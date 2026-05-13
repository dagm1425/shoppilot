import type { ReactNode } from 'react';
import { cn } from '../lib/utils';

type AppShellProps = {
  title: string;
  subtitle: string;
  children: ReactNode;
};

export function AppShell({ title, subtitle, children }: AppShellProps) {
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
