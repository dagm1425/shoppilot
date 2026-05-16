import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

process.env.NEXT_PUBLIC_API_BASE_URL = 'http://127.0.0.1:4000';

import CatalogPage from '../../app/(customer)/catalog/page';

const replaceMock = jest.fn();
let currentSearchParams = 'page=1&pageSize=12';
let searchParamsObject = new URLSearchParams(currentSearchParams);
const originalFetch = globalThis.fetch;

jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace: replaceMock }),
  usePathname: () => '/catalog',
  useSearchParams: () => searchParamsObject,
}));

function buildSuccessPayload(items: Array<{ productId: string; name: string }>) {
  return {
    items: items.map((item, index) => ({
      productId: item.productId,
      name: item.name,
      category: 'tops',
      gender: 'men',
      fit: 'Regular fit',
      color: 'Black',
      priceCents: 4200 + index,
      currency: 'USD',
      available: true,
      primaryImageUrl: `https://example.com/${item.productId}.jpg`,
      secondaryImageUrl: null,
    })),
    pagination: {
      page: 1,
      pageSize: 12,
      total: items.length,
      totalPages: items.length > 0 ? 1 : 0,
    },
    appliedFilters: {
      sort: 'relevance',
    },
  };
}

function buildFetchResponse<T>(payload: T, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload,
  } as Response;
}

describe('Catalog page integration', () => {
  const fetchMock = jest.fn<Promise<Response>, Parameters<typeof fetch>>();

  beforeEach(() => {
    replaceMock.mockReset();
    currentSearchParams = 'page=1&pageSize=12';
    searchParamsObject = new URLSearchParams(currentSearchParams);
    jest.restoreAllMocks();
    fetchMock.mockReset();
    Object.defineProperty(globalThis, 'fetch', {
      value: fetchMock,
      writable: true,
    });
  });

  afterEach(() => {
    Object.defineProperty(globalThis, 'fetch', {
      value: originalFetch,
      writable: true,
    });
  });

  it('renders products for successful catalog fetch', async () => {
    fetchMock.mockResolvedValueOnce(
      buildFetchResponse(
        buildSuccessPayload([
        { productId: 'arrival-oversized-tank', name: 'Arrival Oversized Tank' },
        { productId: 'lift-seamless-tee', name: 'Lift Seamless Tee' },
        ]),
      ),
    );

    render(React.createElement(CatalogPage));

    expect(await screen.findByRole('heading', { name: 'Filter & Sort' })).toBeInTheDocument();
    expect(await screen.findByRole('link', { name: 'Arrival Oversized Tank' })).toBeInTheDocument();
    expect(await screen.findByRole('link', { name: 'Lift Seamless Tee' })).toBeInTheDocument();
  });

  it('shows an empty state when no products match', async () => {
    fetchMock.mockResolvedValueOnce(buildFetchResponse(buildSuccessPayload([])));

    render(React.createElement(CatalogPage));

    expect(await screen.findByText('No products found')).toBeInTheDocument();
  });

  it('shows error state and retries successfully', async () => {
    fetchMock
      .mockResolvedValueOnce(
        buildFetchResponse(
          {
            error: {
              code: 'CATALOG_UPSTREAM_ERROR',
              message: 'Temporary failure',
            },
          },
          500,
        ),
      )
      .mockResolvedValueOnce(
        buildFetchResponse(
          buildSuccessPayload([
          { productId: 'vital-seamless-legging', name: 'Vital Seamless Legging' },
          ]),
        ),
      );

    render(React.createElement(CatalogPage));

    expect(await screen.findByText('Catalog unavailable')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));

    await waitFor(() => {
      expect(screen.getByRole('link', { name: 'Vital Seamless Legging' })).toBeInTheDocument();
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('disables controls while loading catalog results', async () => {
    let resolveFetch: ((value: Response) => void) | undefined;
    fetchMock.mockImplementationOnce(
      () =>
        new Promise<Response>((resolve) => {
          resolveFetch = resolve;
        }),
    );

    render(React.createElement(CatalogPage));

    expect(screen.getByRole('button', { name: 'Clear All' })).toBeDisabled();
    expect(screen.getByRole('heading', { name: 'Loading catalog' })).toBeInTheDocument();

    resolveFetch?.(
      buildFetchResponse(
        buildSuccessPayload([
          { productId: 'essential-cropped-tee', name: 'Essential Cropped Tee' },
        ]),
      ),
    );

    expect(await screen.findByRole('link', { name: 'Essential Cropped Tee' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Loading catalog' })).not.toBeInTheDocument();
  });
});
