import type { OrderRecord } from '@shoppilot/db/order-contract';

type ApiError = {
  error?: {
    code?: string;
    message?: string;
    traceId?: string;
  };
};

export type OrdersApiResponse<T> =
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

async function parseResponse<T>(response: Response): Promise<OrdersApiResponse<T>> {
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

export function getOrderErrorMessage(message: string, code?: string): string {
  if (code === 'ORDER_NOT_FOUND') {
    return 'Order not found. Check the order number and try again.';
  }

  if (code === 'ORDER_VALIDATION_ERROR') {
    return 'Order number format is invalid.';
  }

  if (code === 'AUTH_UNAUTHORIZED') {
    return 'Sign in again to continue.';
  }

  return message;
}

export async function fetchOrderByNumber(orderNumber: string) {
  const response = await fetch(`${getApiBase()}/orders/${encodeURIComponent(orderNumber)}`, {
    credentials: 'include',
    cache: 'no-store',
  });

  return parseResponse<OrderRecord>(response);
}
