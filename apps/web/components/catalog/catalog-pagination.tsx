import { cn } from '../../lib/utils';

type CatalogPaginationProps = {
  currentPage: number;
  totalPages: number;
  disabled: boolean;
  onPageChange: (nextPage: number) => void;
};

function getVisiblePages(currentPage: number, totalPages: number): number[] {
  if (totalPages <= 5) {
    return Array.from({ length: totalPages }, (_, index) => index + 1);
  }

  const start = Math.max(1, currentPage - 2);
  const end = Math.min(totalPages, start + 4);
  const normalizedStart = Math.max(1, end - 4);

  return Array.from(
    { length: end - normalizedStart + 1 },
    (_, index) => normalizedStart + index,
  );
}

export function CatalogPagination({
  currentPage,
  totalPages,
  disabled,
  onPageChange,
}: CatalogPaginationProps) {
  if (totalPages <= 1) {
    return null;
  }

  const visiblePages = getVisiblePages(currentPage, totalPages);

  return (
    <nav aria-label="Catalog pagination" className="mt-8 flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={() => onPageChange(currentPage - 1)}
        disabled={disabled || currentPage <= 1}
        className="rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:text-muted-foreground"
      >
        Previous
      </button>

      {visiblePages.map((page) => (
        <button
          key={page}
          type="button"
          onClick={() => onPageChange(page)}
          disabled={disabled || page === currentPage}
          aria-current={page === currentPage ? 'page' : undefined}
          className={cn(
            'rounded-md border px-3 py-2 text-sm transition-colors disabled:cursor-not-allowed',
            page === currentPage
              ? 'border-foreground bg-foreground text-background'
              : 'border-border bg-background text-foreground hover:bg-muted',
          )}
        >
          {page}
        </button>
      ))}

      <button
        type="button"
        onClick={() => onPageChange(currentPage + 1)}
        disabled={disabled || currentPage >= totalPages}
        className="rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:text-muted-foreground"
      >
        Next
      </button>
    </nav>
  );
}
