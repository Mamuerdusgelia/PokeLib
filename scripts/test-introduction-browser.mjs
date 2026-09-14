// Run against an isolated local dev server. All account/cloud responses are mocked.
// PLAYWRIGHT_MODULE may point to a bundled playwright/index.mjs.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE || 'playwright'
);
const origin = process.env.TEST_ORIGIN || 'http://127.0.0.1:3100';
assert.ok(
  new URL(origin).hostname === '127.0.0.1' ||
    new URL(origin).hostname === 'localhost',
);
const browser = await chromium.launch({
  headless: true,
  ...(process.env.TEST_BROWSER_CHANNEL
    ? { channel: process.env.TEST_BROWSER_CHANNEL }
    : {}),
});
const key = 'pokelib-introduction-dismissed';
await fs.mkdir('.artifacts/introduction', { recursive: true });
try {
  for (const signedIn of [false, true]) {
    const context = await browser.newContext({
      viewport: { width: 1366, height: 768 },
    });
    await context.route('**/api/config', (route) =>
      route.fulfill({
        json: {
          demo: !signedIn,
          supabase_url: 'https://intro-test.supabase.co',
          supabase_key: 'test-key',
          user: null,
        },
      }),
    );
    await context.route('https://intro-test.supabase.co/**', (route) =>
      route.fulfill({ json: {} }),
    );
    await context.route('**/api/cloud', (route) => {
      const { action } = route.request().postDataJSON();
      return route.fulfill({
        json:
          action === 'profile'
            ? { id: 'intro-user', name: 'Intro tester' }
            : action === 'preferences'
              ? { autoCloud: false, acknowledged: false }
              : { teams: [], deleted: [], cursor: null },
      });
    });
    if (signedIn)
      await context.addInitScript(() => {
        const jwt =
          btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' })) +
          '.' +
          btoa(
            JSON.stringify({
              sub: 'intro-user',
              exp: Math.floor(Date.now() / 1000) + 3600,
            }),
          ) +
          '.test';
        localStorage.setItem(
          'sb-intro-test-auth-token',
          JSON.stringify({
            access_token: jwt,
            refresh_token: 'test-refresh-token',
            expires_at: Math.floor(Date.now() / 1000) + 3600,
            token_type: 'bearer',
            user: {
              id: 'intro-user',
              email: 'intro@example.test',
              aud: 'authenticated',
              user_metadata: { display_name: 'Intro tester' },
            },
          }),
        );
      });
    const page = await context.newPage();
    await page.goto(origin + '/signin-with-chatgpt?return_to=%2F');
    const dialog = page.getByRole('dialog', { name: 'Welcome to PokéLib' });
    await dialog.waitFor({ timeout: 120000 });
    if (signedIn)
      await page
        .getByText('Local + Cloud', { exact: true })
        .waitFor({ state: 'attached' });
    for (const [width, height] of [
      [1366, 768],
      [390, 844],
      [375, 667],
    ]) {
      await page.setViewportSize({ width, height });
      await page.evaluate(
        () =>
          new Promise((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(resolve)),
          ),
      );
      await page.evaluate(() =>
        Promise.all(
          document
            .getAnimations()
            .map((animation) => animation.finished.catch(() => {})),
        ),
      );
      const size = await dialog.evaluate((el) => ({
        scroll: el.scrollHeight,
        client: el.clientHeight,
        width: el.getBoundingClientRect().width,
        top: el.getBoundingClientRect().top,
      }));
      assert.ok(
        size.scroll <= size.client + 1,
        JSON.stringify({ signedIn, width, height, ...size }),
      );
      assert.ok(
        size.width < width && size.top >= 0,
        JSON.stringify({ viewportWidth: width, height, ...size }),
      );
      await page.screenshot({
        path: `.artifacts/introduction/${signedIn ? 'account' : 'anonymous'}-${width}.png`,
      });
      console.log('Layout passed', {
        signedIn,
        viewportWidth: width,
        height,
        ...size,
      });
    }
    const parallelTab = await context.newPage();
    await parallelTab.goto(origin);
    const parallelDialog = parallelTab.getByRole('dialog', {
      name: 'Welcome to PokéLib',
    });
    await parallelDialog.waitFor();
    await dialog.getByRole('button', { name: 'Start using PokéLib' }).click();
    await dialog.waitFor({ state: 'detached' });
    await parallelDialog.waitFor({ state: 'detached' });
    await parallelTab.close();
    assert.equal(
      await page.evaluate((k) => localStorage.getItem(k), key),
      'true',
    );
    await page.setViewportSize({ width: 1366, height: 768 });
    await page.reload();
    await page.getByRole('button', { name: 'Settings', exact: true }).waitFor();
    assert.equal(await dialog.count(), 0);
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    await page.getByRole('button', { name: 'About PokéLib' }).click();
    await dialog.waitFor();
    await page.keyboard.press('Escape');
    await dialog.waitFor({ state: 'detached' });
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    await page.getByRole('button', { name: 'About PokéLib' }).click();
    await dialog.getByRole('button', { name: 'Close', exact: true }).click();
    await dialog.waitFor({ state: 'detached' });
    const next = await context.newPage();
    await next.goto(origin);
    await next.getByRole('button', { name: 'Settings', exact: true }).waitFor();
    assert.equal(
      await next.getByRole('dialog', { name: 'Welcome to PokéLib' }).count(),
      0,
    );
    if (signedIn) {
      await page.getByRole('button', { name: 'Settings', exact: true }).click();
      await page
        .getByRole('button', { name: 'Log out and clear cached Cloud data' })
        .click();
      await page.getByText('No account needed', { exact: true }).waitFor();
      assert.equal(
        await dialog.count(),
        0,
        'logout remount does not reopen the introduction',
      );
    }
    console.log(
      'Dismissal, refresh, reopen, Escape, Close and new tab passed:',
      signedIn ? 'mock account' : 'anonymous',
    );
    await context.close();
  }
} finally {
  await browser.close();
}
