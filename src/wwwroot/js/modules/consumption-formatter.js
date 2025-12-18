/**
 * Consumption Formatter Module
 * 
 * Centralized formatting utilities for consumption tracker data.
 */

export class ConsumptionFormatter {
  /**
   * Format number with locale-specific separators
   * @param {number} num - Number to format
   * @returns {string} Formatted number
   */
  static formatNumber(num) {
    return num.toLocaleString();
  }

  /**
   * Format duration in milliseconds to human-readable format
   * @param {number} ms - Duration in milliseconds
   * @returns {string} Formatted duration
   */
  static formatDuration(ms) {
    if (ms < 1000) return `${ms.toFixed(0)}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(2)}s`;
    
    const minutes = Math.floor(ms / 60000);
    const seconds = ((ms % 60000) / 1000).toFixed(2);
    return `${minutes}m ${seconds}s`;
  }

  /**
   * Format sample rate to human-readable format
   * @param {number} rate - Sample rate in Hz
   * @returns {string} Formatted sample rate
   */
  static formatSampleRate(rate) {
    return rate >= 1000 ? `${(rate / 1000).toFixed(0)}kHz` : `${rate}Hz`;
  }

  /**
   * Format large numbers in compact notation (1M, 1K, etc.)
   * @param {number} num - Number to format
   * @returns {string} Compact formatted number
   */
  static formatCompactNumber(num) {
    if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
    if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
    return num.toString();
  }

  /**
   * Truncate ID for display
   * @param {string} id - ID to truncate
   * @returns {string} Truncated ID
   */
  static truncateId(id) {
    if (!id || id.length <= 16) return id || '-';
    return `${id.substring(0, 8)}...${id.substring(id.length - 4)}`;
  }

  /**
   * Escape HTML special characters
   * @param {string} text - Text to escape
   * @returns {string} Escaped HTML
   */
  static escapeHtml(text) {
    const map = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;'
    };
    return String(text).replace(/[&<>"']/g, m => map[m]);
  }

  /**
   * Format currency value
   * @param {number} value - Value in USD
   * @param {number} decimals - Number of decimal places
   * @returns {string} Formatted currency
   */
  static formatCurrency(value, decimals = 4) {
    return `$${value.toFixed(decimals)}`;
  }

  /**
   * Format percentage
   * @param {number} value - Percentage value (0-100)
   * @param {number} decimals - Number of decimal places
   * @returns {string} Formatted percentage
   */
  static formatPercentage(value, decimals = 0) {
    return `${value.toFixed(decimals)}%`;
  }
}
