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
    <form
      onSubmit={handleSubmit}
      className="rounded-auth border-auth border-auth-line bg-auth-panel px-7 py-8 shadow-auth"
    >
      <h2 className="sr-only">Forgot password form</h2>
      <p className="text-center font-auth-body text-sm text-auth-muted">
        Enter your account email and we&apos;ll send a secure reset link.
      </p>

      <div className="mt-6 flex flex-col gap-3">
        <div className="space-y-1.5">
          <div className="relative">
            <input
              id="email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              disabled={loading}
              autoComplete="email"
              placeholder="Email"
              className="auth-input h-auth-input w-full rounded-auth border-auth border-auth-line bg-auth-panel px-4 pb-2 pt-6 font-auth-body text-base text-auth-ink outline-none transition-colors duration-150 placeholder:text-transparent focus:border-auth-focus disabled:cursor-not-allowed disabled:opacity-70"
              aria-invalid={emailError ? 'true' : 'false'}
            />
            <label htmlFor="email" className="auth-floating-label">
              Email
            </label>
          </div>
          {emailError ? <p className="text-xs text-danger">{emailError}</p> : null}
        </div>

        {success ? (
          <p className="rounded-auth border-auth border-auth-line bg-auth-bg px-4 py-3 text-center font-auth-body text-sm text-auth-ink">
            {success}
          </p>
        ) : null}
      </div>

      <button
        type="submit"
        disabled={loading}
        className="mt-6 inline-flex min-h-[3.25rem] w-full items-center justify-center rounded-pill bg-auth-button px-4 py-2 font-auth-heading text-sm font-bold uppercase tracking-[0.08em] text-auth-button-foreground transition-opacity disabled:cursor-not-allowed disabled:opacity-70"
      >
        {loading ? 'Submitting...' : 'Request reset'}
      </button>
    </form>
  );
}
