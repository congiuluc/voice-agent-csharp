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

    // Auto-refresh every 30 seconds
    setInterval(refreshData, 30000);

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
