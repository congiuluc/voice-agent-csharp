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
    // Observe theme changes and re-render charts when theme changes
    const observer = new MutationObserver((mutations) => {
        for (const m of mutations) {
            if (m.attributeName === 'data-theme' || m.attributeName === 'class') {
                // Re-fetch colors and redraw charts
                updateTokenConsumptionCharts(_latestModelData || {});
            }
        }
    });
    observer.observe(document.documentElement, { attributes: true });
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
        
        // store latest raw modelData for redraws
        window._latestModelData = modelData;
        updateTokenConsumptionCharts(modelData);
    } catch (error) {
        console.error('Error fetching metrics for charts:', error);
    }
}

// Update token consumption charts
function updateTokenConsumptionCharts(modelData) {
    const colors = getChartColors();

    // Preserve original keys (could be agent ids) and map to friendly labels for display
    const modelKeys = Object.keys(modelData);
    const models = modelKeys.map(k => mapAgentOrModelKeyToLabel(k));
    // Use modelKeys for numeric lookups (they are the original keys in modelData)
    const inputTokens = modelKeys.map(k => (modelData[k] && modelData[k].inputTokens) ? modelData[k].inputTokens : 0);
    const outputTokens = modelKeys.map(k => (modelData[k] && modelData[k].outputTokens) ? modelData[k].outputTokens : 0);
    const cachedTokens = modelKeys.map(k => (modelData[k] && modelData[k].cachedTokens) ? modelData[k].cachedTokens : 0);

    // Token Consumption Chart (Stacked Bar)
    const tokenCtx = document.getElementById('pricingChart');
    if (tokenCtx) {
        if (pricingChart) {
            pricingChart.destroy();
        }

        pricingChart = new Chart(tokenCtx, {
            type: 'bar',
            data: {
                // labels shown to users
                labels: models.length > 0 ? models : [window.APP_RESOURCES?.NoData || 'No Data'],
                datasets: [
                    {
                        label: window.APP_RESOURCES?.InputTokens || 'Input Tokens',
                        data: inputTokens,
                        backgroundColor: colors.primary,
                        borderColor: colors.primary,
                        borderWidth: 0,
                        stack: 'tokenStack'
                    },
                    {
                        label: window.APP_RESOURCES?.OutputTokens || 'Output Tokens',
                        data: outputTokens,
                        backgroundColor: colors.secondary,
                        borderColor: colors.secondary,
                        borderWidth: 0,
                        stack: 'tokenStack'
                    },
                    {
                        label: window.APP_RESOURCES?.CacheTokens || 'Cached Tokens',
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
                // allow chart to grow vertically so long labels have room
                maintainAspectRatio: false,
                animation: false,
                layout: {
                    padding: {
                        top: 8,
                        right: 8,
                        bottom: 48,
                        left: 8
                    }
                },
                scales: {
                    x: {
                        stacked: true,
                        ticks: {
                            color: colors.text,
                            autoSkip: false,
                            maxRotation: 45,
                            minRotation: 30,
                            // Use helper function for better readability
                            callback: formatChartLabel
                        },
                        grid: { color: colors.grid }
                    },
                    y: {
                        stacked: true,
                        ticks: { color: colors.text },
                        grid: { color: colors.grid },
                        title: { display: true, text: window.APP_RESOURCES?.TokensLabel || 'Tokens', color: colors.text }
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
                output: parseFloat(row.dataset.output),
                cached: row.dataset.cached ? parseFloat(row.dataset.cached) : null
            };
        });

        // When model keys are agent ids, we need to map back to original key for numeric lookups
        const inputCosts = modelKeys.map(k => {
            const pricing = modelPricing[k] || modelPricing[mapAgentOrModelKeyToLabel(k)] || { input: 0 };
            return (modelData[k].inputTokens * pricing.input) / 1000;
        });

        const outputCosts = modelKeys.map(k => {
            const pricing = modelPricing[k] || modelPricing[mapAgentOrModelKeyToLabel(k)] || { output: 0 };
            return (modelData[k].outputTokens * pricing.output) / 1000;
        });

        const cachedCosts = modelKeys.map(k => {
            const pricing = modelPricing[k] || modelPricing[mapAgentOrModelKeyToLabel(k)] || { input: 0, cached: null };
            if (pricing.cached !== null && !isNaN(pricing.cached)) {
                return (modelData[k].cachedTokens * pricing.cached) / 1000;
            }
            return (modelData[k].cachedTokens * pricing.input * 0.1) / 1000;
        });

        costDistributionChart = new Chart(costCtx, {
            type: 'bar',
            data: {
                labels: models.length > 0 ? models : [window.APP_RESOURCES?.NoData || 'No Data'],
                datasets: [
                    {
                        label: window.APP_RESOURCES?.InputCostChart || 'Input Cost ($)',
                        data: inputCosts,
                        backgroundColor: colors.primary,
                        borderColor: colors.primary,
                        borderWidth: 0,
                        stack: 'costStack'
                    },
                    {
                        label: window.APP_RESOURCES?.OutputCostChart || 'Output Cost ($)',
                        data: outputCosts,
                        backgroundColor: colors.secondary,
                        borderColor: colors.secondary,
                        borderWidth: 0,
                        stack: 'costStack'
                    },
                    {
                        label: window.APP_RESOURCES?.CachedCostChart || 'Cached Cost ($)',
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
                maintainAspectRatio: false,
                animation: false,
                layout: {
                    padding: {
                        top: 8,
                        right: 8,
                        bottom: 56,
                        left: 8
                    }
                },
                scales: {
                    x: {
                        stacked: true,
                        ticks: {
                            color: colors.text,
                            autoSkip: false,
                            maxRotation: 45,
                            minRotation: 30,
                            // Use helper function for better readability
                            callback: formatChartLabel
                        },
                        grid: { color: colors.grid }
                    },
                    y: {
                        stacked: true,
                        ticks: { color: colors.text },
                        grid: { color: colors.grid },
                        title: { display: true, text: window.APP_RESOURCES?.CostLabel || 'Cost ($)', color: colors.text }
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

/**
 * Map an incoming model key (could be an agent id) to a friendly label.
 * Strategy:
 * - If the key matches a data-model in the pricing table, use that human name.
 * - If the key looks like an agent id (contains underscores or is long), try to shorten it.
 */
function mapAgentOrModelKeyToLabel(key) {
    if (!key) return '';
    // Try find pricing table row that matches data-model attribute
    const row = document.querySelector(`#pricingTable tr[data-model='${CSS.escape(key)}']`);
    if (row) {
        // Use the display name cell if present
        const display = row.querySelector('.model-name');
        if (display && display.textContent.trim().length > 0) return display.textContent.trim();
        // fallback to dataset model
        return row.dataset.model;
    }

    // If key contains a recognizable model id like 'gpt-' keep as-is
    if (/gpt[-_\d\.a-z]/i.test(key) || key.toLowerCase().includes('phi') || key.toLowerCase().includes('realtime')) {
        return key;
    }

    // If it's long (agent id), shorten to friendly preview e.g. first 8 + ellipsis
    if (key.length > 16) {
        return key.substring(0, 8) + '...' + key.substring(key.length - 4);
    }

    return key;
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
            showToast(window.APP_RESOURCES?.PriceReloadedSuccessfully || 'Prices reloaded successfully!', 'success');
            setTimeout(() => location.reload(), 1000);
        } else {
            showToast(window.APP_RESOURCES?.PriceReloadError || 'Error reloading prices', 'error');
        }
    } catch (error) {
        showToast(window.APP_RESOURCES?.Error || 'Error' + ': ' + error.message, 'error');
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

// --- Pricing edit modal and unit selector ---
function openPricingEditModal(row) {
    // Create modal if not present
    let modal = document.getElementById('pricingEditModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'pricingEditModal';
        modal.className = 'pricing-modal';
        modal.innerHTML = `
            <div class="modal-content">
                <h3>${window.APP_RESOURCES?.EditPricing || 'Edit Pricing'} - <span id="modalModelName"></span></h3>
                <div class="modal-row"><label>${window.APP_RESOURCES?.InputCostLabel || 'Input ($):'}</label><input id="modalInput" type="number" step="0.0001"></div>
                <div class="modal-row"><label>${window.APP_RESOURCES?.OutputCostLabel || 'Output ($):'}</label><input id="modalOutput" type="number" step="0.0001"></div>
                <div class="modal-row"><label>${window.APP_RESOURCES?.CachedCostLabel || 'Cached ($):'}</label><input id="modalCached" type="number" step="0.0001"></div>
                <div class="modal-row"><label>${window.APP_RESOURCES?.AvatarCostLabel || 'Avatar ($/min):'}</label><input id="modalAvatar" type="number" step="0.01"></div>
                <div class="modal-row"><label>${window.APP_RESOURCES?.TtsCostLabel || 'TTS ($/1M chars):'}</label><input id="modalTts" type="number" step="0.01"></div>
                <div class="modal-row"><label>${window.APP_RESOURCES?.Units || 'Units:'}</label>
                    <select id="modalUnits">
                        <option value="per1k">${window.APP_RESOURCES?.Per1KTokens || 'Per 1K tokens'}</option>
                        <option value="per1m">${window.APP_RESOURCES?.Per1MTokens || 'Per 1M tokens'}</option>
                    </select>
                </div>
                <div class="modal-actions">
                    <button id="modalSave">${window.APP_RESOURCES?.Save || 'Save'}</button>
                    <button id="modalCancel">${window.APP_RESOURCES?.Cancel || 'Cancel'}</button>
                </div>
                <div id="modalError" class="modal-error" style="display:none;color:var(--color-danger);"></div>
            </div>
        `;
        document.body.appendChild(modal);
    }

    const modelName = row.dataset.model;
    document.getElementById('modalModelName').textContent = modelName;
    document.getElementById('modalInput').value = row.dataset.input || '0';
    document.getElementById('modalOutput').value = row.dataset.output || '0';
    document.getElementById('modalCached').value = row.dataset.cached || '';
    document.getElementById('modalAvatar').value = row.dataset.avatar || '0';
    document.getElementById('modalTts').value = row.dataset.tts || '0';
    // Default units are per-1k (server uses per-1k)
    document.getElementById('modalUnits').value = 'per1k';

    // Hook actions
    document.getElementById('modalSave').onclick = async () => {
        const input = parseFloat(document.getElementById('modalInput').value) || 0;
        const output = parseFloat(document.getElementById('modalOutput').value) || 0;
        const cached = parseFloat(document.getElementById('modalCached').value) || 0;
        const avatar = parseFloat(document.getElementById('modalAvatar').value) || 0;
        const tts = parseFloat(document.getElementById('modalTts').value) || 0;
        const units = document.getElementById('modalUnits').value;

        // Validation: ensure non-negative
        if (input < 0 || output < 0 || cached < 0) {
            showModalError(window.APP_RESOURCES?.ValuesMustBeNonNegative || 'Values must be non-negative');
            return;
        }

        // Build DTO — server expects per-1k values; if admin chose per-1M, set isPerMillion=true
        const dto = {
            modelName: modelName,
            inputTokenCost: input,
            outputTokenCost: output,
            cachedInputTokenCost: cached,
            avatarCostPerMin: avatar,
            ttsCostPer1MChars: tts,
            isPerMillion: units === 'per1m'
        };

        try {
            const resp = await fetch('/api/admin/pricing/upsert', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(dto)
            });

            if (!resp.ok) {
                const err = await resp.json();
                showModalError(err?.error || 'Failed to save');
                return;
            }

            // Success — reload pricing table
            location.reload();
        } catch (e) {
            showModalError(e.message || 'Failed to save');
        }
    };

    document.getElementById('modalCancel').onclick = () => {
        modal.remove();
    };

    modal.style.display = 'block';
}

function showModalError(msg) {
    const el = document.getElementById('modalError');
    if (el) { el.textContent = msg; el.style.display = 'block'; }
}

// Attach click handlers to pricing rows to open modal
function attachPricingRowHandlers() {
    document.querySelectorAll('#pricingTable tr[data-model]').forEach(row => {
        row.style.cursor = 'pointer';
        row.addEventListener('click', () => openPricingEditModal(row));
    });
}

// Call attach on DOM ready
document.addEventListener('DOMContentLoaded', () => attachPricingRowHandlers());

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
    const lang = document.documentElement.lang || 'en-US';
    const interval = setInterval(() => {
        step++;
        const value = Math.round(currentValue + (stepValue * step));
        element.textContent = value.toLocaleString(lang);
        
        if (step >= steps) {
            clearInterval(interval);
            element.textContent = newValue.toLocaleString(lang);
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
            const lang = document.documentElement.lang || 'en-US';
            const formattedCost = costValue.toLocaleString(lang, { 
                style: 'currency', 
                currency: 'USD',
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
            const lang = document.documentElement.lang || 'en-US';
            lastUpdate.textContent = time.toLocaleTimeString(lang, { hour: '2-digit', minute: '2-digit', second: '2-digit' });
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
                <span>${window.APP_RESOURCES?.NoActiveModels || 'No active models'}</span>
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
                <p>${window.APP_RESOURCES?.NoTokenConsumptionRecorded || 'No token consumption recorded'}</p>
            </div>
        `;
        return;
    }
    
    // Sort by total tokens descending
    const sortedModels = tokenConsumptionByModel.sort((a, b) => b.totalTokens - a.totalTokens);
    
    container.innerHTML = `
        <div class="token-consumption-table">
            <div class="table-header">
                <div class="column model-col">${window.APP_RESOURCES?.Model || 'Model'}</div>
                <div class="column tokens-col">${window.APP_RESOURCES?.InputTokens || 'Input Tokens'}</div>
                <div class="column tokens-col">${window.APP_RESOURCES?.OutputTokens || 'Output Tokens'}</div>
                <div class="column tokens-col">${window.APP_RESOURCES?.CacheTokens || 'Cache Tokens'}</div>
                <div class="column tokens-col">${window.APP_RESOURCES?.Total || 'Total'}</div>
                <div class="column sessions-col">${window.APP_RESOURCES?.Sessions || 'Sessions'}</div>
            </div>
            ${sortedModels.map(model => {
                const lang = document.documentElement.lang || 'en-US';
                return `
                <div class="table-row">
                    <div class="column model-col"><strong>${escapeHtml(model.model)}</strong></div>
                    <div class="column tokens-col">${(model.inputTokens).toLocaleString(lang)}</div>
                    <div class="column tokens-col">${(model.outputTokens).toLocaleString(lang)}</div>
                    <div class="column tokens-col">${(model.cachedTokens).toLocaleString(lang)}</div>
                    <div class="column tokens-col"><strong>${(model.totalTokens).toLocaleString(lang)}</strong></div>
                    <div class="column sessions-col">${model.sessionCount}</div>
                </div>
            `}).join('')}
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

/**
 * Helper function to format chart labels with smart wrapping
 * Used in Chart.js ticks callback
 * 
 * @param {number|string} value - The tick value
 * @param {number} index - The tick index
 * @param {Array} values - All tick values
 * @returns {string|Array} - Formatted label (string or array for multi-line)
 */
function formatChartLabel(value, index, values) {
    // 'this' is bound to the scale instance by Chart.js
    const label = this.getLabelForValue(value) || this.getLabelForValue(index) || '';
    
    // Short labels don't need wrapping
    if (label.length <= 20) return label;

    // Split on non-alphanumeric separators (underscore, dash, dot, space)
    const parts = label.split(/[_\-\.\s]+/);
    
    if (parts.length > 1) {
        // Join into two roughly equal halves
        const half = Math.ceil(parts.length / 2);
        // Return an array to create multi-line labels in Chart.js
        // Note: Chart.js supports arrays for multi-line labels, or strings with \n
        return [
            parts.slice(0, half).join(' '),
            parts.slice(half).join(' ')
        ];
    }
    
    // Fallback: hard wrap at 20 chars
    return [
        label.substring(0, 20),
        label.substring(20)
    ];
}

// Export functions for global use
window.refreshData = refreshData;
window.reloadPricing = reloadPricing;
window.fetchMetrics = fetchMetrics;
