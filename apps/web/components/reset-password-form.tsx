'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import * as Sentry from '@sentry/nextjs';
import { confirmPasswordReset } from '../lib/auth-api';
import { getErrorMessage, resetPasswordSchema } from '../lib/auth-form-schemas';
import { AuthNotice } from './auth-notice';
import { PasswordField } from './password-field';

type ResetPasswordFormProps = {
  initialToken?: string;
};

export function ResetPasswordForm({ initialToken = '' }: ResetPasswordFormProps) {
  const router = useRouter();
  const [token, setToken] = useState(initialToken);
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSuccess(null);

    const parsed = resetPasswordSchema.safeParse({ token, password });
    if (!parsed.success) {
      setError(getErrorMessage(parsed.error.issues[0]?.message));
      return;
    }

    setLoading(true);

    try {
      const result = await confirmPasswordReset(parsed.data);

      if (!result.ok) {
        setError(result.message);
        return;
      }

      setSuccess(result.data.message);
      setTimeout(() => {
        router.push('/login');
      }, 800);
    } catch (error) {
      Sentry.captureException(error);
      setError('Unable to reset password at this time.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-lg border bg-card p-6">
      <h2 className="text-lg font-semibold text-card-foreground">Reset password</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        Choose a new password for your account.
      </p>

      <div className="mt-4 flex flex-col gap-4">
        {token.length === 0 ? (
          <label htmlFor="token" className="flex flex-col gap-2 text-sm text-foreground">
            <span className="font-medium">Reset token</span>
            <input
              id="token"
              type="text"
              value={token}
              onChange={(event) => setToken(event.target.value)}
              disabled={loading}
              placeholder="Paste your reset token"
              className="rounded-md border bg-card px-3 py-2 text-sm text-card-foreground outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed"
            />
          </label>
        ) : null}

        <PasswordField
          id="password"
          label="New password"
          value={password}
          onChange={setPassword}
          disabled={loading}
        />
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
        {loading ? 'Updating...' : 'Reset password'}
      </button>
    </form>
  );
}
