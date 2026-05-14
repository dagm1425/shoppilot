'use client';

import { useState } from 'react';
import * as Sentry from '@sentry/nextjs';
import { requestPasswordReset } from '../lib/auth-api';
import { forgotPasswordSchema, getErrorMessage } from '../lib/auth-form-schemas';
import { AuthNotice } from './auth-notice';

export function ForgotPasswordForm() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSuccess(null);

    const parsed = forgotPasswordSchema.safeParse({ email });
    if (!parsed.success) {
      setError(getErrorMessage(parsed.error.issues[0]?.message));
      return;
    }

    setLoading(true);

    try {
      const result = await requestPasswordReset(parsed.data);

      if (!result.ok) {
        setError(result.message);
        return;
      }

      setSuccess(result.data.message);
    } catch (error) {
      Sentry.captureException(error);
      setError('Unable to process reset request right now.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-lg border bg-card p-6">
      <h2 className="text-lg font-semibold text-card-foreground">Forgot password</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        Enter your email to receive password reset instructions.
      </p>

      <label htmlFor="email" className="mt-4 flex flex-col gap-2 text-sm text-foreground">
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
        {loading ? 'Submitting...' : 'Request reset'}
      </button>
    </form>
  );
}
