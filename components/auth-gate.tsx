'use client';

import { useEffect, useRef, useState } from 'react';
import type { Session, SupabaseClient } from '@supabase/supabase-js';
import { BookOpen, LockKeyhole } from 'lucide-react';
import { browserAuth } from '@/lib/client';
import {
  authError,
  authReturn,
  cleanAuthUrl,
  CONFIRMATION_SENT,
  EXPIRED_LINK,
  newPasswordError,
  passwordLogin,
  passwordSignup,
  requestPasswordReset,
  resendConfirmation,
  updatePassword,
  type AppConfig,
  type AuthMode,
} from '@/lib/auth-flow';
import Library from './library';

export default function AuthGate() {
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  const [mode, setMode] = useState<AuthMode | null>(null);
  const [message, setMessage] = useState('');
  const [failure, setFailure] = useState('');
  const [fatal, setFatal] = useState('');
  const auth = useRef<SupabaseClient['auth'] | null>(null);
  const [signingOut, setSigningOut] = useState(false);

  function changeMode(next: AuthMode | null) {
    setFailure('');
    setMessage('');
    setMode(next);
    window.history.replaceState(
      window.history.state,
      '',
      cleanAuthUrl(window.location.href, next),
    );
  }

  useEffect(() => {
    let disposed = false;
    let unsubscribe = () => {};
    const controller = new AbortController();
    const returned = authReturn(window.location.href);
    let initialMode: AuthMode | null = returned.invalid
      ? 'forgot'
      : returned.recovery
        ? 'reset'
        : returned.forgot
          ? 'forgot'
          : null;
    setMode(initialMode);
    if (returned.invalid) setFailure(EXPIRED_LINK);
    (async () => {
      const response = await fetch('/api/config', {
        signal: controller.signal,
      });
      if (!response.ok) throw Error('Configuration unavailable');
      const c: AppConfig = await response.json();
      if (disposed) return;
      setConfig(c);
      if (c.demo) {
        setReady(true);
        return;
      }
      const client = browserAuth(c.supabase_url, c.supabase_key).auth;
      auth.current = client;
      const { data } = client.onAuthStateChange((event, next) => {
        if (disposed) return;
        // Keep callbacks synchronous; Supabase may emit while coordinating session initialization.
        setSession(next);
        if (event === 'PASSWORD_RECOVERY') {
          setMode('reset');
          setFailure('');
          setMessage('Choose a new password for your account.');
          window.history.replaceState(
            window.history.state,
            '',
            cleanAuthUrl(window.location.href, 'reset'),
          );
        }
      });
      unsubscribe = () => data.subscription.unsubscribe();
      const initialized = await client.initialize();
      const current = await client.getSession();
      if (disposed) return;
      setSession(current.data.session);
      if (returned.callback && (returned.invalid || initialized.error)) {
        initialMode = 'forgot';
        setMode('forgot');
        setFailure(EXPIRED_LINK);
      } else if (current.error) {
        setFailure(authError(current.error));
      } else if (returned.confirmed && current.data.session) {
        setMessage('Email confirmed. You are signed in.');
      }
      if (returned.callback || returned.recovery || returned.forgot)
        window.history.replaceState(
          window.history.state,
          '',
          cleanAuthUrl(window.location.href, initialMode),
        );
      setReady(true);
    })().catch(() => {
      if (!disposed)
        setFatal('Could not connect to PokéLib. Reload to try again.');
    });
    return () => {
      disposed = true;
      controller.abort();
      unsubscribe();
    };
  }, []);

  async function signOut() {
    if (!auth.current || signingOut) return;
    setSigningOut(true);
    try {
      const { error } = await auth.current.signOut({ scope: 'local' });
      if (error) throw error;
      setSession(null);
      changeMode('login');
    } catch {
      setFailure(
        'Sign-out did not finish. Check your connection and try again.',
      );
    } finally {
      setSigningOut(false);
    }
  }

  if (!ready || !config)
    return (
      <div className="boot">
        <BookOpen size={28} />
        <h1>PokéLib</h1>
        <p role={fatal ? 'alert' : 'status'}>
          {fatal || 'Opening your workspace…'}
        </p>
        {fatal && (
          <button className="button" onClick={() => window.location.reload()}>
            Reload
          </button>
        )}
      </div>
    );

  const identity = config.demo
    ? config.user
      ? 'demo'
      : null
    : session?.user.id;
  if (identity && !mode)
    return (
      <>
        {(message || failure) && (
          <div className="auth-banner" role={failure ? 'alert' : 'status'}>
            {failure || message}
            <button
              type="button"
              className="text-link"
              onClick={() => {
                setMessage('');
                setFailure('');
              }}
            >
              Dismiss
            </button>
          </div>
        )}
        {/* A changed Auth user always gets fresh library state, including outstanding UI requests. */}
        <Library
          key={identity}
          config={config}
          onSignOut={signOut}
          signingOut={signingOut}
          onPasswordReset={() => changeMode('forgot')}
        />
      </>
    );

  return (
    <main className="login auth-panel">
      <div className="brand">
        <span className="brand-icon">
          <BookOpen size={20} />
        </span>
        PokéLib
      </div>
      {config.demo ? (
        <>
          <h1>Your teams, together.</h1>
          <p>Sign in to your private team library.</p>
          <a
            className="button primary"
            href={
              '/signin-with-chatgpt?return_to=' +
              encodeURIComponent(
                window.location.pathname + window.location.search,
              )
            }
            target="_top"
          >
            Sign in with ChatGPT
          </a>
        </>
      ) : (
        <PasswordForm
          key={(mode || 'login') + ':' + (session?.user.id || 'anonymous')}
          auth={auth.current!}
          mode={mode || 'login'}
          session={session}
          message={message}
          failure={failure}
          onMessage={setMessage}
          onFailure={setFailure}
          onMode={changeMode}
          onAuthenticated={(next) => {
            setSession(next);
            changeMode(null);
          }}
          onPasswordChanged={async () => {
            let signOutFailed = false;
            try {
              const result = await auth.current!.signOut({ scope: 'local' });
              signOutFailed = !!result.error;
              if (!result.error) setSession(null);
            } catch {
              signOutFailed = true;
            }
            changeMode('login');
            setMessage(
              signOutFailed
                ? 'Your password changed. Sign-out did not finish; log in with your new password.'
                : 'Password changed successfully. Log in with your new password.',
            );
          }}
        />
      )}
      <p className="muted">
        <LockKeyhole size={14} /> Your teams stay private.
      </p>
    </main>
  );
}

function PasswordForm({
  auth,
  mode,
  session,
  message,
  failure,
  onMode,
  onMessage,
  onFailure,
  onAuthenticated,
  onPasswordChanged,
}: {
  auth: SupabaseClient['auth'];
  mode: AuthMode;
  session: Session | null;
  message: string;
  failure: string;
  onMode: (mode: AuthMode | null) => void;
  onMessage: (message: string) => void;
  onFailure: (error: string) => void;
  onAuthenticated: (session: Session | null) => void;
  onPasswordChanged: () => Promise<void>;
}) {
  const [email, setEmail] = useState(session?.user.email || '');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const [canResend, setCanResend] = useState(false);
  const needsNewPassword = mode === 'signup' || mode === 'reset';
  const missingRecovery = mode === 'reset' && !session;
  const titles = {
    login: 'Log in to PokéLib',
    signup: 'Create your account',
    forgot: 'Reset your password',
    reset: 'Choose a new password',
  };

  async function submit(resend = false) {
    if (pending.current || missingRecovery) return;
    onFailure('');
    onMessage('');
    if (needsNewPassword && !resend) {
      const invalid = newPasswordError(password, confirmation);
      if (invalid) {
        onFailure(invalid);
        return;
      }
    }
    pending.current = true;
    setBusy(true);
    try {
      if (resend)
        onMessage(
          await resendConfirmation(auth, email, window.location.origin),
        );
      else if (mode === 'login') {
        const data = await passwordLogin(auth, email, password);
        onAuthenticated(data.session);
      } else if (mode === 'signup') {
        await passwordSignup(
          auth,
          email,
          password,
          confirmation,
          window.location.origin,
        );
        setPassword('');
        setConfirmation('');
        setCanResend(true);
        onMessage(CONFIRMATION_SENT);
      } else if (mode === 'forgot')
        onMessage(
          await requestPasswordReset(auth, email, window.location.origin),
        );
      else {
        await updatePassword(auth, password, confirmation);
        setPassword('');
        setConfirmation('');
        await onPasswordChanged();
      }
    } catch (error) {
      onFailure(authError(error));
      if ((error as { code?: string }).code === 'email_not_confirmed')
        setCanResend(true);
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }

  return (
    <>
      <h1>{titles[mode]}</h1>
      <p>
        {mode === 'login'
          ? 'Open your private team library.'
          : mode === 'signup'
            ? 'Confirm your email once, then log in with your password.'
            : mode === 'forgot'
              ? 'Enter the email you use for PokéLib. You can also use this to set your first password.'
              : 'Your library and account stay the same.'}
      </p>
      {mode === 'reset' && session && (
        <p className="auth-account">
          Changing the password for <strong>{session.user.email}</strong>
        </p>
      )}
      {missingRecovery ? (
        <div role="alert" className="auth-feedback error">
          Your reset session is missing or has expired. Request a new reset
          email.
        </div>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
          aria-busy={busy}
        >
          {mode !== 'reset' && (
            <label className="field" htmlFor="auth-email">
              <span>Email address</span>
              <input
                id="auth-email"
                name="email"
                type="email"
                autoComplete="email"
                autoCapitalize="none"
                spellCheck={false}
                required
                value={email}
                disabled={busy}
                onChange={(e) => {
                  setEmail(e.target.value);
                  setCanResend(false);
                }}
                placeholder="you@example.com"
              />
            </label>
          )}
          {mode !== 'forgot' && (
            <label className="field" htmlFor="auth-password">
              <span>{mode === 'reset' ? 'New password' : 'Password'}</span>
              <input
                id="auth-password"
                name="password"
                type="password"
                autoComplete={
                  needsNewPassword ? 'new-password' : 'current-password'
                }
                required
                disabled={busy}
                minLength={needsNewPassword ? 8 : undefined}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                aria-describedby={
                  needsNewPassword ? 'password-requirements' : undefined
                }
              />
            </label>
          )}
          {needsNewPassword && (
            <>
              <p id="password-requirements" className="auth-help">
                Use at least 8 characters. A long, unique passphrase works well.
              </p>
              <label className="field" htmlFor="auth-confirm">
                <span>
                  Confirm {mode === 'reset' ? 'new password' : 'password'}
                </span>
                <input
                  id="auth-confirm"
                  name="password-confirmation"
                  type="password"
                  autoComplete="new-password"
                  required
                  disabled={busy}
                  value={confirmation}
                  onChange={(e) => setConfirmation(e.target.value)}
                />
              </label>
            </>
          )}
          <button className="button primary" type="submit" disabled={busy}>
            {busy
              ? 'Please wait…'
              : {
                  login: 'Log in',
                  signup: 'Create account',
                  forgot: 'Send reset email',
                  reset: 'Save new password',
                }[mode]}
          </button>
        </form>
      )}
      {failure && (
        <div className="auth-feedback error" role="alert">
          {failure}
        </div>
      )}
      {message && (
        <div className="auth-feedback" role="status">
          {message}
        </div>
      )}
      {canResend && (
        <button
          type="button"
          className="text-link"
          disabled={busy}
          onClick={() => void submit(true)}
        >
          Resend confirmation email
        </button>
      )}
      <nav className="auth-actions" aria-label="Account access">
        {mode === 'login' ? (
          <>
            <button
              type="button"
              className="text-link"
              disabled={busy}
              onClick={() => onMode('forgot')}
            >
              Forgot password?
            </button>
            <button
              type="button"
              className="text-link"
              disabled={busy}
              onClick={() => onMode('signup')}
            >
              Create an account
            </button>
          </>
        ) : (
          <button
            type="button"
            className="text-link"
            disabled={busy}
            onClick={() =>
              onMode(session && mode === 'forgot' ? null : 'login')
            }
          >
            {session && mode === 'forgot'
              ? 'Back to library'
              : 'Back to log in'}
          </button>
        )}
        {mode === 'reset' && (
          <button
            type="button"
            className="text-link"
            disabled={busy}
            onClick={() => onMode('forgot')}
          >
            Request a new reset email
          </button>
        )}
      </nav>
      {mode === 'login' && (
        <p className="auth-help">
          Previously used email sign-in links? Choose{' '}
          <strong>Forgot password?</strong> to set a password for the same email
          address. Your teams stay with your account.
        </p>
      )}
    </>
  );
}
