import Link from 'next/link';
import { AppShell } from '../components/app-shell';
import { EnvNotice } from '../components/env-notice';

export default function HomePage() {
  return (
    <AppShell
      title="ShopPilot Phase 0 Foundation"
      subtitle="Monorepo, runtime, and quality gate baseline"
    >
      <EnvNotice />
      <section className="rounded-lg border bg-card p-6">
        <h2 className="text-lg font-semibold text-card-foreground">Diagnostics</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Use the health-check route to verify API readiness and environment wiring.
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          <Link
            href="/health-check"
            className="inline-flex items-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
          >
            Open health check
          </Link>
        </div>
      </section>
      <section className="rounded-lg border bg-card p-6">
        <h2 className="text-lg font-semibold text-card-foreground">Authentication</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Test registration, login, password reset, and protected account flows.
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          <Link
            href="/login"
            className="inline-flex items-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
          >
            Sign in
          </Link>
          <Link
            href="/register"
            className="inline-flex items-center rounded-md border bg-card px-4 py-2 text-sm font-medium text-card-foreground"
          >
            Create account
          </Link>
        </div>
      </section>
    </AppShell>
  );
}
