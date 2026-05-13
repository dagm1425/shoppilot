'use client';

import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { fetchMe } from '../lib/auth-api';
import { useAuthStore } from '../lib/auth-store';
import { StatePanel } from './state-panel';

type AuthGuardProps = {
  children: ReactNode;
};

export function AuthGuard({ children }: AuthGuardProps) {
  const router = useRouter();
  const pathname = usePathname();
  const setUser = useAuthStore((state) => state.setUser);
  const clearUser = useAuthStore((state) => state.clearUser);
  const [status, setStatus] = useState<'loading' | 'error' | 'ready'>('loading');
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

        setUser(result.data.user);
        setStatus('ready');
      } catch {
        if (!active) {
          return;
        }

        setErrorMessage('Unable to verify session right now.');
        setStatus('error');
      }
    }

    void checkSession();

    return () => {
      active = false;
    };
  }, [clearUser, pathname, router, setUser]);

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

  return <>{children}</>;
}
