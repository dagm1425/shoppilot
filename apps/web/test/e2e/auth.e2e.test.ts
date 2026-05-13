import { test, expect } from '@playwright/test';

test('login, protected account, and logout flow', async ({ page }) => {
  await page.route('**/auth/**', async (route) => {
    const url = route.request().url();
    const method = route.request().method();

    const corsHeaders = {
      'access-control-allow-origin': 'http://127.0.0.1:3000',
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
      await route.fulfill({
        status: 200,
        headers: corsHeaders,
        body: JSON.stringify({
          user: {
            id: 'user_1',
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
  await page.getByLabel('Email').fill('customer@shoppilot.local');
  await page.locator('input#password').fill('SecurePass123');
  await page.getByRole('button', { name: 'Sign in' }).click();

  await expect(page).toHaveURL(/\/account$/);
  await expect(page.getByText('Signed in as')).toBeVisible();

  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page).toHaveURL(/\/login$/);
});

test('forgot and reset password flow', async ({ page }) => {
  await page.route('**/auth/**', async (route) => {
    const url = route.request().url();
    const method = route.request().method();

    const corsHeaders = {
      'access-control-allow-origin': 'http://127.0.0.1:3000',
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
          resetToken: 'dev_reset_token_12345678901234567890123456789012',
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
  await page.getByLabel('Email').fill('customer@shoppilot.local');
  await page.getByRole('button', { name: 'Request reset' }).click();

  await expect(page.getByText('Local dev reset token')).toBeVisible();

  await page.goto('/reset-password?token=dev_reset_token_12345678901234567890123456789012');
  await page.getByLabel('New password').fill('NewPassword123');
  await page.getByRole('button', { name: 'Reset password' }).click();

  await expect(page.getByText('Password reset successful.')).toBeVisible();
});
