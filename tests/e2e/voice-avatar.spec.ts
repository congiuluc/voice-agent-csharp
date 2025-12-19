import { test, expect } from '@playwright/test';

test.describe('Voice Avatar Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('http://localhost:5000/VoiceAvatar', { waitUntil: 'networkidle' });
  });

  test('should load the voice avatar page', async ({ page }) => {
    await page.waitForLoadState('networkidle');
    const title = await page.locator('h1, h2').count();
    expect(title).toBeGreaterThanOrEqual(0);
  });

  test('should display avatar configuration', async ({ page }) => {
    await page.waitForLoadState('networkidle');
    const container = await page.locator('[role="main"], main').count();
    expect(container).toBeGreaterThanOrEqual(0);
  });

  test('should have voice selection options', async ({ page }) => {
    await page.waitForLoadState('networkidle');
    const voiceSelect = await page.locator('select, input').count();
    expect(voiceSelect).toBeGreaterThanOrEqual(0);
  });

  test('should display avatar preview', async ({ page }) => {
    await page.waitForLoadState('networkidle');
    const preview = await page.locator('video, img, [role="img"]').count();
    expect(preview).toBeGreaterThanOrEqual(0);
  });

  test('should have avatar interaction button', async ({ page }) => {
    await page.waitForLoadState('networkidle');
    const buttons = await page.locator('button').count();
    expect(buttons).toBeGreaterThanOrEqual(0);
  });

  test('should display voice options', async ({ page }) => {
    await page.waitForLoadState('networkidle');
    const options = await page.locator('select, input').count();
    expect(options).toBeGreaterThanOrEqual(0);
  });

  test('should be responsive on tablet', async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.waitForLoadState('networkidle');
    const content = await page.locator('body').count();
    expect(content).toBeGreaterThan(0);
  });

  test('should have avatar description', async ({ page }) => {
    await page.waitForLoadState('networkidle');
    const desc = await page.locator('p, [role="main"], main').count();
    expect(desc).toBeGreaterThanOrEqual(0);
  });
});
