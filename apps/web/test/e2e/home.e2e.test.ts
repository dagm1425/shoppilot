import { test, expect } from '@playwright/test';

test('home page redirects to catalog on first load', async ({ page }) => {
  await page.goto('/');

  await expect(page).toHaveURL(/\/catalog(?:\?.*)?$/);
  await expect(page.getByRole('heading', { name: 'Filter & Sort' })).toBeVisible();
});
