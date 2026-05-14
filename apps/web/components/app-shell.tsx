import type { ReactNode } from 'react';
import { cn } from '../lib/utils';

type AppShellProps = {
  title: string;
  subtitle: string;
  children: ReactNode;
  variant?: 'default' | 'auth';
};

export function AppShell({ title, subtitle, children, variant = 'default' }: AppShellProps) {
  if (variant === 'auth') {
    return (
      <main className={cn('min-h-screen bg-auth-radial px-4 py-10 sm:px-6 lg:px-8')}>
        <div className="mx-auto w-full max-w-auth">
          <header className="mb-6 text-center font-auth-body">
            <p className="text-xs uppercase tracking-[0.22em] text-auth-muted">ShopPilot Account</p>
            <h1 className="mt-4 font-auth-heading text-3xl font-bold uppercase tracking-[0.06em] text-auth-ink">
              {title}
            </h1>
            <p className="mt-3 text-sm text-auth-muted">{subtitle}</p>
          </header>
          {children}
        </div>
      </main>
    );
  }

  return (
    <main className={cn('min-h-screen bg-background px-4 py-8 sm:px-6 lg:px-10')}>
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
        <header className="rounded-lg border bg-card p-6">
          <h1 className="text-2xl font-semibold tracking-tight text-card-foreground">{title}</h1>
          <p className="mt-2 text-sm text-muted-foreground">{subtitle}</p>
        </header>
        {children}
      </div>
    </main>
  );
}
