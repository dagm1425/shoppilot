'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { logout } from '../lib/auth-api';
import { useAuthStore } from '../lib/auth-store';
import { AuthNotice } from './auth-notice';

export function AccountPanel() {
  const router = useRouter();
  const user = useAuthStore((state) => state.user);
  const clearUser = useAuthStore((state) => state.clearUser);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleLogout() {
    setLoading(true);
    setError(null);

    try {
      const result = await logout();
      if (!result.ok) {
        setError(result.message);
        return;
      }

      clearUser();
      router.push('/login');
    } catch {
      setError('Unable to log out.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="rounded-lg border bg-card p-6">
      <h2 className="text-lg font-semibold text-card-foreground">Account</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        Signed in as <span className="font-medium text-card-foreground">{user?.email}</span>
      </p>
      <p className="mt-1 text-sm text-muted-foreground">
        Role: <span className="font-medium text-card-foreground">{user?.role ?? 'CUSTOMER'}</span>
      </p>

      {error ? (
        <div className="mt-4">
          <AuthNotice variant="error" message={error} />
        </div>
      ) : null}

      <button
        type="button"
        onClick={handleLogout}
        disabled={loading}
        className="mt-6 inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:cursor-not-allowed disabled:opacity-70"
      >
        {loading ? 'Signing out...' : 'Sign out'}
      </button>
    </section>
  );
}
