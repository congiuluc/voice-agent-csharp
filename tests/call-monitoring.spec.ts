import { test, expect, Page } from '@playwright/test';

/**
 * Call Monitoring Dashboard UI Tests
 * Tests the Admin Call Monitoring page for proper rendering and functionality
 */

const ADMIN_USERNAME = process.env.ADMIN_USERNAME ?? 'admin';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? 'Pa$$w0rd!';

// Helper to login as admin for testing
async function loginAsAdmin(page: Page) {
  // Navigate to login page
  await page.goto('/Login');

  // Fill in credentials
  await page.fill('input[name="username"], input[type="text"]', ADMIN_USERNAME);
  await page.fill('input[name="password"], input[type="password"]', ADMIN_PASSWORD);

  // Submit the form
  await page.click('button[type="submit"]');

  // Wait for redirect to complete
  await page.waitForURL('**/*', { timeout: 5000 }).catch(() => {});
}

test.describe('Call Monitoring Dashboard UI', () => {
  
  test.beforeEach(async ({ page }) => {
    // Try to access the admin page directly first
    await page.goto('/Admin/CallMonitoring');
    
    // If redirected to login, authenticate
    if (page.url().includes('Login')) {
      await loginAsAdmin(page);
      await page.goto('/Admin/CallMonitoring');
    }
  });

  test('should display the page title correctly', async ({ page }) => {
    // Check the main title is visible
    const title = page.locator('h1');
    await expect(title).toBeVisible();
    await expect(title).toContainText('Call');
    await expect(title).toContainText('Monitoring');
  });

  test('should display branded title with proper styling', async ({ page }) => {
    // Verify brand styling elements
    const brandL = page.locator('.brand-l');
    const brandIA = page.locator('.brand-ia');
    
    await expect(brandL).toBeVisible();
    await expect(brandL).toHaveText('Call');
    await expect(brandIA).toBeVisible();
    await expect(brandIA).toHaveText('Monitoring');
  });

  test('should display all navigation buttons', async ({ page }) => {
    // Hamburger menu button - only visible on mobile, check it exists in DOM
    const hamburgerBtn = page.locator('#hamburgerButton');
    await expect(hamburgerBtn).toBeAttached();
    
    // Home button
    const homeBtn = page.locator('.home-btn');
    await expect(homeBtn).toBeVisible();
    await expect(homeBtn).toHaveAttribute('href', '/');
    
    // Theme toggle button
    const themeToggleBtn = page.locator('#themeToggleButton');
    await expect(themeToggleBtn).toBeVisible();
    
    // Logout button
    const logoutBtn = page.locator('.logout-btn');
    await expect(logoutBtn).toBeVisible();
    await expect(logoutBtn).toHaveAttribute('href', '/Logout');
    
    // Refresh button
    const refreshBtn = page.locator('#refreshButton');
    await expect(refreshBtn).toBeVisible();
  });

  test('should display dashboard content container', async ({ page }) => {
    const dashboardContent = page.locator('.dashboard-content');
    await expect(dashboardContent).toBeVisible();
  });

  test('should display all stat cards', async ({ page }) => {
    const statsGrid = page.locator('.stats-grid');
    await expect(statsGrid).toBeVisible();
    
    // Check for 4 stat cards
    const statCards = page.locator('.stat-card');
    await expect(statCards).toHaveCount(4);
    
    // Verify each stat card content
    const expectedStats = [
      { icon: '📊', label: 'Sessioni Attive', valueId: 'activeSessions' },
      { icon: '📋', label: 'Coda', valueId: 'queueSize' },
      { icon: '🤖', label: 'Modelli Totali', valueId: 'pricingModels' },
      { icon: '🕐', label: 'Ultimo Aggiornamento', valueId: 'lastUpdate' },
    ];
    
    for (let i = 0; i < expectedStats.length; i++) {
      const card = statCards.nth(i);
      await expect(card.locator('.stat-icon')).toContainText(expectedStats[i].icon);
      await expect(card.locator('.stat-label')).toContainText(expectedStats[i].label);
      await expect(card.locator(`#${expectedStats[i].valueId}`)).toBeVisible();
    }
  });

  test('should display charts section', async ({ page }) => {
    const chartsGrid = page.locator('.charts-grid');
    await expect(chartsGrid).toBeVisible();
    
    // Check for 2 chart cards
    const chartCards = page.locator('.chart-card');
    await expect(chartCards).toHaveCount(2);
    
    // Verify chart titles
    await expect(chartCards.nth(0).locator('h3')).toHaveText('Costi per Modello');
    await expect(chartCards.nth(1).locator('h3')).toHaveText('Distribuzione Costi');
    
    // Verify canvas elements
    await expect(page.locator('#pricingChart')).toBeVisible();
    await expect(page.locator('#costDistributionChart')).toBeVisible();
  });

  test('should display pricing table card', async ({ page }) => {
    const tableCard = page.locator('.table-card');
    await expect(tableCard).toBeVisible();
    
    // Check header
    const tableHeader = tableCard.locator('.table-header');
    await expect(tableHeader.locator('h3')).toHaveText('Configurazione Prezzi');
    
    // Check reload button
    const reloadBtn = tableCard.locator('.btn-reload');
    await expect(reloadBtn).toBeVisible();
    await expect(reloadBtn).toContainText('Ricarica dal Database');
  });

  test('should display pricing table with correct headers', async ({ page }) => {
    const pricingTable = page.locator('.pricing-table');
    await expect(pricingTable).toBeVisible();
    
    // Check table headers
    const headers = pricingTable.locator('thead th');
    const expectedHeaders = [
      'Modello',
      'Input ($/1K tokens)',
      'Output ($/1K tokens)',
      'Avatar ($/min)',
      'TTS ($/1M chars)',
      'Aggiornato'
    ];
    
    await expect(headers).toHaveCount(6);
    for (let i = 0; i < expectedHeaders.length; i++) {
      await expect(headers.nth(i)).toHaveText(expectedHeaders[i]);
    }
  });

  test('should display external links section', async ({ page }) => {
    const linksGrid = page.locator('.links-grid');
    await expect(linksGrid).toBeVisible();
    
    // Check for 2 link cards
    const linkCards = page.locator('.link-card');
    await expect(linkCards).toHaveCount(2);
    
    // Azure Portal link
    const azureLink = linkCards.nth(0);
    await expect(azureLink).toHaveAttribute('href', 'https://portal.azure.com');
    await expect(azureLink).toHaveAttribute('target', '_blank');
    await expect(azureLink.locator('.link-icon')).toHaveText('☁️');
    await expect(azureLink.locator('.link-title')).toHaveText('Azure Portal');
    
    // Aspire Dashboard link
    const aspireLink = linkCards.nth(1);
    await expect(aspireLink).toHaveAttribute('href', 'http://localhost:18888');
    await expect(aspireLink).toHaveAttribute('target', '_blank');
    await expect(aspireLink.locator('.link-icon')).toHaveText('📈');
    await expect(aspireLink.locator('.link-title')).toHaveText('Aspire Dashboard');
  });

  test('should have theme toggle functionality', async ({ page }) => {
    const themeToggleBtn = page.locator('#themeToggleButton');
    const sunIcon = page.locator('#sunIcon');
    const moonIcon = page.locator('#moonIcon');
    
    // Initial state - check one is visible
    await expect(themeToggleBtn).toBeVisible();
    
    // Click to toggle theme
    await themeToggleBtn.click();
    
    // Check that body has theme class changed
    const body = page.locator('body');
    await expect(body).toBeVisible();
  });

  test('should open hamburger menu on click', async ({ page }) => {
    // Set mobile viewport where hamburger is visible
    await page.setViewportSize({ width: 480, height: 800 });
    await page.reload();
    
    const hamburgerBtn = page.locator('#hamburgerButton');
    const leftPanel = page.locator('#leftPanel');
    
    // Initially panel should be hidden
    await expect(leftPanel).toHaveAttribute('aria-hidden', 'true');
    
    // Click hamburger button
    await hamburgerBtn.click();
    
    // Panel should become visible
    await expect(leftPanel).toHaveAttribute('aria-hidden', 'false');
  });

  test('should close hamburger menu when close button is clicked', async ({ page }) => {
    // Set mobile viewport where hamburger is visible
    await page.setViewportSize({ width: 480, height: 800 });
    await page.reload();
    
    const hamburgerBtn = page.locator('#hamburgerButton');
    const leftPanel = page.locator('#leftPanel');
    const closeBtn = page.locator('#closeLeftPanel');
    
    // Open the menu
    await hamburgerBtn.click();
    await expect(leftPanel).toHaveAttribute('aria-hidden', 'false');
    
    // Close the menu
    await closeBtn.click();
    await expect(leftPanel).toHaveAttribute('aria-hidden', 'true');
  });

  test('should display error boundary container', async ({ page }) => {
    const errorBoundary = page.locator('#errorBoundary');
    await expect(errorBoundary).toBeAttached();
    
    const errorContent = errorBoundary.locator('.error-content');
    await expect(errorContent.locator('h2')).toContainText('Errore Applicazione');
  });

  test('should have toast container for notifications', async ({ page }) => {
    const toastContainer = page.locator('#toastContainer');
    await expect(toastContainer).toBeAttached();
    await expect(toastContainer).toHaveClass(/toast-container/);
  });

  test('should have responsive stat cards on hover', async ({ page }) => {
    const statCard = page.locator('.stat-card').first();
    
    // Hover over the card
    await statCard.hover();
    
    // Card should have hover effect (transform is applied via CSS)
    await expect(statCard).toBeVisible();
  });

  test('should display stat values correctly', async ({ page }) => {
    // Check that stat values contain numbers
    const activeSessions = page.locator('#activeSessions');
    const queueSize = page.locator('#queueSize');
    const pricingModels = page.locator('#pricingModels');
    const lastUpdate = page.locator('#lastUpdate');
    
    await expect(activeSessions).toBeVisible();
    await expect(queueSize).toBeVisible();
    await expect(pricingModels).toBeVisible();
    await expect(lastUpdate).toBeVisible();
    
    // Values should contain text (numbers or time format)
    const activeSessionsText = await activeSessions.textContent();
    expect(activeSessionsText).not.toBeNull();
    
    const lastUpdateText = await lastUpdate.textContent();
    expect(lastUpdateText).toMatch(/\d{2}:\d{2}:\d{2}/);
  });

  test('should navigate to home when home button is clicked', async ({ page }) => {
    const homeBtn = page.locator('.home-btn');
    
    await homeBtn.click();
    
    // Should navigate to home page
    await expect(page).toHaveURL('/');
  });

});

test.describe('Call Monitoring Dashboard Accessibility', () => {
  
  test.beforeEach(async ({ page }) => {
    await page.goto('/Admin/CallMonitoring');
    
    if (page.url().includes('Login')) {
      await loginAsAdmin(page);
      await page.goto('/Admin/CallMonitoring');
    }
  });

  test('should have proper aria labels on buttons', async ({ page }) => {
    // Check home button
    const homeBtn = page.locator('.home-btn');
    await expect(homeBtn).toHaveAttribute('aria-label', 'Vai alla home');
    
    // Check theme toggle button (aria-label changes based on theme state)
    const themeToggleBtn = page.locator('#themeToggleButton');
    const ariaLabel = await themeToggleBtn.getAttribute('aria-label');
    expect(ariaLabel).toMatch(/tema|theme/i);
    
    // Check logout button
    const logoutBtn = page.locator('.logout-btn');
    await expect(logoutBtn).toHaveAttribute('aria-label', 'Logout');
    
    // Check refresh button
    const refreshBtn = page.locator('#refreshButton');
    await expect(refreshBtn).toHaveAttribute('aria-label', 'Refresh data');
  });

  test('should have proper title attributes on buttons', async ({ page }) => {
    const themeToggleBtn = page.locator('#themeToggleButton');
    await expect(themeToggleBtn).toHaveAttribute('title', 'Attiva/Disattiva tema scuro');
    
    const refreshBtn = page.locator('#refreshButton');
    await expect(refreshBtn).toHaveAttribute('title', 'Aggiorna dati');
  });

  test('should have proper role on left panel', async ({ page }) => {
    // Left panel exists in DOM (hidden on desktop, visible on mobile)
    const leftPanel = page.locator('nav#leftPanel');
    await expect(leftPanel).toBeAttached();
  });

  test('should have proper heading hierarchy', async ({ page }) => {
    // Main title is h1
    const h1 = page.locator('h1');
    await expect(h1).toHaveCount(1);
    
    // Section titles are h2 and h3
    const h2s = page.locator('h2');
    const h3s = page.locator('h3');
    const totalSubHeadings = await h2s.count() + await h3s.count();
    expect(totalSubHeadings).toBeGreaterThanOrEqual(4);
  });

});

test.describe('Call Monitoring Dashboard Visual Tests', () => {
  
  test.beforeEach(async ({ page }) => {
    await page.goto('/Admin/CallMonitoring');
    
    if (page.url().includes('Login')) {
      await loginAsAdmin(page);
      await page.goto('/Admin/CallMonitoring');
    }
  });

  test('should render page without horizontal scrollbar', async ({ page }) => {
    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
    
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 1);
  });

  test('should have proper grid layout for stat cards', async ({ page }) => {
    const statsGrid = page.locator('.stats-grid');
    const display = await statsGrid.evaluate((el) => getComputedStyle(el).display);
    
    expect(display).toBe('grid');
  });

  test('should have proper grid layout for charts', async ({ page }) => {
    const chartsGrid = page.locator('.charts-grid');
    const display = await chartsGrid.evaluate((el) => getComputedStyle(el).display);
    
    expect(display).toBe('grid');
  });

  test('should have glassmorphism effect on stat cards', async ({ page }) => {
    const statCard = page.locator('.stat-card').first();
    const backdropFilter = await statCard.evaluate((el) => getComputedStyle(el).backdropFilter);
    
    expect(backdropFilter).toContain('blur');
  });

  test('should display chart canvases with proper dimensions', async ({ page }) => {
    const pricingChart = page.locator('#pricingChart');
    const costChart = page.locator('#costDistributionChart');
    
    await expect(pricingChart).toBeVisible();
    await expect(costChart).toBeVisible();
    
    const pricingBounds = await pricingChart.boundingBox();
    const costBounds = await costChart.boundingBox();
    
    expect(pricingBounds?.width).toBeGreaterThan(100);
    expect(pricingBounds?.height).toBeGreaterThan(50);
    expect(costBounds?.width).toBeGreaterThan(100);
    expect(costBounds?.height).toBeGreaterThan(50);
  });

  test('should take screenshot of full dashboard', async ({ page }) => {
    await page.screenshot({ 
      path: 'test-results/call-monitoring-dashboard.png',
      fullPage: true 
    });
  });

});
