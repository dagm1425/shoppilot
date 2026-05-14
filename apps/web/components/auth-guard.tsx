'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { fetchMe } from '../lib/auth-api';
import type { AuthUser } from '../lib/auth-store';
import { useAuthStore } from '../lib/auth-store';
import { reportClientError } from '../lib/client-error';
import { StatePanel } from './state-panel';

type AuthGuardProps = {
  children: ReactNode;
  allowedRoles?: AuthUser['role'][];
};

export function AuthGuard({ children, allowedRoles }: AuthGuardProps) {
  const router = useRouter();
  const pathname = usePathname();
  const setUser = useAuthStore((state) => state.setUser);
  const clearUser = useAuthStore((state) => state.clearUser);
  const [status, setStatus] = useState<'loading' | 'error' | 'forbidden' | 'ready'>('loading');
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    let active = true;

    async function checkSession() {
      setStatus('loading');

      try {
        const result = await fetchMe();

        if (!active) {
          return;
        }

        if (!result.ok) {
          clearUser();
          router.replace(`/login?redirect=${encodeURIComponent(pathname)}`);
          return;
        }

        const authenticatedUser = result.data.user;
        setUser(authenticatedUser);

        if (allowedRoles && !allowedRoles.includes(authenticatedUser.role)) {
          setStatus('forbidden');
          return;
        }

        setStatus('ready');
      } catch (error) {
        if (!active) {
          return;
        }

        reportClientError({ error, context: 'auth-guard:fetch-me' });
        setErrorMessage('Unable to verify session right now.');
        setStatus('error');
      }
    }

    void checkSession();

    return () => {
      active = false;
    };
  }, [allowedRoles, clearUser, pathname, router, setUser]);

  if (status === 'loading') {
    return (
      <StatePanel
        variant="loading"
        title="Checking session"
        description="Verifying your authentication state."
      />
    );
  }

  if (status === 'error') {
    return (
      <StatePanel
        variant="error"
        title="Session check failed"
        description={errorMessage}
      />
    );
  }

  if (status === 'forbidden') {
    return (
      <StatePanel
        variant="error"
        title="Admin access required"
        description="Your account does not have permission to open this page."
      >
        <Link
          href="/account"
          className="inline-flex items-center rounded-md border bg-card px-3 py-2 text-sm font-medium text-card-foreground"
        >
          Return to account
        </Link>
      </StatePanel>
    );
  }

  return <>{children}</>;
}
