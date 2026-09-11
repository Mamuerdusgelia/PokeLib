import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';
import {
  authError,
  authRedirect,
  authReturn,
  cleanAuthUrl,
  newPasswordError,
  passwordLogin,
  passwordSignup,
  requestPasswordReset,
  resendConfirmation,
  updatePassword,
  RESET_SENT,
  CONFIRMATION_SENT,
  EXPIRED_LINK,
} from '../.test-build/auth-flow.mjs';

let passed = 0;
async function check(name, fn) {
  await fn();
  passed++;
  console.log('PASS auth ' + name);
}
const calls = [];
let reply = {};
let status = 200;
const user = {
  id: '8dfbd438-e8e5-4be7-b193-aaef5c8ba5be',
  aud: 'authenticated',
  role: 'authenticated',
  email: 'fixture@example.invalid',
  email_confirmed_at: '2026-09-11T00:00:00Z',
  app_metadata: {},
  user_metadata: {},
  created_at: '2026-09-11T00:00:00Z',
};
const session = {
  access_token: 'test-access-token',
  refresh_token: 'test-refresh-token',
  expires_in: 3600,
  token_type: 'bearer',
  user,
};
const client = createClient('https://auth-fixture.invalid', 'public-test-key', {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
  global: {
    fetch: async (url, init) => {
      calls.push({
        url: new URL(url),
        method: init?.method,
        body: init?.body ? JSON.parse(init.body) : null,
      });
      return new Response(JSON.stringify(reply), {
        status,
        headers: { 'Content-Type': 'application/json', 'X-Supabase-Api-Version': '2024-01-01' },
      });
    },
  },
});

await check(
  'production redirects cannot follow arbitrary origins or return URLs',
  () => {
    for (const origin of [
      'https://pokelib.app',
      'https://teamvault-library.internetscaryuwu.chatgpt.site',
      'https://evil.invalid',
      'http://localhost:3000.evil.invalid',
      'http://localhost:3001',
    ])
      assert.equal(authRedirect(origin), 'https://pokelib.app/');
    assert.equal(
      authRedirect('http://localhost:3000'),
      'http://localhost:3000/',
    );
  },
);
await check(
  'native password login preserves older passwords and sends no email',
  async () => {
    reply = session;
    const data = await passwordLogin(
      client.auth,
      ' fixture@example.invalid ',
      ' old ',
    );
    assert.equal(data.user.id, user.id);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url.pathname, '/auth/v1/token');
    assert.equal(calls[0].url.searchParams.get('grant_type'), 'password');
    assert.equal(calls[0].body.password, ' old ');
    assert.equal(calls[0].body.email, user.email);
  },
);
await check(
  'signup rejects mismatches and short passwords before native API mutation',
  async () => {
    const count = calls.length;
    await assert.rejects(
      passwordSignup(
        client.auth,
        user.email,
        'new-password',
        'different',
        'https://pokelib.app',
      ),
      /do not match/,
    );
    await assert.rejects(
      passwordSignup(
        client.auth,
        user.email,
        'short',
        'short',
        'https://pokelib.app',
      ),
      /at least 8/,
    );
    assert.equal(calls.length, count);
  },
);
await check(
  'signup calls Supabase signup and leaves confirmation-pending user without a session',
  async () => {
    reply = { ...user, email_confirmed_at: undefined };
    const data = await passwordSignup(
      client.auth,
      user.email,
      'Test-password-42!',
      'Test-password-42!',
      'https://old-site.invalid',
    );
    assert.equal(data.session, null);
    const call = calls.at(-1);
    assert.equal(call.url.pathname, '/auth/v1/signup');
    assert.equal(
      call.url.searchParams.get('redirect_to'),
      'https://pokelib.app/',
    );
    assert.equal(call.body.password, 'Test-password-42!');
  },
);
await check(
  'wrong password and unconfirmed email produce distinct useful feedback',
  async () => {
    status = 400;
    reply = { code: 'invalid_credentials', msg: 'Invalid login credentials' };
    await assert.rejects(passwordLogin(client.auth, user.email, 'wrong'), (e) =>
      authError(e).includes('email or password is incorrect'),
    );
    reply = { code: 'email_not_confirmed', msg: 'Email not confirmed' };
    await assert.rejects(passwordLogin(client.auth, user.email, 'right'), (e) =>
      authError(e).startsWith('Confirm your email'),
    );
    status = 200;
  },
);
await check(
  'reset uses native recovery with canonical production destination',
  async () => {
    reply = {};
    assert.equal(
      await requestPasswordReset(
        client.auth,
        user.email,
        'https://old-site.invalid',
      ),
      RESET_SENT,
    );
    assert.equal(calls.at(-1).url.pathname, '/auth/v1/recover');
    assert.equal(
      calls.at(-1).url.searchParams.get('redirect_to'),
      'https://pokelib.app/',
    );
  },
);
await check(
  'reset keeps identical feedback for unknown accounts, delivery failures and rate limits',
  async () => {
    for (const code of [
      'user_not_found',
      'email_address_not_authorized',
      'over_email_send_rate_limit',
      'over_request_rate_limit',
      'unexpected_failure',
    ]) {
      status = 400;
      reply = { code, msg: 'Account-specific provider detail' };
      assert.equal(
        await requestPasswordReset(
          client.auth,
          user.email,
          'https://pokelib.app',
        ),
        RESET_SENT,
      );
    }
    assert.equal(
      await requestPasswordReset(
        {
          resetPasswordForEmail: async () => {
            throw Error('network');
          },
        },
        user.email,
        'https://pokelib.app',
      ),
      RESET_SENT,
    );
    assert.ok(!RESET_SENT.includes('Account-specific'));
    status = 200;
  },
);
await check(
  'development reset retains localhost and resend uses signup confirmation API',
  async () => {
    reply = {};
    await requestPasswordReset(
      client.auth,
      user.email,
      'http://localhost:3000',
    );
    assert.equal(
      calls.at(-1).url.searchParams.get('redirect_to'),
      'http://localhost:3000/',
    );
    assert.equal(
      await resendConfirmation(client.auth, user.email, 'https://pokelib.app'),
      CONFIRMATION_SENT,
    );
    assert.equal(calls.at(-1).url.pathname, '/auth/v1/resend');
    assert.equal(calls.at(-1).body.type, 'signup');
  },
);
await check(
  'password change updates the same Supabase user using authenticated native API',
  async () => {
    reply = session;
    await passwordLogin(client.auth, user.email, 'Test-password-42!');
    reply = user;
    const data = await updatePassword(
      client.auth,
      'New-password-43!',
      'New-password-43!',
    );
    assert.equal(data.user.id, user.id);
    assert.equal(calls.at(-1).method, 'PUT');
    assert.equal(calls.at(-1).url.pathname, '/auth/v1/user');
    assert.equal(calls.at(-1).body.password, 'New-password-43!');
    assert.equal(calls.at(-1).body.email, undefined);
    assert.equal(calls.at(-1).body.id, undefined);
  },
);
await check(
  'password update validation does not send a partial update',
  async () => {
    const count = calls.length;
    await assert.rejects(
      updatePassword(client.auth, 'New-password-43!', 'mismatch'),
      /do not match/,
    );
    assert.equal(calls.length, count);
    assert.match(newPasswordError('tiny', 'tiny'), /at least 8/);
  },
);
await check(
  'recovery intent survives SDK fragment consumption and reload',
  () => {
    const link =
      'https://pokelib.app/#access_token=sensitive&refresh_token=sensitive&type=recovery';
    const info = authReturn(link);
    assert.equal(info.recovery, true);
    assert.equal(info.callback, true);
    assert.ok(!JSON.stringify(info).includes('sensitive'));
    const cleaned = cleanAuthUrl(link, 'reset');
    assert.equal(cleaned, '/?auth=reset');
    assert.equal(authReturn('https://pokelib.app' + cleaned).recovery, true);
  },
);
await check(
  'expired and malformed callback errors remain visible even with existing sessions',
  () => {
    for (const fragment of [
      '#error=access_denied&error_code=otp_expired',
      '#error_description=Untrusted+text',
      '?code=unsupported-code',
    ])
      assert.equal(authReturn('https://pokelib.app/' + fragment).invalid, true);
    assert.equal(
      authError({ code: 'otp_expired', message: 'Untrusted text' }),
      EXPIRED_LINK,
    );
    assert.equal(
      authReturn('https://pokelib.app/#type=signup&access_token=sensitive')
        .confirmed,
      true,
    );
  },
);
await check(
  'callback cleanup removes query credentials but preserves team deep links',
  () => {
    assert.equal(
      cleanAuthUrl(
        'https://pokelib.app/?team=abc&version=2&access_token=secret&error=bad#refresh_token=secret',
        null,
      ),
      '/?team=abc&version=2',
    );
    assert.equal(authReturn('https://pokelib.app/?auth=forgot').forgot, true);
  },
);
await check(
  'password and session requirements have useful non-raw feedback',
  () => {
    assert.match(
      authError({
        code: 'weak_password',
        message: 'Password should be at least 12 characters.',
      }),
      /12 characters/,
    );
    assert.match(
      authError({ code: 'weak_password', reasons: ['pwned'] }),
      /data breach/,
    );
    assert.match(
      authError({ code: 'weak_password', reasons: ['characters'] }),
      /uppercase/,
    );
    assert.match(authError({ code: 'same_password' }), /different/);
    assert.match(authError({ code: 'session_expired' }), /new reset email/);
    assert.ok(
      !authError({ message: 'Secret raw provider response' }).includes(
        'Secret',
      ),
    );
  },
);
assert.ok(
  calls.every(
    (c) =>
      !c.url.pathname.endsWith('/otp') && !c.url.pathname.includes('/admin'),
  ),
);
await client.auth.signOut({ scope: 'local' });
console.log(`${passed} authentication checks passed`);
