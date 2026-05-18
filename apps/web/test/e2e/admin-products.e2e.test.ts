import { test, expect, type Page } from '@playwright/test';

type PresignRequestPayload = {
  role: string;
  fileName: string;
  contentType: string;
};

type AdminCreatePayload = {
  slug: string;
  name: string;
  description: string;
  category: string;
  gender: string;
  fit: string;
  color: string;
  priceCents: number;
  available: boolean;
  stock: number;
  media: {
    primary: {
      objectKey: string;
      url: string;
    };
    secondary: {
      objectKey: string;
      url: string;
    };
  };
};

type AdminUpdatePayload = {
  name: string;
  priceCents: number;
  stock: number;
};

function cors(origin: string) {
  return {
    'access-control-allow-origin': origin,
    'access-control-allow-credentials': 'true',
    'access-control-allow-methods': 'GET,POST,PATCH,PUT,DELETE,OPTIONS',
    'access-control-allow-headers': 'content-type',
    'content-type': 'application/json',
  };
}

async function mockAdminAuth(page: Page) {
  await page.route('**/auth/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.port !== '4000') {
      await route.continue();
      return;
    }

    const headers = cors(request.headers().origin ?? 'http://127.0.0.1:3000');
    if (request.method() === 'OPTIONS') {
      await route.fulfill({ status: 204, headers, body: '' });
      return;
    }

    if (url.pathname.endsWith('/auth/me') && request.method() === 'GET') {
      await route.fulfill({
        status: 200,
        headers,
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
      headers,
      body: JSON.stringify({ error: { message: 'Not found.' } }),
    });
  });
}

test('admin can upload media and create a product', async ({ page }) => {
  await mockAdminAuth(page);

  let createPayload: unknown = null;
  let uploadSequence = 0;

  await page.route('**/products/admin/media/presign', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.port !== '4000') {
      await route.continue();
      return;
    }

    const headers = cors(request.headers().origin ?? 'http://127.0.0.1:3000');
    if (request.method() === 'OPTIONS') {
      await route.fulfill({ status: 204, headers, body: '' });
      return;
    }

    const body = request.postDataJSON() as PresignRequestPayload;
    uploadSequence += 1;
    const objectKey = `products/2026/05/${uploadSequence}-${body.role}-${body.fileName}`;

    await route.fulfill({
      status: 201,
      headers,
      body: JSON.stringify({
        role: body.role,
        objectKey,
        uploadUrl: `http://127.0.0.1:4000/mock-upload/${uploadSequence}`,
        publicUrl: `https://cdn.shoppilot.local/${objectKey}`,
        expiresInSeconds: 600,
        requiredHeaders: {
          'content-type': body.contentType,
        },
      }),
    });
  });

  await page.route('**/mock-upload/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.port !== '4000') {
      await route.continue();
      return;
    }

    await route.fulfill({ status: request.method() === 'PUT' ? 200 : 405, body: '' });
  });

  await page.route('**/products/admin', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.port !== '4000') {
      await route.continue();
      return;
    }

    const headers = cors(request.headers().origin ?? 'http://127.0.0.1:3000');
    if (request.method() === 'OPTIONS') {
      await route.fulfill({ status: 204, headers, body: '' });
      return;
    }

    const payload = request.postDataJSON() as AdminCreatePayload;
    createPayload = payload;
    await route.fulfill({
      status: 201,
      headers,
      body: JSON.stringify({
        product: {
          productId: payload.slug,
          name: payload.name,
          description: payload.description,
          category: payload.category,
          gender: payload.gender,
          fit: payload.fit,
          color: payload.color,
          priceCents: payload.priceCents,
          currency: 'USD',
          available: payload.available,
          stock: payload.stock,
          primaryImageUrl: payload.media.primary.url,
          secondaryImageUrl: payload.media.secondary.url,
          media: [],
          createdAt: '2026-05-17T12:30:00.000Z',
          updatedAt: '2026-05-17T12:30:00.000Z',
        },
      }),
    });
  });

  await page.goto('/admin/products');

  await expect(page.getByText('Create and update catalog products')).toBeVisible();
  await page.locator('#create-primary-media').setInputFiles({
    name: 'primary.webp',
    mimeType: 'image/webp',
    buffer: Buffer.from('primary-image-binary'),
  });
  await page.locator('#create-secondary-media').setInputFiles({
    name: 'secondary.webp',
    mimeType: 'image/webp',
    buffer: Buffer.from('secondary-image-binary'),
  });

  await expect(page.getByText('Upload complete.')).toHaveCount(2);

  await page.locator('#create-slug').fill('velocity-training-tee');
  await page.locator('#create-name').fill('Velocity Training Tee');
  await page.locator('#create-fit').fill('Athletic');
  await page.locator('#create-color').fill('Black');
  await page.locator('#create-price').fill('3900');
  await page.locator('#create-stock').fill('24');
  await page.locator('#create-description').fill('Lightweight and breathable training tee for daily sessions.');
  await page.getByRole('button', { name: 'Create product' }).click();

  await expect(page.getByText('Created Velocity Training Tee (velocity-training-tee).')).toBeVisible();
  const capturedCreatePayload = createPayload as AdminCreatePayload;
  expect(capturedCreatePayload.media.primary.objectKey).toContain('primary-primary.webp');
  expect(capturedCreatePayload.media.secondary.objectKey).toContain('secondary-secondary.webp');
});

test('admin can load and update an existing product', async ({ page }) => {
  await mockAdminAuth(page);

  let updatePayload: unknown = null;

  await page.route('**/products**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.port !== '4000') {
      await route.continue();
      return;
    }

    const headers = cors(request.headers().origin ?? 'http://127.0.0.1:3000');
    if (request.method() === 'OPTIONS') {
      await route.fulfill({ status: 204, headers, body: '' });
      return;
    }

    if (url.pathname.endsWith('/products') && request.method() === 'GET') {
      await route.fulfill({
        status: 200,
        headers,
        body: JSON.stringify({
          items: [
            {
              productId: 'arrival-oversized-tank',
              name: 'Arrival Oversized Tank',
              category: 'tops',
              gender: 'men',
              fit: 'Oversized',
              color: 'Black',
              priceCents: 3000,
              currency: 'USD',
              available: true,
              primaryImageUrl: 'https://cdn.shoppilot.local/products/arrival-primary.webp',
              secondaryImageUrl: 'https://cdn.shoppilot.local/products/arrival-secondary.webp',
            },
          ],
          pagination: {
            page: 1,
            pageSize: 100,
            total: 1,
            totalPages: 1,
          },
          appliedFilters: {
            sort: 'newest',
          },
        }),
      });
      return;
    }

    if (url.pathname.endsWith('/products/arrival-oversized-tank') && request.method() === 'GET') {
      await route.fulfill({
        status: 200,
        headers,
        body: JSON.stringify({
          product: {
            productId: 'arrival-oversized-tank',
            name: 'Arrival Oversized Tank',
            description: 'Breathable training tank designed for daily workouts.',
            category: 'tops',
            gender: 'men',
            fit: 'Oversized',
            color: 'Black',
            priceCents: 3000,
            currency: 'USD',
            available: true,
            stock: 24,
            images: [],
            createdAt: '2026-05-17T08:00:00.000Z',
          },
        }),
      });
      return;
    }

    if (url.pathname.endsWith('/products/admin/arrival-oversized-tank') && request.method() === 'PATCH') {
      const payload = request.postDataJSON() as AdminUpdatePayload;
      updatePayload = payload;
      await route.fulfill({
        status: 200,
        headers,
        body: JSON.stringify({
          product: {
            productId: 'arrival-oversized-tank',
            name: payload.name,
            description: 'Breathable training tank designed for daily workouts.',
            category: 'tops',
            gender: 'men',
            fit: 'Oversized',
            color: 'Black',
            priceCents: payload.priceCents,
            currency: 'USD',
            available: true,
            stock: payload.stock,
            primaryImageUrl: 'https://cdn.shoppilot.local/products/arrival-primary.webp',
            secondaryImageUrl: 'https://cdn.shoppilot.local/products/arrival-secondary.webp',
            media: [],
            createdAt: '2026-05-17T08:00:00.000Z',
            updatedAt: '2026-05-17T13:00:00.000Z',
          },
        }),
      });
      return;
    }

    await route.fulfill({
      status: 404,
      headers,
      body: JSON.stringify({ error: { message: 'Not found.' } }),
    });
  });

  await page.goto('/admin/products');
  await expect(page.locator('#lookup-product-id option[value="arrival-oversized-tank"]')).toHaveCount(1);
  await expect(page.getByLabel('Product slug')).toBeEnabled();
  await page.getByLabel('Product slug').selectOption('arrival-oversized-tank');
  await page.getByRole('button', { name: 'Load product' }).click();
  await expect(page.getByText('Loaded Arrival Oversized Tank. You can apply updates now.')).toBeVisible();

  await page.locator('#update-name').fill('Arrival Oversized Tank Updated');
  await page.locator('#update-price').fill('3550');
  await page.locator('#update-stock').fill('19');
  await page.getByRole('button', { name: 'Save updates' }).click();

  await expect(page.getByText('Updated Arrival Oversized Tank Updated (arrival-oversized-tank).')).toBeVisible();
  const capturedUpdatePayload = updatePayload as AdminUpdatePayload;
  expect(capturedUpdatePayload.name).toBe('Arrival Oversized Tank Updated');
  expect(capturedUpdatePayload.priceCents).toBe(3550);
  expect(capturedUpdatePayload.stock).toBe(19);
});
