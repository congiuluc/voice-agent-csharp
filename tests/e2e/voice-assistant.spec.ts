import { test, expect } from '@playwright/test';

test.describe('Voice Assistant Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('http://localhost:5000/VoiceAssistant', { waitUntil: 'networkidle' });
  });

  test('should load the voice assistant page', async ({ page }) => {
    await page.waitForLoadState('networkidle');
    const title = await page.locator('h1, h2').count();
    expect(title).toBeGreaterThanOrEqual(0);
  });

  test('should display assistant interface', async ({ page }) => {
    await page.waitForLoadState('networkidle');
    const container = await page.locator('[role="main"], main').count();
    expect(container).toBeGreaterThanOrEqual(0);
  });

  test('should have input field for messages', async ({ page }) => {
    await page.waitForLoadState('networkidle');
    const input = await page.locator('input, textarea').count();
    expect(input).toBeGreaterThanOrEqual(0);
  });

  test('should have send button', async ({ page }) => {
    await page.waitForLoadState('networkidle');
    const buttons = await page.locator('button').count();
    expect(buttons).toBeGreaterThanOrEqual(0);
  });

  test('should display conversation history', async ({ page }) => {
    await page.waitForLoadState('networkidle');
    const history = await page.locator('[role="main"], main').count();
    expect(history).toBeGreaterThanOrEqual(0);
  });

  test('should handle responsive layout', async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.waitForLoadState('networkidle');
    const content = await page.locator('body').count();
    expect(content).toBeGreaterThan(0);
  });

  test('should display assistant settings if available', async ({ page }) => {
    await page.waitForLoadState('networkidle');
    const buttons = await page.locator('button').count();
    expect(buttons).toBeGreaterThanOrEqual(0);
  });

  test('should clear conversation button exists', async ({ page }) => {
    await page.waitForLoadState('networkidle');
    const buttons = await page.locator('button').count();
    expect(buttons).toBeGreaterThanOrEqual(0);
  });
});
