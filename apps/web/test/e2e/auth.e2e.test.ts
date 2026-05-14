import { test, expect, type Page } from '@playwright/test';

async function waitForClientHydration(page: Page) {
  await page.waitForLoadState('domcontentloaded');
}

test('login, protected account, and logout flow', async ({ page }) => {
  let loginRememberMeValue: boolean | undefined;

  await page.route('**/auth/**', async (route) => {
    const url = route.request().url();
    const method = route.request().method();
    const origin = route.request().headers().origin ?? 'http://127.0.0.1:3000';

    const corsHeaders = {
      'access-control-allow-origin': origin,
      'access-control-allow-credentials': 'true',
      'access-control-allow-methods': 'GET,POST,OPTIONS',
      'access-control-allow-headers': 'content-type',
      'content-type': 'application/json',
    };

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

  await page.goto('/login');
  await waitForClientHydration(page);
  await page.getByLabel('Email').fill('customer@shoppilot.local');
  await page.locator('input#password').fill('SecurePass123');
  await page.getByRole('button', { name: 'Sign in' }).click();
  expect(loginRememberMeValue).toBe(false);

  await expect(page).toHaveURL(/\/account$/, { timeout: 20_000 });
  await expect(page.getByText('Signed in as')).toBeVisible();

  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page).toHaveURL(/\/login$/, { timeout: 20_000 });
});

test('forgot and reset password flow', async ({ page }) => {
  await page.route('**/auth/**', async (route) => {
    const url = route.request().url();
    const method = route.request().method();
    const origin = route.request().headers().origin ?? 'http://127.0.0.1:3000';

    const corsHeaders = {
      'access-control-allow-origin': origin,
      'access-control-allow-credentials': 'true',
      'access-control-allow-methods': 'GET,POST,OPTIONS',
      'access-control-allow-headers': 'content-type',
      'content-type': 'application/json',
    };

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

    const corsHeaders = {
      'access-control-allow-origin': origin,
      'access-control-allow-credentials': 'true',
      'access-control-allow-methods': 'GET,POST,OPTIONS',
      'access-control-allow-headers': 'content-type',
      'content-type': 'application/json',
    };

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
