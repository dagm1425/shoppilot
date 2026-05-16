import type { CartResponse, CartSummary } from '@shoppilot/db/cart-contract';
import { create } from 'zustand';

type CartUiState = {
  itemCount: number;
  cart: CartResponse | null;
  pendingActionKeys: string[];
  syncCart: (cart: CartResponse) => void;
  syncSummary: (summary: CartSummary) => void;
  resetSummary: () => void;
  beginPendingAction: (key: string) => void;
  endPendingAction: (key: string) => void;
  clearPendingActions: () => void;
};

export const useCartUiStore = create<CartUiState>((set) => ({
  itemCount: 0,
  cart: null,
  pendingActionKeys: [],
  syncCart: (cart) =>
    set({
      itemCount: cart.summary.itemCount,
      cart,
    }),
  syncSummary: (summary) =>
    set((state) => ({
      itemCount: summary.itemCount,
      cart: state.cart
        ? {
            ...state.cart,
            summary,
          }
        : null,
    })),
  resetSummary: () =>
    set({
      itemCount: 0,
      cart: null,
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
  clearPendingActions: () =>
    set({
      pendingActionKeys: [],
    }),
}));
