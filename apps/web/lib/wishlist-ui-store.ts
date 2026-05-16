import type { WishlistResponse } from '@shoppilot/db/wishlist-contract';
import { create } from 'zustand';

type WishlistUiState = {
  itemCount: number;
  wishlist: WishlistResponse | null;
  productToItemMap: Record<string, string>;
  pendingActionKeys: string[];
  syncWishlist: (wishlist: WishlistResponse) => void;
  resetWishlist: () => void;
  beginPendingAction: (key: string) => void;
  endPendingAction: (key: string) => void;
};

function toProductToItemMap(wishlist: WishlistResponse): Record<string, string> {
  return wishlist.items.reduce<Record<string, string>>((acc, item) => {
    acc[item.productId] = item.itemId;
    return acc;
  }, {});
}

export const useWishlistUiStore = create<WishlistUiState>((set) => ({
  itemCount: 0,
  wishlist: null,
  productToItemMap: {},
  pendingActionKeys: [],
  syncWishlist: (wishlist) =>
    set({
      itemCount: wishlist.summary.itemCount,
      wishlist,
      productToItemMap: toProductToItemMap(wishlist),
    }),
  resetWishlist: () =>
    set({
      itemCount: 0,
      wishlist: null,
      productToItemMap: {},
      pendingActionKeys: [],
    }),
  beginPendingAction: (key) =>
    set((state) => {
      if (state.pendingActionKeys.includes(key)) {
        return state;
      }

      return {
        pendingActionKeys: [...state.pendingActionKeys, key],
      };
    }),
  endPendingAction: (key) =>
    set((state) => ({
      pendingActionKeys: state.pendingActionKeys.filter((entry) => entry !== key),
    })),
}));
