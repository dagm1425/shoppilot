export function CartWishlistDrawerListSkeleton() {
  return (
    <section className="space-y-3 px-5 py-6 sm:px-8">
      {Array.from({ length: 3 }).map((_, index) => (
        <div key={index} className="animate-pulse border-b border-border pb-3">
          <div className="h-4 w-2/3 rounded bg-muted" />
          <div className="mt-2 h-4 w-1/2 rounded bg-muted" />
        </div>
      ))}
    </section>
  );
}
