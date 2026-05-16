'use client';

import type { CartLineItem as CartLineItemData } from '@shoppilot/db/cart-contract';
import Link from 'next/link';
import { LuMinus, LuPlus, LuTrash2 } from 'react-icons/lu';
import { formatDrawerMoney } from './cart-wishlist-drawer-utils';

type CartDrawerItemRowProps = {
  item: CartLineItemData;
  quantityPending: boolean;
  removePending: boolean;
  onClose: () => void;
  onRemove: (itemId: string) => void;
  onUpdateQuantity: (item: CartLineItemData, nextQuantity: number) => void;
};

export function CartDrawerItemRow({
  item,
  quantityPending,
  removePending,
  onClose,
  onRemove,
  onUpdateQuantity,
}: CartDrawerItemRowProps) {
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
                {item.color} - {item.size.toUpperCase()} - {item.fit}
              </p>
            </div>

            <button
              type="button"
              onClick={() => onRemove(item.itemId)}
              disabled={removePending}
              aria-label="Remove item"
              className="inline-flex size-8 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-60"
            >
              <LuTrash2 className="size-4" aria-hidden="true" />
            </button>
          </div>

          <div className="mt-3 flex items-end justify-between gap-3">
            <p className="text-sm font-semibold text-foreground">
              {formatDrawerMoney(item.lineSubtotalCents, item.currency)}
            </p>

            <div className="inline-flex h-8 items-center border border-border">
              <button
                type="button"
                aria-label="Decrease quantity"
                onClick={() => onUpdateQuantity(item, Math.max(1, item.quantity - 1))}
                disabled={item.quantity <= 1 || quantityPending}
                className="inline-flex h-full w-8 items-center justify-center text-foreground transition-colors hover:bg-muted disabled:opacity-50"
              >
                <LuMinus className="size-3" aria-hidden="true" />
              </button>
              <span className="inline-flex w-8 items-center justify-center text-xs text-foreground">
                {item.quantity}
              </span>
              <button
                type="button"
                aria-label="Increase quantity"
                onClick={() => onUpdateQuantity(item, item.quantity + 1)}
                disabled={quantityPending}
                className="inline-flex h-full w-8 items-center justify-center text-foreground transition-colors hover:bg-muted disabled:opacity-50"
              >
                <LuPlus className="size-3" aria-hidden="true" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </li>
  );
}
