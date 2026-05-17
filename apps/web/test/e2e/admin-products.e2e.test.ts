import { test, expect, type Page } from '@playwright/test';

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

  let createPayload: any = null;
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

    const body = request.postDataJSON() as any;
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

    createPayload = request.postDataJSON();
    await route.fulfill({
      status: 201,
      headers,
      body: JSON.stringify({
        product: {
          productId: createPayload.slug,
          name: createPayload.name,
          description: createPayload.description,
          category: createPayload.category,
          gender: createPayload.gender,
          fit: createPayload.fit,
          color: createPayload.color,
          priceCents: createPayload.priceCents,
          currency: 'USD',
          available: createPayload.available,
          stock: createPayload.stock,
          primaryImageUrl: createPayload.media.primary.url,
          secondaryImageUrl: createPayload.media.secondary.url,
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
  expect(createPayload.media.primary.objectKey).toContain('primary-primary.webp');
  expect(createPayload.media.secondary.objectKey).toContain('secondary-secondary.webp');
});

test('admin update flow handles lookup failure then recovery', async ({ page }) => {
  await mockAdminAuth(page);

  let updatePayload: any = null;

  await page.route('**/products/**', async (route) => {
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

    if (url.pathname.endsWith('/products/missing-product') && request.method() === 'GET') {
      await route.fulfill({
        status: 404,
        headers,
        body: JSON.stringify({
          error: {
            code: 'PRODUCT_NOT_FOUND',
            message: 'Product not found.',
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
      updatePayload = request.postDataJSON();
      await route.fulfill({
        status: 200,
        headers,
        body: JSON.stringify({
          product: {
            productId: 'arrival-oversized-tank',
            name: updatePayload.name,
            description: 'Breathable training tank designed for daily workouts.',
            category: 'tops',
            gender: 'men',
            fit: 'Oversized',
            color: 'Black',
            priceCents: updatePayload.priceCents,
            currency: 'USD',
            available: true,
            stock: updatePayload.stock,
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
  await page.getByLabel('Product slug').fill('missing-product');
  await page.getByRole('button', { name: 'Load product' }).click();
  await expect(page.getByText('Product not found.')).toBeVisible();

  await page.getByLabel('Product slug').fill('arrival-oversized-tank');
  await page.getByRole('button', { name: 'Load product' }).click();
  await expect(page.getByText('Loaded Arrival Oversized Tank. You can apply updates now.')).toBeVisible();

  await page.locator('#update-name').fill('Arrival Oversized Tank Updated');
  await page.locator('#update-price').fill('3550');
  await page.locator('#update-stock').fill('19');
  await page.getByRole('button', { name: 'Save updates' }).click();

  await expect(page.getByText('Updated Arrival Oversized Tank Updated (arrival-oversized-tank).')).toBeVisible();
  expect(updatePayload.name).toBe('Arrival Oversized Tank Updated');
  expect(updatePayload.priceCents).toBe(3550);
  expect(updatePayload.stock).toBe(19);
});
