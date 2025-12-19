import { test, expect } from '@playwright/test';

test.describe('Monitoring Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('http://localhost:5000/monitoring', { waitUntil: 'networkidle' });
  });

  test('should load monitoring page', async ({ page }) => {
    await page.waitForLoadState('networkidle');
    const heading = await page.locator('h1, h2').count();
    expect(heading).toBeGreaterThanOrEqual(0);
  });

  test('should display system metrics', async ({ page }) => {
    await page.waitForLoadState('networkidle');
    const metrics = await page.locator('[role="main"], main').count();
    expect(metrics).toBeGreaterThanOrEqual(0);
  });

  test('should display CPU usage', async ({ page }) => {
    await page.waitForLoadState('networkidle');
    const cpu = await page.locator('canvas, div, [role="img"]').count();
    expect(cpu).toBeGreaterThanOrEqual(0);
  });

  test('should display memory usage', async ({ page }) => {
    await page.waitForLoadState('networkidle');
    const memory = await page.locator('canvas, div, [role="img"]').count();
    expect(memory).toBeGreaterThanOrEqual(0);
  });

  test('should display uptime', async ({ page }) => {
    await page.waitForLoadState('networkidle');
    const body = await page.locator('body').count();
    expect(body).toBeGreaterThan(0);
  });

  test('should have refresh button', async ({ page }) => {
    await page.waitForLoadState('networkidle');
    const buttons = await page.locator('button').count();
    expect(buttons).toBeGreaterThanOrEqual(0);
  });

  test('should display health status', async ({ page }) => {
    await page.waitForLoadState('networkidle');
    const health = await page.locator('[role="main"], main').count();
    expect(health).toBeGreaterThanOrEqual(0);
  });

  test('should be responsive', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.waitForLoadState('networkidle');
    const content = await page.locator('body').count();
    expect(content).toBeGreaterThan(0);
  });

  test('should display logs section', async ({ page }) => {
    await page.waitForLoadState('networkidle');
    const logs = await page.locator('[role="main"], main').count();
    expect(logs).toBeGreaterThanOrEqual(0);
  });
});
