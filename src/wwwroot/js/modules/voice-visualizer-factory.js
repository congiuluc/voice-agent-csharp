/**
 * Voice Visualizer Factory Module
 * 
 * Factory for creating and managing voice visualizer instances.
 * Provides a centralized way to load visualizers dynamically.
 */

export class VoiceVisualizerFactory {
  // Available visualizer types and their module paths
  static visualizerMap = {
    'wave': 'voice-visualizer-wave.js',
    'cardio': 'voice-visualizer-cardio.js',
    'vortex': 'voice-visualizer-vortex.js',
    'lines': 'voice-visualizer-lines.js',
    'holographic': 'voice-visualizer-holographic.js',
    'tesseract': 'voice-visualizer-tesseract.js',
    'cortana': 'voice-visualizer-cortana.js'
  };

  /**
   * Create a visualizer instance
   * @async
   * @param {string} type - Visualizer type
   * @param {HTMLCanvasElement} canvas - Canvas element for rendering
   * @returns {Promise<Object>} Visualizer instance
   */
  static async createVisualizer(type, canvas) {
    const modulePath = this.visualizerMap[type];
    
    if (!modulePath) {
      console.warn(`[VoiceVisualizerFactory] Unknown visualizer type: ${type}, falling back to wave`);
      return this.createVisualizer('wave', canvas);
    }

    try {
      const module = await import(`../${modulePath}`);
      return new module.VoiceVisualizer(canvas);
    } catch (error) {
      console.error(`[VoiceVisualizerFactory] Error loading visualizer "${type}":`, error);
      // Fallback to wave visualizer
      if (type !== 'wave') {
        return this.createVisualizer('wave', canvas);
      }
      throw error;
    }
  }

  /**
   * Get list of available visualizer types
   * @returns {Array<string>} Visualizer types
   */
  static getAvailableVisualizers() {
    return Object.keys(this.visualizerMap);
  }

  /**
   * Check if a visualizer type is available
   * @param {string} type - Visualizer type
   * @returns {boolean} True if visualizer is available
   */
  static isAvailable(type) {
    return type in this.visualizerMap;
  }

  /**
   * Preload a visualizer module for faster instantiation
   * @async
   * @param {string} type - Visualizer type
   * @returns {Promise<Object>} Module
   */
  static async preloadVisualizer(type) {
    const modulePath = this.visualizerMap[type];
    if (!modulePath) {
      throw new Error(`Unknown visualizer type: ${type}`);
    }

    try {
      return await import(`../${modulePath}`);
    } catch (error) {
      console.error(`[VoiceVisualizerFactory] Error preloading visualizer "${type}":`, error);
      throw error;
    }
  }

  /**
   * Preload multiple visualizers
   * @async
   * @param {Array<string>} types - Visualizer types to preload
   * @returns {Promise<void>}
   */
  static async preloadVisualizers(types) {
    const promises = types.map(type => 
      this.preloadVisualizer(type).catch(error => {
        console.warn(`[VoiceVisualizerFactory] Failed to preload "${type}":`, error);
      })
    );
    
    await Promise.all(promises);
  }
}
