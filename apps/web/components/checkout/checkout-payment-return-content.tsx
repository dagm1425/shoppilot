'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import {
  createCheckoutPaymentSession,
  fetchCheckoutPaymentStatus,
  getCheckoutErrorMessage,
  placeOrder,
} from '../../lib/checkout-api';
import { reportClientError } from '../../lib/client-error';
import { StatePanel } from '../state-panel';

type Status = 'loading' | 'placing' | 'empty' | 'error';

function buildPlaceOrderIdempotencyKey(sessionToken: string, providerSessionId: string): string {
  return `order:${sessionToken}:${providerSessionId}`;
}

export function CheckoutPaymentReturnContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const sessionToken = searchParams.get('sessionToken');
  const providerSessionId = searchParams.get('providerSessionId');
  const returnStatus = searchParams.get('status');

  const [status, setStatus] = useState<Status>('loading');
  const [message, setMessage] = useState('Could not finalize your order right now.');
  const [pendingRetry, setPendingRetry] = useState(false);

  const canRetry = useMemo(() => Boolean(sessionToken), [sessionToken]);

  useEffect(() => {
    let active = true;

    async function finalizeOrder() {
      if (!sessionToken || !providerSessionId) {
        if (!active) return;
        setStatus('empty');
        setMessage('Missing payment return details. Please retry checkout.');
        return;
      }

      try {
        const response = await fetchCheckoutPaymentStatus(sessionToken, providerSessionId);

        if (!active) return;

        if (!response.ok) {
          setStatus('error');
          setMessage(getCheckoutErrorMessage(response.message, response.code));
          return;
        }

        if (response.data.status !== 'paid') {
          if (response.data.status === 'open' || response.data.status === 'pending') {
            setStatus('error');
            if (returnStatus === 'canceled') {
              setMessage('Payment was canceled. Retry payment when you are ready.');
              return;
            }

            setMessage('Payment is still open. You can retry to continue payment.');
            return;
          }

          if (response.data.status === 'canceled' || response.data.status === 'expired') {
            setStatus('error');
            setMessage('Payment was canceled or expired. Retry payment to continue.');
            return;
          }

          setStatus('error');
          setMessage('Payment did not complete. Retry payment to continue.');
          return;
        }

        setStatus('placing');

        const placeOrderResponse = await placeOrder({
          checkoutSessionToken: sessionToken,
          idempotencyKey: buildPlaceOrderIdempotencyKey(sessionToken, providerSessionId),
        });

        if (!active) return;

        if (!placeOrderResponse.ok) {
          setStatus('error');
          setMessage(getCheckoutErrorMessage(placeOrderResponse.message, placeOrderResponse.code));
          return;
        }

        router.replace(`/orders/${encodeURIComponent(placeOrderResponse.data.orderNumber)}`);
      } catch (error) {
        if (!active) return;

        reportClientError({ error, context: 'checkout:payment-return-finalize' });
        setStatus('error');
        setMessage('Could not finalize your order right now.');
      }
    }

    void finalizeOrder();

    return () => {
      active = false;
    };
  }, [providerSessionId, returnStatus, router, sessionToken]);

  async function handleRetryPayment() {
    if (!sessionToken) {
      return;
    }

    setPendingRetry(true);

    try {
      const response = await createCheckoutPaymentSession(sessionToken);

      if (!response.ok) {
        setStatus('error');
        setMessage(getCheckoutErrorMessage(response.message, response.code));
        return;
      }

      window.location.assign(response.data.checkoutUrl);
    } catch (error) {
      reportClientError({ error, context: 'checkout:payment-retry' });
      setStatus('error');
      setMessage('Could not restart payment right now.');
    } finally {
      setPendingRetry(false);
    }
  }

  if (status === 'loading' || status === 'placing') {
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
      <StatePanel
        variant="empty"
        title="Payment return incomplete"
        description={message}
      >
        <div className="flex flex-wrap gap-2">
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
    <StatePanel variant="error" title="Payment incomplete" description={message}>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => router.push('/checkout')}
          className="inline-flex items-center rounded-md border border-border bg-background px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted"
        >
          Back to checkout
        </button>
        {canRetry ? (
          <button
            type="button"
            onClick={handleRetryPayment}
            disabled={pendingRetry}
            className="inline-flex items-center rounded-md border border-foreground bg-foreground px-3 py-2 text-sm font-medium text-background transition-opacity disabled:cursor-not-allowed disabled:opacity-60"
          >
            {pendingRetry ? 'Retrying...' : 'Retry payment'}
          </button>
        ) : null}
      </div>
    </StatePanel>
  );
}
