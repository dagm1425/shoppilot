'use client';

import type { CartLineItem as CartLineItemData } from '@shoppilot/db/cart-contract';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useAuthStore } from '../lib/auth-store';
import { addCartItem, removeCartItem, updateCartItem } from '../lib/cart-api';
import { reportClientError } from '../lib/client-error';
import { useCartUiStore } from '../lib/cart-ui-store';
import { removeWishlistItem } from '../lib/wishlist-api';
import { useWishlistUiStore } from '../lib/wishlist-ui-store';
import { CartDrawerItemRow } from './cart-wishlist/cart-drawer-item-row';
import { CartWishlistEmptyCartState } from './cart-wishlist/cart-wishlist-empty-cart-state';
import { CartWishlistEmptyWishlistState } from './cart-wishlist/cart-wishlist-empty-wishlist-state';
import { CartWishlistDrawerFooter } from './cart-wishlist/cart-wishlist-drawer-footer';
import { CartWishlistDrawerHeader } from './cart-wishlist/cart-wishlist-drawer-header';
import { WishlistDrawerItemRow } from './cart-wishlist/wishlist-drawer-item-row';

type DrawerTab = 'cart' | 'wishlist';

type CartWishlistDrawerProps = {
  open: boolean;
  onClose: () => void;
  initialTab: DrawerTab;
  checkoutPending: boolean;
  onCheckoutStart: () => void;
};

export function CartWishlistDrawer({
  open,
  onClose,
  initialTab,
  checkoutPending,
  onCheckoutStart,
}: CartWishlistDrawerProps) {
  const router = useRouter();
  const pathname = usePathname();
  const user = useAuthStore((state) => state.user);
  const clearUser = useAuthStore((state) => state.clearUser);
  const cachedCart = useCartUiStore((state) => state.cart);
  const cartPendingActionKeys = useCartUiStore((state) => state.pendingActionKeys);
  const beginCartPendingAction = useCartUiStore((state) => state.beginPendingAction);
  const endCartPendingAction = useCartUiStore((state) => state.endPendingAction);
  const syncCart = useCartUiStore((state) => state.syncCart);
  const resetSummary = useCartUiStore((state) => state.resetSummary);
  const cachedWishlist = useWishlistUiStore((state) => state.wishlist);
  const wishlistPendingActionKeys = useWishlistUiStore((state) => state.pendingActionKeys);
  const beginWishlistPendingAction = useWishlistUiStore((state) => state.beginPendingAction);
  const endWishlistPendingAction = useWishlistUiStore((state) => state.endPendingAction);
  const syncWishlist = useWishlistUiStore((state) => state.syncWishlist);
  const resetWishlist = useWishlistUiStore((state) => state.resetWishlist);

  const [activeTab, setActiveTab] = useState<DrawerTab>(initialTab);

  useEffect(() => {
    if (!open) {
      return;
    }

    setActiveTab(initialTab);
  }, [initialTab, open]);

  useEffect(() => {
    if (!open) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    function handleEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        onClose();
      }
    }

    window.addEventListener('keydown', handleEscape);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleEscape);
    };
  }, [onClose, open]);

  function cartQuantityPending(itemId: string): boolean {
    return cartPendingActionKeys.includes(`qty:${itemId}`);
  }

  function cartRemovePending(itemId: string): boolean {
    return cartPendingActionKeys.includes(`remove:${itemId}`);
  }

  async function handleCartQuantity(item: CartLineItemData, nextQuantity: number) {
    const actionKey = `qty:${item.itemId}`;
    beginCartPendingAction(actionKey);

    try {
      const response = await updateCartItem(item.itemId, { quantity: nextQuantity });

      if (!response.ok) {
        if (response.status === 401 || response.code === 'AUTH_UNAUTHORIZED') {
          clearUser();
          resetSummary();
          resetWishlist();
          router.replace(`/login?redirect=${encodeURIComponent(pathname)}`);
        }

        return;
      }

      syncCart(response.data);
    } catch (error) {
      reportClientError({ error, context: 'drawer:cart-update' });
    } finally {
      endCartPendingAction(actionKey);
    }
  }

  async function handleCartRemove(itemId: string) {
    const actionKey = `remove:${itemId}`;
    beginCartPendingAction(actionKey);

    try {
      const response = await removeCartItem(itemId);

      if (!response.ok) {
        if (response.status === 401 || response.code === 'AUTH_UNAUTHORIZED') {
          clearUser();
          resetSummary();
          resetWishlist();
          router.replace(`/login?redirect=${encodeURIComponent(pathname)}`);
        }

        return;
      }

      syncCart(response.data);
    } catch (error) {
      reportClientError({ error, context: 'drawer:cart-remove' });
    } finally {
      endCartPendingAction(actionKey);
    }
  }

  function wishlistItemPending(productId: string): boolean {
    return wishlistPendingActionKeys.includes(`wishlist:${productId}`);
  }

  async function handleWishlistRemove(itemId: string, productId: string) {
    const actionKey = `wishlist:${productId}`;
    beginWishlistPendingAction(actionKey);

    try {
      const response = await removeWishlistItem(itemId);

      if (!response.ok) {
        if (response.status === 401 || response.code === 'AUTH_UNAUTHORIZED') {
          clearUser();
          resetSummary();
          resetWishlist();
          router.replace(`/login?redirect=${encodeURIComponent(pathname)}`);
        }

        return;
      }

      syncWishlist(response.data);
    } catch (error) {
      reportClientError({ error, context: 'drawer:wishlist-remove' });
    } finally {
      endWishlistPendingAction(actionKey);
    }
  }

  async function handleWishlistAddToBag(productId: string) {
    const actionKey = `wishlist:${productId}`;
    beginWishlistPendingAction(actionKey);

    try {
      const response = await addCartItem({
        productId,
        size: 'm',
        quantity: 1,
      });

      if (!response.ok) {
        if (response.status === 401 || response.code === 'AUTH_UNAUTHORIZED') {
          clearUser();
          resetSummary();
          resetWishlist();
          router.replace(`/login?redirect=${encodeURIComponent(pathname)}`);
        }

        return;
      }

      syncCart(response.data);
      setActiveTab('cart');
    } catch (error) {
      reportClientError({ error, context: 'drawer:wishlist-add-to-bag' });
    } finally {
      endWishlistPendingAction(actionKey);
    }
  }

  function renderCartContent() {
    if (!cachedCart || cachedCart.items.length === 0) {
      return <CartWishlistEmptyCartState onNavigate={onClose} />;
    }

    return (
      <section className="px-5 pb-6 pt-4 sm:px-8">
        <div className="rounded-sm border border-border bg-muted/30 px-3 py-2 text-xs text-foreground">
          <span className="font-semibold">Your items aren&apos;t reserved</span>, checkout quickly to avoid
          missing out.
        </div>

        <ul className="mt-4 divide-y divide-border border-y border-border">
          {cachedCart.items.map((item) => (
            <CartDrawerItemRow
              key={item.itemId}
              item={item}
              quantityPending={cartQuantityPending(item.itemId)}
              removePending={cartRemovePending(item.itemId)}
              onClose={onClose}
              onRemove={handleCartRemove}
              onUpdateQuantity={handleCartQuantity}
            />
          ))}
        </ul>
      </section>
    );
  }

  function renderWishlistContent() {
    if (!cachedWishlist || cachedWishlist.items.length === 0) {
      return <CartWishlistEmptyWishlistState signedIn={Boolean(user)} onNavigate={onClose} />;
    }

    return (
      <section className="px-5 pb-6 pt-4 sm:px-8">
        <ul className="divide-y divide-border border-y border-border">
          {cachedWishlist.items.map((item) => (
            <WishlistDrawerItemRow
              key={item.itemId}
              item={item}
              pending={wishlistItemPending(item.productId)}
              onClose={onClose}
              onRemove={handleWishlistRemove}
              onAddToBag={handleWishlistAddToBag}
            />
          ))}
        </ul>
      </section>
    );
  }

  return (
    <div
      className="fixed inset-0 z-[120]"
      style={{
        pointerEvents: open ? 'auto' : 'none',
      }}
      aria-live="polite"
    >
      <button
        type="button"
        aria-label="Close cart and wishlist panel"
        onClick={onClose}
        className="absolute inset-0 bg-black"
        style={{
          opacity: open ? 0.8 : 0,
          transition: 'opacity 220ms ease-in-out',
        }}
      />

      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Cart and wishlist"
        className="absolute right-0 top-0 flex h-dvh w-full max-w-[31.25rem] flex-col bg-background font-auth-body shadow-2xl will-change-transform"
        style={{
          transform: open ? 'translateX(0)' : 'translateX(100%)',
          transition: 'transform 220ms ease-in-out',
        }}
      >
        <CartWishlistDrawerHeader
          activeTab={activeTab}
          onTabChange={setActiveTab}
          onClose={onClose}
        />

        <div className="min-h-0 flex-1 overflow-y-auto">{activeTab === 'cart' ? renderCartContent() : renderWishlistContent()}</div>

        {activeTab === 'cart' && cachedCart && cachedCart.items.length > 0 ? (
          <CartWishlistDrawerFooter
            subtotalCents={cachedCart.summary.subtotalCents}
            currency={cachedCart.summary.currency}
            checkoutPending={checkoutPending}
            onCheckoutStart={onCheckoutStart}
          />
        ) : null}
      </aside>
    </div>
  );
}
