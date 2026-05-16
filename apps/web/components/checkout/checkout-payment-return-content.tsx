'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { createCheckoutPaymentSession, fetchCheckoutPaymentStatus, getCheckoutErrorMessage } from '../../lib/checkout-api';
import { reportClientError } from '../../lib/client-error';
import { StatePanel } from '../state-panel';

type Status = 'loading' | 'success' | 'error';

export function CheckoutPaymentReturnContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const sessionToken = searchParams.get('sessionToken');
  const providerSessionId = searchParams.get('providerSessionId');

  const [status, setStatus] = useState<Status>('loading');
  const [message, setMessage] = useState('Checking payment status...');
  const [pendingRetry, setPendingRetry] = useState(false);

  const canRetry = useMemo(() => Boolean(sessionToken), [sessionToken]);

  useEffect(() => {
    let active = true;

    async function loadStatus() {
      if (!sessionToken || !providerSessionId) {
        if (!active) return;
        setStatus('error');
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

        if (response.data.status === 'paid') {
          setStatus('success');
          setMessage('Payment received. Your order confirmation is next in subphase 2.3.');
          return;
        }

        if (response.data.status === 'open' || response.data.status === 'pending') {
          setStatus('error');
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
      } catch (error) {
        if (!active) return;

        reportClientError({ error, context: 'checkout:payment-return-status' });
        setStatus('error');
        setMessage('Could not verify payment status right now.');
      }
    }

    void loadStatus();

    return () => {
      active = false;
    };
  }, [providerSessionId, sessionToken]);

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

  if (status === 'loading') {
    return <StatePanel variant="loading" title="Payment return" description={message} />;
  }

  if (status === 'success') {
    return (
      <StatePanel variant="success" title="Payment complete" description={message}>
        <button
          type="button"
          onClick={() => router.push('/checkout')}
          className="rounded-full border border-black/20 bg-white px-4 py-2 text-sm font-semibold text-black"
        >
          Back to checkout
        </button>
      </StatePanel>
    );
  }

  return (
    <StatePanel variant="error" title="Payment incomplete" description={message}>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => router.push('/checkout')}
          className="rounded-full border border-black/20 bg-white px-4 py-2 text-sm font-semibold text-black"
        >
          Back to checkout
        </button>
        {canRetry ? (
          <button
            type="button"
            onClick={handleRetryPayment}
            disabled={pendingRetry}
            className="rounded-full bg-black px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
          >
            {pendingRetry ? 'Retrying...' : 'Retry payment'}
          </button>
        ) : null}
      </div>
    </StatePanel>
  );
}
