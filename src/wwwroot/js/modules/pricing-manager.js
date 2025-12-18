/**
 * Pricing Manager Module
 * 
 * Manages model pricing configuration and cost calculations.
 * Loads pricing from server and calculates token costs.
 */

export class PricingManager {
  constructor() {
    // Model pricing configuration (in USD per 1K tokens)
    this.modelPrices = {
      'gpt-4o': { input: 0.00250, output: 0.01000, cached: 0.00125 },
      'gpt-4o-mini': { input: 0.00015, output: 0.00060, cached: 0.000075 },
      'gpt-4-turbo': { input: 0.01000, output: 0.03000, cached: 0.00500 },
      'gpt-4': { input: 0.03000, output: 0.06000, cached: 0.01500 },
      'gpt-3.5-turbo': { input: 0.00050, output: 0.00150, cached: 0.00025 },
      'gpt-5-nano': { input: 0.0129730, output: 0.0285406, cached: 0.0000346 },
      'phi4-mm-realtime': { input: 0.0034595, output: 0.0285406, cached: 0.0000346 },
      'phi4-mini': { input: 0.0129730, output: 0.0285406, cached: 0.0000346 },
      'gpt-realtime-mini': { input: 0.0095136, output: 0.0190271, cached: 0.0002855 },
      'gpt-4.1-mini': { input: 0.0129730, output: 0.0285406, cached: 0.0002855 },
      'gpt-5-mini': { input: 0.0129730, output: 0.0285406, cached: 0.0002855 },
      'gpt-realtime': { input: 0.0380541, output: 0.0761082, cached: 0.0023784 },
      'default': { input: 0.00100, output: 0.00200, cached: 0.00050 }
    };
  }

  /**
   * Load pricing from server and update modelPrices
   * @async
   */
  async loadServerPricing() {
    try {
      const resp = await fetch('/api/admin/pricing/list', { cache: 'no-store' });
      if (!resp.ok) return;
      
      const json = await resp.json();
      const list = Array.isArray(json) ? json : (Array.isArray(json?.pricing) ? json.pricing : []);
      
      list.forEach(p => {
        const model = p.modelName || p.model || p.name;
        if (!model) return;
        
        const input = (p.inputTokenCost || p.inputTokenCost === 0) ? p.inputTokenCost : undefined;
        const output = (p.outputTokenCost || p.outputTokenCost === 0) ? p.outputTokenCost : undefined;
        const cached = (p.cachedInputTokenCost || p.cachedInputTokenCost === 0) ? p.cachedInputTokenCost : undefined;

        this.modelPrices[model] = {
          input: (input !== undefined) ? input : (this.modelPrices[model]?.input ?? this.modelPrices['default'].input),
          output: (output !== undefined) ? output : (this.modelPrices[model]?.output ?? this.modelPrices['default'].output),
          cached: (cached !== undefined) ? cached : (this.modelPrices[model]?.cached ?? this.modelPrices['default'].cached)
        };
      });
    } catch (error) {
      console.error('[PricingManager] Error loading server pricing:', error);
    }
  }

  /**
   * Calculate costs for token usage
   * @param {string} modelName - Model identifier
   * @param {Object} tokenUsage - Token usage object with input, output, cached properties
   * @returns {Object} Cost breakdown
   */
  calculateCosts(modelName, tokenUsage) {
    const pricing = this.modelPrices[modelName] || this.modelPrices['default'];
    const input = (tokenUsage.input / 1000) * pricing.input;
    const output = (tokenUsage.output / 1000) * pricing.output;
    const cached = (tokenUsage.cached / 1000) * pricing.cached;
    
    return {
      input,
      output,
      cached,
      total: input + output + cached
    };
  }

  /**
   * Get pricing for a specific model and token type
   * @param {string} modelName - Model identifier
   * @param {string} tokenType - 'input', 'output', or 'cached'
   * @returns {number} Price per 1K tokens
   */
  getPrice(modelName, tokenType) {
    return this.modelPrices[modelName]?.[tokenType] || this.modelPrices['default'][tokenType];
  }

  /**
   * Update pricing for a specific model
   * @param {string} modelName - Model identifier
   * @param {Object} prices - Price object with input, output, cached properties
   */
  setPrice(modelName, prices) {
    this.modelPrices[modelName] = {
      input: prices.input ?? this.modelPrices['default'].input,
      output: prices.output ?? this.modelPrices['default'].output,
      cached: prices.cached ?? this.modelPrices['default'].cached
    };
  }
}
