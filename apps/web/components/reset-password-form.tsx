'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { confirmPasswordReset } from '../lib/auth-api';
import { getErrorMessage, resetPasswordSchema } from '../lib/auth-form-schemas';
import { PasswordField } from './password-field';
import { reportClientError } from '../lib/client-error';
import { showToast } from '../lib/toast-store';

type ResetPasswordFormProps = {
  initialToken?: string;
};

export function ResetPasswordForm({ initialToken = '' }: ResetPasswordFormProps) {
  const router = useRouter();
  const [token, setToken] = useState(initialToken);
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [tokenError, setTokenError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setTokenError(null);
    setPasswordError(null);
    setSuccess(null);

    const parsed = resetPasswordSchema.safeParse({ token, password });
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      const message = getErrorMessage(issue?.message);
      if (issue?.path[0] === 'token') {
        setTokenError(message);
      } else if (issue?.path[0] === 'password') {
        setPasswordError(message);
      } else {
        showToast({ variant: 'error', message });
      }
      return;
    }

    setLoading(true);

    try {
      const result = await confirmPasswordReset(parsed.data);

      if (!result.ok) {
        showToast({
          variant: 'error',
          message: result.message,
        });
        return;
      }

      setSuccess(result.data.message);
      setTimeout(() => {
        router.push('/login');
      }, 800);
    } catch (error) {
      reportClientError({ error, context: 'reset-password:submit' });
      showToast({
        variant: 'error',
        message: 'Unable to reset password at this time.',
      });
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
              aria-invalid={tokenError ? 'true' : 'false'}
            />
            {tokenError ? <p className="text-sm text-danger">{tokenError}</p> : null}
          </label>
        ) : null}

        <PasswordField
          id="password"
          label="New password"
          value={password}
          onChange={setPassword}
          error={passwordError ?? undefined}
          disabled={loading}
        />
      </div>

      {success ? (
        <p className="mt-4 rounded-md border border-success/40 bg-success/10 px-3 py-2 text-sm text-foreground">
          {success}
        </p>
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
