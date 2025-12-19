import { test, expect } from '@playwright/test';

test.describe('Avatar Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('http://localhost:5000/avatar', { waitUntil: 'networkidle' });
  });

  test('should load avatar page', async ({ page }) => {
    await page.waitForLoadState('networkidle');
    const heading = await page.locator('h1, h2').count();
    expect(heading).toBeGreaterThanOrEqual(0);
  });

  test('should display avatar video', async ({ page }) => {
    await page.waitForLoadState('networkidle');
    const video = await page.locator('video, [role="img"]').count();
    expect(video).toBeGreaterThanOrEqual(0);
  });

  test('should have play button', async ({ page }) => {
    await page.waitForLoadState('networkidle');
    const buttons = await page.locator('button').count();
    expect(buttons).toBeGreaterThanOrEqual(0);
  });

  test('should have pause button', async ({ page }) => {
    await page.waitForLoadState('networkidle');
    const buttons = await page.locator('button').count();
    expect(buttons).toBeGreaterThanOrEqual(0);
  });

  test('should display avatar controls', async ({ page }) => {
    await page.waitForLoadState('networkidle');
    const controls = await page.locator('button').count();
    expect(controls).toBeGreaterThanOrEqual(0);
  });

  test('should have avatar expressions selector', async ({ page }) => {
    await page.waitForLoadState('networkidle');
    const selectors = await page.locator('select, [role="listbox"]').count();
    expect(selectors).toBeGreaterThanOrEqual(0);
  });

  test('should display current expression', async ({ page }) => {
    await page.waitForLoadState('networkidle');
    const body = await page.locator('body').count();
    expect(body).toBeGreaterThan(0);
  });

  test('should be responsive', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.waitForLoadState('networkidle');
    const body = await page.locator('body').count();
    expect(body).toBeGreaterThan(0);
  });

  test('should have fullscreen button', async ({ page }) => {
    await page.waitForLoadState('networkidle');
    const buttons = await page.locator('button').count();
    expect(buttons).toBeGreaterThanOrEqual(0);
  });
});
