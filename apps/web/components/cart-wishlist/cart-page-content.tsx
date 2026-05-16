'use client';

import type { CartLineItem as CartLineItemData, CartResponse } from '@shoppilot/db/cart-contract';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { useAuthStore } from '../../lib/auth-store';
import {
  fetchCart,
  getCartErrorMessage,
  removeCartItem,
  updateCartItem,
} from '../../lib/cart-api';
import { useCartUiStore } from '../../lib/cart-ui-store';
import { reportClientError } from '../../lib/client-error';
import { CartLineItem } from './cart-line-item';
import { CartStatePanel } from './cart-state-panel';
import { CartSummaryCard } from './cart-summary-card';

type CartPageStatus = 'loading' | 'success' | 'error';

export function CartPageContent() {
  const router = useRouter();
  const pathname = usePathname();
  const clearUser = useAuthStore((state) => state.clearUser);
  const pendingActionKeys = useCartUiStore((state) => state.pendingActionKeys);
  const beginPendingAction = useCartUiStore((state) => state.beginPendingAction);
  const endPendingAction = useCartUiStore((state) => state.endPendingAction);
  const syncCart = useCartUiStore((state) => state.syncCart);
  const resetSummary = useCartUiStore((state) => state.resetSummary);

  const [status, setStatus] = useState<CartPageStatus>('loading');
  const [errorMessage, setErrorMessage] = useState('Unable to load your cart right now.');
  const [retryCounter, setRetryCounter] = useState(0);
  const [cart, setCart] = useState<CartResponse | null>(null);

  useEffect(() => {
    let active = true;

    async function loadCart() {
      setStatus('loading');

      try {
        const response = await fetchCart();

        if (!active) {
          return;
        }

        if (!response.ok) {
          if (response.status === 401 || response.code === 'AUTH_UNAUTHORIZED') {
            clearUser();
            resetSummary();
            router.replace(`/login?redirect=${encodeURIComponent(pathname)}`);
            return;
          }

          setStatus('error');
          setErrorMessage(getCartErrorMessage(response.message, response.code));
          return;
        }

        setCart(response.data);
        syncCart(response.data);
        setStatus('success');
        setErrorMessage('');
      } catch (error) {
        if (!active) {
          return;
        }

        reportClientError({ error, context: 'cart:get' });
        setStatus('error');
        setErrorMessage('Unable to load your cart right now.');
      }
    }

    void loadCart();

    return () => {
      active = false;
    };
  }, [clearUser, pathname, resetSummary, retryCounter, router, syncCart]);

  async function handleMutation(
    actionKey: string,
    action: () => Promise<
      | {
          ok: true;
          data: CartResponse;
          status: number;
        }
      | {
          ok: false;
          message: string;
          code?: string;
          status: number;
        }
    >,
  ) {
    beginPendingAction(actionKey);

    try {
      const response = await action();

      if (!response.ok) {
        if (response.status === 401 || response.code === 'AUTH_UNAUTHORIZED') {
          clearUser();
          resetSummary();
          router.replace(`/login?redirect=${encodeURIComponent(pathname)}`);
          return;
        }
        return;
      }

      setCart(response.data);
      syncCart(response.data);
    } catch (error) {
      reportClientError({ error, context: `cart:${actionKey}` });
    } finally {
      endPendingAction(actionKey);
    }
  }

  function isPending(key: string): boolean {
    return pendingActionKeys.includes(key);
  }

  function handleIncrease(item: CartLineItemData) {
    const actionKey = `line:${item.itemId}`;
    void handleMutation(actionKey, () => updateCartItem(item.itemId, { quantity: item.quantity + 1 }));
  }

  function handleDecrease(item: CartLineItemData) {
    if (item.quantity <= 1) {
      return;
    }

    const actionKey = `line:${item.itemId}`;
    void handleMutation(actionKey, () => updateCartItem(item.itemId, { quantity: item.quantity - 1 }));
  }

  function handleRemove(item: CartLineItemData) {
    const actionKey = `line:${item.itemId}`;
    void handleMutation(actionKey, () => removeCartItem(item.itemId));
  }

  const hasInvalidItems = useMemo(
    () => Boolean(cart?.items.some((item) => !item.isValid)),
    [cart?.items],
  );

  if (status === 'loading' && !cart) {
    return (
      <section className="space-y-4">
        <CartStatePanel
          state="loading"
          title="Loading your cart"
          description="Fetching your latest cart details."
        />
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_18rem]">
          <div className="space-y-3">
            {Array.from({ length: 2 }).map((_, index) => (
              <div key={index} className="animate-pulse rounded-lg border border-border bg-muted p-4">
                <div className="h-4 w-1/2 rounded bg-border" />
                <div className="mt-3 h-4 w-3/4 rounded bg-border" />
              </div>
            ))}
          </div>
          <div className="animate-pulse rounded-lg border border-border bg-muted p-4">
            <div className="h-4 w-2/3 rounded bg-border" />
            <div className="mt-3 h-4 w-full rounded bg-border" />
            <div className="mt-2 h-4 w-4/5 rounded bg-border" />
          </div>
        </div>
      </section>
    );
  }

  if (status === 'error') {
    return (
      <CartStatePanel
        state="error"
        title="Cart unavailable"
        description={errorMessage}
      >
        <button
          type="button"
          onClick={() => setRetryCounter((count) => count + 1)}
          className="rounded-md border border-border bg-background px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted"
        >
          Retry
        </button>
      </CartStatePanel>
    );
  }

  if (!cart || cart.items.length === 0) {
    return (
      <CartStatePanel
        state="empty"
        title="Your bag is empty"
        description="Add products from the catalog to start building your cart."
      >
        <button
          type="button"
          onClick={() => router.push('/catalog')}
          className="inline-flex rounded-md border border-border bg-background px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted"
        >
          Browse catalog
        </button>
      </CartStatePanel>
    );
  }

  return (
    <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_18rem]">
      <div>
        <header className="mb-3">
          <h1 className="font-auth-heading text-xl font-bold uppercase tracking-wide text-foreground">
            Your cart
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Review your items before checkout.
          </p>
        </header>

        {hasInvalidItems ? (
          <div className="mb-3">
            <CartStatePanel
              state="disabled"
              title="Some items need attention"
              description="Unavailable or overstocked items are excluded from subtotal until resolved."
            />
          </div>
        ) : null}

        <ul className="space-y-3">
          {cart.items.map((item) => {
            const actionKey = `line:${item.itemId}`;

            return (
              <CartLineItem
                key={item.itemId}
                item={item}
                pending={isPending(actionKey)}
                onIncrease={() => handleIncrease(item)}
                onDecrease={() => handleDecrease(item)}
                onRemove={() => handleRemove(item)}
              />
            );
          })}
        </ul>
      </div>

      <div className="lg:sticky lg:top-24 lg:h-fit">
        <CartSummaryCard
          summary={cart.summary}
          hasInvalidItems={hasInvalidItems}
        />
      </div>
    </section>
  );
}
