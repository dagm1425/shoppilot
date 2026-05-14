import { create } from 'zustand';

export type ToastVariant = 'success' | 'error' | 'info';

export type ToastPayload = {
  message: string;
  variant: ToastVariant;
  durationMs?: number;
};

type ToastItem = ToastPayload & {
  id: string;
};

type ToastState = {
  toasts: ToastItem[];
  pushToast: (toast: ToastPayload) => void;
  removeToast: (id: string) => void;
};

function createToastId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export const useToastStore = create<ToastState>((set) => ({
  toasts: [],
  pushToast: (toast) =>
    set((state) => ({
      toasts: [...state.toasts, { ...toast, id: createToastId() }],
    })),
  removeToast: (id) =>
    set((state) => ({
      toasts: state.toasts.filter((toast) => toast.id !== id),
    })),
}));

export function showToast(toast: ToastPayload): void {
  useToastStore.getState().pushToast(toast);
}
