import type { CartSummary } from '@shoppilot/db/cart-contract';

function formatMoney(cents: number, currency: string): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
  }).format(cents / 100);
}

type CartSummaryCardProps = {
  summary: CartSummary;
  hasInvalidItems: boolean;
};

export function CartSummaryCard({ summary, hasInvalidItems }: CartSummaryCardProps) {
  return (
    <section className="rounded-lg border border-border bg-card p-5">
      <h2 className="font-auth-heading text-sm font-bold uppercase tracking-wider text-foreground">
        Order summary
      </h2>
      <dl className="mt-4 space-y-2 text-sm">
        <div className="flex items-center justify-between gap-4 text-muted-foreground">
          <dt>Items</dt>
          <dd>{summary.itemCount}</dd>
        </div>
        <div className="flex items-center justify-between gap-4 text-muted-foreground">
          <dt>Valid lines</dt>
          <dd>{summary.validLineCount}</dd>
        </div>
        <div className="flex items-center justify-between gap-4 border-t border-border pt-3 font-semibold text-foreground">
          <dt>Subtotal</dt>
          <dd>{formatMoney(summary.subtotalCents, summary.currency)}</dd>
        </div>
      </dl>
      {hasInvalidItems ? (
        <p className="mt-3 rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-foreground">
          One or more items are unavailable and excluded from subtotal.
        </p>
      ) : null}
    </section>
  );
}
