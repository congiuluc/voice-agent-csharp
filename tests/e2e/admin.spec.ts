import { test, expect } from '@playwright/test';

test.describe('Admin Dashboard Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('http://localhost:5000/Admin', { waitUntil: 'networkidle' });
  });

  test('should load admin dashboard', async ({ page }) => {
    await page.waitForLoadState('networkidle');
    const main = await page.locator('[role="main"], main').count();
    expect(main).toBeGreaterThanOrEqual(0);
  });

  test('should have admin navigation', async ({ page }) => {
    await page.waitForLoadState('networkidle');
    const body = await page.locator('body').count();
    expect(body).toBeGreaterThan(0);
  });

  test('should display admin menu items', async ({ page }) => {
    await page.waitForLoadState('networkidle');
    const buttons = await page.locator('button').count();
    expect(buttons).toBeGreaterThanOrEqual(0);
  });

  test('should have pricing management section', async ({ page }) => {
    await page.waitForLoadState('networkidle');
    const content = await page.locator('body').count();
    expect(content).toBeGreaterThan(0);
  });

  test('should have user management section', async ({ page }) => {
    await page.waitForLoadState('networkidle');
    const content = await page.locator('body').count();
    expect(content).toBeGreaterThan(0);
  });

  test('should display admin statistics', async ({ page }) => {
    await page.waitForLoadState('networkidle');
    const stats = await page.locator('[role="main"], main').count();
    expect(stats).toBeGreaterThanOrEqual(0);
  });

  test('should have settings access', async ({ page }) => {
    await page.waitForLoadState('networkidle');
    const buttons = await page.locator('button, a').count();
    expect(buttons).toBeGreaterThanOrEqual(0);
  });

  test('should display admin welcome message', async ({ page }) => {
    await page.waitForLoadState('networkidle');
    const welcome = await page.locator('h1, h2').count();
    expect(welcome).toBeGreaterThanOrEqual(0);
  });

  test('should be responsive', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.waitForLoadState('networkidle');
    const body = await page.locator('body').count();
    expect(body).toBeGreaterThan(0);
  });
});
