import type {
  CatalogCategory,
  CatalogGender,
  CatalogListQuery,
  CatalogListResponse,
  CatalogPriceRange,
  CatalogProductDetailsResponse,
  CatalogSort,
} from '@shoppilot/db/catalog-contract';

type ApiError = {
  error?: {
    code?: string;
    message?: string;
    traceId?: string;
  };
};

export type CatalogApiResponse<T> =
  | {
      ok: true;
      data: T;
    }
  | {
      ok: false;
      message: string;
      code?: string;
    };

export const CATALOG_SORT_OPTIONS: Array<{ label: string; value: CatalogSort }> = [
  { label: 'Relevance', value: 'relevance' },
  { label: 'Newest', value: 'newest' },
  { label: 'Price: Low to High', value: 'price-asc' },
  { label: 'Price: High to Low', value: 'price-desc' },
];

export const CATALOG_CATEGORY_OPTIONS: Array<{ label: string; value: CatalogCategory }> = [
  { label: 'Bottoms', value: 'bottoms' },
  { label: 'Tops', value: 'tops' },
];

export const CATALOG_GENDER_OPTIONS: Array<{ label: string; value: CatalogGender }> = [
  { label: 'Men', value: 'men' },
  { label: 'Women', value: 'women' },
];

export const CATALOG_PRICE_OPTIONS: Array<{ label: string; value: CatalogPriceRange }> = [
  { label: 'Under $25', value: 'under-25' },
  { label: '$25 to $40', value: '25-40' },
  { label: 'Over $40', value: 'over-40' },
];

const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL;

function getApiBase(): string {
  if (!apiBase) {
    throw new Error('NEXT_PUBLIC_API_BASE_URL is missing.');
  }

  return apiBase;
}

async function parseResponse<T>(response: Response): Promise<CatalogApiResponse<T>> {
  if (response.ok) {
    return {
      ok: true,
      data: (await response.json()) as T,
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
  };
}

function buildCatalogQueryString(query: CatalogListQuery): string {
  const params = new URLSearchParams();

  params.set('page', String(query.page));
  params.set('pageSize', String(query.pageSize));
  params.set('sort', query.sort);

  if (query.category) {
    params.set('category', query.category);
  }

  if (query.gender) {
    params.set('gender', query.gender);
  }

  if (query.price) {
    params.set('price', query.price);
  }

  if (query.q) {
    params.set('q', query.q);
  }

  return params.toString();
}

export async function fetchCatalogProducts(query: CatalogListQuery) {
  const response = await fetch(`${getApiBase()}/products?${buildCatalogQueryString(query)}`, {
    credentials: 'include',
    cache: 'no-store',
  });

  return parseResponse<CatalogListResponse>(response);
}

export async function fetchCatalogProductDetails(productId: string) {
  const response = await fetch(`${getApiBase()}/products/${productId}`, {
    credentials: 'include',
    cache: 'no-store',
  });

  return parseResponse<CatalogProductDetailsResponse>(response);
}
