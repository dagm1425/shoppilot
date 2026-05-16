'use client';

import { useEffect } from 'react';
import { type ToastVariant, useToastStore } from '../lib/toast-store';

const toastVariantClasses: Record<ToastVariant, string> = {
  success: 'border-success/40 bg-success/10 text-foreground',
  error: 'border-danger/40 bg-danger/10 text-foreground',
  info: 'border-border bg-card text-card-foreground',
};

type ToastRowProps = {
  id: string;
  message: string;
  variant: ToastVariant;
  durationMs: number;
  onDismiss: (id: string) => void;
};

function ToastRow({ id, message, variant, durationMs, onDismiss }: ToastRowProps) {
  useEffect(() => {
    const timeout = window.setTimeout(() => {
      onDismiss(id);
    }, durationMs);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [durationMs, id, onDismiss]);

  return (
    <div
      className={`pointer-events-auto w-full rounded-md border px-3 py-2 text-sm shadow-sm ${toastVariantClasses[variant]}`}
      role="status"
      aria-live={variant === 'error' ? 'assertive' : 'polite'}
    >
      <div className="flex items-start justify-between gap-3">
        <p className="leading-5">{message}</p>
        <button
          type="button"
          onClick={() => onDismiss(id)}
          className="text-muted-foreground"
          aria-label="Dismiss notification"
        >
          x
        </button>
      </div>
    </div>
  );
}

export function GlobalToaster() {
  const toasts = useToastStore((state) => state.toasts);
  const removeToast = useToastStore((state) => state.removeToast);

  if (toasts.length === 0) {
    return null;
  }

  return (
    <div className="pointer-events-none fixed bottom-4 left-4 z-50 flex w-full max-w-sm flex-col gap-2">
      {toasts.map((toast) => (
        <ToastRow
          key={toast.id}
          id={toast.id}
          message={toast.message}
          variant={toast.variant}
          durationMs={toast.durationMs ?? 4500}
          onDismiss={removeToast}
        />
      ))}
    </div>
  );
}
