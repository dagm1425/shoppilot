import { test, expect, type Page } from '@playwright/test';

type MockCatalogProduct = {
  productId: string;
  name: string;
  category: 'tops' | 'bottoms';
  gender: 'men' | 'women';
  fit: string;
  color: string;
  priceCents: number;
  currency: 'USD';
  available: boolean;
  primaryImageUrl: string;
  secondaryImageUrl: string | null;
};

const CATALOG_PRODUCTS: MockCatalogProduct[] = [
  {
    productId: 'arrival-oversized-tank',
    name: 'Arrival Oversized Tank',
    category: 'tops',
    gender: 'men',
    fit: 'Oversized fit',
    color: 'Force Blue',
    priceCents: 3000,
    currency: 'USD',
    available: true,
    primaryImageUrl: 'https://example.com/arrival-a.jpg',
    secondaryImageUrl: 'https://example.com/arrival-b.jpg',
  },
  {
    productId: 'essential-cropped-tee',
    name: 'Essential Cropped Tee',
    category: 'tops',
    gender: 'women',
    fit: 'Relaxed fit',
    color: 'White',
    priceCents: 2400,
    currency: 'USD',
    available: true,
    primaryImageUrl: 'https://example.com/tee-a.jpg',
    secondaryImageUrl: 'https://example.com/tee-b.jpg',
  },
  {
    productId: 'lift-seamless-tee',
    name: 'Lift Seamless Tee',
    category: 'tops',
    gender: 'men',
    fit: 'Slim fit',
    color: 'Olive',
    priceCents: 3200,
    currency: 'USD',
    available: true,
    primaryImageUrl: 'https://example.com/lift-a.jpg',
    secondaryImageUrl: null,
  },
  {
    productId: 'vital-seamless-legging',
    name: 'Vital Seamless Legging',
    category: 'bottoms',
    gender: 'women',
    fit: 'High-rise fit',
    color: 'Night Grey',
    priceCents: 4800,
    currency: 'USD',
    available: true,
    primaryImageUrl: 'https://example.com/legging-a.jpg',
    secondaryImageUrl: 'https://example.com/legging-b.jpg',
  },
];

function buildCorsHeaders(origin: string) {
  return {
    'access-control-allow-origin': origin,
    'access-control-allow-credentials': 'true',
    'access-control-allow-methods': 'GET,POST,OPTIONS',
    'access-control-allow-headers': 'content-type',
    'content-type': 'application/json',
  };
}

async function mockCatalogApi(page: Page) {
  await page.route('**/products**', async (route) => {
    const url = new URL(route.request().url());
    if (url.port !== '4000') {
      await route.continue();
      return;
    }
    const origin = route.request().headers().origin ?? 'http://127.0.0.1:3000';
    const corsHeaders = buildCorsHeaders(origin);

    if (route.request().method() === 'OPTIONS') {
      await route.fulfill({ status: 204, headers: corsHeaders, body: '' });
      return;
    }

    if (url.pathname.endsWith('/products')) {
      const sort = url.searchParams.get('sort') ?? 'relevance';
      const category = url.searchParams.get('category');
      const gender = url.searchParams.get('gender');
      const query = (url.searchParams.get('q') ?? '').trim().toLowerCase();
      const price = url.searchParams.get('price');
      const pageNumber = Number.parseInt(url.searchParams.get('page') ?? '1', 10) || 1;
      const pageSize = Number.parseInt(url.searchParams.get('pageSize') ?? '12', 10) || 12;

      let items = [...CATALOG_PRODUCTS];

      if (category) {
        items = items.filter((item) => item.category === category);
      }

      if (gender) {
        items = items.filter((item) => item.gender === gender);
      }

      if (query.length > 0) {
        items = items.filter((item) => {
          const haystack = `${item.name} ${item.fit}`.toLowerCase();
          return haystack.includes(query);
        });
      }

      if (price === 'under-25') {
        items = items.filter((item) => item.priceCents < 2500);
      } else if (price === '25-40') {
        items = items.filter((item) => item.priceCents >= 2500 && item.priceCents <= 4000);
      } else if (price === 'over-40') {
        items = items.filter((item) => item.priceCents > 4000);
      }

      if (sort === 'price-asc') {
        items.sort((left, right) => left.priceCents - right.priceCents);
      } else if (sort === 'price-desc') {
        items.sort((left, right) => right.priceCents - left.priceCents);
      }

      const start = (pageNumber - 1) * pageSize;
      const pagedItems = items.slice(start, start + pageSize);

      await route.fulfill({
        status: 200,
        headers: corsHeaders,
        body: JSON.stringify({
          items: pagedItems,
          pagination: {
            page: pageNumber,
            pageSize,
            total: items.length,
            totalPages: items.length === 0 ? 0 : Math.ceil(items.length / pageSize),
          },
          appliedFilters: {
            sort,
            category: category ?? undefined,
            gender: gender ?? undefined,
            price: price ?? undefined,
            q: query.length > 0 ? query : undefined,
          },
        }),
      });
      return;
    }

    const productId = url.pathname.split('/').pop() ?? '';
    const product = CATALOG_PRODUCTS.find((entry) => entry.productId === productId);

    if (!product) {
      await route.fulfill({
        status: 404,
        headers: corsHeaders,
        body: JSON.stringify({
          error: {
            code: 'PRODUCT_NOT_FOUND',
            message: 'Product not found.',
          },
        }),
      });
      return;
    }

    await route.fulfill({
      status: 200,
      headers: corsHeaders,
      body: JSON.stringify({
        product: {
          productId: product.productId,
          name: product.name,
          description: `${product.name} detail view for e2e coverage.`,
          category: product.category,
          gender: product.gender,
          fit: product.fit,
          color: product.color,
          priceCents: product.priceCents,
          currency: product.currency,
          available: product.available,
          stock: product.available ? 10 : 0,
          images: [product.primaryImageUrl, product.secondaryImageUrl].filter(Boolean),
          createdAt: new Date().toISOString(),
        },
      }),
    });
  });
}

test('catalog happy path supports filtering, search, and detail navigation', async ({ page }) => {
  await mockCatalogApi(page);

  await page.goto('/catalog?page=1&pageSize=12&category=tops&q=tee');

  await expect(page.getByRole('heading', { name: 'Filter & Sort' })).toBeVisible();
  await expect(
    page.getByRole('link', { name: 'Essential Cropped Tee', exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('link', { name: 'Lift Seamless Tee', exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Gender' }).click();
  await page.locator('label', { hasText: 'Women' }).first().click();

  await expect(page).toHaveURL(/gender=women/);
  await expect(
    page.getByRole('link', { name: 'Essential Cropped Tee', exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('link', { name: 'Lift Seamless Tee', exact: true })).toHaveCount(0);
});

test('catalog failure path shows retry and recovers on subsequent request', async ({ page }) => {
  let requestCount = 0;

  await page.route('**/products**', async (route) => {
    const url = new URL(route.request().url());
    const origin = route.request().headers().origin ?? 'http://127.0.0.1:3000';
    const corsHeaders = buildCorsHeaders(origin);

    if (!url.pathname.endsWith('/products')) {
      await route.continue();
      return;
    }

    requestCount += 1;

    if (requestCount === 1) {
      await route.fulfill({
        status: 500,
        headers: corsHeaders,
        body: JSON.stringify({
          error: {
            code: 'CATALOG_UPSTREAM_ERROR',
            message: 'Temporary failure',
          },
        }),
      });
      return;
    }

    await route.fulfill({
      status: 200,
      headers: corsHeaders,
      body: JSON.stringify({
        items: [CATALOG_PRODUCTS[0]],
        pagination: {
          page: 1,
          pageSize: 12,
          total: 1,
          totalPages: 1,
        },
        appliedFilters: {
          sort: 'relevance',
        },
      }),
    });
  });

  await page.goto('/catalog');

  await expect(page.getByText('Catalog unavailable')).toBeVisible();
  await page.getByRole('button', { name: 'Retry' }).click();
  await expect(
    page.getByRole('link', { name: 'Arrival Oversized Tank', exact: true }),
  ).toBeVisible();
});

test('catalog page remains usable with no horizontal overflow on required viewports', async ({ page }) => {
  await mockCatalogApi(page);

  const viewports = [
    { width: 360, height: 800 },
    { width: 768, height: 1024 },
    { width: 1024, height: 768 },
    { width: 1440, height: 900 },
  ];

  for (const viewport of viewports) {
    await page.setViewportSize(viewport);
    await page.goto('/catalog');

    await expect(page.getByRole('heading', { name: 'Filter & Sort' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Arrival Oversized Tank', exact: true })).toBeVisible();

    const hasOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    );
    expect(hasOverflow).toBe(false);
  }
});
