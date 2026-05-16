import type { CartLineItem as CartLineItemData } from '@shoppilot/db/cart-contract';
import Link from 'next/link';
import { LuTrash2 } from 'react-icons/lu';
import { CartQuantityControl } from './cart-quantity-control';

function formatMoney(cents: number, currency: string): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
  }).format(cents / 100);
}

function getInvalidMessage(item: CartLineItemData): string {
  if (item.invalidReason === 'PRODUCT_UNAVAILABLE') {
    return 'This product is currently unavailable.';
  }

  if (item.invalidReason === 'INSUFFICIENT_STOCK') {
    return `Only ${item.stock} unit(s) are currently available.`;
  }

  return 'This item requires an update before checkout.';
}

type CartLineItemProps = {
  item: CartLineItemData;
  pending: boolean;
  onIncrease: () => void;
  onDecrease: () => void;
  onRemove: () => void;
};

export function CartLineItem({
  item,
  pending,
  onIncrease,
  onDecrease,
  onRemove,
}: CartLineItemProps) {
  const isUnavailable = !item.isValid && item.invalidReason === 'PRODUCT_UNAVAILABLE';
  const canDecrease = item.quantity > 1;
  const canIncrease = item.isValid && item.quantity < item.stock;

  return (
    <li className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-start gap-4">
        <Link
          href={`/catalog/${item.productId}`}
          className="block h-24 w-20 shrink-0 overflow-hidden rounded-md border border-border bg-muted"
        >
          <img
            src={item.primaryImageUrl}
            alt={`${item.name} image`}
            className="h-full w-full object-cover"
          />
        </Link>

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div>
              <Link
                href={`/catalog/${item.productId}`}
                className="text-sm font-semibold text-foreground hover:underline"
              >
                {item.name}
              </Link>
              <p className="mt-1 text-xs text-muted-foreground">
                {item.size.toUpperCase()} · {item.fit} · {item.color}
              </p>
            </div>
            <button
              type="button"
              aria-label={`Remove ${item.name}`}
              disabled={pending}
              onClick={onRemove}
              className="inline-flex size-8 items-center justify-center rounded-md border border-border text-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:text-muted-foreground"
            >
              <LuTrash2 className="size-4" aria-hidden="true" />
            </button>
          </div>

          {!item.isValid ? (
            <p className="mt-2 rounded-md border border-warning/40 bg-warning/10 px-2.5 py-2 text-xs text-foreground">
              {getInvalidMessage(item)}
            </p>
          ) : null}

          <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
            <CartQuantityControl
              quantity={item.quantity}
              disabled={pending || isUnavailable}
              canDecrease={canDecrease}
              canIncrease={canIncrease}
              onDecrease={onDecrease}
              onIncrease={onIncrease}
            />
            <p className="text-sm font-semibold text-foreground">
              {formatMoney(item.lineSubtotalCents, item.currency)}
            </p>
          </div>
        </div>
      </div>
    </li>
  );
}
