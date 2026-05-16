'use client';

import type { WishlistResponse } from '@shoppilot/db/wishlist-contract';
import Link from 'next/link';
import { LuTrash2 } from 'react-icons/lu';
import { formatDrawerMoney } from './cart-wishlist-drawer-utils';

type WishlistItem = WishlistResponse['items'][number];

type WishlistDrawerItemRowProps = {
  item: WishlistItem;
  pending: boolean;
  onClose: () => void;
  onRemove: (itemId: string, productId: string) => void;
  onAddToBag: (productId: string) => void;
};

export function WishlistDrawerItemRow({
  item,
  pending,
  onClose,
  onRemove,
  onAddToBag,
}: WishlistDrawerItemRowProps) {
  return (
    <li className="py-4">
      <div className="flex gap-3">
        <Link
          href={`/catalog/${item.productId}`}
          onClick={onClose}
          className="h-28 w-[4.75rem] shrink-0 overflow-hidden bg-muted"
        >
          <img src={item.primaryImageUrl} alt={item.name} className="h-full w-full object-cover" />
        </Link>

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <Link
                href={`/catalog/${item.productId}`}
                onClick={onClose}
                className="line-clamp-2 text-sm leading-tight text-foreground hover:underline"
              >
                {item.name}
              </Link>
              <p className="mt-1 text-xs text-muted-foreground">
                {item.color} - {item.fit}
              </p>
            </div>

            <button
              type="button"
              onClick={() => onRemove(item.itemId, item.productId)}
              disabled={pending}
              aria-label="Remove item"
              className="inline-flex size-8 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-60"
            >
              <LuTrash2 className="size-4" aria-hidden="true" />
            </button>
          </div>

          <div className="mt-3 flex items-end justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-foreground">
                {formatDrawerMoney(item.priceCents, item.currency)}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {item.available ? 'In stock' : 'Out of stock'}
              </p>
            </div>
            <button
              type="button"
              onClick={() => onAddToBag(item.productId)}
              disabled={!item.available || pending}
              className="inline-flex h-9 items-center justify-center rounded-pill border border-foreground px-4 font-auth-heading text-[0.6875rem] font-bold uppercase tracking-[0.08em] text-foreground transition-colors hover:bg-foreground hover:text-background disabled:cursor-not-allowed disabled:border-muted-foreground disabled:text-muted-foreground"
            >
              Add to bag
            </button>
          </div>
        </div>
      </div>
    </li>
  );
}
