import type {
  CheckoutPaymentStatusResponse,
  CheckoutSessionResponse,
  CreateCheckoutPaymentSessionResponse,
  SelectCheckoutAddressInput,
  UpdateCheckoutContactInput,
} from '@shoppilot/db/checkout-contract';
import type { PlaceOrderInput, PlaceOrderResponse } from '@shoppilot/db/order-contract';

type ApiError = {
  error?: {
    code?: string;
    message?: string;
    traceId?: string;
  };
};

export type CheckoutApiResponse<T> =
  | {
      ok: true;
      data: T;
      status: number;
    }
  | {
      ok: false;
      message: string;
      code?: string;
      status: number;
    };

const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL;

function getApiBase(): string {
  if (!apiBase) {
    throw new Error('NEXT_PUBLIC_API_BASE_URL is missing.');
  }

  return apiBase;
}

async function parseResponse<T>(response: Response): Promise<CheckoutApiResponse<T>> {
  if (response.ok) {
    return {
      ok: true,
      data: (await response.json()) as T,
      status: response.status,
    };
  }

  let payload: ApiError = {};

  try {
    payload = (await response.json()) as ApiError;
  } catch {
    payload = {};
  }

  return {
    ok: false,
    message: payload.error?.message ?? 'Request failed.',
    code: payload.error?.code,
    status: response.status,
  };
}

export function getCheckoutErrorMessage(message: string, code?: string): string {
  if (code === 'CHECKOUT_CART_EMPTY') {
    return 'Your cart is empty. Add products before checkout.';
  }

  if (code === 'CHECKOUT_CART_ITEM_UNAVAILABLE') {
    return 'Some products are unavailable. Update cart and retry checkout.';
  }

  if (code === 'CHECKOUT_CART_STOCK_INVALID') {
    return 'Some quantities exceed stock. Update cart and retry checkout.';
  }

  if (code === 'CHECKOUT_SESSION_EXPIRED') {
    return 'Checkout session expired. Start again from cart.';
  }

  if (code === 'CHECKOUT_ADDRESS_NOT_FOUND') {
    return 'Selected address no longer exists.';
  }

  if (code === 'CHECKOUT_VALIDATION_ERROR') {
    return 'Please provide valid checkout input.';
  }

  if (code === 'CHECKOUT_NOT_READY') {
    return 'Please complete address and contact details before payment.';
  }

  if (code === 'CHECKOUT_PAYMENT_SESSION_UNAVAILABLE') {
    return 'Payment is temporarily unavailable. Please retry.';
  }

  if (code === 'CHECKOUT_PAYMENT_NOT_PAID') {
    return 'Payment is not complete yet. Retry payment to continue.';
  }

  if (code === 'CHECKOUT_STOCK_REVALIDATION_FAILED') {
    return 'Stock changed before order placement. Review cart and retry.';
  }

  if (code === 'ORDER_IDEMPOTENCY_KEY_MISMATCH') {
    return 'Order submission conflict detected. Return to checkout and retry safely.';
  }

  return message;
}

export async function startCheckoutSession() {
  const response = await fetch(`${getApiBase()}/checkout/session`, {
    method: 'POST',
    credentials: 'include',
  });

  return parseResponse<CheckoutSessionResponse>(response);
}

export async function fetchCheckoutSession(token: string) {
  const response = await fetch(`${getApiBase()}/checkout/session/${token}`, {
    credentials: 'include',
    cache: 'no-store',
  });

  return parseResponse<CheckoutSessionResponse>(response);
}

export async function setCheckoutSessionAddress(token: string, input: SelectCheckoutAddressInput) {
  const response = await fetch(`${getApiBase()}/checkout/session/${token}/address`, {
    method: 'PATCH',
    credentials: 'include',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify(input),
  });

  return parseResponse<CheckoutSessionResponse>(response);
}

export async function setCheckoutSessionContact(token: string, input: UpdateCheckoutContactInput) {
  const response = await fetch(`${getApiBase()}/checkout/session/${token}/contact`, {
    method: 'PATCH',
    credentials: 'include',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify(input),
  });

  return parseResponse<CheckoutSessionResponse>(response);
}

export async function createCheckoutPaymentSession(token: string) {
  const response = await fetch(`${getApiBase()}/checkout/session/${token}/payment`, {
    method: 'POST',
    credentials: 'include',
  });

  return parseResponse<CreateCheckoutPaymentSessionResponse>(response);
}

export async function fetchCheckoutPaymentStatus(token: string, providerSessionId: string) {
  const response = await fetch(
    `${getApiBase()}/checkout/session/${token}/payment-status?providerSessionId=${encodeURIComponent(providerSessionId)}`,
    {
      credentials: 'include',
      cache: 'no-store',
    },
  );

  return parseResponse<CheckoutPaymentStatusResponse>(response);
}

export async function placeOrder(input: PlaceOrderInput) {
  const response = await fetch(`${getApiBase()}/checkout/place-order`, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify(input),
  });

  return parseResponse<PlaceOrderResponse>(response);
}
