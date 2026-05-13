import { test, expect } from '@playwright/test';

test('home page loads and exposes diagnostics entrypoint', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByText('ShopPilot Phase 0 Foundation')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Open health check' })).toBeVisible();
});
