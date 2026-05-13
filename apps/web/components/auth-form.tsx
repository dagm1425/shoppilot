'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { AuthNotice } from './auth-notice';
import { PasswordField } from './password-field';
import { login, register } from '../lib/auth-api';
import {
  getErrorMessage,
  loginFormSchema,
  registerFormSchema,
} from '../lib/auth-form-schemas';
import { useAuthStore } from '../lib/auth-store';

type AuthMode = 'login' | 'register';

type AuthFormProps = {
  mode: AuthMode;
};

export function AuthForm({ mode }: AuthFormProps) {
  const router = useRouter();
  const setUser = useAuthStore((state) => state.setUser);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSuccess(null);

    if (mode === 'login') {
      const parsed = loginFormSchema.safeParse({ email, password, rememberMe });
      if (!parsed.success) {
        setError(getErrorMessage(parsed.error.issues[0]?.message));
        return;
      }
    } else {
      const parsed = registerFormSchema.safeParse({ email, password });
      if (!parsed.success) {
        setError(getErrorMessage(parsed.error.issues[0]?.message));
        return;
      }
    }

    setLoading(true);

    try {
      const result =
        mode === 'login'
          ? await login({ email, password, rememberMe })
          : await register({ email, password });

      if (!result.ok) {
        setError(result.message);
        return;
      }

      setUser(result.data.user);
      setSuccess(mode === 'login' ? 'Login successful.' : 'Registration successful.');
      router.push('/account');
    } catch {
      setError('Unable to complete this action. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-lg border bg-card p-6">
      <h2 className="text-lg font-semibold text-card-foreground">
        {mode === 'login' ? 'Sign in' : 'Create account'}
      </h2>
      <p className="mt-2 text-sm text-muted-foreground">
        {mode === 'login'
          ? 'Use your credentials to continue to your account.'
          : 'Create a customer account for checkout and order tracking.'}
      </p>

      <div className="mt-4 flex flex-col gap-4">
        <label htmlFor="email" className="flex flex-col gap-2 text-sm text-foreground">
          <span className="font-medium">Email</span>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            disabled={loading}
            autoComplete="email"
            placeholder="you@example.com"
            className="rounded-md border bg-card px-3 py-2 text-sm text-card-foreground outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed"
          />
        </label>

        <PasswordField
          id="password"
          label="Password"
          value={password}
          onChange={setPassword}
          disabled={loading}
        />

        {mode === 'login' ? (
          <label className="flex items-center gap-2 text-sm text-foreground">
            <input
              type="checkbox"
              checked={rememberMe}
              onChange={(event) => setRememberMe(event.target.checked)}
              disabled={loading}
              className="size-4 rounded border"
            />
            <span>Remember me</span>
          </label>
        ) : null}
      </div>

      {error ? (
        <div className="mt-4">
          <AuthNotice variant="error" message={error} />
        </div>
      ) : null}

      {success ? (
        <div className="mt-4">
          <AuthNotice variant="success" message={success} />
        </div>
      ) : null}

      <button
        type="submit"
        disabled={loading}
        className="mt-6 inline-flex w-full items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:cursor-not-allowed disabled:opacity-70"
      >
        {loading ? 'Submitting...' : mode === 'login' ? 'Sign in' : 'Create account'}
      </button>

      {mode === 'login' ? (
        <div className="mt-4 flex items-center justify-between gap-2 text-sm text-muted-foreground">
          <Link href="/forgot-password" className="text-primary">
            Forgot password?
          </Link>
          <Link href="/register" className="text-primary">
            Need an account?
          </Link>
        </div>
      ) : (
        <div className="mt-4 text-sm text-muted-foreground">
          Already have an account?{' '}
          <Link href="/login" className="text-primary">
            Sign in
          </Link>
        </div>
      )}
    </form>
  );
}
