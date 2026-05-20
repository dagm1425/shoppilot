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

test('login and logout flow through header account popover', async ({ page }) => {
  let loginRememberMeValue: boolean | undefined;

  await page.route('**/auth/**', async (route) => {
    const url = route.request().url();
    const method = route.request().method();
    const origin = route.request().headers().origin ?? 'http://127.0.0.1:3000';
    const corsHeaders = buildCorsHeaders(origin);

    if (method === 'OPTIONS') {
      await route.fulfill({ status: 204, headers: corsHeaders, body: '' });
      return;
    }

    if (url.endsWith('/auth/login') && method === 'POST') {
      const payload = route.request().postDataJSON() as { rememberMe?: boolean };
      loginRememberMeValue = payload.rememberMe;

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

    if (url.endsWith('/auth/me') && method === 'GET') {
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

    if (url.endsWith('/auth/logout') && method === 'POST') {
      await route.fulfill({
        status: 200,
        headers: corsHeaders,
        body: JSON.stringify({ message: 'Logged out.' }),
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

  await page.goto('/login');
  await waitForClientHydration(page);
  await page.getByLabel('Email').fill('customer@shoppilot.local');
  await page.locator('input#password').fill('SecurePass123');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect
    .poll(() => loginRememberMeValue, {
      timeout: 20_000,
      message: 'Expected mocked login request payload to be captured.',
    })
    .toBe(false);

  await expect(page).toHaveURL(/\/catalog/, { timeout: 45_000 });

  await page.getByRole('button', { name: 'Account menu' }).click();
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page).toHaveURL(/\/login$/, { timeout: 20_000 });
});

test('forgot and reset password flow', async ({ page }) => {
  await page.route('**/auth/**', async (route) => {
    const url = route.request().url();
    const method = route.request().method();
    const origin = route.request().headers().origin ?? 'http://127.0.0.1:3000';
    const corsHeaders = buildCorsHeaders(origin);

    if (method === 'OPTIONS') {
      await route.fulfill({ status: 204, headers: corsHeaders, body: '' });
      return;
    }

    if (url.endsWith('/auth/password-reset/request') && method === 'POST') {
      await route.fulfill({
        status: 200,
        headers: corsHeaders,
        body: JSON.stringify({
          message: 'If an account exists, reset instructions have been sent.',
        }),
      });
      return;
    }

    if (url.endsWith('/auth/password-reset/confirm') && method === 'POST') {
      await route.fulfill({
        status: 200,
        headers: corsHeaders,
        body: JSON.stringify({ message: 'Password reset successful.' }),
      });
      return;
    }

    await route.fulfill({
      status: 404,
      headers: corsHeaders,
      body: JSON.stringify({ error: { message: 'Not found.' } }),
    });
  });

  await page.goto('/forgot-password');
  await waitForClientHydration(page);
  await page.getByLabel('Email').fill('customer@shoppilot.local');
  await page.getByRole('button', { name: 'Request reset' }).click();

  await expect(
    page.getByText('If an account exists, reset instructions have been sent.'),
  ).toBeVisible();

  await page.goto('/reset-password?token=dev_reset_token_12345678901234567890123456789012');
  await page.getByLabel('New password').fill('NewPassword123');
  await page.getByRole('button', { name: 'Reset password' }).click();

  await expect(page.getByText('Password reset successful.')).toBeVisible();
});

test('forgot password request stays on page after success', async ({ page }) => {
  await page.route('**/auth/**', async (route) => {
    const url = route.request().url();
    const method = route.request().method();
    const origin = route.request().headers().origin ?? 'http://127.0.0.1:3000';
    const corsHeaders = buildCorsHeaders(origin);

    if (method === 'OPTIONS') {
      await route.fulfill({ status: 204, headers: corsHeaders, body: '' });
      return;
    }

    if (url.endsWith('/auth/password-reset/request') && method === 'POST') {
      await route.fulfill({
        status: 200,
        headers: corsHeaders,
        body: JSON.stringify({
          message: 'If an account exists, reset instructions have been sent.',
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

  await page.goto('/forgot-password');
  await waitForClientHydration(page);
  await page.getByLabel('Email').fill('customer@shoppilot.local');
  await page.getByRole('button', { name: 'Request reset' }).click();

  await expect(page).toHaveURL(/\/forgot-password\??$/);
  await expect(
    page.getByText('If an account exists, reset instructions have been sent.'),
  ).toBeVisible();
});
