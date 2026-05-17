'use client';

import type { OrderRecord } from '@shoppilot/db/order-contract';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useAuthStore } from '../../lib/auth-store';
import { reportClientError } from '../../lib/client-error';
import { fetchOrderByNumber, getOrderErrorMessage } from '../../lib/orders-api';
import { StatePanel } from '../state-panel';

type LoadState = 'loading' | 'success' | 'error' | 'empty';

function formatMoney(cents: number, currency: string): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
  }).format(cents / 100);
}

type OrderConfirmationContentProps = {
  orderNumber: string;
};

export function OrderConfirmationContent({ orderNumber }: OrderConfirmationContentProps) {
  const router = useRouter();
  const pathname = usePathname();
  const clearUser = useAuthStore((state) => state.clearUser);

  const [status, setStatus] = useState<LoadState>('loading');
  const [order, setOrder] = useState<OrderRecord | null>(null);
  const [message, setMessage] = useState('Loading your order confirmation...');
  const [pendingRefresh, setPendingRefresh] = useState(false);

  useEffect(() => {
    let active = true;

    async function loadOrder() {
      setStatus('loading');
      setMessage('Loading your order confirmation...');

      try {
        const response = await fetchOrderByNumber(orderNumber);

        if (!active) {
          return;
        }

        if (!response.ok) {
          if (response.status === 401 || response.code === 'AUTH_UNAUTHORIZED') {
            clearUser();
            router.replace(`/login?redirect=${encodeURIComponent(pathname)}`);
            return;
          }

          if (response.status === 404 || response.code === 'ORDER_NOT_FOUND') {
            setStatus('empty');
            setMessage(getOrderErrorMessage(response.message, response.code));
            return;
          }

          setStatus('error');
          setMessage(getOrderErrorMessage(response.message, response.code));
          return;
        }

        setOrder(response.data);
        setStatus('success');
      } catch (error) {
        if (!active) {
          return;
        }

        reportClientError({ error, context: 'order:confirmation-load' });
        setStatus('error');
        setMessage('Could not load order confirmation right now.');
      }
    }

    void loadOrder();

    return () => {
      active = false;
    };
  }, [clearUser, orderNumber, pathname, router]);

  async function handleRefresh() {
    setPendingRefresh(true);

    try {
      const response = await fetchOrderByNumber(orderNumber);

      if (!response.ok) {
        setStatus(response.status === 404 ? 'empty' : 'error');
        setMessage(getOrderErrorMessage(response.message, response.code));
        return;
      }

      setOrder(response.data);
      setStatus('success');
    } catch (error) {
      reportClientError({ error, context: 'order:confirmation-refresh' });
      setStatus('error');
      setMessage('Could not refresh order confirmation.');
    } finally {
      setPendingRefresh(false);
    }
  }

  if (status === 'loading') {
    return (
      <section className="rounded-lg border border-muted bg-muted/50 p-4 text-foreground">
        <div className="flex items-center gap-3">
          <span
            aria-hidden="true"
            className="size-4 animate-spin rounded-full border-2 border-foreground border-t-transparent"
          />
          <h2 className="text-base font-semibold">Processing your order</h2>
        </div>
      </section>
    );
  }

  if (status === 'empty') {
    return (
      <StatePanel variant="empty" title="Order not found" description={message}>
        <button
          type="button"
          onClick={() => router.push('/checkout')}
          className="inline-flex items-center rounded-md border border-border bg-background px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted"
        >
          Back to checkout
        </button>
      </StatePanel>
    );
  }

  if (status === 'error' || !order) {
    return (
      <StatePanel variant="error" title="Order unavailable" description={message}>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={handleRefresh}
            disabled={pendingRefresh}
            className="inline-flex items-center rounded-md border border-border bg-background px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
          >
            {pendingRefresh ? 'Refreshing...' : 'Refresh'}
          </button>
          <button
            type="button"
            onClick={() => router.push('/checkout')}
            className="inline-flex items-center rounded-md border border-border bg-background px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted"
          >
            Back to checkout
          </button>
        </div>
      </StatePanel>
    );
  }

  return (
    <section className="mx-auto w-full max-w-[1180px] lg:grid lg:grid-cols-[minmax(0,1fr)_420px] lg:gap-0">
      <div className="space-y-6 px-4 py-6 sm:px-6 lg:max-w-[640px] lg:px-0 lg:py-8">
        <section className="border-b border-border pb-5">
          <p className="font-auth-heading text-xs font-bold uppercase tracking-[0.08em] text-muted-foreground">
            Order confirmed
          </p>
          <h1 className="mt-2 font-auth-heading text-xl font-bold uppercase tracking-wide text-foreground">
            {order.orderNumber}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Status: <span className="font-medium text-foreground">{order.status.replaceAll('_', ' ')}</span>
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            Created: {new Date(order.createdAt).toLocaleString('en-US')}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            Confirmation email delivery can take up to a minute.
          </p>
        </section>

        <section className="border-b border-border pb-6">
          <h2 className="font-auth-heading text-sm font-bold uppercase tracking-wider text-foreground">
            Items
          </h2>
          {order.items.length === 0 ? (
            <div className="mt-3">
              <StatePanel
                variant="empty"
                title="No items snapshot"
                description="Order line item details are unavailable."
              />
            </div>
          ) : (
            <ul className="mt-3 divide-y divide-border border-y border-border">
              {order.items.map((item) => (
                <li key={item.orderLineItemId} className="flex items-start justify-between gap-3 py-3">
                  <div>
                    <p className="text-sm font-semibold text-foreground">{item.productName}</p>
                    <p className="text-sm text-muted-foreground">
                      {item.productFit} • {item.productColor} • {item.size.toUpperCase()}
                    </p>
                    <p className="text-sm text-muted-foreground">Qty {item.quantity}</p>
                  </div>
                  <p className="text-sm font-semibold text-foreground">
                    {formatMoney(item.lineSubtotalCents, item.currency)}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <aside className="mt-6 border-t border-border bg-muted px-4 py-6 sm:px-6 lg:mt-0 lg:min-h-full lg:border-l lg:border-t-0 lg:px-10 lg:py-10">
        <section className="bg-background p-5">
          <h2 className="font-auth-heading text-sm font-bold uppercase tracking-wider text-foreground">Totals</h2>
          <dl className="mt-3 space-y-2 text-sm">
            <div className="flex items-center justify-between text-muted-foreground">
              <dt>Subtotal</dt>
              <dd>{formatMoney(order.totals.subtotalCents, order.totals.currency)}</dd>
            </div>
            <div className="flex items-center justify-between text-muted-foreground">
              <dt>Shipping</dt>
              <dd>{formatMoney(order.totals.shippingCents, order.totals.currency)}</dd>
            </div>
            <div className="flex items-center justify-between text-muted-foreground">
              <dt>Tax</dt>
              <dd>{formatMoney(order.totals.taxCents, order.totals.currency)}</dd>
            </div>
            <div className="flex items-center justify-between border-t border-border pt-2 font-semibold text-foreground">
              <dt>Total</dt>
              <dd>{formatMoney(order.totals.totalCents, order.totals.currency)}</dd>
            </div>
          </dl>
        </section>

        <section className="mt-4 bg-background p-5">
          <h2 className="font-auth-heading text-xs font-bold uppercase tracking-[0.08em] text-foreground">
            Shipping
          </h2>
          <div className="mt-3 space-y-1 text-sm text-muted-foreground">
            <p className="font-semibold text-foreground">{order.shipping.recipientName}</p>
            <p>{order.shipping.line1}</p>
            {order.shipping.line2 ? <p>{order.shipping.line2}</p> : null}
            <p>
              {order.shipping.city}, {order.shipping.postalCode}, {order.shipping.country}
            </p>
            {order.shipping.phone ? <p>{order.shipping.phone}</p> : null}
            <p className="pt-1 text-foreground">
              {order.shipping.methodName} ({order.shipping.etaLabel})
            </p>
          </div>
        </section>
      </aside>
    </section>
  );
}
