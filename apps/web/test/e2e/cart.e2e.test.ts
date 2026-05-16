import { expect, test, type Page } from '@playwright/test';

type MockProduct = {
  productId: string;
  name: string;
  description: string;
  category: 'tops' | 'bottoms';
  gender: 'men' | 'women';
  fit: string;
  color: string;
  priceCents: number;
  currency: 'USD';
  available: boolean;
  stock: number;
  images: string[];
};

type CartLine = {
  itemId: string;
  productId: string;
  size: 's' | 'm' | 'l' | 'xl';
  quantity: number;
};

function buildCorsHeaders(origin: string) {
  return {
    'access-control-allow-origin': origin,
    'access-control-allow-credentials': 'true',
    'access-control-allow-methods': 'GET,POST,PATCH,DELETE,OPTIONS',
    'access-control-allow-headers': 'content-type',
    'content-type': 'application/json',
  };
}

async function mockCartAndCatalogApi(
  page: Page,
  options?: {
    startAuthenticated?: boolean;
    initialStock?: number;
    initialAvailability?: boolean;
    seededCart?: CartLine[];
    cartMutationAuthorized?: boolean;
  },
) {
  let authenticated = options?.startAuthenticated ?? true;
  const cartMutationAuthorized = options?.cartMutationAuthorized ?? true;
  let lineCounter = 1;

  const product: MockProduct = {
    productId: 'arrival-oversized-tank',
    name: 'Arrival Oversized Tank',
    description: 'Breathable gym tank.',
    category: 'tops',
    gender: 'men',
    fit: 'Oversized fit',
    color: 'Force Blue',
    priceCents: 3000,
    currency: 'USD',
    available: options?.initialAvailability ?? true,
    stock: options?.initialStock ?? 5,
    images: ['https://example.com/arrival-a.jpg', 'https://example.com/arrival-b.jpg'],
  };

  const cart = new Map<string, CartLine>();

  for (const line of options?.seededCart ?? []) {
    cart.set(line.itemId, { ...line });
    lineCounter += 1;
  }

  function buildCartPayload() {
    const items = [...cart.values()].map((line) => {
      const unavailable = !product.available || product.stock < 1;
      const insufficientStock = !unavailable && line.quantity > product.stock;
      const isValid = !unavailable && !insufficientStock;

      return {
        itemId: line.itemId,
        productId: line.productId,
        name: product.name,
        fit: product.fit,
        color: product.color,
        size: line.size,
        quantity: line.quantity,
        stock: product.stock,
        available: product.available,
        priceCents: product.priceCents,
        currency: product.currency,
        primaryImageUrl: product.images[0],
        secondaryImageUrl: product.images[1] ?? null,
        isValid,
        invalidReason: unavailable
          ? 'PRODUCT_UNAVAILABLE'
          : insufficientStock
            ? 'INSUFFICIENT_STOCK'
            : undefined,
        lineSubtotalCents: isValid ? line.quantity * product.priceCents : 0,
      };
    });

    const summary = {
      itemCount: items.reduce((total, item) => total + item.quantity, 0),
      validLineCount: items.reduce((total, item) => total + (item.isValid ? 1 : 0), 0),
      subtotalCents: items.reduce((total, item) => total + item.lineSubtotalCents, 0),
      currency: 'USD',
    };

    return { items, summary };
  }

  await page.route('**/auth/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.port !== '4000') {
      await route.continue();
      return;
    }
    const origin = request.headers().origin ?? 'http://127.0.0.1:3000';
    const corsHeaders = buildCorsHeaders(origin);

    if (request.method() === 'OPTIONS') {
      await route.fulfill({ status: 204, headers: corsHeaders, body: '' });
      return;
    }

    if (url.pathname.endsWith('/auth/me') && request.method() === 'GET') {
      if (!authenticated) {
        await route.fulfill({
          status: 401,
          headers: corsHeaders,
          body: JSON.stringify({
            error: {
              code: 'AUTH_UNAUTHORIZED',
              message: 'Authentication is required.',
            },
          }),
        });
        return;
      }

      await route.fulfill({
        status: 200,
        headers: corsHeaders,
        body: JSON.stringify({
          user: {
            id: 'user_1',
            username: 'customer_1',
            email: 'customer@shoppilot.local',
            role: 'CUSTOMER',
          },
        }),
      });
      return;
    }

    await route.fulfill({
      status: 404,
      headers: corsHeaders,
      body: JSON.stringify({
        error: {
          code: 'AUTH_NOT_FOUND',
          message: 'Not found.',
        },
      }),
    });
  });

  await page.route('**/products**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.port !== '4000') {
      await route.continue();
      return;
    }
    const origin = request.headers().origin ?? 'http://127.0.0.1:3000';
    const corsHeaders = buildCorsHeaders(origin);

    if (request.method() === 'OPTIONS') {
      await route.fulfill({ status: 204, headers: corsHeaders, body: '' });
      return;
    }

    if (url.pathname.endsWith('/products')) {
      await route.fulfill({
        status: 200,
        headers: corsHeaders,
        body: JSON.stringify({
          items: [
            {
              productId: product.productId,
              name: product.name,
              category: product.category,
              gender: product.gender,
              fit: product.fit,
              color: product.color,
              priceCents: product.priceCents,
              currency: product.currency,
              available: product.available,
              primaryImageUrl: product.images[0],
              secondaryImageUrl: product.images[1],
            },
          ],
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
      return;
    }

    if (url.pathname.endsWith(`/products/${product.productId}`)) {
      await route.fulfill({
        status: 200,
        headers: corsHeaders,
        body: JSON.stringify({
          product: {
            productId: product.productId,
            name: product.name,
            description: product.description,
            category: product.category,
            gender: product.gender,
            fit: product.fit,
            color: product.color,
            priceCents: product.priceCents,
            currency: product.currency,
            available: product.available,
            stock: product.stock,
            images: product.images,
            createdAt: new Date().toISOString(),
          },
        }),
      });
      return;
    }

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
  });

  await page.route('**/cart**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.port !== '4000') {
      await route.continue();
      return;
    }
    const origin = request.headers().origin ?? 'http://127.0.0.1:3000';
    const corsHeaders = buildCorsHeaders(origin);

    if (request.method() === 'OPTIONS') {
      await route.fulfill({ status: 204, headers: corsHeaders, body: '' });
      return;
    }

    if (!authenticated) {
      await route.fulfill({
        status: 401,
        headers: corsHeaders,
        body: JSON.stringify({
          error: {
            code: 'AUTH_UNAUTHORIZED',
            message: 'Authentication is required.',
          },
        }),
      });
      return;
    }

    if (!cartMutationAuthorized && request.method() !== 'GET') {
      await route.fulfill({
        status: 401,
        headers: corsHeaders,
        body: JSON.stringify({
          error: {
            code: 'AUTH_UNAUTHORIZED',
            message: 'Authentication is required.',
          },
        }),
      });
      return;
    }

    if (url.pathname.endsWith('/cart') && request.method() === 'GET') {
      await route.fulfill({
        status: 200,
        headers: corsHeaders,
        body: JSON.stringify(buildCartPayload()),
      });
      return;
    }

    if (url.pathname.endsWith('/cart/items') && request.method() === 'POST') {
      const body = request.postDataJSON() as {
        productId: string;
        size?: 's' | 'm' | 'l' | 'xl';
        quantity?: number;
      };
      const quantity = body.quantity ?? 1;
      const size = body.size;

      if (!size) {
        await route.fulfill({
          status: 400,
          headers: corsHeaders,
          body: JSON.stringify({
            error: {
              code: 'CART_VALIDATION_ERROR',
              message: 'Invalid cart payload.',
            },
          }),
        });
        return;
      }

      if (!product.available || product.stock < 1) {
        await route.fulfill({
          status: 409,
          headers: corsHeaders,
          body: JSON.stringify({
            error: {
              code: 'CART_PRODUCT_UNAVAILABLE',
              message: 'This product is currently unavailable.',
            },
          }),
        });
        return;
      }

      const existing = [...cart.values()].find(
        (entry) => entry.productId === body.productId && entry.size === size,
      );
      const nextQuantity = (existing?.quantity ?? 0) + quantity;

      if (nextQuantity > product.stock) {
        await route.fulfill({
          status: 409,
          headers: corsHeaders,
          body: JSON.stringify({
            error: {
              code: 'CART_STOCK_EXCEEDED',
              message: `Only ${product.stock} unit(s) are available.`,
            },
          }),
        });
        return;
      }

      if (existing) {
        existing.quantity = nextQuantity;
        cart.set(existing.itemId, existing);
      } else {
        const itemId = `item_${lineCounter}`;
        lineCounter += 1;

        cart.set(itemId, {
          itemId,
          productId: body.productId,
          size,
          quantity,
        });
      }

      await route.fulfill({
        status: 201,
        headers: corsHeaders,
        body: JSON.stringify(buildCartPayload()),
      });
      return;
    }

    if (url.pathname.includes('/cart/items/') && request.method() === 'PATCH') {
      const itemId = url.pathname.split('/').pop() ?? '';
      const line = cart.get(itemId);

      if (!line) {
        await route.fulfill({
          status: 404,
          headers: corsHeaders,
          body: JSON.stringify({
            error: {
              code: 'CART_ITEM_NOT_FOUND',
              message: 'Cart item not found.',
            },
          }),
        });
        return;
      }

      const body = request.postDataJSON() as { quantity: number };
      if (!product.available || product.stock < 1) {
        await route.fulfill({
          status: 409,
          headers: corsHeaders,
          body: JSON.stringify({
            error: {
              code: 'CART_PRODUCT_UNAVAILABLE',
              message: 'This product is currently unavailable.',
            },
          }),
        });
        return;
      }

      if (body.quantity > product.stock) {
        await route.fulfill({
          status: 409,
          headers: corsHeaders,
          body: JSON.stringify({
            error: {
              code: 'CART_STOCK_EXCEEDED',
              message: `Only ${product.stock} unit(s) are available.`,
            },
          }),
        });
        return;
      }

      line.quantity = body.quantity;
      cart.set(itemId, line);

      await route.fulfill({
        status: 200,
        headers: corsHeaders,
        body: JSON.stringify(buildCartPayload()),
      });
      return;
    }

    if (url.pathname.includes('/cart/items/') && request.method() === 'DELETE') {
      const itemId = url.pathname.split('/').pop() ?? '';
      cart.delete(itemId);

      await route.fulfill({
        status: 200,
        headers: corsHeaders,
        body: JSON.stringify(buildCartPayload()),
      });
      return;
    }

    await route.fulfill({
      status: 404,
      headers: corsHeaders,
      body: JSON.stringify({
        error: {
          code: 'CART_NOT_FOUND',
          message: 'Not found.',
        },
      }),
    });
  });

  return {
    setAuthenticated(value: boolean) {
      authenticated = value;
    },
    setProductState(input: { available: boolean; stock: number }) {
      product.available = input.available;
      product.stock = input.stock;
    },
  };
}

test('cart happy path: update quantity and remove', async ({ page }) => {
  await mockCartAndCatalogApi(page, {
    startAuthenticated: true,
    seededCart: [
      {
        itemId: 'item_1',
        productId: 'arrival-oversized-tank',
        size: 'm',
        quantity: 1,
      },
    ],
  });

  await page.goto('/cart');
  await expect(page).toHaveURL(/\/cart$/);

  const cartMain = page.locator('#main-content');

  await expect(cartMain.getByRole('heading', { name: 'Your cart' })).toBeVisible();
  await expect(cartMain.getByText('Arrival Oversized Tank').first()).toBeVisible();

  await cartMain.getByLabel('Increase quantity').click();
  await expect(cartMain.getByText('$60.00').first()).toBeVisible();

  await cartMain.getByRole('button', { name: 'Remove Arrival Oversized Tank' }).click();
  await expect(cartMain.getByText('Your bag is empty')).toBeVisible();
});

test('cart failure/recovery path: stock drops after add and user recovers by decreasing quantity', async ({ page }) => {
  const mock = await mockCartAndCatalogApi(page, {
    startAuthenticated: true,
    initialStock: 2,
    seededCart: [
      {
        itemId: 'item_1',
        productId: 'arrival-oversized-tank',
        size: 'm',
        quantity: 2,
      },
    ],
  });

  mock.setProductState({
    available: true,
    stock: 1,
  });

  await page.goto('/cart');
  const cartMain = page.locator('#main-content');

  await expect(cartMain.getByText('Some items need attention')).toBeVisible();
  await expect(cartMain.getByText('Only 1 unit(s) are currently available.')).toBeVisible();

  await cartMain.getByLabel('Decrease quantity').click();

  await expect(cartMain.getByText('$30.00').first()).toBeVisible();
  await expect(cartMain.getByText('Some items need attention')).toHaveCount(0);
});

test('cart page remains usable with no horizontal overflow on required viewports', async ({ page }) => {
  await mockCartAndCatalogApi(page, {
    startAuthenticated: true,
    seededCart: [
      {
        itemId: 'item_1',
        productId: 'arrival-oversized-tank',
        size: 'm',
        quantity: 1,
      },
    ],
  });

  const viewports = [
    { width: 360, height: 800 },
    { width: 768, height: 1024 },
    { width: 1024, height: 768 },
    { width: 1440, height: 900 },
  ];

  for (const viewport of viewports) {
    await page.setViewportSize(viewport);
    await page.goto('/cart');

    const cartMain = page.locator('#main-content');
    await expect(cartMain.getByRole('heading', { name: 'Your cart' })).toBeVisible();
    await expect(cartMain.getByRole('button', { name: 'Increase quantity' })).toBeVisible();

    const hasOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    );
    expect(hasOverflow).toBe(false);
  }
});
