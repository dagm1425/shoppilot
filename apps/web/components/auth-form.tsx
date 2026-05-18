'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { PasswordField } from './password-field';
import { login, register } from '../lib/auth-api';
import { fetchCart } from '../lib/cart-api';
import { fetchWishlist } from '../lib/wishlist-api';
import {
  getErrorMessage,
  loginFormSchema,
  registerFormSchema,
} from '../lib/auth-form-schemas';
import { useAuthStore } from '../lib/auth-store';
import { useCartUiStore } from '../lib/cart-ui-store';
import { useWishlistUiStore } from '../lib/wishlist-ui-store';
import { reportClientError } from '../lib/client-error';
import { showToast } from '../lib/toast-store';

type AuthMode = 'login' | 'register';

type AuthFormProps = {
  mode: AuthMode;
  postLoginRedirect?: string | null;
};

type AuthTextFieldProps = {
  id: string;
  label: string;
  type: 'text' | 'email';
  autoComplete: string;
  value: string;
  disabled: boolean;
  error: string | null;
  onChange: (value: string) => void;
};

function resolvePostAuthRedirect(rawRedirect: string | null): string {
  if (!rawRedirect || !rawRedirect.startsWith('/') || rawRedirect.startsWith('//')) {
    return '/catalog';
  }

  return rawRedirect;
}

function resolvePostLoginRoute(rawRedirect: string | null, role: 'CUSTOMER' | 'ADMIN'): string {
  if (role === 'ADMIN') {
    return '/admin';
  }

  return resolvePostAuthRedirect(rawRedirect);
}

function AuthTextField({
  id,
  label,
  type,
  autoComplete,
  value,
  disabled,
  error,
  onChange,
}: AuthTextFieldProps) {
  return (
    <div className="space-y-1.5">
      <div className="relative">
        <input
          id={id}
          type={type}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          disabled={disabled}
          autoComplete={autoComplete}
          placeholder={label}
          className="auth-input h-auth-input w-full rounded-auth border-auth border-auth-line bg-auth-panel px-4 pb-2 pt-6 font-auth-body text-base text-auth-ink outline-none transition-colors duration-150 placeholder:text-transparent focus:border-auth-focus disabled:cursor-not-allowed disabled:opacity-70"
          aria-invalid={error ? 'true' : 'false'}
        />
        <label htmlFor={id} className="auth-floating-label">
          {label}
        </label>
      </div>
      {error ? <p className="text-xs text-danger">{error}</p> : null}
    </div>
  );
}

export function AuthForm({ mode, postLoginRedirect = null }: AuthFormProps) {
  const router = useRouter();
  const setUser = useAuthStore((state) => state.setUser);
  const syncCart = useCartUiStore((state) => state.syncCart);
  const resetSummary = useCartUiStore((state) => state.resetSummary);
  const syncWishlist = useWishlistUiStore((state) => state.syncWishlist);
  const resetWishlist = useWishlistUiStore((state) => state.resetWishlist);
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [loading, setLoading] = useState(false);
  const [usernameError, setUsernameError] = useState<string | null>(null);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setUsernameError(null);
    setEmailError(null);
    setPasswordError(null);

    if (mode === 'login') {
      const parsed = loginFormSchema.safeParse({ email, password, rememberMe });
      if (!parsed.success) {
        const issue = parsed.error.issues[0];
        const message = getErrorMessage(issue?.message);
        if (issue?.path[0] === 'email') {
          setEmailError(message);
        } else if (issue?.path[0] === 'password') {
          setPasswordError(message);
        } else {
          showToast({ variant: 'error', message });
        }
        return;
      }
    } else {
      const parsed = registerFormSchema.safeParse({ username, email, password });
      if (!parsed.success) {
        const issue = parsed.error.issues[0];
        const message = getErrorMessage(issue?.message);
        if (issue?.path[0] === 'username') {
          setUsernameError(message);
        } else if (issue?.path[0] === 'email') {
          setEmailError(message);
        } else if (issue?.path[0] === 'password') {
          setPasswordError(message);
        } else {
          showToast({ variant: 'error', message });
        }
        return;
      }
    }

    setLoading(true);

    try {
      const result =
        mode === 'login'
          ? await login({ email, password, rememberMe })
          : await register({ username, email, password });

      if (!result.ok) {
        showToast({
          variant: 'error',
          message: result.message,
        });
        return;
      }

      setUser(result.data.user);
      if (mode === 'login') {
        try {
          const [cartResult, wishlistResult] = await Promise.all([fetchCart(), fetchWishlist()]);
          if (cartResult.ok) {
            syncCart(cartResult.data);
          } else {
            resetSummary();
          }

          if (wishlistResult.ok) {
            syncWishlist(wishlistResult.data);
          } else {
            resetWishlist();
          }
        } catch {
          resetSummary();
          resetWishlist();
        }
      }
      const nextRoute =
        mode === 'login'
          ? resolvePostLoginRoute(postLoginRedirect, result.data.user.role)
          : '/catalog';
      router.push(nextRoute);
    } catch (error) {
      reportClientError({ error, context: `${mode}:submit` });
      showToast({
        variant: 'error',
        message: 'Unable to complete this action. Please try again.',
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-auth border-auth border-auth-line bg-auth-panel px-7 py-8 shadow-auth"
    >
      <h2 className="sr-only">{mode === 'login' ? 'Sign in form' : 'Create account form'}</h2>
      <p className="text-center font-auth-body text-sm text-auth-muted">
        {mode === 'login'
          ? 'Welcome back. Sign in to continue.'
          : 'One account across checkout and order tracking.'}
      </p>

      <div className="mt-6 flex flex-col gap-3">
        {mode === 'register' ? (
          <AuthTextField
            id="username"
            type="text"
            label="Username"
            value={username}
            onChange={setUsername}
            disabled={loading}
            autoComplete="username"
            error={usernameError}
          />
        ) : null}

        <AuthTextField
          id="email"
          type="email"
          label="Email"
          value={email}
          onChange={setEmail}
          disabled={loading}
          autoComplete="email"
          error={emailError}
        />

        <PasswordField
          id="password"
          label="Password"
          value={password}
          onChange={setPassword}
          error={passwordError ?? undefined}
          disabled={loading}
          autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
          variant="auth"
        />

        {mode === 'login' ? (
          <div className="flex items-center justify-between gap-3 pt-1">
            <div className="flex items-center gap-2">
              <input
                id="rememberMe"
                type="checkbox"
                checked={rememberMe}
                onChange={(event) => setRememberMe(event.target.checked)}
                disabled={loading}
                className="size-4 rounded border-auth border-auth-line text-auth-ink focus:ring-auth-ink"
              />
              <label htmlFor="rememberMe" className="font-auth-body text-sm text-auth-ink">
                Remember me
              </label>
            </div>
            <Link href="/forgot-password" className="font-auth-body text-sm font-medium text-auth-ink underline">
              Forgot password?
            </Link>
          </div>
        ) : null}
      </div>

      <button
        type="submit"
        disabled={loading}
        aria-busy={loading}
        className="mt-6 inline-flex min-h-[3.25rem] w-full items-center justify-center rounded-pill bg-auth-button px-4 py-2 font-auth-heading text-sm font-bold uppercase tracking-[0.08em] text-auth-button-foreground transition-opacity disabled:cursor-not-allowed disabled:opacity-70"
      >
        {loading ? (
          <span className="inline-flex items-center gap-2">
            <span
              aria-hidden="true"
              className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent"
            />
            <span>{mode === 'login' ? 'Sign in' : 'Create account'}</span>
          </span>
        ) : (
          mode === 'login' ? 'Sign in' : 'Create account'
        )}
      </button>

      {mode === 'login' ? (
        <p className="mt-5 text-center font-auth-body text-sm text-auth-muted">
          Need an account?{' '}
          <Link href="/register" className="font-semibold text-auth-ink underline">
            Create one
          </Link>
        </p>
      ) : (
        <p className="mt-5 text-center font-auth-body text-sm text-auth-muted">
          Already have an account?{' '}
          <Link href="/login" className="font-semibold text-auth-ink underline">
            Sign in
          </Link>
        </p>
      )}
    </form>
  );
}
