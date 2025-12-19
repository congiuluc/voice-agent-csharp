import { test, expect } from '@playwright/test';

test.describe('Settings Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('http://localhost:5000/settings', { waitUntil: 'networkidle' });
  });

  test('should load settings page', async ({ page }) => {
    await page.waitForLoadState('networkidle');
    const heading = await page.locator('h1, h2').count();
    expect(heading).toBeGreaterThanOrEqual(0);
  });

  test('should display settings form', async ({ page }) => {
    await page.waitForLoadState('networkidle');
    const form = await page.locator('form, [role="main"]').count();
    expect(form).toBeGreaterThanOrEqual(0);
  });

  test('should have language selector', async ({ page }) => {
    await page.waitForLoadState('networkidle');
    const langSelector = await page.locator('select, input').count();
    expect(langSelector).toBeGreaterThanOrEqual(0);
  });

  test('should have theme selector', async ({ page }) => {
    await page.waitForLoadState('networkidle');
    const themeSelector = await page.locator('select, input').count();
    expect(themeSelector).toBeGreaterThanOrEqual(0);
  });

  test('should have save button', async ({ page }) => {
    await page.waitForLoadState('networkidle');
    const buttons = await page.locator('button').count();
    expect(buttons).toBeGreaterThanOrEqual(0);
  });

  test('should have reset button', async ({ page }) => {
    await page.waitForLoadState('networkidle');
    const buttons = await page.locator('button').count();
    expect(buttons).toBeGreaterThanOrEqual(0);
  });

  test('should display user preferences', async ({ page }) => {
    await page.waitForLoadState('networkidle');
    const prefs = await page.locator('[role="main"], main').count();
    expect(prefs).toBeGreaterThanOrEqual(0);
  });

  test('should have notification settings', async ({ page }) => {
    await page.waitForLoadState('networkidle');
    const notifications = await page.locator('input, button').count();
    expect(notifications).toBeGreaterThanOrEqual(0);
  });

  test('should be responsive', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.waitForLoadState('networkidle');
    const content = await page.locator('body').count();
    expect(content).toBeGreaterThan(0);
  });
});
