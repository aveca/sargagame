import { test, expect } from '@playwright/test';

test('should load the correct resources', async ({ page }) => {
  await page.goto('https://sargassummiami.com/api/export');
  expect(page.status()).toBe(200);
  expect(page.url()).toBe('https://sargassummiami.com/api/export');

  await page.goto('https://sargassummiami.com/api/export?format=md');
  expect(page.status()).toBe(200);
  expect(page.url()).toBe('https://sargassummiami.com/api/export?format=md');

  await page.goto('https://sargassummiami.com/export');
  expect(page.status()).toBe(200);
  expect(page.url()).toBe('https://sargassummiami.com/export');
});
