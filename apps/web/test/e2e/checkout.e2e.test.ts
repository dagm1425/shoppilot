import { expect, test, type Page } from '@playwright/test';

type Address = {
  addressId: string;
  recipientName: string;
  country: string;
  city: string;
  postalCode: string;
  line1: string;
  line2?: string;
  phone?: string;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
};

type CheckoutState = {
  token: string;
  selectedAddressId: string | null;
  contact: { email: string | null; phone: string | null };
  addresses: Address[];
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

function getBlockingReasons(state: CheckoutState) {
  const reasons: Array<{ code: 'ADDRESS_REQUIRED' | 'CONTACT_REQUIRED'; message: string }> = [];

  if (!state.selectedAddressId) {
    reasons.push({
      code: 'ADDRESS_REQUIRED',
      message: 'Select or add a shipping address to continue.',
    });
  }

  if (!state.contact.email || !state.contact.phone) {
    reasons.push({
      code: 'CONTACT_REQUIRED',
      message: 'Provide checkout contact email and phone to continue.',
    });
  }

  return reasons;
}

function buildCheckoutSessionResponse(state: CheckoutState) {
  const blockingReasons = getBlockingReasons(state);

  return {
    sessionToken: state.token,
    expiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
    readinessStatus: blockingReasons.length > 0 ? 'blocked' : 'ready',
    blockingReasons,
    selectedAddressId: state.selectedAddressId,
    contact: state.contact,
    cartSnapshot: {
      items: [
        {
          itemId: 'item_1',
          productId: 'everyday-training-short',
          name: 'Everyday Training Short',
          fit: 'Regular fit',
          color: 'Black',
          size: 'm',
          quantity: 1,
          stock: 5,
          available: true,
          priceCents: 5200,
          currency: 'USD',
          primaryImageUrl: 'https://example.com/short-a.jpg',
          secondaryImageUrl: null,
          isValid: true,
          invalidReason: null,
          lineSubtotalCents: 5200,
        },
      ],
      summary: {
        itemCount: 1,
        validLineCount: 1,
        subtotalCents: 5200,
        currency: 'USD',
      },
    },
    priceValidatedAt: new Date().toISOString(),
  };
}

async function mockCheckoutApis(page: Page) {
  const state: CheckoutState = {
    token: 'checkout_token_1',
    selectedAddressId: null,
    contact: { email: 'checkout@shoppilot.local', phone: null },
    addresses: [],
  };

  await page.route('**/*', async (route) => {
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
      await route.fulfill({
        status: 200,
        headers: corsHeaders,
        body: JSON.stringify({
          user: {
            id: 'user_1',
            username: 'checkout_user',
            email: 'checkout@shoppilot.local',
            role: 'CUSTOMER',
          },
        }),
      });
      return;
    }

    if (url.pathname.endsWith('/cart') && request.method() === 'GET') {
      await route.fulfill({
        status: 200,
        headers: corsHeaders,
        body: JSON.stringify({
          items: [],
          summary: { itemCount: 0, validLineCount: 0, subtotalCents: 0, currency: 'USD' },
        }),
      });
      return;
    }

    if (url.pathname.endsWith('/wishlist') && request.method() === 'GET') {
      await route.fulfill({
        status: 200,
        headers: corsHeaders,
        body: JSON.stringify({ items: [], summary: { itemCount: 0 } }),
      });
      return;
    }

    if (url.pathname.endsWith('/checkout/session') && request.method() === 'POST') {
      await route.fulfill({
        status: 200,
        headers: corsHeaders,
        body: JSON.stringify(buildCheckoutSessionResponse(state)),
      });
      return;
    }

    if (url.pathname.includes('/checkout/session/') && request.method() === 'GET') {
      await route.fulfill({
        status: 200,
        headers: corsHeaders,
        body: JSON.stringify(buildCheckoutSessionResponse(state)),
      });
      return;
    }

    if (url.pathname.endsWith('/me/addresses') && request.method() === 'GET') {
      await route.fulfill({
        status: 200,
        headers: corsHeaders,
        body: JSON.stringify({ items: state.addresses }),
      });
      return;
    }

    if (url.pathname.endsWith('/me/addresses') && request.method() === 'POST') {
      const payload = request.postDataJSON() as {
        recipientName: string;
        country: string;
        city: string;
        postalCode: string;
        line1: string;
        line2?: string;
        phone?: string;
        isDefault?: boolean;
      };

      const now = new Date().toISOString();
      const address: Address = {
        addressId: `address_${state.addresses.length + 1}`,
        recipientName: payload.recipientName,
        country: payload.country,
        city: payload.city,
        postalCode: payload.postalCode,
        line1: payload.line1,
        line2: payload.line2,
        phone: payload.phone,
        isDefault: payload.isDefault ?? state.addresses.length === 0,
        createdAt: now,
        updatedAt: now,
      };

      state.addresses = [address, ...state.addresses.map((entry) => ({ ...entry, isDefault: false }))];

      await route.fulfill({
        status: 201,
        headers: corsHeaders,
        body: JSON.stringify(address),
      });
      return;
    }

    if (url.pathname.includes('/checkout/session/') && url.pathname.endsWith('/address') && request.method() === 'PATCH') {
      const payload = request.postDataJSON() as { addressId: string };
      state.selectedAddressId = payload.addressId;

      await route.fulfill({
        status: 200,
        headers: corsHeaders,
        body: JSON.stringify(buildCheckoutSessionResponse(state)),
      });
      return;
    }

    if (url.pathname.includes('/checkout/session/') && url.pathname.endsWith('/contact') && request.method() === 'PATCH') {
      const payload = request.postDataJSON() as { email: string; phone: string };
      state.contact = {
        email: payload.email.trim().toLowerCase(),
        phone: payload.phone.trim(),
      };

      await route.fulfill({
        status: 200,
        headers: corsHeaders,
        body: JSON.stringify(buildCheckoutSessionResponse(state)),
      });
      return;
    }

    await route.fulfill({
      status: 404,
      headers: corsHeaders,
      body: JSON.stringify({ error: { code: 'NOT_FOUND', message: 'Not found.' } }),
    });
  });
}

test('checkout stays disabled until address and contact are completed', async ({ page }) => {
  await mockCheckoutApis(page);

  await page.goto('/checkout');

  await expect(page.getByRole('heading', { name: 'Checkout' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Continue' })).toBeDisabled();

  await page.getByLabel('Recipient').fill('Dagmawi');
  await page.getByLabel('Country').fill('ET');
  await page.getByLabel('City').fill('Addis Ababa');
  await page.getByLabel('Postal code').fill('2000');
  await page.getByLabel('Address line 1').fill('Yeka Sub-city');
  await page.getByLabel('Phone').first().fill('0900000000');
  await page.getByRole('button', { name: 'Save address' }).click();

  await page.getByLabel('Email').fill('checkout@shoppilot.local');
  await page.getByLabel('Phone').nth(1).fill('0900000000');
  await page.getByRole('button', { name: 'Save contact' }).click();

  await expect(page.getByRole('button', { name: 'Continue' })).toBeEnabled();
});

test('checkout page remains usable with no horizontal overflow on required viewports', async ({ page }) => {
  await mockCheckoutApis(page);

  const viewports = [
    { width: 360, height: 800 },
    { width: 768, height: 1024 },
    { width: 1024, height: 768 },
    { width: 1440, height: 900 },
  ];

  for (const viewport of viewports) {
    await page.setViewportSize(viewport);
    await page.goto('/checkout');

    await expect(page.getByRole('heading', { name: 'Checkout' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Save address' })).toBeVisible();

    const hasOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    );

    expect(hasOverflow).toBe(false);
  }
});
