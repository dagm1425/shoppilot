import type { AddWishlistItemInput, WishlistResponse } from '@shoppilot/db/wishlist-contract';

type ApiError = {
  error?: {
    code?: string;
    message?: string;
    traceId?: string;
  };
};

export type WishlistApiResponse<T> =
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

async function parseResponse<T>(response: Response): Promise<WishlistApiResponse<T>> {
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

export async function fetchWishlist() {
  const response = await fetch(`${getApiBase()}/wishlist`, {
    credentials: 'include',
    cache: 'no-store',
  });

  return parseResponse<WishlistResponse>(response);
}

export async function addWishlistItem(input: AddWishlistItemInput) {
  const response = await fetch(`${getApiBase()}/wishlist/items`, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify(input),
  });

  return parseResponse<WishlistResponse>(response);
}

export async function removeWishlistItem(itemId: string) {
  const response = await fetch(`${getApiBase()}/wishlist/items/${itemId}`, {
    method: 'DELETE',
    credentials: 'include',
  });

  return parseResponse<WishlistResponse>(response);
}
