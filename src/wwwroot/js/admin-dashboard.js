/**
 * Admin Dashboard - Chart Integration
 * Provides interactive charts for call monitoring and pricing data
 */

// Chart instances
let pricingChart = null;
let costDistributionChart = null;

// Get current theme
function getCurrentTheme() {
    return document.documentElement.getAttribute('data-theme') || 'light';
}

// Chart colors based on theme
function getChartColors() {
    const theme = getCurrentTheme();
    const isDark = theme === 'dark';

    return {
        primary: isDark ? '#60a5fa' : '#2563eb',
        secondary: isDark ? '#a78bfa' : '#7c3aed',
        success: isDark ? '#34d399' : '#10b981',
        warning: isDark ? '#fbbf24' : '#f59e0b',
        danger: isDark ? '#f87171' : '#ef4444',
        text: isDark ? '#e5e7eb' : '#1f2937',
        grid: isDark ? '#374151' : '#e5e7eb',
        background: isDark ? '#1f2937' : '#ffffff'
    };
}

// Initialize charts
function initializeCharts() {
    const colors = getChartColors();
    
    // Get pricing data from table
    const pricingRows = document.querySelectorAll('#pricingTable tr[data-model]');
    const models = [];
    const inputCosts = [];
    const outputCosts = [];
    const avatarCosts = [];
    const ttsCosts = [];

    pricingRows.forEach(row => {
        models.push(row.dataset.model);
        inputCosts.push(parseFloat(row.dataset.input));
        outputCosts.push(parseFloat(row.dataset.output));
        avatarCosts.push(parseFloat(row.dataset.avatar));
        ttsCosts.push(parseFloat(row.dataset.tts));
    });

    // Pricing Chart (Bar Chart)
    const pricingCtx = document.getElementById('pricingChart');
    if (pricingCtx) {
        if (pricingChart) {
            pricingChart.destroy();
        }

        pricingChart = new Chart(pricingCtx, {
            type: 'bar',
            data: {
                labels: models,
                datasets: [
                    {
                        label: 'Input ($/1K tokens)',
                        data: inputCosts,
                        backgroundColor: colors.primary,
                        borderColor: colors.primary,
                        borderWidth: 1
                    },
                    {
                        label: 'Output ($/1K tokens)',
                        data: outputCosts,
                        backgroundColor: colors.secondary,
                        borderColor: colors.secondary,
                        borderWidth: 1
                    }
                ]
            },
            options: {
                colors: colors
            }
        });
        pricingChart.render();
    }

    // Cost Distribution Chart (Doughnut Chart)
    const distributionCtx = document.getElementById('costDistributionChart');
    if (distributionCtx) {
        if (costDistributionChart) {
            costDistributionChart.destroy();
        }

        // Calculate average costs for distribution
        const avgInput = inputCosts.reduce((a, b) => a + b, 0) / inputCosts.length || 0;
        const avgOutput = outputCosts.reduce((a, b) => a + b, 0) / outputCosts.length || 0;
        const avgAvatar = avatarCosts.reduce((a, b) => a + b, 0) / avatarCosts.length || 0;
        const avgTts = ttsCosts.reduce((a, b) => a + b, 0) / ttsCosts.length || 0;

        costDistributionChart = new Chart(distributionCtx, {
            type: 'doughnut',
            data: {
                labels: ['Input Tokens', 'Output Tokens', 'Avatar', 'TTS'],
                datasets: [{
                    data: [avgInput, avgOutput, avgAvatar, avgTts],
                    backgroundColor: [
                        colors.primary,
                        colors.secondary,
                        colors.success,
                        colors.warning
                    ],
                    borderColor: colors.background,
                    borderWidth: 2
                }]
            },
            options: {
                colors: colors
            }
        });
        costDistributionChart.render();
    }
}

// Refresh data
function refreshData() {
    location.reload();
}

// Reload pricing from database
async function reloadPricing() {
    try {
        const response = await fetch('/api/admin/pricing/reload', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            }
        });

        if (response.ok) {
            showToast('Prezzi ricaricati con successo!', 'success');
            setTimeout(() => location.reload(), 1000);
        } else {
            showToast('Errore nel ricaricamento dei prezzi', 'error');
        }
    } catch (error) {
        showToast('Errore: ' + error.message, 'error');
    }
}

// Show toast notification
function showToast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    
    container.appendChild(toast);

    // Trigger animation
    setTimeout(() => toast.classList.add('show'), 10);

    // Remove after 5 seconds
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }, 5000);
}

// Format number with animation
function animateNumber(element, newValue) {
    if (!element) return;
    
    const currentValue = parseInt(element.textContent.replace(/,/g, '')) || 0;
    const diff = newValue - currentValue;
    const duration = 500;
    const steps = 20;
    const stepValue = diff / steps;
    const stepDuration = duration / steps;
    
    let step = 0;
    const interval = setInterval(() => {
        step++;
        const value = Math.round(currentValue + (stepValue * step));
        element.textContent = value.toLocaleString();
        
        if (step >= steps) {
            clearInterval(interval);
            element.textContent = newValue.toLocaleString();
        }
    }, stepDuration);
}

// Fetch and update metrics
async function fetchMetrics() {
    try {
        const response = await fetch('/api/admin/metrics');
        if (!response.ok) {
            throw new Error('Failed to fetch metrics');
        }
        
        const data = await response.json();
        
        // Update token metrics with animation
        animateNumber(document.getElementById('inputTokens'), data.inputTokens);
        animateNumber(document.getElementById('outputTokens'), data.outputTokens);
        animateNumber(document.getElementById('cachedTokens'), data.cachedTokens);
        animateNumber(document.getElementById('interactions'), data.interactions);
        
        // Update session metrics
        animateNumber(document.getElementById('activeSessions'), data.activeSessions);
        animateNumber(document.getElementById('queueSize'), data.queueSize);
        
        // Update used models
        updateUsedModels(data.usedModels);
        
        // Update last update time
        const lastUpdate = document.getElementById('lastUpdate');
        if (lastUpdate) {
            const time = new Date(data.timestamp);
            lastUpdate.textContent = time.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        }
        
    } catch (error) {
        console.error('Error fetching metrics:', error);
    }
}

// Update used models display
function updateUsedModels(models) {
    const grid = document.getElementById('usedModelsGrid');
    if (!grid) return;
    
    if (!models || models.length === 0) {
        grid.innerHTML = `
            <div class="no-models">
                <svg class="no-models-icon" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="17" y1="11" x2="23" y2="11"/></svg>
                <span>No active models</span>
            </div>
        `;
        return;
    }
    
    grid.innerHTML = models.map(model => `
        <div class="model-badge">
            <div class="model-indicator"></div>
            <span class="model-name">${escapeHtml(model)}</span>
        </div>
    `).join('');
}

// Escape HTML to prevent XSS
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Handle hamburger menu
function initializeMenu() {
    const hamburgerButton = document.getElementById('hamburgerButton');
    const leftPanel = document.getElementById('leftPanel');
    const closeLeftPanel = document.getElementById('closeLeftPanel');

    if (hamburgerButton && leftPanel) {
        hamburgerButton.addEventListener('click', () => {
            leftPanel.classList.add('open');
            leftPanel.setAttribute('aria-hidden', 'false');
        });
    }

    if (closeLeftPanel && leftPanel) {
        closeLeftPanel.addEventListener('click', () => {
            leftPanel.classList.remove('open');
            leftPanel.setAttribute('aria-hidden', 'true');
        });
    }
}

// Update charts when theme changes
function onThemeChange() {
    initializeCharts();
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    initializeCharts();
    initializeMenu();

    // Initial metrics fetch
    fetchMetrics();

    // Auto-refresh metrics every 5 seconds
    setInterval(fetchMetrics, 5000);

    // Full page refresh every 60 seconds (for charts)
    setInterval(() => {
        initializeCharts();
    }, 60000);

    // Listen for theme changes
    const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
            if (mutation.attributeName === 'data-theme') {
                onThemeChange();
            }
        });
    });

    observer.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ['data-theme']
    });
});

// Export functions for global use
window.refreshData = refreshData;
window.reloadPricing = reloadPricing;
window.fetchMetrics = fetchMetrics;
