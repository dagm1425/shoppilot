'use client';

import Link from 'next/link';

type CartWishlistDrawerFooterProps = {
  subtotalLabel: string;
  onClose: () => void;
};

export function CartWishlistDrawerFooter({ subtotalLabel, onClose }: CartWishlistDrawerFooterProps) {
  return (
    <footer className="sticky bottom-0 z-10 border-t border-border bg-background p-4">
      <div className="mb-3 flex items-center justify-between text-sm text-foreground">
        <span className="font-medium">Subtotal</span>
        <span className="font-semibold">{subtotalLabel}</span>
      </div>
      <Link
        href="/cart"
        onClick={onClose}
        className="inline-flex h-11 w-full items-center justify-center rounded-pill bg-foreground px-6 font-auth-heading text-xs font-bold uppercase tracking-[0.08em] text-background"
      >
        Checkout securely
      </Link>
    </footer>
  );
}
