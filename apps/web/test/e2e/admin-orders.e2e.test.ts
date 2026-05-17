import { test, expect, type Page } from '@playwright/test';

type MockOrderStatus =
  | 'pending_payment'
  | 'paid'
  | 'processing'
  | 'shipped'
  | 'delivered'
  | 'cancelled'
  | 'refunded';

type MockOrder = {
  orderId: string;
  orderNumber: string;
  customerEmail: string;
  status: MockOrderStatus;
  totalCents: number;
  currency: string;
  createdAt: string;
  paidAt: string | null;
};

const mockOrders: MockOrder[] = [
  {
    orderId: 'order_1',
    orderNumber: 'SP-20260510-AAA111',
    customerEmail: 'alex@example.com',
    status: 'paid',
    totalCents: 6000,
    currency: 'USD',
    createdAt: '2026-05-10T09:00:00.000Z',
    paidAt: '2026-05-10T09:10:00.000Z',
  },
  {
    orderId: 'order_2',
    orderNumber: 'SP-20260511-BBB222',
    customerEmail: 'sam@example.com',
    status: 'pending_payment',
    totalCents: 4500,
    currency: 'USD',
    createdAt: '2026-05-11T09:00:00.000Z',
    paidAt: null,
  },
  {
    orderId: 'order_3',
    orderNumber: 'SP-20260512-CCC333',
    customerEmail: 'alex@example.com',
    status: 'paid',
    totalCents: 8100,
    currency: 'USD',
    createdAt: '2026-05-12T09:00:00.000Z',
    paidAt: '2026-05-12T09:15:00.000Z',
  },
  {
    orderId: 'order_4',
    orderNumber: 'SP-20260513-DDD444',
    customerEmail: 'jamie@example.com',
    status: 'processing',
    totalCents: 3000,
    currency: 'USD',
    createdAt: '2026-05-13T09:00:00.000Z',
    paidAt: '2026-05-13T09:25:00.000Z',
  },
  {
    orderId: 'order_5',
    orderNumber: 'SP-20260514-EEE555',
    customerEmail: 'alex@example.com',
    status: 'paid',
    totalCents: 11000,
    currency: 'USD',
    createdAt: '2026-05-14T09:00:00.000Z',
    paidAt: '2026-05-14T09:20:00.000Z',
  },
  {
    orderId: 'order_6',
    orderNumber: 'SP-20260515-FFF666',
    customerEmail: 'sam@example.com',
    status: 'cancelled',
    totalCents: 7000,
    currency: 'USD',
    createdAt: '2026-05-15T09:00:00.000Z',
    paidAt: null,
  },
  {
    orderId: 'order_7',
    orderNumber: 'SP-20260516-GGG777',
    customerEmail: 'alex@example.com',
    status: 'paid',
    totalCents: 5200,
    currency: 'USD',
    createdAt: '2026-05-16T09:00:00.000Z',
    paidAt: '2026-05-16T09:18:00.000Z',
  },
  {
    orderId: 'order_8',
    orderNumber: 'SP-20260517-HHH888',
    customerEmail: 'sam@example.com',
    status: 'paid',
    totalCents: 9200,
    currency: 'USD',
    createdAt: '2026-05-17T09:00:00.000Z',
    paidAt: '2026-05-17T09:09:00.000Z',
  },
  {
    orderId: 'order_9',
    orderNumber: 'SP-20260518-III999',
    customerEmail: 'lee@example.com',
    status: 'refunded',
    totalCents: 4100,
    currency: 'USD',
    createdAt: '2026-05-18T09:00:00.000Z',
    paidAt: '2026-05-18T09:14:00.000Z',
  },
  {
    orderId: 'order_10',
    orderNumber: 'SP-20260519-JJJ000',
    customerEmail: 'alex@example.com',
    status: 'paid',
    totalCents: 12000,
    currency: 'USD',
    createdAt: '2026-05-19T09:00:00.000Z',
    paidAt: '2026-05-19T09:16:00.000Z',
  },
  {
    orderId: 'order_11',
    orderNumber: 'SP-20260520-KKK111',
    customerEmail: 'sam@example.com',
    status: 'shipped',
    totalCents: 7300,
    currency: 'USD',
    createdAt: '2026-05-20T09:00:00.000Z',
    paidAt: '2026-05-20T09:14:00.000Z',
  },
  {
    orderId: 'order_12',
    orderNumber: 'SP-20260521-LLL222',
    customerEmail: 'alex@example.com',
    status: 'paid',
    totalCents: 9800,
    currency: 'USD',
    createdAt: '2026-05-21T09:00:00.000Z',
    paidAt: '2026-05-21T09:14:00.000Z',
  },
];

function buildCorsHeaders(origin: string) {
  return {
    'access-control-allow-origin': origin,
    'access-control-allow-credentials': 'true',
    'access-control-allow-methods': 'GET,POST,PATCH,DELETE,OPTIONS',
    'access-control-allow-headers': 'content-type',
    'content-type': 'application/json',
  };
}

function startOfDayUtc(day: string): Date {
  return new Date(`${day}T00:00:00.000Z`);
}

function applyFiltersAndPaginate(url: URL) {
  const status = url.searchParams.get('status');
  const customer = url.searchParams.get('customer');
  const dateFrom = url.searchParams.get('dateFrom');
  const dateTo = url.searchParams.get('dateTo');
  const page = Number.parseInt(url.searchParams.get('page') ?? '1', 10);
  const pageSize = Number.parseInt(url.searchParams.get('pageSize') ?? '10', 10);

  let rows = [...mockOrders].sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  if (status) {
    rows = rows.filter((row) => row.status === status);
  }

  if (customer) {
    const value = customer.toLowerCase();
    rows = rows.filter((row) => row.customerEmail.toLowerCase().includes(value));
  }

  if (dateFrom) {
    const lowerBound = startOfDayUtc(dateFrom);
    rows = rows.filter((row) => new Date(row.createdAt) >= lowerBound);
  }

  if (dateTo) {
    const upperBoundExclusive = new Date(startOfDayUtc(dateTo).getTime() + 24 * 60 * 60 * 1000);
    rows = rows.filter((row) => new Date(row.createdAt) < upperBoundExclusive);
  }

  const safePage = Number.isFinite(page) ? Math.max(1, page) : 1;
  const safePageSize = Number.isFinite(pageSize) ? Math.max(1, pageSize) : 10;

  const total = rows.length;
  const totalPages = total === 0 ? 0 : Math.ceil(total / safePageSize);
  const start = (safePage - 1) * safePageSize;
  const items = rows.slice(start, start + safePageSize);

  return {
    generatedAt: '2026-05-22T08:15:00.000Z',
    items,
    pagination: {
      page: safePage,
      pageSize: safePageSize,
      total,
      totalPages,
    },
    appliedFilters: {
      status: status ?? undefined,
      customer: customer ?? undefined,
      dateFrom: dateFrom ?? undefined,
      dateTo: dateTo ?? undefined,
    },
  };
}

async function mockAdminAuth(page: Page) {
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
}

async function mockAdminOrdersList(page: Page) {
  await page.route('**/orders/admin/list**', async (route) => {
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

    if (request.method() !== 'GET') {
      await route.fulfill({
        status: 405,
        headers: corsHeaders,
        body: JSON.stringify({ error: { message: 'Method not allowed.' } }),
      });
      return;
    }

    const dateFrom = url.searchParams.get('dateFrom');
    const dateTo = url.searchParams.get('dateTo');

    if (dateFrom && dateTo && dateFrom > dateTo) {
      await route.fulfill({
        status: 400,
        headers: corsHeaders,
        body: JSON.stringify({
          error: {
            code: 'ORDER_VALIDATION_ERROR',
            message: 'dateFrom must be on or before dateTo.',
          },
        }),
      });
      return;
    }

    await route.fulfill({
      status: 200,
      headers: corsHeaders,
      body: JSON.stringify(applyFiltersAndPaginate(url)),
    });
  });
}

test('admin orders list supports pagination and combined filters', async ({ page }) => {
  await mockAdminAuth(page);
  await mockAdminOrdersList(page);

  await page.goto('/admin/orders');

  await expect(page).toHaveURL(/\/admin\/orders$/, { timeout: 20_000 });
  await expect(page.getByText('Admin orders list')).toBeVisible();
  await expect(page.getByText('SP-20260521-LLL222')).toBeVisible();
  await expect(page.getByText('Showing 10 of 12 orders.')).toBeVisible();

  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(page.getByText('SP-20260511-BBB222')).toBeVisible();
  await expect(page.getByText('Showing 2 of 12 orders.')).toBeVisible();

  await page.getByLabel('Status').selectOption('paid');
  await page.getByLabel('Customer').fill('alex@example.com');
  await page.getByLabel('Date from').fill('2026-05-14');
  await page.getByLabel('Date to').fill('2026-05-19');
  await page.getByRole('button', { name: 'Apply filters' }).click();

  await expect(page.getByText('Showing 3 of 3 orders.')).toBeVisible();
  await expect(page.getByText('SP-20260519-JJJ000')).toBeVisible();
  await expect(page.getByText('SP-20260516-GGG777')).toBeVisible();
  await expect(page.getByText('SP-20260514-EEE555')).toBeVisible();

  await page.getByRole('button', { name: 'Clear' }).click();
  await expect(page.getByText('Showing 10 of 12 orders.')).toBeVisible();
  await expect(page.getByText('No filters applied.')).toBeVisible();
});
