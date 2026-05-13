'use client';

import { AppShell } from '../components/app-shell';
import { StatePanel } from '../components/state-panel';

export default function ErrorPage({ reset }: { error: Error; reset: () => void }) {
  return (
    <AppShell
      title="Unexpected UI error"
      subtitle="A non-fatal rendering error occurred."
    >
      <StatePanel
        variant="error"
        title="Rendering failed"
        description="Try resetting the route. If the issue persists, check console logs."
      >
        <button
          onClick={reset}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
        >
          Reset route
        </button>
      </StatePanel>
    </AppShell>
  );
}
