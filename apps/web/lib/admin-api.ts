import type { AdminHomeSummaryResponse } from '@shoppilot/db/admin-dashboard-contract';
import type {
  AdminOrdersListQuery,
  AdminOrdersListResponse,
} from '@shoppilot/db/admin-orders-contract';

type ApiError = {
  error?: {
    code?: string;
    message?: string;
    traceId?: string;
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
