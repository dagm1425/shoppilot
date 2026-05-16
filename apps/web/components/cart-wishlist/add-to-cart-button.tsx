'use client';

import type { AddCartItemInput, CartProductSize, CartResponse } from '@shoppilot/db/cart-contract';
import { usePathname, useRouter } from 'next/navigation';
import { addCartItem } from '../../lib/cart-api';
import { useCartUiStore } from '../../lib/cart-ui-store';
import { reportClientError } from '../../lib/client-error';
import { useAuthStore } from '../../lib/auth-store';

type AddToCartButtonProps = {
  productId: string;
  size: CartProductSize;
  quantity?: number;
  label?: string;
  disabled?: boolean;
  className?: string;
  onAdded?: (response: CartResponse) => void;
};

const defaultButtonClassName =
  'inline-flex h-10 w-full items-center justify-center rounded-md bg-foreground px-4 text-sm font-semibold text-background transition-colors hover:bg-foreground/90 disabled:cursor-not-allowed disabled:bg-muted-foreground';

export function AddToCartButton({
  productId,
  size,
  quantity = 1,
  label = 'Add to bag',
  disabled = false,
  className,
  onAdded,
}: AddToCartButtonProps) {
  const router = useRouter();
  const pathname = usePathname();
  const user = useAuthStore((state) => state.user);
  const clearUser = useAuthStore((state) => state.clearUser);
  const pendingActionKeys = useCartUiStore((state) => state.pendingActionKeys);
  const beginPendingAction = useCartUiStore((state) => state.beginPendingAction);
  const endPendingAction = useCartUiStore((state) => state.endPendingAction);
  const syncCart = useCartUiStore((state) => state.syncCart);
  const resetSummary = useCartUiStore((state) => state.resetSummary);

  const actionKey = `add:${productId}`;
  const isPending = pendingActionKeys.includes(actionKey);

  async function handleAddToCart() {
    if (!user) {
      router.replace(`/login?redirect=${encodeURIComponent(pathname)}`);
      return;
    }

    beginPendingAction(actionKey);

    try {
      const payload: AddCartItemInput = {
        productId,
        size,
        quantity,
      };

      const response = await addCartItem(payload);

      if (!response.ok) {
        if (response.status === 401 || response.code === 'AUTH_UNAUTHORIZED') {
          clearUser();
          resetSummary();
          router.replace(`/login?redirect=${encodeURIComponent(pathname)}`);
          return;
        }

        return;
      }

      syncCart(response.data);

      onAdded?.(response.data);
    } catch (error) {
      reportClientError({ error, context: 'cart:add-item' });
    } finally {
      endPendingAction(actionKey);
    }
  }

  return (
    <button
      type="button"
      disabled={disabled || isPending}
      onClick={handleAddToCart}
      className={className ?? defaultButtonClassName}
      aria-busy={isPending}
    >
      {isPending ? (
        <span className="inline-flex items-center gap-2">
          <span
            aria-hidden="true"
            className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent"
          />
          <span>{label}</span>
        </span>
      ) : (
        label
      )}
    </button>
  );
}
