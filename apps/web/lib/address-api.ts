import type {
  AddressListResponse,
  AddressRecord,
  CreateAddressInput,
  DeleteAddressResponse,
  UpdateAddressInput,
} from '@shoppilot/db/address-contract';

type ApiError = {
  error?: {
    code?: string;
    message?: string;
    traceId?: string;
  };
};

export type AddressApiResponse<T> =
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

async function parseResponse<T>(response: Response): Promise<AddressApiResponse<T>> {
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

export function getAddressErrorMessage(message: string, code?: string): string {
  if (code === 'ADDRESS_VALIDATION_ERROR') {
    return 'Please enter a valid address.';
  }

  if (code === 'ADDRESS_NOT_FOUND') {
    return 'This address no longer exists.';
  }

  if (code === 'ADDRESS_DEFAULT_REQUIRED') {
    return 'At least one default address is required.';
  }

  return message;
}

export async function fetchAddresses() {
  const response = await fetch(`${getApiBase()}/me/addresses`, {
    credentials: 'include',
    cache: 'no-store',
  });

  return parseResponse<AddressListResponse>(response);
}

export async function createAddress(input: CreateAddressInput) {
  const response = await fetch(`${getApiBase()}/me/addresses`, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify(input),
  });

  return parseResponse<AddressRecord>(response);
}

export async function updateAddress(addressId: string, input: UpdateAddressInput) {
  const response = await fetch(`${getApiBase()}/me/addresses/${addressId}`, {
    method: 'PATCH',
    credentials: 'include',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify(input),
  });

  return parseResponse<AddressRecord>(response);
}

export async function deleteAddress(addressId: string) {
  const response = await fetch(`${getApiBase()}/me/addresses/${addressId}`, {
    method: 'DELETE',
    credentials: 'include',
  });

  return parseResponse<DeleteAddressResponse>(response);
}
