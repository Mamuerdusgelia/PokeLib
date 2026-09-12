import assert from 'node:assert/strict';
import { handleAccount } from '../.test-build/account-server.mjs';

const calls = [];
const account = {
  id: crypto.randomUUID(),
  email: 'test@accounts.pokelib.invalid',
  identities: [{}],
};
const session = { access_token: 'test-session', user: account };
let failedPassword = false,
  limited = false;
const auth = {
  signUp: async (p) => {
    calls.push(['signup', p]);
    return { data: { user: account, session: null } };
  },
  signInWithPassword: async (p) => {
    calls.push(['password', p]);
    return failedPassword
      ? { error: { message: 'wrong' } }
      : { data: { user: account, session } };
  },
  getUser: async (token) => {
    calls.push(['verify', token]);
    return { data: { user: account } };
  },
  admin: {
    createUser: async (p) => {
      calls.push(['create', p]);
      return { data: { user: account } };
    },
  },
};
const makeClient = () => ({
  auth,
  rpc: async (name, p) => {
    calls.push([name, p]);
    return {
      data:
        name === 'lf_auth_limit'
          ? !limited
          : name === 'lf_registration_code'
            ? 'ABCDEF1234567890'
            : name === 'lf_login_email'
              ? account.email
              : true,
    };
  },
});
async function request(action, p = {}, bearer = false) {
  return handleAccount(
    new Request('https://pokelib.example/api/account', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(bearer ? { Authorization: 'Bearer test-session' } : {}),
      },
      body: JSON.stringify({ action, ...p }),
    }),
    { url: 'https://auth.example', key: 'public' },
    'server-only',
    makeClient,
  );
}
const password = 'test-only-password';
let response = await request('signup', { name: 'Alice', password });
assert.equal(response.status, 200);
let body = await response.json();
assert.equal(body.login_code, 'ABCDEF1234567890');
assert.equal(body.session.access_token, 'test-session');
assert.match(body.message, /cannot be recovered/);
const created = calls.find(([name]) => name === 'create')[1];
assert.equal(created.email_confirm, true);
assert.equal(created.user_metadata.no_recovery_email, true);
assert.match(created.email, /@accounts\.pokelib\.invalid$/);
assert.equal(created.password, password); // Supabase Auth alone receives the password; no application table stores it.
assert.ok(
  !calls
    .filter(([name]) => name.startsWith('lf_'))
    .some(([, p]) => JSON.stringify(p).includes(password)),
);
response = await request('signup', {
  name: 'Alice',
  email: 'alice@example.com',
  password,
});
body = await response.json();
assert.equal(body.session, undefined);
assert.match(body.message, /confirm/);
assert.equal(
  calls.find(([name]) => name === 'signup')[1].options.emailRedirectTo,
  'https://pokelib.example/',
);
response = await request('login', { identifier: 'ABCDEF1234567890', password });
assert.equal(response.status, 200);
assert.equal(calls.at(-1)[1].email, account.email);
failedPassword = true;
assert.equal(
  (
    await request('login', {
      identifier: 'ABCDEF1234567890',
      password: 'wrong',
    })
  ).status,
  400,
);
assert.equal(
  (
    await request(
      'delete',
      { confirmation: 'DELETE ACCOUNT', password: 'wrong' },
      true,
    )
  ).status,
  400,
);
assert.ok(!calls.some(([name]) => name === 'lf_delete_account'));
failedPassword = false;
assert.equal(
  (await request('delete', { confirmation: 'DELETE ACCOUNT', password }))
    .status,
  400,
);
assert.equal(
  (await request('delete', { confirmation: 'DELETE ACCOUNT', password }, true))
    .status,
  200,
);
assert.deepEqual(calls.at(-1), ['lf_delete_account', { p_id: account.id }]);
limited = true;
assert.equal(
  (await request('login', { identifier: 'Alice', password })).status,
  429,
);
const unavailable = await handleAccount(
  new Request('https://pokelib.example/api/account', {
    method: 'POST',
    body: '{"action":"signup"}',
  }),
  { url: '', key: '' },
  undefined,
  makeClient,
);
assert.equal(unavailable.status, 400);
assert.match((await unavailable.json()).error, /Local teams/);
console.log(
  'PASS account endpoint: optional email, login codes, Supabase password delegation, confirmation, reauthentication, rate limits and missing configuration (mocked Auth transport).',
);
