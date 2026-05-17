import type { AdminHomeSummaryResponse } from '@shoppilot/db/admin-dashboard-contract';
import type {
  AdminOrdersListQuery,
  AdminOrdersListResponse,
} from '@shoppilot/db/admin-orders-contract';
import type {
  AdminCreateProductInput,
  AdminMediaPresignRequestInput,
  AdminUpdateProductInput,
} from './admin-product-form-schemas';

type ApiError = {
  error?: {
    code?: string;
    message?: string;
    traceId?: string;
  };
};

export type AdminMediaPresignResponse = {
  role: 'primary' | 'secondary';
  objectKey: string;
  uploadUrl: string;
  publicUrl: string;
  expiresInSeconds: number;
  requiredHeaders: {
    'content-type': string;
  };
};

export type AdminProductMutationResponse = {
  product: {
    productId: string;
    name: string;
    description: string;
    category: 'bottoms' | 'tops';
    gender: 'men' | 'women';
    fit: string;
    color: string;
    priceCents: number;
    currency: string;
    available: boolean;
    stock: number;
    primaryImageUrl: string;
    secondaryImageUrl: string | null;
    media: Array<{
      role: 'primary' | 'secondary';
      objectKey: string;
      url: string;
      contentType: string;
      sizeBytes: number;
      altText: string | null;
    }>;
    createdAt: string;
    updatedAt: string;
  };
};

export type AdminApiResponse<T> =
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

async function parseResponse<T>(response: Response): Promise<AdminApiResponse<T>> {
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

export function getAdminHomeErrorMessage(message: string, code?: string): string {
  if (code === 'AUTH_UNAUTHORIZED') {
    return 'Sign in again to continue.';
  }

  if (code === 'AUTH_FORBIDDEN') {
    return 'Your account does not have permission to access admin data.';
  }

  return message;
}

export function getAdminOrdersErrorMessage(message: string, code?: string): string {
  if (code === 'ORDER_VALIDATION_ERROR') {
    return 'One or more order filters are invalid.';
  }

  return getAdminHomeErrorMessage(message, code);
}

export function getAdminProductsErrorMessage(message: string, code?: string): string {
  if (code === 'PRODUCT_VALIDATION_ERROR') {
    return 'One or more product fields are invalid.';
  }

  if (code === 'PRODUCT_MEDIA_TOO_LARGE') {
    return 'Media file is too large for upload.';
  }

  if (code === 'PRODUCT_MEDIA_CONTENT_TYPE_UNSUPPORTED') {
    return 'Unsupported media file type. Use JPEG, PNG, or WebP.';
  }

  if (code === 'PRODUCT_SLUG_CONFLICT') {
    return 'A product with this slug already exists.';
  }

  if (code === 'PRODUCT_MEDIA_NOT_CONFIGURED') {
    return 'Media upload is not configured for this environment yet.';
  }

  return getAdminHomeErrorMessage(message, code);
}

export async function fetchAdminHomeSummary() {
  const response = await fetch(`${getApiBase()}/orders/admin/home`, {
    credentials: 'include',
    cache: 'no-store',
  });

  return parseResponse<AdminHomeSummaryResponse>(response);
}

function buildAdminOrdersListUrl(query: AdminOrdersListQuery): string {
  const params = new URLSearchParams();

  params.set('page', String(query.page));
  params.set('pageSize', String(query.pageSize));

  if (query.status) {
    params.set('status', query.status);
  }

  if (query.customer) {
    params.set('customer', query.customer);
  }

  if (query.dateFrom) {
    params.set('dateFrom', query.dateFrom);
  }

  if (query.dateTo) {
    params.set('dateTo', query.dateTo);
  }

  const serialized = params.toString();
  return `${getApiBase()}/orders/admin/list${serialized.length > 0 ? `?${serialized}` : ''}`;
}

export async function fetchAdminOrdersList(query: AdminOrdersListQuery) {
  const response = await fetch(buildAdminOrdersListUrl(query), {
    credentials: 'include',
    cache: 'no-store',
  });

  return parseResponse<AdminOrdersListResponse>(response);
}

export async function presignAdminProductMedia(input: AdminMediaPresignRequestInput) {
  const response = await fetch(`${getApiBase()}/products/admin/media/presign`, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify(input),
  });

  return parseResponse<AdminMediaPresignResponse>(response);
}

export async function uploadAdminProductMediaFile(input: {
  uploadUrl: string;
  contentType: string;
  file: File;
}) {
  const response = await fetch(input.uploadUrl, {
    method: 'PUT',
    headers: {
      'content-type': input.contentType,
    },
    body: input.file,
  });

  return response.ok;
}

export async function createAdminProduct(input: AdminCreateProductInput) {
  const response = await fetch(`${getApiBase()}/products/admin`, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify(input),
  });

  return parseResponse<AdminProductMutationResponse>(response);
}

export async function updateAdminProduct(productId: string, input: AdminUpdateProductInput) {
  const response = await fetch(`${getApiBase()}/products/admin/${encodeURIComponent(productId)}`, {
    method: 'PATCH',
    credentials: 'include',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify(input),
  });

  return parseResponse<AdminProductMutationResponse>(response);
}
