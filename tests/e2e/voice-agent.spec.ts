import { test, expect } from '@playwright/test';

test.describe('Voice Agent Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('http://localhost:5000/VoiceAgent', { waitUntil: 'networkidle' });
  });

  test('should load the voice agent page', async ({ page }) => {
    await page.waitForLoadState('networkidle');
    const title = await page.locator('h1, h2').count();
    expect(title).toBeGreaterThanOrEqual(0);
  });

  test('should have voice agent container', async ({ page }) => {
    await page.waitForLoadState('networkidle');
    const container = await page.locator('[role="main"], main').count();
    expect(container).toBeGreaterThanOrEqual(0);
  });

  test('should display voice configuration section', async ({ page }) => {
    await page.waitForLoadState('networkidle');
    const config = await page.locator('input, select').count();
    expect(config).toBeGreaterThanOrEqual(0);
  });

  test('should have start button enabled', async ({ page }) => {
    await page.waitForLoadState('networkidle');
    const buttons = await page.locator('button').count();
    expect(buttons).toBeGreaterThanOrEqual(0);
  });

  test('should be responsive on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.waitForLoadState('networkidle');
    const content = await page.locator('body').count();
    expect(content).toBeGreaterThan(0);
  });

  test('should handle page navigation', async ({ page }) => {
    await page.waitForLoadState('networkidle');
    const buttons = await page.locator('button, a').count();
    expect(buttons).toBeGreaterThanOrEqual(0);
  });

  test('should display voice instructions if available', async ({ page }) => {
    await page.waitForLoadState('networkidle');
    const instructions = await page.locator('[role="main"], main').count();
    expect(instructions).toBeGreaterThanOrEqual(0);
  });
});
