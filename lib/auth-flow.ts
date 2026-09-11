import type { SupabaseClient } from '@supabase/supabase-js';

export type AuthMode = 'login' | 'signup' | 'forgot' | 'reset';
export type AuthApi = Pick<
  SupabaseClient['auth'],
  | 'signInWithPassword'
  | 'signUp'
  | 'resetPasswordForEmail'
  | 'updateUser'
  | 'resend'
>;
export type AppConfig = {
  demo: boolean;
  supabase_url: string;
  supabase_key: string;
  user: { name: string; email: string } | null;
};
export const RESET_SENT =
  'If an account exists for this email address, you will receive a password reset email. Check your spam folder too. If it does not arrive, wait a few minutes before trying again.';
export const CONFIRMATION_SENT =
  'Check your email for a confirmation link before logging in. If you already have an account, log in or use Forgot password.';
export const EXPIRED_LINK =
  'This email link is invalid or has expired. Request a new link and use the newest email.';

/** Only the fixed production origin and the explicit development origin can receive email links. */
export function authRedirect(origin: string) {
  return origin === 'http://localhost:3000'
    ? 'http://localhost:3000/'
    : 'https://pokelib.app/';
}

/** Read the link's intent before Supabase consumes its fragment. Never retain its tokens. */
export function authReturn(href: string) {
  const url = new URL(href);
  const hash = new URLSearchParams(url.hash.slice(1));
  const value = (key: string) => hash.get(key) || url.searchParams.get(key);
  const callback = [
    'access_token',
    'refresh_token',
    'error',
    'error_code',
    'error_description',
    'code',
  ].some((key) => !!value(key));
  return {
    callback,
    invalid: !!(
      value('error') ||
      value('error_code') ||
      value('error_description') ||
      value('code')
    ),
    recovery:
      value('type') === 'recovery' || url.searchParams.get('auth') === 'reset',
    confirmed: value('type') === 'signup' && !!value('access_token'),
    forgot: url.searchParams.get('auth') === 'forgot',
  };
}

/** Clear callback credentials/errors; keep team deep links and a non-secret recovery view marker. */
export function cleanAuthUrl(href: string, mode: AuthMode | null) {
  const url = new URL(href);
  for (const key of [
    'access_token',
    'refresh_token',
    'provider_token',
    'provider_refresh_token',
    'expires_in',
    'expires_at',
    'token_type',
    'type',
    'error',
    'error_code',
    'error_description',
    'code',
  ]) {
    url.searchParams.delete(key);
  }
  url.hash = '';
  if (mode === 'reset' || mode === 'forgot') url.searchParams.set('auth', mode);
  else url.searchParams.delete('auth');
  return url.pathname + url.search;
}

export function newPasswordError(password: string, confirmation: string) {
  if (password.length < 8)
    return 'Use at least 8 characters for your new password.';
  if (password !== confirmation) return 'The passwords do not match.';
  return '';
}

export function authError(error: unknown) {
  const e = error as {
    code?: string;
    message?: string;
    reasons?: string[];
  } | null;
  switch (e?.code) {
    case 'invalid_credentials':
    case 'user_not_found':
    case 'user_banned':
      return 'The email or password is incorrect. Try again or choose Forgot password.';
    case 'email_not_confirmed':
      return 'Confirm your email before logging in. Open the confirmation email, or request another below.';
    case 'weak_password': {
      const length = e.message?.match(/at least (\d+) characters/i)?.[1];
      if (e.reasons?.includes('pwned'))
        return 'This password has appeared in a data breach. Choose a different, unique password.';
      if (e.reasons?.includes('characters'))
        return 'Include uppercase and lowercase letters, a number, and a symbol in your password.';
      return length
        ? `Use at least ${length} characters for your password.`
        : 'Choose a stronger password with uppercase and lowercase letters, a number, and a symbol.';
    }
    case 'same_password':
      return 'Choose a password different from your current password.';
    case 'otp_expired':
    case 'flow_state_expired':
    case 'flow_state_not_found':
      return EXPIRED_LINK;
    case 'session_not_found':
    case 'session_expired':
    case 'bad_jwt':
    case 'reauthentication_needed':
    case 'reauth_nonce_missing':
      return 'Your password-reset session has expired. Request a new reset email.';
    case 'over_email_send_rate_limit':
    case 'over_request_rate_limit':
      return 'Too many attempts. Wait a few minutes before trying again.';
    case 'email_address_invalid':
      return 'Enter a valid email address.';
    case 'signup_disabled':
      return 'New account signup is currently unavailable.';
    case 'user_already_exists':
    case 'email_exists':
      return 'Unable to create this account. Try logging in or use Forgot password.';
    default:
      return 'Unable to complete this request. Check your connection and try again.';
  }
}

export async function passwordLogin(
  auth: AuthApi,
  email: string,
  password: string,
) {
  // Do not apply new-password rules to existing passwords or trim password whitespace.
  const result = await auth.signInWithPassword({
    email: email.trim(),
    password,
  });
  if (result.error) throw result.error;
  return result.data;
}

export async function passwordSignup(
  auth: AuthApi,
  email: string,
  password: string,
  confirmation: string,
  origin: string,
) {
  const invalid = newPasswordError(password, confirmation);
  if (invalid) throw Error(invalid);
  const result = await auth.signUp({
    email: email.trim(),
    password,
    options: { emailRedirectTo: authRedirect(origin) },
  });
  if (result.error) throw result.error;
  return result.data;
}

export async function requestPasswordReset(
  auth: AuthApi,
  email: string,
  origin: string,
) {
  // Keep every response identical, including account-specific mail/rate-limit failures.
  // Native Supabase controls delivery, account lookup, rate limits and recovery tokens.
  try {
    await auth.resetPasswordForEmail(email.trim(), {
      redirectTo: authRedirect(origin),
    });
  } catch {}
  return RESET_SENT;
}

export async function resendConfirmation(
  auth: AuthApi,
  email: string,
  origin: string,
) {
  const result = await auth.resend({
    type: 'signup',
    email: email.trim(),
    options: { emailRedirectTo: authRedirect(origin) },
  });
  if (result.error) throw result.error;
  return CONFIRMATION_SENT;
}

export async function updatePassword(
  auth: AuthApi,
  password: string,
  confirmation: string,
) {
  const invalid = newPasswordError(password, confirmation);
  if (invalid) throw Error(invalid);
  const result = await auth.updateUser({ password });
  if (result.error) throw result.error;
  return result.data;
}
