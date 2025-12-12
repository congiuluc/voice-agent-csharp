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
    
    // Fetch current metrics from API to get actual consumption data
    fetchMetricsForCharts();
}

// Fetch metrics and update charts
async function fetchMetricsForCharts() {
    try {
        const response = await fetch('/api/admin/metrics');
        const data = await response.json();
        
        if (!data) return;

        // Use tokenConsumptionByModel for complete breakdown (active + completed sessions)
        const modelData = {};
        
        if (data.tokenConsumptionByModel && Array.isArray(data.tokenConsumptionByModel)) {
            data.tokenConsumptionByModel.forEach(model => {
                if (!model.model) return;
                
                modelData[model.model] = {
                    inputTokens: model.inputTokens || 0,
                    outputTokens: model.outputTokens || 0,
                    cachedTokens: model.cachedTokens || 0,
                    totalTokens: model.totalTokens || 0,
                    sessionCount: model.sessionCount || 0
                };
            });
        }
        
        updateTokenConsumptionCharts(modelData);
    } catch (error) {
        console.error('Error fetching metrics for charts:', error);
    }
}

// Update token consumption charts
function updateTokenConsumptionCharts(modelData) {
    const colors = getChartColors();
    
    const models = Object.keys(modelData);
    const inputTokens = models.map(m => modelData[m].inputTokens);
    const outputTokens = models.map(m => modelData[m].outputTokens);
    const cachedTokens = models.map(m => modelData[m].cachedTokens);
    const costs = models.map(m => modelData[m].estimatedCost);

    // Token Consumption Chart (Stacked Bar)
    const tokenCtx = document.getElementById('pricingChart');
    if (tokenCtx) {
        if (pricingChart) {
            pricingChart.destroy();
        }

        pricingChart = new Chart(tokenCtx, {
            type: 'bar',
            data: {
                labels: models.length > 0 ? models : ['No Data'],
                datasets: [
                    {
                        label: 'Input Tokens',
                        data: inputTokens,
                        backgroundColor: colors.primary,
                        borderColor: colors.primary,
                        borderWidth: 0,
                        stack: 'tokenStack'
                    },
                    {
                        label: 'Output Tokens',
                        data: outputTokens,
                        backgroundColor: colors.secondary,
                        borderColor: colors.secondary,
                        borderWidth: 0,
                        stack: 'tokenStack'
                    },
                    {
                        label: 'Cached Tokens',
                        data: cachedTokens,
                        backgroundColor: colors.success,
                        borderColor: colors.success,
                        borderWidth: 0,
                        stack: 'tokenStack'
                    }
                ]
            },
            options: {
                indexAxis: 'x',
                responsive: true,
                maintainAspectRatio: true,
                animation: false,
                scales: {
                    x: {
                        stacked: true,
                        ticks: { color: colors.text },
                        grid: { color: colors.grid }
                    },
                    y: {
                        stacked: true,
                        ticks: { color: colors.text },
                        grid: { color: colors.grid },
                        title: { display: true, text: 'Tokens', color: colors.text }
                    }
                },
                plugins: {
                    legend: {
                        display: true,
                        labels: { color: colors.text }
                    },
                    tooltip: {
                        backgroundColor: colors.background,
                        titleColor: colors.text,
                        bodyColor: colors.text
                    }
                }
            }
        });
    }

    // Cost Distribution Chart (Stacked Bar)
    const costCtx = document.getElementById('costDistributionChart');
    if (costCtx) {
        if (costDistributionChart) {
            costDistributionChart.destroy();
        }

        // Calculate cost breakdown per model based on token type
        const pricingTable = document.querySelectorAll('#pricingTable tr[data-model]');
        const modelPricing = {};
        pricingTable.forEach(row => {
            modelPricing[row.dataset.model] = {
                input: parseFloat(row.dataset.input),
                output: parseFloat(row.dataset.output)
            };
        });

        const inputCosts = models.map(m => {
            const pricing = modelPricing[m] || { input: 0 };
            return (modelData[m].inputTokens * pricing.input) / 1000;
        });

        const outputCosts = models.map(m => {
            const pricing = modelPricing[m] || { output: 0 };
            return (modelData[m].outputTokens * pricing.output) / 1000;
        });

        const cachedCosts = models.map(m => {
            // Cached tokens typically have reduced cost (usually 90% discount)
            const pricing = modelPricing[m] || { input: 0 };
            return (modelData[m].cachedTokens * pricing.input * 0.1) / 1000;
        });

        costDistributionChart = new Chart(costCtx, {
            type: 'bar',
            data: {
                labels: models.length > 0 ? models : ['No Data'],
                datasets: [
                    {
                        label: 'Input Cost ($)',
                        data: inputCosts,
                        backgroundColor: colors.primary,
                        borderColor: colors.primary,
                        borderWidth: 0,
                        stack: 'costStack'
                    },
                    {
                        label: 'Output Cost ($)',
                        data: outputCosts,
                        backgroundColor: colors.secondary,
                        borderColor: colors.secondary,
                        borderWidth: 0,
                        stack: 'costStack'
                    },
                    {
                        label: 'Cached Cost ($)',
                        data: cachedCosts,
                        backgroundColor: colors.success,
                        borderColor: colors.success,
                        borderWidth: 0,
                        stack: 'costStack'
                    }
                ]
            },
            options: {
                indexAxis: 'x',
                responsive: true,
                maintainAspectRatio: true,
                animation: false,
                scales: {
                    x: {
                        stacked: true,
                        ticks: { color: colors.text },
                        grid: { color: colors.grid }
                    },
                    y: {
                        stacked: true,
                        ticks: { color: colors.text },
                        grid: { color: colors.grid },
                        title: { display: true, text: 'Cost ($)', color: colors.text }
                    }
                },
                plugins: {
                    legend: {
                        display: true,
                        labels: { color: colors.text }
                    },
                    tooltip: {
                        backgroundColor: colors.background,
                        titleColor: colors.text,
                        bodyColor: colors.text,
                        callbacks: {
                            label: function(context) {
                                const label = context.dataset.label || '';
                                const value = context.raw || 0;
                                return label + ': $' + value.toFixed(4);
                            }
                        }
                    }
                }
            }
        });
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
        
        // Update cost metrics
        const totalCostElement = document.getElementById('totalCost');
        if (totalCostElement) {
            const costValue = data.totalEstimatedCost || 0;
            const formattedCost = costValue.toLocaleString('it-IT', { 
                style: 'currency', 
                currency: 'EUR',
                minimumFractionDigits: 2,
                maximumFractionDigits: 2
            });
            totalCostElement.textContent = formattedCost;
        }
        
        // Update session metrics
        const activeSessionsElement = document.getElementById('activeSessions');
        if (activeSessionsElement) {
            animateNumber(activeSessionsElement, data.activeSessionCount);
            // Hide the element after animation (500ms)
            setTimeout(() => {
                activeSessionsElement.style.opacity = '0';
                activeSessionsElement.style.transition = 'opacity 0.3s ease-out';
            }, 500);
        }
        animateNumber(document.getElementById('queueSize'), data.queueSize);
        
        // Update used models
        updateUsedModels(data.usedModels);
        
        // Update token consumption breakdown per model
        updateTokenConsumptionByModelUI(data.tokenConsumptionByModel);
        
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

// Update token consumption breakdown per model (active + completed sessions)
function updateTokenConsumptionByModelUI(tokenConsumptionByModel) {
    const container = document.getElementById('tokenConsumptionByModelContainer');
    if (!container) return;
    
    if (!tokenConsumptionByModel || tokenConsumptionByModel.length === 0) {
        container.innerHTML = `
            <div class="no-data-message">
                <p>Nessun consumo di token registrato</p>
            </div>
        `;
        return;
    }
    
    // Sort by total tokens descending
    const sortedModels = tokenConsumptionByModel.sort((a, b) => b.totalTokens - a.totalTokens);
    
    container.innerHTML = `
        <div class="token-consumption-table">
            <div class="table-header">
                <div class="column model-col">Modello</div>
                <div class="column tokens-col">Token Input</div>
                <div class="column tokens-col">Token Output</div>
                <div class="column tokens-col">Token Cache</div>
                <div class="column tokens-col">Totale</div>
                <div class="column sessions-col">Sessioni</div>
            </div>
            ${sortedModels.map(model => `
                <div class="table-row">
                    <div class="column model-col"><strong>${escapeHtml(model.model)}</strong></div>
                    <div class="column tokens-col">${(model.inputTokens).toLocaleString('it-IT')}</div>
                    <div class="column tokens-col">${(model.outputTokens).toLocaleString('it-IT')}</div>
                    <div class="column tokens-col">${(model.cachedTokens).toLocaleString('it-IT')}</div>
                    <div class="column tokens-col"><strong>${(model.totalTokens).toLocaleString('it-IT')}</strong></div>
                    <div class="column sessions-col">${model.sessionCount}</div>
                </div>
            `).join('')}
        </div>
    `;
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

    // Auto-refresh metrics and charts every 5 seconds
    setInterval(() => {
        fetchMetrics();
        initializeCharts();
    }, 5000);

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
