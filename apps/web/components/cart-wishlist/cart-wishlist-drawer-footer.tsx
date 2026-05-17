'use client';

import { useRouter } from 'next/navigation';
import { useTransition } from 'react';
import { getCheckoutTotalCents, getEstimatedShippingCents } from '../../lib/checkout-pricing';
import { formatDrawerMoney } from './cart-wishlist-drawer-utils';

type CartWishlistDrawerFooterProps = {
  subtotalCents: number;
  currency: string;
  checkoutPending: boolean;
  onCheckoutStart: () => void;
};

export function CartWishlistDrawerFooter({
  subtotalCents,
  currency,
  checkoutPending,
  onCheckoutStart,
}: CartWishlistDrawerFooterProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const estimatedShippingCents = getEstimatedShippingCents(subtotalCents);
  const totalCents = getCheckoutTotalCents(subtotalCents);
  const isBusy = isPending || checkoutPending;

  return (
    <footer className="sticky bottom-0 z-10 border-t border-border bg-background p-4">
      <div className="mb-3 space-y-2 text-sm text-foreground">
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">Sub Total</span>
          <span className="font-medium">{formatDrawerMoney(subtotalCents, currency)}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">Estimated Shipping</span>
          <span className="font-medium">{formatDrawerMoney(estimatedShippingCents, currency)}</span>
        </div>
        <div className="flex items-center justify-between border-t border-border pt-2">
          <span className="font-semibold">Total</span>
          <span className="font-semibold">{formatDrawerMoney(totalCents, currency)}</span>
        </div>
      </div>
      <button
        type="button"
        disabled={isBusy}
        aria-busy={isBusy}
        onClick={() => {
          if (isBusy) {
            return;
          }

          onCheckoutStart();
          startTransition(() => {
            router.push('/checkout');
          });
        }}
        className="inline-flex h-11 w-full items-center justify-center rounded-pill bg-foreground px-6 font-auth-heading text-xs font-bold uppercase tracking-[0.08em] text-background disabled:cursor-not-allowed disabled:opacity-70"
      >
        <span className="inline-flex items-center gap-2">
          {isBusy ? (
            <span
              aria-hidden="true"
              className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent"
            />
          ) : (
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              className="size-4 fill-none stroke-current stroke-2"
            >
              <rect x="5" y="11" width="14" height="10" rx="2" ry="2" />
              <path d="M8 11V8a4 4 0 1 1 8 0v3" />
            </svg>
          )}
          <span>Checkout securely</span>
        </span>
      </button>
    </footer>
  );
}
