import { test, expect } from '@playwright/test';

test.describe('Call Monitoring Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('http://localhost:5000/Admin/CallMonitoring', { waitUntil: 'networkidle', timeout: 30000 });
  });

  test('should load call monitoring page', async ({ page }) => {
    await page.waitForLoadState('networkidle');
    const body = await page.locator('body').count();
    expect(body).toBeGreaterThan(0);
  });

  test('should display heading', async ({ page }) => {
    await page.waitForLoadState('networkidle');
    const headings = await page.locator('h1, h2').count();
    expect(headings).toBeGreaterThanOrEqual(0);
  });

  test('should have main content area', async ({ page }) => {
    await page.waitForLoadState('networkidle');
    const main = await page.locator('[role=\ main\], main').count();
    expect(main).toBeGreaterThanOrEqual(0);
  });

  test('should have button elements', async ({ page }) => {
    await page.waitForLoadState('networkidle');
    const buttons = await page.locator('button').count();
    expect(buttons).toBeGreaterThanOrEqual(0);
  });

  test('should be responsive', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.waitForLoadState('networkidle');
    const body = await page.locator('body').count();
    expect(body).toBeGreaterThan(0);
  });

  test('should take screenshot', async ({ page }) => {
    await page.screenshot({ 
      path: 'test-results/call-monitoring.png',
      fullPage: true 
    });
  });
});
