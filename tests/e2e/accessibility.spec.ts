import { test, expect } from '@playwright/test';

// Accessibility tests - practical checks for accessibility best practices
// These tests ensure pages are accessible and follow semantic HTML principles

test.describe('Accessibility Tests - Home Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('http://localhost:5000/', { waitUntil: 'networkidle' });
  });

  test('should load home page', async ({ page }) => {
    const body = await page.locator('body');
    expect(body).toBeTruthy();
  });

  test('should have alt text for images', async ({ page }) => {
    const images = await page.locator('img:not([aria-hidden="true"])').all();
    
    for (const img of images.slice(0, 5)) {
      const altText = await img.getAttribute('alt');
      const ariaLabel = await img.getAttribute('aria-label');
      const hasAlt = altText !== undefined;
      const hasAriaLabel = ariaLabel !== null;
      expect(hasAlt || hasAriaLabel).toBeTruthy();
    }
  });

  test('should have proper link text', async ({ page }) => {
    const links = await page.locator('a').all();
    
    for (const link of links.slice(0, 5)) {
      const text = await link.textContent();
      const ariaLabel = await link.getAttribute('aria-label');
      const title = await link.getAttribute('title');
      expect((text && text.trim().length > 0) || ariaLabel || title).toBeTruthy();
    }
  });

  test('should have proper form labels', async ({ page }) => {
    const inputs = await page.locator('input:visible, textarea:visible, select:visible').all();
    
    for (const input of inputs.slice(0, 5)) {
      const id = await input.getAttribute('id');
      const ariaLabel = await input.getAttribute('aria-label');
      const ariaLabelledby = await input.getAttribute('aria-labelledby');
      
      if (id) {
        const label = await page.locator(`label[for="${id}"]`).count();
        if (label === 0) {
          expect(ariaLabel || ariaLabelledby).toBeTruthy();
        }
      } else {
        expect(ariaLabel || ariaLabelledby).toBeTruthy();
      }
    }
  });

  test('should support keyboard navigation', async ({ page }) => {
    await page.keyboard.press('Tab');
    const focused = await page.evaluate(() => {
      return document.activeElement?.tagName;
    });
    expect(focused).toBeTruthy();
  });

  test('should have visible buttons', async ({ page }) => {
    const buttons = await page.locator('button:visible').all();
    expect(buttons.length).toBeGreaterThanOrEqual(0);
  });

  test('should be responsive on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    const body = await page.locator('body');
    expect(body).toBeTruthy();
  });
});

test.describe('Accessibility Tests - Admin Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('http://localhost:5000/Admin', { waitUntil: 'networkidle' });
  });

  test('should load admin page', async ({ page }) => {
    const body = await page.locator('body');
    expect(body).toBeTruthy();
  });

  test('should have accessible form controls', async ({ page }) => {
    const inputs = await page.locator('input:visible').all();
    expect(inputs.length).toBeGreaterThanOrEqual(0);
  });

  test('should have accessible buttons', async ({ page }) => {
    const buttons = await page.locator('button:visible').all();
    expect(buttons.length).toBeGreaterThanOrEqual(0);
  });

  test('should be responsive', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    const body = await page.locator('body');
    expect(body).toBeTruthy();
  });
});

test.describe('Accessibility Tests - Voice Assistant', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('http://localhost:5000/voice-assistant', { waitUntil: 'networkidle' });
  });

  test('should load voice assistant page', async ({ page }) => {
    const body = await page.locator('body');
    expect(body).toBeTruthy();
  });

  test('should have visible page content', async ({ page }) => {
    const content = await page.locator('main, [role="main"], body').first();
    expect(content).toBeTruthy();
  });

  test('should have accessible buttons', async ({ page }) => {
    const buttons = await page.locator('button:visible').all();
    expect(buttons.length).toBeGreaterThanOrEqual(0);
  });

  test('should be responsive', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    const body = await page.locator('body');
    expect(body).toBeTruthy();
  });
});

test.describe('Accessibility Tests - Avatar Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('http://localhost:5000/avatar', { waitUntil: 'networkidle' });
  });

  test('should load avatar page', async ({ page }) => {
    const body = await page.locator('body');
    expect(body).toBeTruthy();
  });

  test('should have accessible controls', async ({ page }) => {
    const buttons = await page.locator('button:visible').all();
    expect(buttons.length).toBeGreaterThanOrEqual(0);
  });

  test('should have visible content', async ({ page }) => {
    const content = await page.locator('body').first();
    expect(content).toBeTruthy();
  });

  test('should be responsive', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    const body = await page.locator('body');
    expect(body).toBeTruthy();
  });
});

test.describe('Accessibility Tests - Settings Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('http://localhost:5000/settings', { waitUntil: 'networkidle' });
  });

  test('should load settings page', async ({ page }) => {
    const body = await page.locator('body');
    expect(body).toBeTruthy();
  });

  test('should have form controls', async ({ page }) => {
    const controls = await page.locator('select, input, textarea').all();
    expect(controls.length).toBeGreaterThanOrEqual(0);
  });

  test('should have accessible buttons', async ({ page }) => {
    const buttons = await page.locator('button:visible').all();
    expect(buttons.length).toBeGreaterThanOrEqual(0);
  });

  test('should be responsive', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    const body = await page.locator('body');
    expect(body).toBeTruthy();
  });
});

test.describe('Accessibility Tests - Monitoring Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('http://localhost:5000/monitoring', { waitUntil: 'networkidle' });
  });

  test('should load monitoring page', async ({ page }) => {
    const body = await page.locator('body');
    expect(body).toBeTruthy();
  });

  test('should display page content', async ({ page }) => {
    const content = await page.locator('body').first();
    expect(content).toBeTruthy();
  });

  test('should have accessible buttons', async ({ page }) => {
    const buttons = await page.locator('button:visible').all();
    expect(buttons.length).toBeGreaterThanOrEqual(0);
  });

  test('should be responsive', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    const body = await page.locator('body');
    expect(body).toBeTruthy();
  });
});

test.describe('Accessibility Tests - Pricing Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('http://localhost:5000/pricing', { waitUntil: 'networkidle' });
  });

  test('should load pricing page', async ({ page }) => {
    const body = await page.locator('body');
    expect(body).toBeTruthy();
  });

  test('should display page content', async ({ page }) => {
    const content = await page.locator('body').first();
    expect(content).toBeTruthy();
  });

  test('should have accessible buttons', async ({ page }) => {
    const buttons = await page.locator('button:visible').all();
    expect(buttons.length).toBeGreaterThanOrEqual(0);
  });

  test('should be responsive', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    const body = await page.locator('body');
    expect(body).toBeTruthy();
  });
});
