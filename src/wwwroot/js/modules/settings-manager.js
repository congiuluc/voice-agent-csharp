/**
 * Settings Manager Module
 * 
 * Centralized management for application settings persistence.
 * Handles localStorage operations with fallback to in-memory storage.
 */

export class SettingsManager {
  /**
   * Initialize settings manager
   * @param {string} storageKey - LocalStorage key for persistence
   * @param {Object} defaultSettings - Default settings object
   */
  constructor(storageKey = 'voiceAgentSettings', defaultSettings = {}) {
    this.storageKey = storageKey;
    this.defaultSettings = defaultSettings;
    this.settings = this.load();
  }

  /**
   * Load settings from localStorage
   * @private
   * @returns {Object} Loaded or default settings
   */
  load() {
    try {
      const stored = localStorage.getItem(this.storageKey);
      if (!stored) return { ...this.defaultSettings };
      
      const parsed = JSON.parse(stored);
      return { ...this.defaultSettings, ...parsed };
    } catch (error) {
      console.error(`[SettingsManager] Error loading settings from "${this.storageKey}":`, error);
      return { ...this.defaultSettings };
    }
  }

  /**
   * Save settings to localStorage
   * @param {Object} newSettings - Settings to save (merges with existing)
   * @returns {boolean} Success indicator
   */
  save(newSettings) {
    try {
      this.settings = { ...this.settings, ...newSettings };
      localStorage.setItem(this.storageKey, JSON.stringify(this.settings));
      return true;
    } catch (error) {
      console.error(`[SettingsManager] Error saving settings to "${this.storageKey}":`, error);
      return false;
    }
  }

  /**
   * Get a setting value
   * @param {string} key - Setting key
   * @param {*} defaultValue - Default value if key doesn't exist
   * @returns {*} Setting value
   */
  get(key, defaultValue = null) {
    return this.settings.hasOwnProperty(key) ? this.settings[key] : defaultValue;
  }

  /**
   * Set a single setting value
   * @param {string} key - Setting key
   * @param {*} value - Setting value
   * @returns {boolean} Success indicator
   */
  set(key, value) {
    this.settings[key] = value;
    return this.save({});
  }

  /**
   * Get multiple settings
   * @param {Array<string>} keys - Setting keys to retrieve
   * @returns {Object} Settings object
   */
  getMultiple(keys) {
    const result = {};
    keys.forEach(key => {
      result[key] = this.settings[key];
    });
    return result;
  }

  /**
   * Check if a setting exists
   * @param {string} key - Setting key
   * @returns {boolean} True if setting exists
   */
  has(key) {
    return this.settings.hasOwnProperty(key);
  }

  /**
   * Delete a setting
   * @param {string} key - Setting key
   * @returns {boolean} Success indicator
   */
  delete(key) {
    if (this.settings.hasOwnProperty(key)) {
      delete this.settings[key];
      return this.save({});
    }
    return false;
  }

  /**
   * Clear all settings and restore defaults
   * @returns {boolean} Success indicator
   */
  reset() {
    this.settings = { ...this.defaultSettings };
    try {
      localStorage.removeItem(this.storageKey);
      return true;
    } catch (error) {
      console.error(`[SettingsManager] Error resetting settings:`, error);
      return false;
    }
  }

  /**
   * Get all settings
   * @returns {Object} All settings
   */
  getAll() {
    return { ...this.settings };
  }

  /**
   * Clear all settings (without restoring defaults)
   * @returns {boolean} Success indicator
   */
  clear() {
    this.settings = {};
    try {
      localStorage.removeItem(this.storageKey);
      return true;
    } catch (error) {
      console.error(`[SettingsManager] Error clearing settings:`, error);
      return false;
    }
  }
}
