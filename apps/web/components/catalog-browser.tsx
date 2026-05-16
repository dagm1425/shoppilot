'use client';

import type {
  CatalogCategory,
  CatalogGender,
  CatalogListResponse,
  CatalogListQuery,
  CatalogPriceRange,
  CatalogSort,
} from '@shoppilot/db/catalog-contract';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import {
  CATALOG_CATEGORY_OPTIONS,
  CATALOG_GENDER_OPTIONS,
  CATALOG_PRICE_OPTIONS,
  CATALOG_SORT_OPTIONS,
  fetchCatalogProducts,
} from '../lib/catalog-api';
import { reportClientError } from '../lib/client-error';
import { CatalogFilterSidebar, type CatalogPriceRangeFilter } from './catalog/catalog-filter-sidebar';
import { CatalogPagination } from './catalog/catalog-pagination';
import { CatalogProductCard } from './catalog/catalog-product-card';
import { StatePanel } from './state-panel';

const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE = 12;
const DEFAULT_SORT: CatalogSort = 'relevance';

const VALID_SORTS = new Set(CATALOG_SORT_OPTIONS.map((entry) => entry.value));
const VALID_CATEGORIES = new Set(CATALOG_CATEGORY_OPTIONS.map((entry) => entry.value));
const VALID_GENDERS = new Set(CATALOG_GENDER_OPTIONS.map((entry) => entry.value));
const VALID_PRICES = new Set(CATALOG_PRICE_OPTIONS.map((entry) => entry.value));

type CatalogLoadState = 'loading' | 'success' | 'error';

function parsePositiveInt(value: string | null, fallback: number): number {
  const parsed = Number.parseInt(value ?? '', 10);
  if (!Number.isFinite(parsed) || parsed < 1) {
    return fallback;
  }

  return parsed;
}

function parseQueryFromSearchParams(searchParams: URLSearchParams): CatalogListQuery {
  const page = parsePositiveInt(searchParams.get('page'), DEFAULT_PAGE);
  const pageSize = parsePositiveInt(searchParams.get('pageSize'), DEFAULT_PAGE_SIZE);

  const rawSort = searchParams.get('sort');
  const sort = VALID_SORTS.has(rawSort as CatalogSort)
    ? (rawSort as CatalogSort)
    : DEFAULT_SORT;

  const rawCategory = searchParams.get('category');
  const category = VALID_CATEGORIES.has(rawCategory as CatalogCategory)
    ? (rawCategory as CatalogCategory)
    : undefined;

  const rawGender = searchParams.get('gender');
  const gender = VALID_GENDERS.has(rawGender as CatalogGender)
    ? (rawGender as CatalogGender)
    : undefined;

  const rawPrice = searchParams.get('price');
  const price = VALID_PRICES.has(rawPrice as CatalogPriceRange)
    ? (rawPrice as CatalogPriceRange)
    : undefined;

  const rawQuery = searchParams.get('q');
  const q = rawQuery && rawQuery.trim().length > 0 ? rawQuery.trim() : undefined;

  return {
    page,
    pageSize,
    sort,
    category,
    gender,
    price,
    q,
  };
}

function buildSearchString(query: CatalogListQuery): string {
  const params = new URLSearchParams();

  params.set('page', String(query.page));
  params.set('pageSize', String(query.pageSize));

  if (query.sort !== DEFAULT_SORT) {
    params.set('sort', query.sort);
  }

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

function formatMoney(cents: number, currency: string): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
  }).format(cents / 100);
}

export function CatalogBrowser() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const query = useMemo(() => parseQueryFromSearchParams(searchParams), [searchParams]);
  const queryKey = useMemo(() => JSON.stringify(query), [query]);

  const [status, setStatus] = useState<CatalogLoadState>('loading');
  const [retryCounter, setRetryCounter] = useState(0);
  const [errorMessage, setErrorMessage] = useState('Unable to load products right now.');
  const [payload, setPayload] = useState<CatalogListResponse | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadCatalog() {
      setStatus('loading');
      const response = await fetchCatalogProducts(query);

      if (cancelled) {
        return;
      }

      if (!response.ok) {
        setStatus('error');
        setErrorMessage(response.message);
        reportClientError({
          error: new Error(response.code ? `${response.code}: ${response.message}` : response.message),
          context: 'catalog.list',
        });
        return;
      }

      setPayload(response.data);
      setStatus('success');
      setErrorMessage('');
    }

    loadCatalog().catch((error: unknown) => {
      if (cancelled) {
        return;
      }

      setStatus('error');
      setErrorMessage('Unable to load products right now.');
      reportClientError({ error, context: 'catalog.list' });
    });

    return () => {
      cancelled = true;
    };
  }, [query, queryKey, retryCounter]);

  const isLoading = status === 'loading';
  const hasActiveSidebarFilters =
    query.sort !== DEFAULT_SORT
    || Boolean(query.gender)
    || Boolean(query.price);

  const visibleItems = payload?.items ?? [];

  function navigateWithQuery(next: CatalogListQuery) {
    const search = buildSearchString(next);
    router.replace(search.length > 0 ? `${pathname}?${search}` : pathname);
  }

  function handleSortChange(nextSort: CatalogSort) {
    navigateWithQuery({
      ...query,
      page: DEFAULT_PAGE,
      sort: nextSort,
    });
  }

  function handleGenderChange(nextGender: CatalogGender | undefined) {
    navigateWithQuery({
      ...query,
      page: DEFAULT_PAGE,
      gender: nextGender,
    });
  }

  function handlePageChange(nextPage: number) {
    navigateWithQuery({
      ...query,
      page: nextPage,
    });
  }

  function handlePriceRangeChange(nextPriceRange: CatalogPriceRangeFilter) {
    navigateWithQuery({
      ...query,
      page: DEFAULT_PAGE,
      price: nextPriceRange === 'all' ? undefined : nextPriceRange,
    });
  }

  function clearAllSidebarFilters() {
    if (query.sort !== DEFAULT_SORT) {
      navigateWithQuery({
        ...query,
        page: DEFAULT_PAGE,
        sort: DEFAULT_SORT,
        gender: undefined,
        price: undefined,
      });
      return;
    }

    if (query.gender || query.price) {
      navigateWithQuery({
        ...query,
        page: DEFAULT_PAGE,
        gender: undefined,
        price: undefined,
      });
    }
  }

  return (
    <main id="main-content" className="min-h-screen bg-card px-4 py-6 sm:px-6 lg:px-10">
      <div className="mx-auto grid w-full max-w-[92rem] gap-6 lg:gap-10 lg:grid-cols-[20rem_minmax(0,1fr)]">
        <CatalogFilterSidebar
          sort={query.sort}
          selectedGender={query.gender ?? 'all'}
          selectedPriceRange={query.price ?? 'all'}
          hasActiveFilters={hasActiveSidebarFilters}
          onSortChange={handleSortChange}
          onGenderChange={handleGenderChange}
          onPriceRangeChange={handlePriceRangeChange}
          onClearAll={clearAllSidebarFilters}
        />

        <section className="min-w-0">
          {status === 'error' ? (
            <div>
              <StatePanel
                variant="error"
                title="Catalog unavailable"
                description={errorMessage}
              >
                <button
                  type="button"
                  onClick={() => setRetryCounter((count) => count + 1)}
                  className="rounded-md border border-border bg-background px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted"
                >
                  Retry
                </button>
              </StatePanel>
            </div>
          ) : null}

          {isLoading && !payload ? (
            <section>
              <StatePanel
                variant="loading"
                title="Loading catalog"
                description="Fetching products and filters."
              />
              <div className="mt-4 grid grid-cols-2 gap-2 lg:grid-cols-3 xl:grid-cols-4">
                {Array.from({ length: 8 }).map((_, index) => (
                  <div key={index} className="animate-pulse">
                    <div className="aspect-[4/5] bg-muted" />
                    <div className="mt-2 h-4 bg-muted" />
                    <div className="mt-1 h-4 w-2/3 bg-muted" />
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          {status === 'success' && payload ? (
            <>
              {isLoading ? (
                <div className="mb-4">
                  <StatePanel
                    variant="loading"
                    title="Refreshing results"
                    description="Applying your latest filters."
                  />
                </div>
              ) : null}

              {visibleItems.length === 0 ? (
                <section className="py-4">
                  <h2 className="text-base font-semibold text-foreground">No products found</h2>
                </section>
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-2 lg:grid-cols-3 xl:grid-cols-4">
                    {visibleItems.map((product) => (
                      <CatalogProductCard
                        key={product.productId}
                        product={product}
                        formatMoney={formatMoney}
                      />
                    ))}
                  </div>

                  <CatalogPagination
                    currentPage={payload.pagination.page}
                    totalPages={payload.pagination.totalPages}
                    disabled={isLoading}
                    onPageChange={handlePageChange}
                  />
                </>
              )}
            </>
          ) : null}
        </section>
      </div>
    </main>
  );
}
