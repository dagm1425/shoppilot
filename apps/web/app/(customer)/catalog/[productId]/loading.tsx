export default function ProductDetailsLoadingPage() {
  return (
    <main id="main-content" className="min-h-screen bg-card px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto w-full max-w-[92rem]">
        <section className="grid gap-4 lg:grid-cols-2 lg:items-start lg:gap-0">
          <section className="min-w-0">
            <div className="aspect-[4/5] animate-pulse bg-muted" />
            <div className="mt-3 grid grid-cols-5 gap-2">
              {Array.from({ length: 5 }).map((_, index) => (
                <div key={index} className="aspect-[4/5] animate-pulse bg-muted" />
              ))}
            </div>
          </section>

          <div className="lg:flex lg:justify-center lg:pt-10">
            <section className="w-full max-w-[25.625rem]">
              <div className="h-6 w-4/5 animate-pulse rounded bg-muted" />
              <div className="mt-2 h-4 w-1/3 animate-pulse rounded bg-muted" />
              <div className="mt-3 h-5 w-1/4 animate-pulse rounded bg-muted" />

              <div className="mt-6 border-y border-border py-6">
                <div className="h-5 w-24 animate-pulse rounded bg-muted" />
              </div>

              <div className="pt-6">
                <div className="h-8 w-28 animate-pulse rounded bg-muted" />
              </div>

              <div className="mt-6 rounded-sm border border-border p-2">
                <div className="grid grid-cols-4 gap-1">
                  {Array.from({ length: 4 }).map((_, index) => (
                    <div key={index} className="h-12 animate-pulse bg-muted" />
                  ))}
                </div>
                <div className="mx-auto mt-4 h-4 w-2/3 animate-pulse rounded bg-muted" />
              </div>

              <div className="mt-6 flex items-center justify-between">
                <div className="h-4 w-16 animate-pulse rounded bg-muted" />
                <div className="h-9 w-28 animate-pulse rounded bg-muted" />
              </div>

              <div className="mt-4 h-[3.375rem] w-full animate-pulse rounded-pill bg-muted" />
              <div className="mt-2 h-4 w-1/3 animate-pulse rounded bg-muted" />

              <div className="mt-8 border-t border-border pt-5">
                <div className="h-4 w-24 animate-pulse rounded bg-muted" />
                <div className="mt-2 h-4 w-full animate-pulse rounded bg-muted" />
                <div className="mt-2 h-4 w-5/6 animate-pulse rounded bg-muted" />
                <div className="mt-2 h-4 w-2/3 animate-pulse rounded bg-muted" />
              </div>
            </section>
          </div>
        </section>
      </div>
    </main>
  );
}
