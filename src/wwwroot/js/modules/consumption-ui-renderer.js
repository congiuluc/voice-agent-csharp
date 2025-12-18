/**
 * Consumption UI Renderer Module
 * 
 * Handles all UI rendering logic for consumption tracker dashboard.
 * Separates presentation from business logic.
 */

import { ConsumptionFormatter } from './consumption-formatter.js';

export class ConsumptionUIRenderer {
  /**
   * Create a token consumption row for a model
   * @param {string} model - Model name
   * @param {Object} usage - Token usage { input, output, cached }
   * @returns {string} HTML for token row
   */
  static createTokenConsumptionRow(model, usage) {
    const totalTokens = usage.input + usage.output + usage.cached;
    if (totalTokens === 0) return '';

    const inputPercent = (usage.input / totalTokens) * 100;
    const outputPercent = (usage.output / totalTokens) * 100;
    const cachedPercent = (usage.cached / totalTokens) * 100;

    return `
      <div class="model-row">
        <div class="model-header">
          <strong>${ConsumptionFormatter.escapeHtml(model)}</strong>
          <span class="model-total">${ConsumptionFormatter.formatNumber(totalTokens)} tokens</span>
        </div>
        <div class="stacked-bar-chart">
          <div class="bar-container">
            ${this.renderSegment('input-segment', inputPercent, `Input ${inputPercent.toFixed(0)}%`, ConsumptionFormatter.formatNumber(usage.input))}
            ${this.renderSegment('output-segment', outputPercent, `Output ${outputPercent.toFixed(0)}%`, ConsumptionFormatter.formatNumber(usage.output))}
            ${this.renderSegment('cached-segment', cachedPercent, `Cached ${cachedPercent.toFixed(0)}%`, ConsumptionFormatter.formatNumber(usage.cached))}
          </div>
        </div>
        <div class="model-details">
          <span class="detail-item input-detail">
            <span class="detail-color input-color"></span>Input: ${ConsumptionFormatter.formatNumber(usage.input)}
          </span>
          <span class="detail-item output-detail">
            <span class="detail-color output-color"></span>Output: ${ConsumptionFormatter.formatNumber(usage.output)}
          </span>
          <span class="detail-item cached-detail">
            <span class="detail-color cached-color"></span>Cached: ${ConsumptionFormatter.formatNumber(usage.cached)}
          </span>
        </div>
      </div>
    `;
  }

  /**
   * Create a cost row for a model
   * @param {string} model - Model name
   * @param {Object} costs - Cost breakdown { input, output, cached, total }
   * @returns {string} HTML for cost row
   */
  static createCostRow(model, costs) {
    const totalCost = costs.total;
    if (totalCost === 0) return '';

    const inputPercent = (costs.input / totalCost) * 100;
    const outputPercent = (costs.output / totalCost) * 100;
    const cachedPercent = (costs.cached / totalCost) * 100;

    return `
      <div class="model-cost-row">
        <div class="model-header">
          <strong>${ConsumptionFormatter.escapeHtml(model)}</strong>
          <span class="model-total">${ConsumptionFormatter.formatCurrency(totalCost)}</span>
        </div>
        <div class="stacked-bar-chart">
          <div class="bar-container">
            ${this.renderSegment('input-segment', inputPercent, `Input ${inputPercent.toFixed(0)}%`, ConsumptionFormatter.formatCurrency(costs.input))}
            ${this.renderSegment('output-segment', outputPercent, `Output ${outputPercent.toFixed(0)}%`, ConsumptionFormatter.formatCurrency(costs.output))}
            ${this.renderSegment('cached-segment', cachedPercent, `Cached ${cachedPercent.toFixed(0)}%`, ConsumptionFormatter.formatCurrency(costs.cached))}
          </div>
        </div>
      </div>
    `;
  }

  /**
   * Render a single bar segment
   * @param {string} className - CSS class for segment
   * @param {number} percent - Percentage width
   * @param {string} label - Display label
   * @param {string} tooltip - Tooltip text
   * @returns {string} HTML for segment
   * @private
   */
  static renderSegment(className, percent, label, tooltip) {
    return percent > 0 ? `
      <div class="bar-segment ${className}" style="width: ${percent}%; flex: ${percent};" title="${tooltip}">
        <span class="segment-label">${percent > 8 ? label : ''}</span>
      </div>
    ` : '';
  }

  /**
   * Create session info display
   * @param {Object} sessionData - Session information
   * @returns {string} HTML for session info
   */
  static createSessionInfo(sessionData) {
    return `
      <div class="session-info">
        <div class="info-row">
          <span class="info-label">Session:</span>
          <span class="info-value">${ConsumptionFormatter.truncateId(sessionData.sessionId)}</span>
        </div>
        <div class="info-row">
          <span class="info-label">Model:</span>
          <span class="info-value">${ConsumptionFormatter.escapeHtml(sessionData.sessionModel || '-')}</span>
        </div>
        <div class="info-row">
          <span class="info-label">Status:</span>
          <span class="info-value status-${sessionData.sessionStatus}">${sessionData.sessionStatus}</span>
        </div>
      </div>
    `;
  }

  /**
   * Create rate limits display
   * @param {Array} rateLimits - Rate limit objects
   * @returns {string} HTML for rate limits
   */
  static createRateLimitsDisplay(rateLimits) {
    if (!rateLimits || rateLimits.length === 0) {
      return '<div class="rate-limits-empty">No rate limits</div>';
    }

    const html = rateLimits.map(limit => `
      <div class="rate-limit-item">
        <div class="limit-header">
          <span class="limit-name">${ConsumptionFormatter.escapeHtml(limit.name || 'Unknown')}</span>
          <span class="limit-value">${limit.remaining}/${limit.limit}</span>
        </div>
        <div class="limit-bar">
          <div class="limit-progress" style="width: ${((limit.limit - limit.remaining) / limit.limit) * 100}%"></div>
        </div>
      </div>
    `).join('');

    return `<div class="rate-limits">${html}</div>`;
  }

  /**
   * Create audio metrics display
   * @param {Object} audioMetrics - Audio metrics
   * @returns {string} HTML for audio metrics
   */
  static createAudioMetricsDisplay(audioMetrics) {
    return `
      <div class="audio-metrics">
        <div class="metric-item">
          <span class="metric-label">Input Duration:</span>
          <span class="metric-value">${ConsumptionFormatter.formatDuration(audioMetrics.inputDuration)}</span>
        </div>
        <div class="metric-item">
          <span class="metric-label">Output Duration:</span>
          <span class="metric-value">${ConsumptionFormatter.formatDuration(audioMetrics.outputDuration)}</span>
        </div>
        <div class="metric-item">
          <span class="metric-label">Input Format:</span>
          <span class="metric-value">${ConsumptionFormatter.escapeHtml(audioMetrics.inputFormat)}</span>
        </div>
        <div class="metric-item">
          <span class="metric-label">Output Format:</span>
          <span class="metric-value">${ConsumptionFormatter.escapeHtml(audioMetrics.outputFormat)}</span>
        </div>
      </div>
    `;
  }
}
