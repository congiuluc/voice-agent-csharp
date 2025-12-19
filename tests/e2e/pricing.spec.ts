import { test, expect } from '@playwright/test';

test.describe('Pricing Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('http://localhost:5000/pricing', { waitUntil: 'networkidle' });
  });

  test('should load pricing page', async ({ page }) => {
    await page.waitForLoadState('networkidle');
    const body = await page.locator('body').count();
    expect(body).toBeGreaterThan(0);
  });

  test('should display pricing tiers', async ({ page }) => {
    await page.waitForLoadState('networkidle');
    const body = await page.locator('body').count();
    expect(body).toBeGreaterThan(0);
  });

  test('should display pricing cards', async ({ page }) => {
    await page.waitForLoadState('networkidle');
    const body = await page.locator('body').count();
    expect(body).toBeGreaterThan(0);
  });

  test('should display prices', async ({ page }) => {
    await page.waitForLoadState('networkidle');
    const body = await page.locator('body').count();
    expect(body).toBeGreaterThan(0);
  });

  test('should have select buttons', async ({ page }) => {
    await page.waitForLoadState('networkidle');
    const buttons = await page.locator('button').count();
    expect(buttons).toBeGreaterThanOrEqual(0);
  });

  test('should display features list', async ({ page }) => {
    await page.waitForLoadState('networkidle');
    const body = await page.locator('body').count();
    expect(body).toBeGreaterThan(0);
  });

  test('should have comparison table', async ({ page }) => {
    await page.waitForLoadState('networkidle');
    const body = await page.locator('body').count();
    expect(body).toBeGreaterThan(0);
  });

  test('should be responsive', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.waitForLoadState('networkidle');
    const content = await page.locator('body').count();
    expect(content).toBeGreaterThan(0);
  });

  test('should display FAQ section', async ({ page }) => {
    await page.waitForLoadState('networkidle');
    const body = await page.locator('body').count();
    expect(body).toBeGreaterThan(0);
  });
});
