import { test, expect, Page } from '@playwright/test';

/**
 * Login and Authentication UI Tests
 * Tests the login page and authentication flow
 */

test.describe('Login Page UI', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/Login');
  });

  test('should display login page with correct elements', async ({ page }) => {
    // Check page title
    const title = page.locator('h1, h2').first();
    await expect(title).toBeVisible();
    
    // Check username input
    const usernameInput = page.locator('input[type="text"], input[name="username"]').first();
    await expect(usernameInput).toBeVisible();
    
    // Check password input
    const passwordInput = page.locator('input[type="password"]').first();
    await expect(passwordInput).toBeVisible();
    
    // Check submit button
    const submitBtn = page.locator('button[type="submit"]');
    await expect(submitBtn).toBeVisible();
  });

  test('should have proper label elements', async ({ page }) => {
    const labels = page.locator('label');
    await expect(labels).toHaveCount(2); // Username and password labels
  });

  test('should require username field', async ({ page }) => {
    const submitBtn = page.locator('button[type="submit"]');
    const usernameInput = page.locator('input[type="text"], input[name="username"]').first();
    
    await expect(usernameInput).toHaveAttribute('required', '');
  });

  test('should require password field', async ({ page }) => {
    const submitBtn = page.locator('button[type="submit"]');
    const passwordInput = page.locator('input[type="password"]').first();
    
    await expect(passwordInput).toHaveAttribute('required', '');
  });

  test('should successfully login with correct credentials', async ({ page }) => {
    const usernameInput = page.locator('input[type="text"], input[name="username"]').first();
    const passwordInput = page.locator('input[type="password"]').first();
    const submitBtn = page.locator('button[type="submit"]');
    
    await usernameInput.fill(process.env.ADMIN_USERNAME || 'admin');
    await passwordInput.fill(process.env.ADMIN_PASSWORD || 'Pa$$w0rd!');
    await submitBtn.click();
    
    // Should navigate away from login page
    await page.waitForURL(url => !url.toString().includes('Login'), { timeout: 5000 });
    expect(page.url()).not.toContain('Login');
  });

  test('should show error message on failed login', async ({ page }) => {
    const usernameInput = page.locator('input[type="text"], input[name="username"]').first();
    const passwordInput = page.locator('input[type="password"]').first();
    const submitBtn = page.locator('button[type="submit"]');
    
    await usernameInput.fill('wronguser');
    await passwordInput.fill('wrongpass');
    await submitBtn.click();
    
    // Should stay on login page or show error
    await page.waitForTimeout(500);
    const currentUrl = page.url();
    expect(currentUrl.includes('Login') || currentUrl.includes('login') || currentUrl.includes('error')).toBeTruthy();
  });

  test('should have input autocomplete attributes', async ({ page }) => {
    const usernameInput = page.locator('input[type="text"], input[name="username"]').first();
    const passwordInput = page.locator('input[type="password"]').first();
    
    const usernameAutocomplete = await usernameInput.getAttribute('autocomplete');
    const passwordAutocomplete = await passwordInput.getAttribute('autocomplete');
    
    expect(['username', 'on', null]).toContain(usernameAutocomplete);
    expect(['current-password', 'password', 'on', null]).toContain(passwordAutocomplete);
  });

  test('should be keyboard navigable', async ({ page }) => {
    const usernameInput = page.locator('input[type="text"], input[name="username"]').first();
    const passwordInput = page.locator('input[type="password"]').first();
    const submitBtn = page.locator('button[type="submit"]');
    
    // Tab to username
    await usernameInput.focus();
    expect(await usernameInput.evaluate(el => el === document.activeElement)).toBeTruthy();
    
    // Tab to password
    await page.keyboard.press('Tab');
    expect(await passwordInput.evaluate(el => el === document.activeElement)).toBeTruthy();
    
    // Tab to submit button
    await page.keyboard.press('Tab');
    expect(await submitBtn.evaluate(el => el === document.activeElement)).toBeTruthy();
  });

  test('should take screenshot of login page', async ({ page }) => {
    await page.screenshot({ 
      path: 'test-results/login-page.png',
      fullPage: true 
    });
  });
});

test.describe('Authentication Flow', () => {
  test('should logout successfully', async ({ page }) => {
    // Login first
    await page.goto('/Login');
    const usernameInput = page.locator('input[type="text"], input[name="username"]').first();
    const passwordInput = page.locator('input[type="password"]').first();
    const submitBtn = page.locator('button[type="submit"]');
    
    await usernameInput.fill(process.env.ADMIN_USERNAME || 'admin');
    await passwordInput.fill(process.env.ADMIN_PASSWORD || 'Pa$$w0rd!');
    await submitBtn.click();
    
    // Wait for redirect
    await page.waitForURL(url => !url.toString().includes('Login'), { timeout: 5000 });
    
    // Now logout
    const logoutBtn = page.locator('.logout-btn, a[href="/Logout"]').first();
    await logoutBtn.click();
    
    // Should be back at login
    await page.waitForURL(url => url.toString().includes('Login'), { timeout: 5000 });
  });

  test('should redirect to login when accessing protected page without auth', async ({ page }) => {
    // Clear any cookies to ensure logged out
    await page.context().clearCookies();
    
    // Try to access protected page
    await page.goto('/Admin/CallMonitoring');
    
    // Should redirect to login
    await page.waitForURL(url => url.toString().includes('Login'), { timeout: 5000 });
    expect(page.url()).toContain('Login');
  });
});
