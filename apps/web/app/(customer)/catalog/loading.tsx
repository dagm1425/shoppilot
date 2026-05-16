export default function CatalogLoadingPage() {
  return (
    <main id="main-content" className="min-h-screen bg-background px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto grid w-full max-w-[92rem] gap-6 md:grid-cols-[16rem_minmax(0,1fr)]">
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="h-4 w-24 animate-pulse rounded bg-muted" />
          <div className="mt-4 space-y-2">
            {Array.from({ length: 5 }).map((_, index) => (
              <div key={index} className="h-9 animate-pulse rounded bg-muted" />
            ))}
          </div>
        </div>

        <div className="rounded-lg border border-border bg-card p-4 sm:p-6">
          <div className="h-10 animate-pulse rounded bg-muted" />
          <div className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, index) => (
              <div key={index} className="space-y-3">
                <div className="aspect-[4/5] animate-pulse rounded bg-muted" />
                <div className="h-4 animate-pulse rounded bg-muted" />
                <div className="h-4 w-3/4 animate-pulse rounded bg-muted" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </main>
  );
}
