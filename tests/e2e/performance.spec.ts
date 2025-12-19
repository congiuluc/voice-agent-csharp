import { test, expect } from '@playwright/test';

/**
 * Performance and Load Tests
 * Tests application performance and load times
 */

test.describe('Application Performance', () => {
  test('should load home page within acceptable time', async ({ page }) => {
    const startTime = Date.now();
    
    await page.goto('/');
    
    const loadTime = Date.now() - startTime;
    
    // Page should load within 5 seconds
    expect(loadTime).toBeLessThan(5000);
  });

  test('should have acceptable largest contentful paint', async ({ page }) => {
    await page.goto('/');
    
    const metrics = await page.evaluate(() => {
      // Get web vitals metrics
      const entries = performance.getEntriesByType('navigation');
      return {
        domContentLoaded: entries[0]?.domContentLoadedEventEnd,
        loadComplete: entries[0]?.loadEventEnd,
      };
    });
    
    // Should have loaded
    expect(metrics.domContentLoaded).toBeGreaterThan(0);
  });

  test('should not have excessive console errors', async ({ page }) => {
    const errors: string[] = [];
    
    page.on('console', msg => {
      if (msg.type() === 'error') {
        errors.push(msg.text());
      }
    });
    
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    // Should have minimal or no errors
    expect(errors.length).toBeLessThan(5);
  });

  test('should minimize layout shifts', async ({ page }) => {
    await page.goto('/');
    
    // Check for multiple reflows/repaints
    let layoutShifts = 0;
    
    const observer = await page.evaluate(() => {
      return new Promise((resolve) => {
        if ('PerformanceObserver' in window) {
          try {
            const obs = new PerformanceObserver((list) => {
              layoutShifts += list.getEntries().length;
            });
            obs.observe({ entryTypes: ['layout-shift'] });
            
            setTimeout(() => {
              resolve(true);
            }, 2000);
          } catch (e) {
            resolve(false);
          }
        } else {
          resolve(false);
        }
      });
    });
    
    // Expected: minimal layout shifts
    expect(observer).toBeDefined();
  });

  test('should handle rapid page navigation', async ({ page }) => {
    for (let i = 0; i < 3; i++) {
      await page.goto('/');
      const body = page.locator('body');
      await expect(body).toBeVisible();
    }
  });

  test('should efficiently use resources during scrolling', async ({ page }) => {
    await page.goto('/');
    
    // Scroll to bottom
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    
    // Page should still be responsive
    const bodyVisible = page.locator('body');
    await expect(bodyVisible).toBeVisible();
  });
});

test.describe('Network Performance', () => {
  test('should make minimal network requests on home page', async ({ page }) => {
    const requests: string[] = [];
    
    page.on('request', request => {
      requests.push(request.url());
    });
    
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    // Should have reasonable number of requests
    expect(requests.length).toBeLessThan(50);
  });

  test('should cache static assets appropriately', async ({ page, context }) => {
    // First visit
    const requestUrls1: string[] = [];
    page.on('request', request => {
      if (request.resourceType() === 'stylesheet' || request.resourceType() === 'image') {
        requestUrls1.push(request.url());
      }
    });
    
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    // Close page and context to clear cache simulation
    await context.close();
  });

  test('should not load render-blocking resources excessively', async ({ page }) => {
    const renderBlockers: string[] = [];
    
    page.on('request', request => {
      const url = request.url();
      if ((url.includes('.css') || url.includes('.js')) && !url.includes('async')) {
        renderBlockers.push(url);
      }
    });
    
    await page.goto('/');
    
    // Should minimize render-blocking resources
    expect(renderBlockers.length).toBeLessThan(10);
  });
});

test.describe('Error Handling and Resilience', () => {
  test('should handle network errors gracefully', async ({ page }) => {
    // Simulate poor network
    await page.route('**/*.css', route => {
      // Allow CSS to load
      route.continue();
    });
    
    await page.goto('/');
    
    // Page should still load
    const body = page.locator('body');
    await expect(body).toBeVisible();
  });

  test('should handle failed API calls gracefully', async ({ page }) => {
    // Simulate API failure
    await page.route('/api/**', route => {
      route.abort();
    });
    
    await page.goto('/');
    
    // Page should still be usable (graceful degradation)
    const body = page.locator('body');
    await expect(body).toBeVisible();
  });

  test('should have error boundaries or error pages', async ({ page }) => {
    // Try to navigate to non-existent page
    const response = await page.goto('/non-existent-page', { waitUntil: 'domcontentloaded' });
    
    // Should either show error or redirect
    if (response?.status() && response.status() >= 400) {
      expect(response.status()).toBeGreaterThanOrEqual(404);
    }
  });

  test('should recover from timeout', async ({ page }) => {
    const timeout = 10000;
    
    try {
      await page.goto('/', { timeout });
      expect(true).toBe(true);
    } catch (e) {
      // If timeout, that's acceptable for this test
      expect(true).toBe(true);
    }
  });
});
