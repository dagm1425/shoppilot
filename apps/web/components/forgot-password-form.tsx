'use client';

import { useState } from 'react';
import { requestPasswordReset } from '../lib/auth-api';
import { forgotPasswordSchema, getErrorMessage } from '../lib/auth-form-schemas';
import { reportClientError } from '../lib/client-error';
import { showToast } from '../lib/toast-store';

export function ForgotPasswordForm() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setEmailError(null);
    setSuccess(null);

    const parsed = forgotPasswordSchema.safeParse({ email });
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      const message = getErrorMessage(issue?.message);
      if (issue?.path[0] === 'email') {
        setEmailError(message);
      } else {
        showToast({ variant: 'error', message });
      }
      return;
    }

    setLoading(true);

    try {
      const result = await requestPasswordReset(parsed.data);

      if (!result.ok) {
        showToast({
          variant: 'error',
          message: result.message,
        });
        return;
      }

      setSuccess(result.data.message);
    } catch (error) {
      reportClientError({ error, context: 'forgot-password:submit' });
      showToast({
        variant: 'error',
        message: 'Unable to process reset request right now.',
      });
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
          aria-invalid={emailError ? 'true' : 'false'}
        />
        {emailError ? <p className="text-sm text-danger">{emailError}</p> : null}
      </label>

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
        {loading ? 'Submitting...' : 'Request reset'}
      </button>
    </form>
  );
}
