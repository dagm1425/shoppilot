import type {
  AddCartItemInput,
  CartResponse,
  UpdateCartItemInput,
} from '@shoppilot/db/cart-contract';

type ApiError = {
  error?: {
    code?: string;
    message?: string;
    traceId?: string;
  };
};

export type CartApiResponse<T> =
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

async function parseResponse<T>(response: Response): Promise<CartApiResponse<T>> {
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

export function getCartErrorMessage(message: string, code?: string): string {
  if (code === 'CART_STOCK_EXCEEDED') {
    return 'Requested quantity exceeds available stock.';
  }

  if (code === 'CART_PRODUCT_UNAVAILABLE') {
    return 'This product is currently unavailable.';
  }

  if (code === 'CART_PRODUCT_NOT_FOUND') {
    return 'This product is no longer available.';
  }

  if (code === 'CART_ITEM_NOT_FOUND') {
    return 'This cart item no longer exists.';
  }

  if (code === 'CART_VALIDATION_ERROR') {
    return 'Please provide a valid cart quantity.';
  }

  return message;
}

export async function fetchCart() {
  const response = await fetch(`${getApiBase()}/cart`, {
    credentials: 'include',
    cache: 'no-store',
  });

  return parseResponse<CartResponse>(response);
}

export async function addCartItem(input: AddCartItemInput) {
  const response = await fetch(`${getApiBase()}/cart/items`, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify(input),
  });

  return parseResponse<CartResponse>(response);
}

export async function updateCartItem(itemId: string, input: UpdateCartItemInput) {
  const response = await fetch(`${getApiBase()}/cart/items/${itemId}`, {
    method: 'PATCH',
    credentials: 'include',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify(input),
  });

  return parseResponse<CartResponse>(response);
}

export async function removeCartItem(itemId: string) {
  const response = await fetch(`${getApiBase()}/cart/items/${itemId}`, {
    method: 'DELETE',
    credentials: 'include',
  });

  return parseResponse<CartResponse>(response);
}
