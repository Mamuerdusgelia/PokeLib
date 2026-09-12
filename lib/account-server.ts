import { supabaseClient } from './supabase-store';
import { sha256 } from './backup-format';
export async function handleAccount(
  request: Request,
  c: { url: string; key: string },
  key: string | undefined,
  makeClient = supabaseClient,
) {
  try {
    const text = await request.text();
    if (text.length > 10000) throw Error('Request too large.');
    const { action, ...p } = JSON.parse(text);

    if (!c.url || !c.key || !key)
      throw Error(
        'Account management is not configured on this installation. You can keep using Local teams.',
      );
    const admin = makeClient(c.url, key);
    const auth = makeClient(c.url, c.key).auth;
    const ip = request.headers.get('cf-connecting-ip') || 'development';
    const limit = await admin.rpc('lf_auth_limit', { p_key: await sha256(ip) });
    if (limit.error || !limit.data)
      return Response.json(
        { error: 'Too many attempts. Try again in 15 minutes.' },
        { status: 429 },
      );
    if (action === 'signup') {
      const name = String(p.name || '').trim();
      if (!name || name.length > 60)
        throw Error('Choose a display name of 1–60 characters.');
      if (
        typeof p.password !== 'string' ||
        p.password.length < 8 ||
        p.password.length > 200
      )
        throw Error('Use a password of 8–200 characters.');
      const email = String(p.email || '').trim();
      const address =
        email || crypto.randomUUID() + '@accounts.pokelib.invalid';
      let userId: string | undefined;
      let signupSession = null;
      if (email) {
        const result = await auth.signUp({
          email: address,
          password: p.password,
          options: {
            data: { display_name: name },
            emailRedirectTo: new URL(request.url).origin + '/',
          },
        });
        if (result.error)
          throw Error(
            'Account creation failed. Try logging in, or check your email and password.',
          );
        userId = result.data.user?.identities?.length
          ? result.data.user.id
          : undefined;
        signupSession = result.data.session;
      } else {
        const result = await admin.auth.admin.createUser({
          email: address,
          password: p.password,
          email_confirm: true,
          user_metadata: { display_name: name, no_recovery_email: true },
        });
        if (result.error)
          throw Error(
            'Account creation failed. Choose a stronger password and try again.',
          );
        userId = result.data.user.id;
      }
      const code = userId
        ? await admin.rpc('lf_registration_code', { p_id: userId })
        : null;
      const logged = email
        ? null
        : await auth.signInWithPassword({
            email: address,
            password: p.password,
          });
      return Response.json(
        {
          login_code: code?.data,
          session: signupSession || logged?.data.session,
          message: email
            ? signupSession
              ? 'Account created. Keep your account login code.'
              : 'Check your email to confirm your account, then log in. Keep your account login code.'
            : 'Keep your account login code. Without a recovery email, a lost password cannot be recovered.',
        },
        { headers: { 'Cache-Control': 'no-store' } },
      );
    }
    if (action === 'login') {
      const identifier = String(p.identifier || '').trim();
      const resolved = identifier.includes('@')
        ? identifier
        : (await admin.rpc('lf_login_email', { p_code: identifier })).data;
      // Always ask Supabase Auth to check a password, even for an unknown login code.
      const result = await auth.signInWithPassword({
        email: resolved || 'unknown@accounts.pokelib.invalid',
        password: p.password,
      });
      if (result.error)
        throw Error(
          'The login code/email or password is incorrect, or your email needs confirmation.',
        );
      return Response.json(
        { session: result.data.session },
        { headers: { 'Cache-Control': 'no-store' } },
      );
    }
    if (action === 'delete') {
      if (p.confirmation !== 'DELETE ACCOUNT')
        throw Error('Type DELETE ACCOUNT to confirm.');
      const token = request.headers
        .get('authorization')
        ?.replace(/^Bearer /i, '');
      if (!token) throw Error('Please sign in again.');
      const current = await auth.getUser(token);
      if (current.error || !current.data.user?.email)
        throw Error('Please sign in again.');
      const verified = await auth.signInWithPassword({
        email: current.data.user.email,
        password: p.password,
      });
      if (verified.error || verified.data.user.id !== current.data.user.id)
        throw Error('Password is incorrect.');
      const result = await admin.rpc('lf_delete_account', {
        p_id: current.data.user.id,
      });
      if (result.error)
        throw Error(
          'Account deletion failed. Your account has been retained; try again.',
        );
      return Response.json(
        { ok: true },
        { headers: { 'Cache-Control': 'no-store' } },
      );
    }
    throw Error('Unknown account action.');
  } catch (error) {
    return Response.json(
      { error: (error as Error).message },
      { status: 400, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
