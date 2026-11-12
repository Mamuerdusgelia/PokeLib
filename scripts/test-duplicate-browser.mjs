// Real Library UI + IndexedDB against the isolated serve-introduction-test harness.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE || 'playwright'
);
const origin = process.env.TEST_ORIGIN || 'http://127.0.0.1:3100';
assert.ok(['127.0.0.1', 'localhost'].includes(new URL(origin).hostname));
const browser = await chromium.launch({
  headless: true,
  channel: process.env.TEST_BROWSER_CHANNEL || 'chrome',
});
await fs.mkdir('.artifacts/duplicates', { recursive: true });
try {
  for (const scenario of ['dismiss', 'merge', 'delete']) {
    const context = await browser.newContext({
      viewport: { width: 1366, height: 900 },
    });
    await context.route('**/api/config', (route) =>
      route.fulfill({ json: { demo: true, user: null } }),
    );
    await context.addInitScript(() =>
      localStorage.setItem('pokelib-introduction-dismissed', 'true'),
    );
    const page = await context.newPage();
    await page.goto(origin, { waitUntil: 'domcontentloaded', timeout: 120000 });
    await page
      .getByRole('button', { name: 'New team', exact: true })
      .first()
      .waitFor({ timeout: 120000 });
    await page.evaluate(async () => {
      const { api } = await import('/lib/client.ts');
      const { emptyDraft } = await import('/lib/domain.ts');
      const species = [
        'Kyogre',
        'Tornadus',
        'Urshifu-Rapid-Strike',
        'Incineroar',
        'Rillaboom',
        'Amoonguss',
      ];
      await api('import', {
        drafts: [
          ['Rain original', 'gen9ou', species],
          ['Rain Worlds prep', 'gen9ou', [...species].reverse()],
          ['Rain bulky revision', 'gen9ou', species],
          ['UU practice', 'gen9uu', species],
          ['UU tournament', 'gen9uu', species],
        ].map(([title, format, names]) => ({
          ...emptyDraft(true),
          title,
          format,
          team_notes: title + ' private notes',
          showdown_text: names.map((name) => name + '\n- Protect').join('\n\n'),
        })),
      });
    });
    const dialog = page.getByRole('dialog', {
      name: 'Possible team versions found',
    });
    await dialog.waitFor();
    assert.equal(await page.getByRole('dialog').count(), 1);
    assert.equal(
      await dialog.getByRole('button', { name: 'Merge into family' }).count(),
      2,
    );
    assert.equal(await dialog.locator('.duplicate-team').count(), 5);
    await page.screenshot({
      path: `.artifacts/duplicates/${scenario}-desktop.png`,
    });
    if (scenario === 'dismiss') {
      await page.setViewportSize({ width: 390, height: 844 });
      const bounds = await dialog.boundingBox();
      assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= 391);
      await page.screenshot({ path: '.artifacts/duplicates/mobile.png' });
      await dialog
        .getByRole('button', { name: 'Not now / Keep separate' })
        .click();
    } else if (scenario === 'merge') {
      await dialog
        .locator('.duplicate-group')
        .filter({ hasText: 'Rain original' })
        .getByRole('button', { name: 'Merge into family' })
        .click();
      const merge = page.getByRole('dialog', {
        name: 'Merge into family',
        exact: true,
      });
      await merge.getByRole('radio').nth(1).check();
      const main = await merge.getByRole('radio').nth(1).inputValue();
      await merge
        .getByRole('button', { name: 'Merge into family', exact: true })
        .click();
      await merge.waitFor({ state: 'hidden' });
      const team = await page.evaluate(
        async (id) => (await import('/lib/client.ts')).api('get', { id }),
        main,
      );
      assert.equal(team.family_id, main);
      assert.equal(team.variant_count, 3);
    } else {
      await dialog
        .locator('.duplicate-group')
        .filter({ hasText: 'Rain original' })
        .getByRole('button', { name: 'Delete duplicate', exact: true })
        .click();
      assert.equal(await dialog.getByRole('checkbox').count(), 3);
      assert.ok(
        await dialog
          .getByRole('button', { name: 'Review deletion' })
          .isDisabled(),
      );
      await dialog.getByRole('checkbox').first().check();
      await dialog.getByRole('button', { name: 'Review deletion' }).click();
      const confirmation = page.getByRole('dialog', {
        name: 'Delete 1 team families?',
      });
      await confirmation.waitFor();
      const count = () =>
        page.evaluate(
          async () =>
            (
              await (
                await import('/lib/client.ts')
              ).api('list', { group_families: false })
            ).total,
        );
      assert.equal(await count(), 5);
      await confirmation.getByRole('button', { name: /Delete.*famil/ }).click();
      await confirmation.waitFor({ state: 'hidden' });
      assert.equal(await count(), 4);
    }
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page
      .getByRole('button', { name: 'Add team', exact: true })
      .first()
      .waitFor();
    await page.waitForTimeout(1000);
    assert.equal(
      await page
        .getByRole('dialog', { name: 'Possible team versions found' })
        .count(),
      0,
    );
    await page.evaluate(async () => {
      const { api } = await import('/lib/client.ts');
      const { emptyDraft } = await import('/lib/domain.ts');
      const { teams } = await api('list', { group_families: false });
      const t = await api('get', { id: teams[0].id });
      await api('import', {
        drafts: [
          {
            ...emptyDraft(true),
            title: 'Later duplicate',
            format: t.format,
            showdown_text: t.version.showdown_text,
          },
        ],
      });
    });
    await page.waitForTimeout(1000);
    assert.equal(
      await page
        .getByRole('dialog', { name: 'Possible team versions found' })
        .count(),
      0,
    );
    console.log(
      'PASS browser:',
      scenario,
      'and reload/later-import suppression',
    );
    await context.close();
  }
  // Separate browser contexts share only the mocked account settings service.
  const remoteSeen = new Map();
  for (const scenario of [
    'account-dismiss',
    'account-second-device',
    'other-account',
  ]) {
    const accountId =
      scenario === 'other-account' ? 'other-user' : 'duplicate-user';
    let release;
    const delayed = new Promise((resolve) => {
      release = resolve;
    });
    if (scenario !== 'account-second-device') release();
    const context = await browser.newContext();
    await context.route('**/api/config', (route) =>
      route.fulfill({
        json: {
          demo: false,
          supabase_url: 'https://duplicate-test.supabase.co',
          supabase_key: 'test-key',
          user: null,
        },
      }),
    );
    await context.route('https://duplicate-test.supabase.co/**', (route) =>
      route.fulfill({ json: {} }),
    );
    await context.route('**/api/cloud', async (route) => {
      const { action, payload } = route.request().postDataJSON();
      if (action === 'preferences' || action === 'preferences_save') {
        await delayed;
        if (payload?.duplicateSuggestionSeen) remoteSeen.set(accountId, true);
        return route.fulfill({
          json: {
            autoCloud: false,
            acknowledged: false,
            duplicateSuggestionSeen: remoteSeen.get(accountId) || false,
          },
        });
      }
      return route.fulfill({
        json:
          action === 'profile'
            ? { id: accountId, name: 'Tester' }
            : { teams: [] },
      });
    });
    await context.addInitScript((id) => {
      localStorage.setItem('pokelib-introduction-dismissed', 'true');
      const expiry = Math.floor(Date.now() / 1000) + 3600;
      const jwt =
        btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' })) +
        '.' +
        btoa(JSON.stringify({ sub: id, exp: expiry })) +
        '.test';
      localStorage.setItem(
        'sb-duplicate-test-auth-token',
        JSON.stringify({
          access_token: jwt,
          refresh_token: 'test',
          expires_at: expiry,
          token_type: 'bearer',
          user: {
            id,
            email: 'tester@example.test',
            aud: 'authenticated',
            user_metadata: { display_name: 'Tester' },
          },
        }),
      );
    }, accountId);
    const page = await context.newPage();
    await page.goto(origin, { waitUntil: 'domcontentloaded', timeout: 120000 });
    await page
      .getByText('Local + Cloud', { exact: true })
      .waitFor({ state: 'attached' });
    await page.waitForFunction(
      async (expected) =>
        (await import('/lib/client.ts')).currentAccount()?.id === expected,
      accountId,
    );
    await page.evaluate(async () => {
      const { api, localLibrary } = await import('/lib/client.ts');
      const { emptyDraft } = await import('/lib/domain.ts');
      // A cached false from an earlier visit must not bypass session hydration.
      const lib = localLibrary();
      await lib.db.commit(lib.namespace, [], [], {
        preferences: {
          autoCloud: false,
          acknowledged: false,
          duplicateSuggestionSeen: false,
        },
      });
      const text = [
        'Pikachu',
        'Charizard',
        'Blastoise',
        'Venusaur',
        'Gengar',
        'Dragonite',
      ]
        .map((s) => s + '\n- Protect')
        .join('\n\n');
      await api('import', {
        drafts: ['Account original', 'Account variant'].map((title) => ({
          ...emptyDraft(true),
          title,
          format: 'gen9ou',
          showdown_text: text,
        })),
      });
    });
    const dialog = page.getByRole('dialog', {
      name: 'Possible team versions found',
    });
    if (scenario === 'account-second-device') {
      await page.waitForTimeout(1000);
      assert.equal(
        await dialog.count(),
        0,
        'No popup while remote settings are delayed',
      );
      assert.equal(
        await page.evaluate(
          async () =>
            (await (await import('/lib/client.ts')).api('list')).total,
        ),
        2,
        'Library stays readable',
      );
      release();
      await page.waitForFunction(async () => {
        const lib = (await import('/lib/client.ts')).localLibrary();
        return await lib.db.value(
          lib.namespace,
          'duplicate-suggestion-seen-v1',
        );
      });
      await page.waitForTimeout(500);
      assert.equal(
        await dialog.count(),
        0,
        'Remote dismissal suppresses a fresh browser',
      );
    } else {
      await dialog.waitFor();
      const saved = page.waitForResponse(
        (response) =>
          response.url().endsWith('/api/cloud') &&
          response.request().postDataJSON().action === 'preferences_save',
      );
      await dialog
        .getByRole('button', { name: 'Not now / Keep separate' })
        .click();
      await saved;
      assert.equal(remoteSeen.get(accountId), true);
    }
    console.log(
      'PASS browser:',
      scenario,
      'account preference hydration and isolation',
    );
    await context.close();
  }
} finally {
  await browser.close();
}
