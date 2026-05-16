'use client';

import { usePathname, useRouter } from 'next/navigation';
import type { MouseEvent } from 'react';
import { LuHeart } from 'react-icons/lu';
import { useAuthStore } from '../../lib/auth-store';
import { reportClientError } from '../../lib/client-error';
import { addWishlistItem, removeWishlistItem } from '../../lib/wishlist-api';
import { useWishlistUiStore } from '../../lib/wishlist-ui-store';

type WishlistToggleButtonProps = {
  productId: string;
  className?: string;
  iconClassName?: string;
  ariaLabel?: string;
  preventNavigationOnClick?: boolean;
};

export function WishlistToggleButton({
  productId,
  className,
  iconClassName,
  ariaLabel,
  preventNavigationOnClick = false,
}: WishlistToggleButtonProps) {
  const router = useRouter();
  const pathname = usePathname();
  const clearUser = useAuthStore((state) => state.clearUser);
  const productToItemMap = useWishlistUiStore((state) => state.productToItemMap);
  const pendingActionKeys = useWishlistUiStore((state) => state.pendingActionKeys);
  const syncWishlist = useWishlistUiStore((state) => state.syncWishlist);
  const resetWishlist = useWishlistUiStore((state) => state.resetWishlist);
  const beginPendingAction = useWishlistUiStore((state) => state.beginPendingAction);
  const endPendingAction = useWishlistUiStore((state) => state.endPendingAction);

  const itemId = productToItemMap[productId];
  const isSaved = Boolean(itemId);
  const actionKey = `wishlist:${productId}`;
  const isPending = pendingActionKeys.includes(actionKey);

  async function handleToggle(event: MouseEvent<HTMLButtonElement>) {
    if (preventNavigationOnClick) {
      event.preventDefault();
      event.stopPropagation();
    }

    beginPendingAction(actionKey);

    try {
      const response = isSaved
        ? await removeWishlistItem(itemId)
        : await addWishlistItem({ productId });

      if (!response.ok) {
        if (response.status === 401 || response.code === 'AUTH_UNAUTHORIZED') {
          clearUser();
          resetWishlist();
          router.replace(`/login?redirect=${encodeURIComponent(pathname)}`);
        }

        return;
      }

      syncWishlist(response.data);
    } catch (error) {
      reportClientError({ error, context: isSaved ? 'wishlist:remove-item' : 'wishlist:add-item' });
    } finally {
      endPendingAction(actionKey);
    }
  }

  return (
    <button
      type="button"
      aria-label={ariaLabel ?? (isSaved ? 'Remove from wishlist' : 'Add to wishlist')}
      aria-pressed={isSaved}
      onClick={handleToggle}
      disabled={isPending}
      className={className}
    >
      <LuHeart
        className={iconClassName}
        aria-hidden="true"
        fill={isSaved ? 'currentColor' : 'none'}
      />
    </button>
  );
}
