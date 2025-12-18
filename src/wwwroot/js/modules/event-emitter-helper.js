/**
 * Event Emitter Helper Module
 * 
 * Provides utilities for managing event listeners and handlers.
 */

export class EventEmitterHelper {
  /**
   * @param {Object} eventBus - Event emitter instance
   */
  constructor(eventBus) {
    this.eventBus = eventBus;
    this.listeners = [];
  }

  /**
   * Register a single event listener
   * @param {string} eventName - Event name
   * @param {Function} handler - Event handler
   */
  on(eventName, handler) {
    if (this.eventBus && typeof this.eventBus.on === 'function') {
      this.eventBus.on(eventName, handler);
      this.listeners.push({ eventName, handler });
    }
  }

  /**
   * Register multiple event listeners from a map
   * @param {Object} handlerMap - Object with event names as keys and handlers as values
   * @param {Object} context - Context to bind handlers to (optional)
   */
  registerHandlers(handlerMap, context) {
    Object.entries(handlerMap).forEach(([event, handler]) => {
      const boundHandler = context ? handler.bind(context) : handler;
      this.on(event, boundHandler);
    });
  }

  /**
   * Unregister a specific event listener
   * @param {string} eventName - Event name
   * @param {Function} handler - Event handler
   */
  off(eventName, handler) {
    if (this.eventBus && typeof this.eventBus.off === 'function') {
      this.eventBus.off(eventName, handler);
      this.listeners = this.listeners.filter(
        l => !(l.eventName === eventName && l.handler === handler)
      );
    }
  }

  /**
   * Unregister all event listeners
   */
  unregisterAll() {
    this.listeners.forEach(({ eventName, handler }) => {
      if (this.eventBus && typeof this.eventBus.off === 'function') {
        this.eventBus.off(eventName, handler);
      }
    });
    this.listeners = [];
  }

  /**
   * Get count of registered listeners
   * @returns {number} Number of listeners
   */
  getListenerCount() {
    return this.listeners.length;
  }

  /**
   * Check if a specific listener is registered
   * @param {string} eventName - Event name
   * @returns {boolean} True if listener exists
   */
  hasListener(eventName) {
    return this.listeners.some(l => l.eventName === eventName);
  }
}
