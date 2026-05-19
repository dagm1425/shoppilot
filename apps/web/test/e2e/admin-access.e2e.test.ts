import { test, expect, type Page } from '@playwright/test';

async function waitForClientHydration(page: Page) {
  await page.waitForLoadState('domcontentloaded');
}

function buildCorsHeaders(origin: string) {
  return {
    'access-control-allow-origin': origin,
    'access-control-allow-credentials': 'true',
    'access-control-allow-methods': 'GET,POST,PATCH,DELETE,OPTIONS',
    'access-control-allow-headers': 'content-type',
    'content-type': 'application/json',
  };
}

function buildAdminHomeSummaryPayload() {
  return {
    generatedAt: '2026-05-17T10:15:00.000Z',
    currency: 'USD',
    kpis: {
      ordersToday: 12,
      grossRevenueTodayCents: 124900,
      paidOrdersToday: 9,
      pendingPaymentOrders: 3,
    },
    revenueTrendLast30Days: [
      { date: '2026-05-15', totalCents: 95000 },
      { date: '2026-05-16', totalCents: 110500 },
      { date: '2026-05-17', totalCents: 124900 },
    ],
    recentOrders: [
      {
        orderId: 'order_1',
        orderNumber: 'SP-20260517-0001',
        customerEmail: 'sam@example.com',
        status: 'paid',
        totalCents: 49900,
        currency: 'USD',
        createdAt: '2026-05-17T09:32:00.000Z',
      },
      {
        orderId: 'order_2',
        orderNumber: 'SP-20260517-0002',
        customerEmail: 'alex@example.com',
        status: 'pending_payment',
        totalCents: 75900,
        currency: 'USD',
        createdAt: '2026-05-17T10:01:00.000Z',
      },
    ],
  };
}

async function mockAdminHomeSummary(page: Page) {
  await page.route('**/orders/admin/home', async (route) => {
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

    if (url.pathname.endsWith('/orders/admin/home') && request.method() === 'GET') {
      await route.fulfill({
        status: 200,
        headers: corsHeaders,
        body: JSON.stringify(buildAdminHomeSummaryPayload()),
      });
      return;
    }

    await route.fulfill({
      status: 404,
      headers: corsHeaders,
      body: JSON.stringify({ error: { message: 'Not found.' } }),
    });
  });
}

test('redirects unauthenticated admin route access to login and returns after successful login', async ({
  page,
}) => {
  test.setTimeout(120_000);
  let isAuthenticated = false;
  await mockAdminHomeSummary(page);

  await page.route('**/auth/**', async (route) => {
    const url = route.request().url();
    const parsedUrl = new URL(url);
    if (parsedUrl.port !== '4000') {
      await route.continue();
      return;
    }
    const method = route.request().method();
    const origin = route.request().headers().origin ?? 'http://127.0.0.1:3000';
    const corsHeaders = buildCorsHeaders(origin);

    if (method === 'OPTIONS') {
      await route.fulfill({ status: 204, headers: corsHeaders, body: '' });
      return;
    }

    if (url.endsWith('/auth/me') && method === 'GET') {
      if (!isAuthenticated) {
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
            id: 'admin_1',
            username: 'admin_1',
            email: 'admin@shoppilot.local',
            role: 'ADMIN',
          },
        }),
      });
      return;
    }

    if (url.endsWith('/auth/login') && method === 'POST') {
      isAuthenticated = true;

      await route.fulfill({
        status: 200,
        headers: corsHeaders,
        body: JSON.stringify({
          user: {
            id: 'admin_1',
            username: 'admin_1',
            email: 'admin@shoppilot.local',
            role: 'ADMIN',
          },
        }),
      });
      return;
    }

    await route.fulfill({
      status: 404,
      headers: corsHeaders,
      body: JSON.stringify({ error: { message: 'Not found.' } }),
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

    if (url.pathname.endsWith('/cart') && request.method() === 'GET') {
      await route.fulfill({
        status: 200,
        headers: corsHeaders,
        body: JSON.stringify({
          items: [],
          summary: {
            itemCount: 0,
            validLineCount: 0,
            subtotalCents: 0,
            currency: 'USD',
          },
        }),
      });
      return;
    }

    await route.fulfill({
      status: 404,
      headers: corsHeaders,
      body: JSON.stringify({ error: { message: 'Not found.' } }),
    });
  });

  await page.route('**/wishlist**', async (route) => {
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

    if (url.pathname.endsWith('/wishlist') && request.method() === 'GET') {
      await route.fulfill({
        status: 200,
        headers: corsHeaders,
        body: JSON.stringify({
          items: [],
          summary: {
            itemCount: 0,
          },
        }),
      });
      return;
    }

    await route.fulfill({
      status: 404,
      headers: corsHeaders,
      body: JSON.stringify({ error: { message: 'Not found.' } }),
    });
  });

  await page.goto('/admin');
  await waitForClientHydration(page);

  await expect(page).toHaveURL(/\/login\?redirect=%2Fadmin$/, { timeout: 60_000 });

  await page.getByLabel('Email').fill('admin@shoppilot.local');
  await page.locator('input#password').fill('AdminSecure123');
  await page.getByRole('button', { name: 'Sign in' }).click();

  await expect(page).toHaveURL(/\/admin$/, { timeout: 60_000 });
  await expect(page.getByText('Admin home')).toBeVisible();
  await expect(page.locator("a[href='/admin']")).toBeVisible();
  await expect(page.locator("a[href='/admin/products']")).toBeVisible();
  await expect(page.locator("a[href='/admin/orders']")).toBeVisible();
});

test('blocks authenticated customer from admin route', async ({ page }) => {
  await page.route('**/auth/**', async (route) => {
    const url = route.request().url();
    const parsedUrl = new URL(url);
    if (parsedUrl.port !== '4000') {
      await route.continue();
      return;
    }
    const method = route.request().method();
    const origin = route.request().headers().origin ?? 'http://127.0.0.1:3000';
    const corsHeaders = buildCorsHeaders(origin);

    if (method === 'OPTIONS') {
      await route.fulfill({ status: 204, headers: corsHeaders, body: '' });
      return;
    }

    if (url.endsWith('/auth/me') && method === 'GET') {
      await route.fulfill({
        status: 200,
        headers: corsHeaders,
        body: JSON.stringify({
          user: {
            id: 'customer_1',
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
      body: JSON.stringify({ error: { message: 'Not found.' } }),
    });
  });

  await page.goto('/admin');
  await waitForClientHydration(page);

  await expect(page).toHaveURL(/\/admin$/, { timeout: 20_000 });
  await expect(page.getByText('Admin access required')).toBeVisible();
  await expect(page.getByText('Your account does not have permission to open this page.')).toBeVisible();
  await expect(page.getByText('Admin home')).toHaveCount(0);
});

test('allows authenticated admin to access admin route', async ({ page }) => {
  await mockAdminHomeSummary(page);

  await page.route('**/auth/**', async (route) => {
    const url = route.request().url();
    const parsedUrl = new URL(url);
    if (parsedUrl.port !== '4000') {
      await route.continue();
      return;
    }
    const method = route.request().method();
    const origin = route.request().headers().origin ?? 'http://127.0.0.1:3000';
    const corsHeaders = buildCorsHeaders(origin);

    if (method === 'OPTIONS') {
      await route.fulfill({ status: 204, headers: corsHeaders, body: '' });
      return;
    }

    if (url.endsWith('/auth/me') && method === 'GET') {
      await route.fulfill({
        status: 200,
        headers: corsHeaders,
        body: JSON.stringify({
          user: {
            id: 'admin_2',
            username: 'admin_2',
            email: 'admin2@shoppilot.local',
            role: 'ADMIN',
          },
        }),
      });
      return;
    }

    await route.fulfill({
      status: 404,
      headers: corsHeaders,
      body: JSON.stringify({ error: { message: 'Not found.' } }),
    });
  });

  await page.goto('/admin');
  await waitForClientHydration(page);

  await expect(page).toHaveURL(/\/admin$/, { timeout: 20_000 });
  await expect(page.getByText('Admin home')).toBeVisible();
  await expect(page.locator("a[href='/admin']")).toBeVisible();
  await expect(page.locator("a[href='/admin/products']")).toBeVisible();
  await expect(page.locator("a[href='/admin/orders']")).toBeVisible();
});

test('allows authenticated admin to access products workspace route', async ({ page }) => {
  await page.route('**/auth/**', async (route) => {
    const url = route.request().url();
    const parsedUrl = new URL(url);
    if (parsedUrl.port !== '4000') {
      await route.continue();
      return;
    }
    const method = route.request().method();
    const origin = route.request().headers().origin ?? 'http://127.0.0.1:3000';
    const corsHeaders = buildCorsHeaders(origin);

    if (method === 'OPTIONS') {
      await route.fulfill({ status: 204, headers: corsHeaders, body: '' });
      return;
    }

    if (url.endsWith('/auth/me') && method === 'GET') {
      await route.fulfill({
        status: 200,
        headers: corsHeaders,
        body: JSON.stringify({
          user: {
            id: 'admin_products_1',
            username: 'admin_products_1',
            email: 'admin-products@shoppilot.local',
            role: 'ADMIN',
          },
        }),
      });
      return;
    }

    await route.fulfill({
      status: 404,
      headers: corsHeaders,
      body: JSON.stringify({ error: { message: 'Not found.' } }),
    });
  });

  await page.goto('/admin/products');
  await waitForClientHydration(page);

  await expect(page).toHaveURL(/\/admin\/products$/, { timeout: 20_000 });
  await expect(page.getByText('Create and update catalog products')).toBeVisible();
  await expect(page.locator("a[href='/admin/products']")).toHaveAttribute('aria-current', 'page');
});

test('blocks authenticated customer from orders placeholder route', async ({ page }) => {
  await page.route('**/auth/**', async (route) => {
    const url = route.request().url();
    const parsedUrl = new URL(url);
    if (parsedUrl.port !== '4000') {
      await route.continue();
      return;
    }
    const method = route.request().method();
    const origin = route.request().headers().origin ?? 'http://127.0.0.1:3000';
    const corsHeaders = buildCorsHeaders(origin);

    if (method === 'OPTIONS') {
      await route.fulfill({ status: 204, headers: corsHeaders, body: '' });
      return;
    }

    if (url.endsWith('/auth/me') && method === 'GET') {
      await route.fulfill({
        status: 200,
        headers: corsHeaders,
        body: JSON.stringify({
          user: {
            id: 'customer_orders_1',
            username: 'customer_orders_1',
            email: 'customer-orders@shoppilot.local',
            role: 'CUSTOMER',
          },
        }),
      });
      return;
    }

    await route.fulfill({
      status: 404,
      headers: corsHeaders,
      body: JSON.stringify({ error: { message: 'Not found.' } }),
    });
  });

  await page.goto('/admin/orders');
  await waitForClientHydration(page);

  await expect(page).toHaveURL(/\/admin\/orders$/, { timeout: 20_000 });
  await expect(page.getByText('Admin access required')).toBeVisible();
  await expect(page.getByText('Your account does not have permission to open this page.')).toBeVisible();
  await expect(page.getByText('Orders workspace')).toHaveCount(0);
});
