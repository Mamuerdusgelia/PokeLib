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
    const welcome = page.getByRole('heading', { name: 'A home for your teams.' });
    const about = page.getByRole('dialog', { name: 'Welcome to PokéLib' });
    await welcome.waitFor({ timeout: 120000 });
    assert.equal(await about.count(), 0);
    if (signedIn) await page.getByText('Local + Cloud', { exact: true }).waitFor();

    for (const [width, height] of [[1366, 768], [390, 844], [375, 667]]) {
      await page.setViewportSize({ width, height });
      await welcome.waitFor();
      await page.getByRole('button', { name: 'Browse example teams', exact: true }).click();
      await page.getByRole('heading', { name: 'Example library' }).waitFor();
      await page.getByRole('button', { name: 'Try Darkrai Ice Beam' }).click();
      assert.deepEqual(await page.locator('.team-card h2').allTextContents(), ['Darkrai balance']);
      await page.getByRole('button', { name: 'Preview Darkrai balance' }).click();
      const preview = page.getByRole('dialog', { name: 'Darkrai balance' });
      await preview.getByText('Heavy-Duty Boots', { exact: true }).waitFor();
      assert.ok((await preview.innerText()).includes('Ice Beam'));
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      await page.screenshot({
        path: `.artifacts/introduction/${signedIn ? 'account' : 'anonymous'}-${width}.png`,
      });
      await page.keyboard.press('Escape');
      await page.getByRole('button', { name: 'Back to your library' }).click();
      await welcome.waitFor();
      assert.equal(await page.locator('.team-card').count(), 0);
    }
    await page.setViewportSize({ width: 1366, height: 768 });
    await page.reload();
    await welcome.waitFor();
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    await page.getByRole('button', { name: 'About PokéLib' }).click();
    await about.waitFor();
    await page.keyboard.press('Escape');
    await about.waitFor({ state: 'detached' });
    if (signedIn) {
      await page.getByRole('button', { name: 'Settings', exact: true }).click();
      await page.getByRole('button', { name: 'Log out and clear cached Cloud data' }).click();
      await welcome.waitFor();
      assert.equal(await about.count(), 0);
    }
    console.log('First visit, sample search, lineup preview and return passed:', signedIn ? 'mock account' : 'anonymous');
    await context.close();
  }
} finally {
  await browser.close();
}
