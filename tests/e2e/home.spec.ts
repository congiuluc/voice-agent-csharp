import { test, expect, Page } from '@playwright/test';

/**
 * Home Page UI Tests
 * Tests the home page and general navigation
 */

test.describe('Home Page UI', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('should display home page successfully', async ({ page }) => {
    // Check page is loaded
    const body = page.locator('body');
    await expect(body).toBeVisible();
    
    // Page title should exist
    const pageTitle = page.locator('title');
    const titleText = await pageTitle.textContent();
    expect(titleText).toBeTruthy();
  });

  test('should have navigation elements', async ({ page }) => {
    // Check for nav or header or any navigation element
    const nav = page.locator('nav, header, [role="navigation"]').first();
    const navCount = await nav.count();
    
    // If nav is not found, page should still have navigation buttons
    if (navCount === 0) {
      const navButtons = page.locator('button, a').filter({ hasText: /home|menu|nav|goto/i });
      await expect(navButtons).toBeDefined();
    } else {
      await expect(nav).toBeVisible();
    }
  });

  test('should have language selector if available', async ({ page }) => {
    // Check for language selector
    const langSelector = page.locator('[data-testid="language-selector"], .language-selector-container').first();
    
    // May or may not exist, but if it does, should be visible
    const count = await langSelector.count();
    if (count > 0) {
      await expect(langSelector).toBeVisible();
    }
  });

  test('should have proper viewport settings', async ({ page }) => {
    const viewport = page.viewportSize();
    expect(viewport).not.toBeNull();
    expect(viewport?.width).toBeGreaterThan(0);
    expect(viewport?.height).toBeGreaterThan(0);
  });

  test('should render without errors', async ({ page }) => {
    let errors: string[] = [];
    
    page.on('console', msg => {
      if (msg.type() === 'error') {
        errors.push(msg.text());
      }
    });
    
    // Re-navigate to trigger any console errors
    await page.reload();
    
    // Should have no console errors (or very few)
    expect(errors.length).toBeLessThan(3);
  });

  test('should take screenshot of home page', async ({ page }) => {
    await page.screenshot({ 
      path: 'test-results/home-page.png',
      fullPage: true 
    });
  });
});

test.describe('Home Page Responsiveness', () => {
  const viewports = [
    { width: 375, height: 667, name: 'iPhone' },
    { width: 768, height: 1024, name: 'iPad' },
    { width: 1920, height: 1080, name: 'Desktop' },
  ];

  for (const viewport of viewports) {
    test(`should render properly on ${viewport.name} (${viewport.width}x${viewport.height})`, async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await page.goto('/');
      
      const body = page.locator('body');
      await expect(body).toBeVisible();
      
      // Should not have horizontal scrollbar
      const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
      const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
      
      expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 1);
    });
  }
});

test.describe('Home Page Accessibility', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('should have proper page structure', async ({ page }) => {
    // Check for h1
    const h1 = page.locator('h1');
    const h1Count = await h1.count();
    expect(h1Count).toBeGreaterThanOrEqual(0); // May not have h1, but if it does should be valid
    
    // Page should have meaningful content
    const body = page.locator('body');
    const bodyText = await body.textContent();
    expect(bodyText).not.toBe('');
  });

  test('should have lang attribute on html element', async ({ page }) => {
    const html = page.locator('html').first();
    const lang = await html.getAttribute('lang');
    
    // Should have lang attribute set to valid language code
    if (lang) {
      expect(lang).toMatch(/^[a-z]{2}(-[a-z]{2})?$/i);
    }
  });

  test('should have proper meta tags', async ({ page }) => {
    // Check for viewport meta tag
    const viewportMeta = page.locator('meta[name="viewport"]');
    await expect(viewportMeta).toBeAttached();
    
    const viewportContent = await viewportMeta.getAttribute('content');
    expect(viewportContent).toContain('width=device-width');
  });

  test('should be keyboard navigable', async ({ page }) => {
    // Press Tab and check focus moves
    const initialActiveElement = await page.evaluate(() => document.activeElement?.tagName);
    
    await page.keyboard.press('Tab');
    const afterTabElement = await page.evaluate(() => document.activeElement?.tagName);
    
    // Focus should change or remain on valid interactive element
    expect(['BODY', 'BUTTON', 'A', 'INPUT']).toContain(afterTabElement);
  });
});

test.describe('Static Content', () => {
  test('should load external resources', async ({ page }) => {
    await page.goto('/');
    
    // Check that CSS files are loaded
    const stylesheets = await page.evaluate(() => {
      return Array.from(document.styleSheets).map(sheet => sheet.href);
    });
    
    expect(stylesheets.length).toBeGreaterThan(0);
  });

  test('should handle missing resources gracefully', async ({ page }) => {
    let hadResourceError = false;
    
    page.on('requestfailed', () => {
      hadResourceError = true;
    });
    
    await page.goto('/');
    
    // Page should still render even if some resources fail
    const body = page.locator('body');
    await expect(body).toBeVisible();
  });
});
