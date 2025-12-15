/**
 * Consumption Tracker Module
 * 
 * Tracks session, response, and token consumption for Voice Live API.
 * Provides real-time updates to the consumption dashboard.
 */

/**
 * ConsumptionTracker class
 * Manages tracking of Voice Live API usage and consumption
 */
export class ConsumptionTracker {
  constructor() {
    // Session tracking
    this.sessionId = null;
    this.sessionModel = null;
    this.sessionStartTime = null;
    this.sessionStatus = 'disconnected';
    
    // Audio configuration (from session)
    this.inputAudioSamplingRate = 24000; // Default PCM16 sample rate
    this.outputAudioSamplingRate = 24000;
    this.inputAudioFormat = 'pcm16';
    this.outputAudioFormat = 'pcm16';
    
    // Response tracking
    this.responseCount = 0;
    this.currentResponseId = null;
    this.currentResponseStatus = null;
    
    // Token tracking (cumulative for session)
    this.totalInputTokens = 0;
    this.totalOutputTokens = 0;
    this.totalTokens = 0;
    
    // Audio duration tracking (in milliseconds)
    this.totalInputAudioDurationMs = 0;
    this.totalOutputAudioDurationMs = 0;
    this.currentInputAudioStartMs = null;
    this.currentInputAudioBytes = 0;
    this.currentOutputAudioBytes = 0;
    
    // Audio timestamp tracking for precise output duration
    this.maxOutputAudioEndMs = 0; // Tracks max(audio_offset_ms + audio_duration_ms) for precise duration
    
    // Detailed token breakdown
    this.inputTokenDetails = {
      cachedTokens: 0,
      textTokens: 0,
      audioTokens: 0
    };
    
    this.outputTokenDetails = {
      textTokens: 0,
      audioTokens: 0
    };
    
    // Rate limits
    this.rateLimits = [];
    
    // Model-based token tracking for cost analysis
    this.modelTokenUsage = {}; // { modelName: { input: 0, output: 0, cached: 0 } }
    this.modelCosts = {}; // { modelName: { input: 0, output: 0, cached: 0, total: 0 } }
    
    // Model pricing configuration (in USD per 1K tokens)
    // These values are the per-1M numbers divided by 1000 to match server-side (per-1K) schema
    this.modelPrices = {
      'gpt-4o': { input: 0.00250, output: 0.01000, cached: 0.00125 },
      'gpt-4o-mini': { input: 0.00015, output: 0.00060, cached: 0.000075 },
      'gpt-4-turbo': { input: 0.01000, output: 0.03000, cached: 0.00500 },
      'gpt-4': { input: 0.03000, output: 0.06000, cached: 0.01500 },
      'gpt-3.5-turbo': { input: 0.00050, output: 0.00150, cached: 0.00025 },
      // Added new models (per-1K)
      'gpt-5-nano': { input: 0.0129730, output: 0.0285406, cached: 0.0000346 },
      'phi4-mm-realtime': { input: 0.0034595, output: 0.0285406, cached: 0.0000346 },
      'phi4-mini': { input: 0.0129730, output: 0.0285406, cached: 0.0000346 },
      // mini models requested (per-1K)
      'gpt-realtime-mini': { input: 0.0095136, output: 0.0190271, cached: 0.0002855 },
      'gpt-4o-mini': { input: 0.0129730, output: 0.0285406, cached: 0.0002855 },
      'gpt-4.1-mini': { input: 0.0129730, output: 0.0285406, cached: 0.0002855 },
      'gpt-5-mini': { input: 0.0129730, output: 0.0285406, cached: 0.0002855 },
      'gpt-realtime': { input: 0.0380541, output: 0.0761082, cached: 0.0023784 },
      'default': { input: 0.00100, output: 0.00200, cached: 0.00050 }
    };
    
    // UI elements cache
    this.dashboardElement = null;
    
    // Initialize UI
    this.initializeDashboard();
    // Try to load server-driven pricing to override frontend fallbacks
    this.loadServerPricing();
  }

  /**
   * Load pricing from server and populate modelPrices map.
   * The server returns prices per 1K tokens; frontend expects per 1M tokens
   * in the modelPrices map to preserve the existing calculations. Convert
   * from per-1K to per-1M by multiplying by 1000.
   */
  async loadServerPricing() {
    try {
      const resp = await fetch('/api/admin/pricing/list', { cache: 'no-store' });
      if (!resp.ok) return;
      const json = await resp.json();

      // API historically returned an array at the root, but newer controller returns
      // an object with a `pricing` array. Support both shapes for compatibility.
      const list = Array.isArray(json) ? json : (Array.isArray(json?.pricing) ? json.pricing : []);
      if (list.length === 0) return;

      list.forEach(p => {
        try {
          const model = p.modelName || p.model || p.name;
          if (!model) return;
          // server uses per-1K decimals and frontend now also uses per-1K. Keep values as-is.
          const input = (p.inputTokenCost || p.inputTokenCost === 0) ? p.inputTokenCost : undefined;
          const output = (p.outputTokenCost || p.outputTokenCost === 0) ? p.outputTokenCost : undefined;
          const cached = (p.cachedInputTokenCost || p.cachedInputTokenCost === 0) ? p.cachedInputTokenCost : undefined;

          this.modelPrices[model] = {
            input: (input !== undefined) ? input : (this.modelPrices[model]?.input ?? this.modelPrices['default'].input),
            output: (output !== undefined) ? output : (this.modelPrices[model]?.output ?? this.modelPrices['default'].output),
            cached: (cached !== undefined) ? cached : (this.modelPrices[model]?.cached ?? this.modelPrices['default'].cached)
          };
        } catch (e) {
          console.warn('Failed to process pricing entry', e);
        }
      });
    } catch (e) {
      // network error or not available - keep fallbacks
      console.debug('Could not load server pricing, using frontend fallbacks', e);
    }
  }
  
  /**
   * Initialize the consumption dashboard UI
   */
  initializeDashboard() {
    // Check if dashboard already exists
    this.dashboardElement = document.getElementById('consumptionDashboard');
    if (this.dashboardElement) {
      this.updateDashboard();
      return;
    }
    
    // Create dashboard element
    this.dashboardElement = document.createElement('div');
    this.dashboardElement.id = 'consumptionDashboard';
    this.dashboardElement.className = 'consumption-dashboard';
    this.dashboardElement.innerHTML = this.getDashboardHTML();
    
    // Find a suitable container (after status monitor or at bottom)
    const mainContainer = document.querySelector('.main-container');
    if (mainContainer) {
      mainContainer.appendChild(this.dashboardElement);
    }
    
    // Add toggle button to controls
    this.addToggleButton();
    
    // Initially hidden
    this.dashboardElement.classList.add('hidden');
  }
  
  /**
   * SVG icon definitions for the dashboard
   */
  static ICONS = {
    dashboard: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v18h18"/><path d="M7 16l4-4 4 4 5-6"/></svg>`,
    session: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="M12 5v14"/><circle cx="12" cy="12" r="10"/></svg>`,
    responses: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>`,
    tokens: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="3"/></svg>`,
    audio: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/></svg>`,
    rateLimits: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>`
  };

  /**
   * Get the HTML structure for the dashboard
   */
  getDashboardHTML() {
    return `
      <div class="consumption-header">
        <h3>${ConsumptionTracker.ICONS.dashboard} Consumption Dashboard</h3>
        <button id="closeDashboard" class="close-dashboard-btn" title="Chiudi dashboard">×</button>
      </div>
      <div class="consumption-body">
        <!-- Session Section -->
        <div class="consumption-section">
          <h4>${ConsumptionTracker.ICONS.session} Session</h4>
          <div class="consumption-grid">
            <div class="consumption-item">
              <span class="consumption-label">Session ID:</span>
              <span class="consumption-value" id="dashSessionId">-</span>
            </div>
            <div class="consumption-item">
              <span class="consumption-label">Model:</span>
              <span class="consumption-value" id="dashSessionModel">-</span>
            </div>
            <div class="consumption-item">
              <span class="consumption-label">Status:</span>
              <span class="consumption-value consumption-status" id="dashSessionStatus">Disconnected</span>
            </div>
            <div class="consumption-item">
              <span class="consumption-label">Duration:</span>
              <span class="consumption-value" id="dashSessionDuration">-</span>
            </div>
          </div>
        </div>
        
        <!-- Response Section -->
        <div class="consumption-section">
          <h4>${ConsumptionTracker.ICONS.responses} Responses</h4>
          <div class="consumption-grid">
            <div class="consumption-item">
              <span class="consumption-label">Response Count:</span>
              <span class="consumption-value consumption-count" id="dashResponseCount">0</span>
            </div>
            <div class="consumption-item">
              <span class="consumption-label">Current Response:</span>
              <span class="consumption-value" id="dashCurrentResponse">-</span>
            </div>
            <div class="consumption-item">
              <span class="consumption-label">Response Status:</span>
              <span class="consumption-value" id="dashResponseStatus">-</span>
            </div>
          </div>
        </div>
        
        <!-- Token Usage Section -->
        <div class="consumption-section">
          <h4>${ConsumptionTracker.ICONS.tokens} Token Usage</h4>
          <div class="consumption-grid tokens-grid">
            <div class="consumption-item token-item input">
              <span class="consumption-label">Input Tokens:</span>
              <span class="consumption-value consumption-tokens" id="dashInputTokens">0</span>
            </div>
            <div class="consumption-item token-item output">
              <span class="consumption-label">Output Tokens:</span>
              <span class="consumption-value consumption-tokens" id="dashOutputTokens">0</span>
            </div>
            <div class="consumption-item token-item total">
              <span class="consumption-label">Total Tokens:</span>
              <span class="consumption-value consumption-tokens consumption-total" id="dashTotalTokens">0</span>
            </div>
          </div>
          
          <!-- Token Details -->
          <div class="token-details">
            <div class="token-detail-section">
              <h5>Input Details</h5>
              <div class="token-detail-grid">
                <span>Text: <strong id="dashInputText">0</strong></span>
                <span>Audio: <strong id="dashInputAudio">0</strong></span>
                <span>Cached: <strong id="dashInputCached">0</strong></span>
              </div>
            </div>
            <div class="token-detail-section">
              <h5>Output Details</h5>
              <div class="token-detail-grid">
                <span>Text: <strong id="dashOutputText">0</strong></span>
                <span>Audio: <strong id="dashOutputAudio">0</strong></span>
              </div>
            </div>
          </div>
        </div>
        
        <!-- Audio Duration Section -->
        <div class="consumption-section">
          <h4>${ConsumptionTracker.ICONS.audio} Audio Duration</h4>
          <div class="consumption-grid audio-grid">
            <div class="consumption-item audio-item input">
              <span class="consumption-label">Input Audio:</span>
              <span class="consumption-value" id="dashInputAudioDuration">0.00s</span>
            </div>
            <div class="consumption-item audio-item output">
              <span class="consumption-label">Output Audio:</span>
              <span class="consumption-value" id="dashOutputAudioDuration">0.00s</span>
            </div>
            <div class="consumption-item audio-item total">
              <span class="consumption-label">Total Audio:</span>
              <span class="consumption-value consumption-total" id="dashTotalAudioDuration">0.00s</span>
            </div>
          </div>
          <div class="audio-format-info">
            <span>Format: <strong id="dashAudioFormat">pcm16</strong></span>
            <span>Sample Rate: <strong id="dashSampleRate">24kHz</strong></span>
          </div>
        </div>
        
        <!-- Rate Limits Section -->
        <div class="consumption-section" id="rateLimitsSection" style="display: none;">
          <h4>${ConsumptionTracker.ICONS.rateLimits} Rate Limits</h4>
          <div class="rate-limits-grid" id="dashRateLimits">
          </div>
        </div>
        
        <!-- Token Consumption per Model Section -->
        <div class="consumption-section" id="tokenConsumptionPerModelSection">
          <h4>${ConsumptionTracker.ICONS.tokens} Token Consumption per Model</h4>
          <div class="token-consumption-per-model-container" id="dashTokenConsumptionPerModel">
          </div>
        </div>
        
        <!-- Costs per Model Section -->
        <div class="consumption-section" id="costsPerModelSection">
          <h4>💰 Costs per Model</h4>
          <div class="costs-per-model-container" id="dashCostsPerModel">
          </div>
        </div>
      </div>
    `;
  }
  
  /**
   * Add toggle button for the dashboard
   */
  addToggleButton() {
    // Check if button already exists
    if (document.getElementById('dashboardToggle')) return;
    
    const button = document.createElement('button');
    button.id = 'dashboardToggle';
    button.className = 'dashboard-toggle-btn';
    button.title = 'Mostra/Nascondi Consumption Dashboard';
    button.setAttribute('aria-label', 'Toggle consumption dashboard');
    button.innerHTML = `
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M3 3v18h18" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M7 16l4-4 4 4 5-6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
      <span class="dashboard-badge" id="tokenBadge">0</span>
    `;
    
    // Find the start button and insert after it (last in the right column)
    const startButton = document.getElementById('startButton');
    if (startButton && startButton.parentNode) {
      startButton.parentNode.insertBefore(button, startButton.nextSibling);
    } else {
      // Fallback: add to main container
      const mainContainer = document.querySelector('.main-container');
      if (mainContainer) {
        mainContainer.appendChild(button);
      }
    }
    
    // Add event listeners
    button.addEventListener('click', () => this.toggleDashboard());
    
    const closeBtn = document.getElementById('closeDashboard');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => this.hideDashboard());
    }
  }
  
  /**
   * Toggle dashboard visibility
   */
  toggleDashboard() {
    if (this.dashboardElement) {
      this.dashboardElement.classList.toggle('hidden');
      this.dashboardElement.classList.toggle('visible');
    }
  }
  
  /**
   * Show dashboard
   */
  showDashboard() {
    if (this.dashboardElement) {
      this.dashboardElement.classList.remove('hidden');
      this.dashboardElement.classList.add('visible');
    }
  }
  
  /**
   * Hide dashboard
   */
  hideDashboard() {
    if (this.dashboardElement) {
      this.dashboardElement.classList.add('hidden');
      this.dashboardElement.classList.remove('visible');
    }
  }
  
  /**
   * Handle session.created event
   * @param {Object} payload - Session created payload
   */
  handleSessionCreated(payload) {
    if (!payload) return;
    
    const session = payload.session || payload;
    this.sessionId = session.id || session.SessionId || payload.SessionId;
    this.sessionModel = session.model || session.Model || '-';
    this.sessionStartTime = new Date();
    this.sessionStatus = 'connected';
    
    // Extract audio configuration from session
    this.inputAudioFormat = session.input_audio_format || session.InputAudioFormat || 'pcm16';
    this.outputAudioFormat = session.output_audio_format || session.OutputAudioFormat || 'pcm16';
    this.inputAudioSamplingRate = session.input_audio_sampling_rate || session.InputAudioSamplingRate || this.getDefaultSampleRate(this.inputAudioFormat);
    this.outputAudioSamplingRate = this.getOutputSampleRate(this.outputAudioFormat);
    
    // Keep dashboard totals cumulative even across sessions
    this.updateDashboard();
    this.logEvent('SessionCreated', { 
      sessionId: this.sessionId, 
      model: this.sessionModel,
      inputAudioFormat: this.inputAudioFormat,
      outputAudioFormat: this.outputAudioFormat,
      inputSampleRate: this.inputAudioSamplingRate,
      outputSampleRate: this.outputAudioSamplingRate
    });
  }
  
  /**
   * Get default sample rate based on audio format
   */
  getDefaultSampleRate(format) {
    switch (format) {
      case 'g711_ulaw':
      case 'g711_alaw':
        return 8000;
      case 'pcm16':
      default:
        return 24000;
    }
  }
  
  /**
   * Get output sample rate based on audio format
   */
  getOutputSampleRate(format) {
    switch (format) {
      case 'pcm16_8000hz':
      case 'g711_ulaw':
      case 'g711_alaw':
        return 8000;
      case 'pcm16_16000hz':
        return 16000;
      case 'pcm16':
      default:
        return 24000;
    }
  }
  
  /**
   * Handle session.updated event
   * @param {Object} payload - Session updated payload
   */
  handleSessionUpdated(payload) {
    if (!payload) return;
    
    const session = payload.session || payload;
    if (session.model || session.Model) {
      this.sessionModel = session.model || session.Model;
    }
    
    // Update audio configuration if changed
    if (session.input_audio_format || session.InputAudioFormat) {
      this.inputAudioFormat = session.input_audio_format || session.InputAudioFormat;
      this.inputAudioSamplingRate = this.getDefaultSampleRate(this.inputAudioFormat);
    }
    if (session.output_audio_format || session.OutputAudioFormat) {
      this.outputAudioFormat = session.output_audio_format || session.OutputAudioFormat;
      this.outputAudioSamplingRate = this.getOutputSampleRate(this.outputAudioFormat);
    }
    if (session.input_audio_sampling_rate || session.InputAudioSamplingRate) {
      this.inputAudioSamplingRate = session.input_audio_sampling_rate || session.InputAudioSamplingRate;
    }
    
    this.updateDashboard();
  }
  
  /**
   * Handle session disconnection
   */
  handleSessionDisconnected() {
    this.sessionStatus = 'disconnected';
    this.updateDashboard();
  }
  
  /**
   * Handle response.created event
   * @param {Object} payload - Response created payload
   */
  handleResponseCreated(payload) {
    if (!payload) return;
    
    const response = payload.response || payload;
    this.currentResponseId = response.id || response.ResponseId || payload.ResponseId;
    this.currentResponseStatus = response.status || response.Status || 'in_progress';
    this.responseCount++;
    
    this.updateDashboard();
    this.logEvent('ResponseCreated', { responseId: this.currentResponseId, count: this.responseCount });
  }
  
  /**
   * Handle response.done event with token usage
   * @param {Object} payload - Response done payload
   */
  handleResponseDone(payload) {
    if (!payload) return;
    
    const response = payload.response || payload;
    this.currentResponseId = response.id || response.ResponseId || payload.ResponseId || this.currentResponseId;
    this.currentResponseStatus = response.status || response.Status || payload.Status || 'completed';
    
    // Ensure we have a model name - try to extract from response if not already set
    if (!this.sessionModel) {
      this.sessionModel = response.model || response.Model || response.modelName || response.ModelName || response.model_name || response.Model_Name || payload.model || payload.Model || payload.modelName || payload.ModelName || 'unknown';
    }
    
    // Extract usage information
    const usage = response.usage || response.Usage || payload.Usage || response.usage_info || response.UsageInfo || payload.usage || payload.usage_info;
    if (usage) {
      // Be resilient to different naming conventions returned by various API versions
      const inputTokens = usage.input_tokens ?? usage.InputTokens ?? usage.inputTokens ?? usage.input ?? usage.Input ?? usage.inputs ?? 0;
      const outputTokens = usage.output_tokens ?? usage.OutputTokens ?? usage.outputTokens ?? usage.output ?? usage.Output ?? 0;
      const totalTokens = usage.total_tokens ?? usage.TotalTokens ?? usage.totalTokens ?? usage.total ?? (inputTokens + outputTokens);

      this.totalInputTokens += inputTokens;
      this.totalOutputTokens += outputTokens;
      this.totalTokens += totalTokens;

      // Log raw usage for debugging if tokens are unexpectedly zero
      if ((inputTokens + outputTokens) === 0) {
        this.logEvent('ResponseUsageEmpty', { responseId: this.currentResponseId, rawUsage: usage, response, payload });
      } else {
        this.logEvent('ResponseUsage', { responseId: this.currentResponseId, inputTokens, outputTokens, totalTokens });
      }
      
      // Track tokens per model
      if (this.sessionModel && this.sessionModel !== 'unknown') {
        if (!this.modelTokenUsage[this.sessionModel]) {
          this.modelTokenUsage[this.sessionModel] = {
            input: 0,
            output: 0,
            cached: 0
          };
        }
        
        // Extract cached tokens separately (support multiple naming conventions)
        const inputDetails = usage.input_token_details ?? usage.InputTokenDetails ?? usage.inputTokenDetails ?? usage.inputDetails ?? usage.InputDetails ?? {};
        const cachedTokens = inputDetails.cached_tokens ?? inputDetails.CachedTokens ?? inputDetails.cachedTokens ?? inputDetails.Cached ?? 0;

        // Calculate actual input tokens (not including cached)
        const actualInputTokens = Math.max(0, inputTokens - cachedTokens);
        
        // Add to model usage
        this.modelTokenUsage[this.sessionModel].input += actualInputTokens;
        this.modelTokenUsage[this.sessionModel].output += outputTokens;
        this.modelTokenUsage[this.sessionModel].cached += cachedTokens;
        
        // Calculate costs per model
        this.calculateModelCosts();
        
        this.logEvent('ModelTokensTracked', {
          model: this.sessionModel,
          input: actualInputTokens,
          output: outputTokens,
          cached: cachedTokens
        });
      }
      
      // Detailed breakdown
      const inputDetails = usage.input_token_details || usage.InputTokenDetails;
      if (inputDetails) {
        this.inputTokenDetails.cachedTokens += inputDetails.cached_tokens || inputDetails.CachedTokens || 0;
        this.inputTokenDetails.textTokens += inputDetails.text_tokens || inputDetails.TextTokens || 0;
        this.inputTokenDetails.audioTokens += inputDetails.audio_tokens || inputDetails.AudioTokens || 0;
      }
      
      const outputDetails = usage.output_token_details || usage.OutputTokenDetails;
      if (outputDetails) {
        this.outputTokenDetails.textTokens += outputDetails.text_tokens || outputDetails.TextTokens || 0;
        this.outputTokenDetails.audioTokens += outputDetails.audio_tokens || outputDetails.AudioTokens || 0;
      }
      
      this.logEvent('ResponseDone', { 
        responseId: this.currentResponseId,
        status: this.currentResponseStatus,
        inputTokens,
        outputTokens,
        totalTokens,
        cumulativeTotal: this.totalTokens
      });
    }
    
    this.updateDashboard();
    this.updateTokenBadge();
  }
  
  /**
   * Handle rate_limits.updated event
   * @param {Object} payload - Rate limits payload
   */
  handleRateLimitsUpdated(payload) {
    if (!payload) return;
    
    this.rateLimits = payload.rate_limits || payload.RateLimits || [];
    this.updateRateLimitsUI();
  }
  
  /**
   * Handle input_audio_buffer.speech_started event
   * Tracks when user starts speaking
   * @param {Object} payload - Speech started payload
   */
  handleInputAudioSpeechStarted(payload) {
    // Store the local timestamp when speech started
    // Since the SDK doesn't provide audio_start_ms, we track locally
    this.currentInputAudioStartMs = Date.now();
    
    this.logEvent('InputAudioSpeechStarted', { 
      timestamp: this.currentInputAudioStartMs,
      itemId: payload?.item_id || payload?.ItemId
    });
  }
  
  /**
   * Handle input_audio_buffer.speech_stopped event
   * Tracks when user stops speaking and calculates duration
   * @param {Object} payload - Speech stopped payload
   */
  handleInputAudioSpeechStopped(payload) {
    // Calculate duration using local timestamps
    if (this.currentInputAudioStartMs !== null) {
      const endTime = Date.now();
      const durationMs = endTime - this.currentInputAudioStartMs;
      
      if (durationMs > 0) {
        this.totalInputAudioDurationMs += durationMs;
      }
      this.currentInputAudioStartMs = null;
    }
    
    this.updateDashboard();
    this.logEvent('InputAudioSpeechStopped', { 
      itemId: payload?.item_id || payload?.ItemId,
      totalInputDurationMs: this.totalInputAudioDurationMs
    });
  }
  
  /**
   * Handle input_audio_buffer.append event
   * Tracks bytes of input audio for duration estimation
   * @param {Object} payload - Audio append payload
   */
  handleInputAudioBufferAppend(payload) {
    if (!payload || !payload.audio) return;
    
    // Estimate audio duration from base64 audio data
    // Base64 string length * 3/4 = bytes, then calculate duration based on format
    const base64Audio = payload.audio;
    const audioBytes = Math.floor(base64Audio.length * 3 / 4);
    this.currentInputAudioBytes += audioBytes;
  }
  
  /**
   * Handle response.audio.delta event
   * Tracks bytes of output audio for duration calculation
   * @param {Object} payload - Audio delta payload
   */
  handleOutputAudioDelta(payload) {
    if (!payload) return;
    
    // Server sends AudioLength (bytes) directly, not base64 delta
    const audioBytes = payload.AudioLength || payload.audioLength || payload.Length || 0;
    
    if (audioBytes > 0) {
      this.currentOutputAudioBytes += audioBytes;
      
      // Calculate duration: for PCM16 at 24kHz, each sample is 2 bytes
      // Duration (ms) = (bytes / 2 / sampleRate) * 1000
      const durationMs = (audioBytes / 2 / this.outputAudioSamplingRate) * 1000;
      this.totalOutputAudioDurationMs += durationMs;
    }
    
    // Update dashboard less frequently to avoid performance issues
    if (this.currentOutputAudioBytes % 10000 < 1000) {
      this.updateDashboard();
    }
  }
  
  /**
   * Handle response.audio.done event
   * Finalizes output audio tracking for a response
   * @param {Object} payload - Audio done payload
   */
  handleOutputAudioDone(payload) {
    this.updateDashboard();
    this.logEvent('OutputAudioDone', { 
      responseId: payload?.response_id || payload?.ResponseId,
      totalOutputDurationMs: this.totalOutputAudioDurationMs,
      totalOutputBytes: this.currentOutputAudioBytes
    });
  }
  
  /**
   * Handle response.audio_timestamp.delta event
   * Uses precise timestamp information from API for accurate duration tracking
   * @param {Object} payload - Audio timestamp delta payload
   */
  handleAudioTimestampDelta(payload) {
    if (!payload) return;
    
    const audioOffsetMs = payload.audio_offset_ms || payload.AudioOffsetMs || 0;
    const audioDurationMs = payload.audio_duration_ms || payload.AudioDurationMs || 0;
    
    // Calculate the end time of this audio segment
    const audioEndMs = audioOffsetMs + audioDurationMs;
    
    // Track maximum end time for accurate total output duration
    if (audioEndMs > this.maxOutputAudioEndMs) {
      this.maxOutputAudioEndMs = audioEndMs;
      // Update the output duration with more precise timestamp-based value
      this.totalOutputAudioDurationMs = this.maxOutputAudioEndMs;
    }
    
    // Update dashboard periodically
    if (audioOffsetMs % 500 < 100) {
      this.updateDashboard();
    }
    
    this.logEvent('AudioTimestampDelta', { 
      audioOffsetMs,
      audioDurationMs,
      audioEndMs,
      maxOutputAudioEndMs: this.maxOutputAudioEndMs
    });
  }


  


  /**
   * Reset all counters (for new session)
   */
  resetCounters() {
    this.responseCount = 0;
    this.currentResponseId = null;
    this.currentResponseStatus = null;
    this.totalInputTokens = 0;
    this.totalOutputTokens = 0;
    this.totalTokens = 0;
    this.inputTokenDetails = { cachedTokens: 0, textTokens: 0, audioTokens: 0 };
    this.outputTokenDetails = { textTokens: 0, audioTokens: 0 };
    this.rateLimits = [];
    this.modelTokenUsage = {};
    this.modelCosts = {};
    
    // Reset audio duration tracking
    this.totalInputAudioDurationMs = 0;
    this.totalOutputAudioDurationMs = 0;
    this.currentInputAudioStartMs = null;
    this.currentInputAudioBytes = 0;
    this.currentOutputAudioBytes = 0;
    
    // Reset audio timestamp tracking
    this.maxOutputAudioEndMs = 0;
    
    this.updateDashboard();
    this.updateTokenBadge();
  }
  
  /**
   * Update the dashboard UI with current values
   */
  updateDashboard() {
    // Session info
    this.updateElement('dashSessionId', this.sessionId ? this.truncateId(this.sessionId) : '-');
    this.updateElement('dashSessionModel', this.sessionModel || '-');
    this.updateElement('dashSessionStatus', this.sessionStatus, `consumption-status ${this.sessionStatus}`);
    this.updateElement('dashSessionDuration', this.getSessionDuration());
    
    // Response info
    this.updateElement('dashResponseCount', this.responseCount.toString());
    this.updateElement('dashCurrentResponse', this.currentResponseId ? this.truncateId(this.currentResponseId) : '-');
    this.updateElement('dashResponseStatus', this.currentResponseStatus || '-');
    
    // Token counts
    this.updateElement('dashInputTokens', this.formatNumber(this.totalInputTokens));
    this.updateElement('dashOutputTokens', this.formatNumber(this.totalOutputTokens));
    this.updateElement('dashTotalTokens', this.formatNumber(this.totalTokens));
    
    // Token details
    this.updateElement('dashInputText', this.formatNumber(this.inputTokenDetails.textTokens));
    this.updateElement('dashInputAudio', this.formatNumber(this.inputTokenDetails.audioTokens));
    this.updateElement('dashInputCached', this.formatNumber(this.inputTokenDetails.cachedTokens));
    this.updateElement('dashOutputText', this.formatNumber(this.outputTokenDetails.textTokens));
    this.updateElement('dashOutputAudio', this.formatNumber(this.outputTokenDetails.audioTokens));
    
    // Audio duration info
    this.updateElement('dashInputAudioDuration', this.formatDuration(this.totalInputAudioDurationMs));
    this.updateElement('dashOutputAudioDuration', this.formatDuration(this.totalOutputAudioDurationMs));
    this.updateElement('dashTotalAudioDuration', this.formatDuration(this.totalInputAudioDurationMs + this.totalOutputAudioDurationMs));
    this.updateElement('dashAudioFormat', this.outputAudioFormat || 'pcm16');
    this.updateElement('dashSampleRate', this.formatSampleRate(this.outputAudioSamplingRate));
    
    // Update token consumption and costs per model
    this.updateTokenConsumptionPerModelUI();
    this.updateCostsPerModelUI();
  }
  
  /**
   * Calculate costs for each model based on token usage
   */
  calculateModelCosts() {
    for (const modelName in this.modelTokenUsage) {
      const usage = this.modelTokenUsage[modelName];
      const pricing = this.modelPrices[modelName] || this.modelPrices['default'];
      // Pricing values are per 1K tokens. Convert tokens to thousands for cost calculation.
      const inputCost = (usage.input / 1000) * pricing.input;
      const outputCost = (usage.output / 1000) * pricing.output;
      const cachedCost = (usage.cached / 1000) * pricing.cached;
      
      this.modelCosts[modelName] = {
        input: inputCost,
        output: outputCost,
        cached: cachedCost,
        total: inputCost + outputCost + cachedCost
      };
      
      this.logEvent('CalculatedModelCosts', {
        model: modelName,
        tokens: usage,
        pricing: pricing,
        costs: this.modelCosts[modelName]
      });
    }
  }
  
  /**
   * Format duration in milliseconds to human-readable string
   * @param {number} ms - Duration in milliseconds
   * @returns {string} Formatted duration (e.g., "2.35s" or "1m 23.45s")
   */
  formatDuration(ms) {
    if (ms < 1000) {
      return `${ms.toFixed(0)}ms`;
    } else if (ms < 60000) {
      return `${(ms / 1000).toFixed(2)}s`;
    } else {
      const minutes = Math.floor(ms / 60000);
      const seconds = ((ms % 60000) / 1000).toFixed(2);
      return `${minutes}m ${seconds}s`;
    }
  }
  
  /**
   * Format sample rate to human-readable string
   * @param {number} rate - Sample rate in Hz
   * @returns {string} Formatted sample rate (e.g., "24kHz")
   */
  formatSampleRate(rate) {
    if (rate >= 1000) {
      return `${(rate / 1000).toFixed(0)}kHz`;
    }
    return `${rate}Hz`;
  }

  /**
   * Update rate limits UI
   */
  updateRateLimitsUI() {
    const container = document.getElementById('dashRateLimits');
    const section = document.getElementById('rateLimitsSection');
    
    if (!container || !section) return;
    
    if (this.rateLimits.length === 0) {
      section.style.display = 'none';
      return;
    }
    
    section.style.display = 'block';
    container.innerHTML = this.rateLimits.map(limit => `
      <div class="rate-limit-item">
        <span class="rate-limit-name">${limit.name || limit.Name}</span>
        <div class="rate-limit-bar">
          <div class="rate-limit-fill" style="width: ${this.calculateRateLimitPercentage(limit)}%"></div>
        </div>
        <span class="rate-limit-values">${limit.remaining || limit.Remaining}/${limit.limit || limit.Limit}</span>
      </div>
    `).join('');
  }
  
  /**
   * Calculate rate limit usage percentage
   */
  calculateRateLimitPercentage(limit) {
    const max = limit.limit || limit.Limit || 1;
    const remaining = limit.remaining || limit.Remaining || 0;
    return ((max - remaining) / max) * 100;
  }
  
  /**
   * Update token consumption per model UI with stacked bar charts
   */
  updateTokenConsumptionPerModelUI() {
    const container = document.getElementById('dashTokenConsumptionPerModel');
    const section = document.getElementById('tokenConsumptionPerModelSection');
    
    if (!container || !section) return;
    
    const models = Object.keys(this.modelTokenUsage);
    this.logEvent('UpdateTokenConsumptionUI', { modelsCount: models.length, models: models });
    
    if (models.length === 0) {
      section.style.display = 'none';
      return;
    }
    
    section.style.display = 'block';
    
    // Build HTML for each model with stacked bar chart
    container.innerHTML = models.map(model => {
      const usage = this.modelTokenUsage[model];
      return this.createTokenConsumptionRow(model, usage);
    }).join('');
  }
  
  /**
   * Create a token consumption row with stacked bar chart
   */
  createTokenConsumptionRow(model, usage) {
    const totalTokens = usage.input + usage.output + usage.cached;
    
    if (totalTokens === 0) {
      return '';
    }
    
    const inputPercent = (usage.input / totalTokens) * 100;
    const outputPercent = (usage.output / totalTokens) * 100;
    const cachedPercent = (usage.cached / totalTokens) * 100;
    
    return `
      <div class="model-row">
        <div class="model-header">
          <strong>${this.escapeHtml(model)}</strong>
          <span class="model-total">${this.formatNumber(totalTokens)} tokens</span>
        </div>
        <div class="stacked-bar-chart">
          <div class="bar-container">
            ${inputPercent > 0 ? `
              <div class="bar-segment input-segment" style="width: ${inputPercent}%; flex: ${inputPercent};" title="Input: ${this.formatNumber(usage.input)} tokens (${inputPercent.toFixed(1)}%)">
                <span class="segment-label">${inputPercent > 8 ? `Input ${inputPercent.toFixed(0)}%` : ''}</span>
              </div>
            ` : ''}
            ${outputPercent > 0 ? `
              <div class="bar-segment output-segment" style="width: ${outputPercent}%; flex: ${outputPercent};" title="Output: ${this.formatNumber(usage.output)} tokens (${outputPercent.toFixed(1)}%)">
                <span class="segment-label">${outputPercent > 8 ? `Output ${outputPercent.toFixed(0)}%` : ''}</span>
              </div>
            ` : ''}
            ${cachedPercent > 0 ? `
              <div class="bar-segment cached-segment" style="width: ${cachedPercent}%; flex: ${cachedPercent};" title="Cached: ${this.formatNumber(usage.cached)} tokens (${cachedPercent.toFixed(1)}%)">
                <span class="segment-label">${cachedPercent > 8 ? `Cached ${cachedPercent.toFixed(0)}%` : ''}</span>
              </div>
            ` : ''}
          </div>
        </div>
        <div class="model-details">
          <span class="detail-item input-detail"><span class="detail-color input-color"></span>Input: ${this.formatNumber(usage.input)}</span>
          <span class="detail-item output-detail"><span class="detail-color output-color"></span>Output: ${this.formatNumber(usage.output)}</span>
          <span class="detail-item cached-detail"><span class="detail-color cached-color"></span>Cached: ${this.formatNumber(usage.cached)}</span>
        </div>
      </div>
    `;
  }
  
  /**
   * Update costs per model UI with stacked bar charts
   */
  updateCostsPerModelUI() {
    const container = document.getElementById('dashCostsPerModel');
    const section = document.getElementById('costsPerModelSection');
    
    if (!container || !section) return;
    
    const models = Object.keys(this.modelCosts);
    this.logEvent('UpdateCostsPerModelUI', { modelsCount: models.length, models: models, costs: this.modelCosts });
    
    if (models.length === 0) {
      section.style.display = 'none';
      return;
    }

    
    section.style.display = 'block';
    
    // Build HTML for each model with stacked bar chart
    container.innerHTML = models.map(model => {
      const costs = this.modelCosts[model];
      return this.createModelCostRow(model, costs);
    }).join('');
  }
  
  /**
   * Create a model cost row with stacked bar chart
   */
  createModelCostRow(model, costs) {
    const totalCost = costs.total;
    
    if (totalCost === 0) {
      return '';
    }
    
    const inputPercent = (costs.input / totalCost) * 100;
    const outputPercent = (costs.output / totalCost) * 100;
    const cachedPercent = (costs.cached / totalCost) * 100;
    
    return `
      <div class="model-cost-row">
        <div class="model-header">
          <strong>${this.escapeHtml(model)}</strong>
          <span class="model-total">$${totalCost.toFixed(4)}</span>
        </div>
        <div class="stacked-bar-chart">
          <div class="bar-container">
            ${inputPercent > 0 ? `
              <div class="bar-segment input-segment" style="width: ${inputPercent}%; flex: ${inputPercent};" title="Input: $${costs.input.toFixed(4)} (${inputPercent.toFixed(1)}%)">
                <span class="segment-label">${inputPercent > 8 ? `Input ${inputPercent.toFixed(0)}%` : ''}</span>
              </div>
            ` : ''}
            ${outputPercent > 0 ? `
              <div class="bar-segment output-segment" style="width: ${outputPercent}%; flex: ${outputPercent};" title="Output: $${costs.output.toFixed(4)} (${outputPercent.toFixed(1)}%)">
                <span class="segment-label">${outputPercent > 8 ? `Output ${outputPercent.toFixed(0)}%` : ''}</span>
              </div>
            ` : ''}
            ${cachedPercent > 0 ? `
              <div class="bar-segment cached-segment" style="width: ${cachedPercent}%; flex: ${cachedPercent};" title="Cached: $${costs.cached.toFixed(4)} (${cachedPercent.toFixed(1)}%)">
                <span class="segment-label">${cachedPercent > 8 ? `Cached ${cachedPercent.toFixed(0)}%` : ''}</span>
              </div>
            ` : ''}
          </div>
        </div>
        <div class="model-details">
          <span class="detail-item input-detail"><span class="detail-color input-color"></span>Input: $${costs.input.toFixed(4)}</span>
          <span class="detail-item output-detail"><span class="detail-color output-color"></span>Output: $${costs.output.toFixed(4)}</span>
          <span class="detail-item cached-detail"><span class="detail-color cached-color"></span>Cached: $${costs.cached.toFixed(4)}</span>
        </div>
      </div>
    `;
  }
  
  /**
   * Escape HTML special characters
   */
  escapeHtml(text) {
    if (!text) return '';
    const map = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;'
    };
    return text.replace(/[&<>"']/g, m => map[m]);
  }
  
  /**
   * Update token badge
   */
  updateTokenBadge() {
    const badge = document.getElementById('tokenBadge');
    if (badge) {
      badge.textContent = this.formatCompactNumber(this.totalTokens);
    }
  }
  
  /**
   * Update a single element
   */
  updateElement(id, value, className = null) {
    const element = document.getElementById(id);
    if (element) {
      element.textContent = value;
      if (className) {
        element.className = className;
      }
    }
  }
  
  /**
   * Get session duration as a formatted string
   */
  getSessionDuration() {
    if (!this.sessionStartTime || this.sessionStatus === 'disconnected') {
      return '-';
    }
    
    const now = new Date();
    const diff = now - this.sessionStartTime;
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    
    if (hours > 0) {
      return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    } else {
      return `${seconds}s`;
    }
  }
  
  /**
   * Truncate ID for display
   */
  truncateId(id) {
    if (!id) return '-';
    if (id.length <= 16) return id;
    return `${id.substring(0, 8)}...${id.substring(id.length - 4)}`;
  }
  
  /**
   * Format number with locale
   */
  formatNumber(num) {
    return num.toLocaleString();
  }
  
  /**
   * Format number in compact form (1.2K, 3.4M, etc.)
   */
  formatCompactNumber(num) {
    if (num >= 1000000) {
      return (num / 1000000).toFixed(1) + 'M';
    } else if (num >= 1000) {
      return (num / 1000).toFixed(1) + 'K';
    }
    return num.toString();
  }
  
  /**
   * Log event for debugging
   */
  logEvent(eventType, data) {
    console.log(`[ConsumptionTracker] ${eventType}:`, data);
  }
  
  /**
   * Get current consumption summary
   */
  getSummary() {
    return {
      sessionId: this.sessionId,
      sessionModel: this.sessionModel,
      sessionDuration: this.getSessionDuration(),
      sessionStatus: this.sessionStatus,
      responseCount: this.responseCount,
      totalInputTokens: this.totalInputTokens,
      totalOutputTokens: this.totalOutputTokens,
      totalTokens: this.totalTokens,
      inputTokenDetails: { ...this.inputTokenDetails },
      outputTokenDetails: { ...this.outputTokenDetails },
      modelTokenUsage: { ...this.modelTokenUsage },
      modelCosts: { ...this.modelCosts }
    };
  }
  
  /**
   * Start duration timer
   */
  startDurationTimer() {
    // Update duration every second while connected
    this.durationInterval = setInterval(() => {
      if (this.sessionStatus === 'connected') {
        this.updateElement('dashSessionDuration', this.getSessionDuration());
      }
    }, 1000);
  }
  
  /**
   * Stop duration timer
   */
  stopDurationTimer() {
    if (this.durationInterval) {
      clearInterval(this.durationInterval);
      this.durationInterval = null;
    }
  }
  
  // =====================
  // localStorage Persistence
  // =====================
  
  /**
   * Storage key for consumption data
   */
  getStorageKey() {
    return 'voiceAgent_consumptionHistory';
  }
  
  /**
   * Save current session data to localStorage
   */
  saveToLocalStorage() {
    try {
      const history = this.loadFromLocalStorage();
      
      // Create session record
      const sessionRecord = {
        sessionId: this.sessionId,
        model: this.sessionModel,
        startTime: this.sessionStartTime,
        endTime: new Date().toISOString(),
        status: this.sessionStatus,
        duration: this.getSessionDuration(),
        responseCount: this.responseCount,
        tokens: {
          input: this.totalInputTokens,
          output: this.totalOutputTokens,
          total: this.totalTokens,
          inputDetails: { ...this.inputTokenDetails },
          outputDetails: { ...this.outputTokenDetails }
        },
        audio: {
          inputDurationMs: this.totalInputAudioDurationMs,
          outputDurationMs: this.totalOutputAudioDurationMs,
          inputBytes: this.currentInputAudioBytes,
          outputBytes: this.currentOutputAudioBytes,
          inputFormat: this.inputAudioFormat,
          outputFormat: this.outputAudioFormat,
          sampleRate: this.outputAudioSamplingRate
        },
        modelUsage: { ...this.modelTokenUsage },
        modelCosts: { ...this.modelCosts },
        savedAt: new Date().toISOString()
      };
      
      // Add to history, keep last 100 sessions
      history.sessions.unshift(sessionRecord);
      if (history.sessions.length > 100) {
        history.sessions = history.sessions.slice(0, 100);
      }
      
      // Update aggregated totals
      history.aggregated.totalSessions++;
      history.aggregated.totalTokens += this.totalTokens;
      history.aggregated.totalInputTokens += this.totalInputTokens;
      history.aggregated.totalOutputTokens += this.totalOutputTokens;
      history.aggregated.totalInputAudioMs += this.totalInputAudioDurationMs;
      history.aggregated.totalOutputAudioMs += this.totalOutputAudioDurationMs;
      history.aggregated.lastUpdated = new Date().toISOString();
      
      localStorage.setItem(this.getStorageKey(), JSON.stringify(history));
      this.logEvent('SavedToLocalStorage', { sessionId: this.sessionId });
      
      return true;
    } catch (error) {
      console.error('[ConsumptionTracker] Error saving to localStorage:', error);
      return false;
    }
  }
  
  /**
   * Load consumption history from localStorage
   */
  loadFromLocalStorage() {
    try {
      const stored = localStorage.getItem(this.getStorageKey());
      if (stored) {
        return JSON.parse(stored);
      }
    } catch (error) {
      console.error('[ConsumptionTracker] Error loading from localStorage:', error);
    }
    
    // Return empty structure
    return {
      sessions: [],
      aggregated: {
        totalSessions: 0,
        totalTokens: 0,
        totalInputTokens: 0,
        totalOutputTokens: 0,
        totalInputAudioMs: 0,
        totalOutputAudioMs: 0,
        lastUpdated: null
      }
    };
  }
  
  /**
   * Get aggregated consumption data
   */
  getAggregatedConsumption() {
    const history = this.loadFromLocalStorage();
    return history.aggregated;
  }
  
  /**
   * Get recent sessions from localStorage
   */
  getRecentSessions(limit = 10) {
    const history = this.loadFromLocalStorage();
    return history.sessions.slice(0, limit);
  }
  
  /**
   * Clear consumption history from localStorage
   */
  clearHistory() {
    try {
      localStorage.removeItem(this.getStorageKey());
      this.logEvent('HistoryCleared', {});
      return true;
    } catch (error) {
      console.error('[ConsumptionTracker] Error clearing history:', error);
      return false;
    }
  }
  
  /**
   * Sync consumption data to backend for batch persistence
   */
  async syncToBackend() {
    if (!this.sessionId) {
      this.logEvent('SyncSkipped', { reason: 'No active session' });
      return false;
    }
    
    try {
      const payload = {
        sessionId: this.sessionId,
        model: this.sessionModel,
        inputTokens: this.totalInputTokens,
        outputTokens: this.totalOutputTokens,
        cachedTokens: this.inputTokenDetails.cachedTokens,
        inputAudioDurationMs: this.totalInputAudioDurationMs,
        outputAudioDurationMs: this.totalOutputAudioDurationMs,
        responseCount: this.responseCount,
        timestamp: new Date().toISOString()
      };
      
      const response = await fetch('/api/metrics/consumption', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });
      
      if (response.ok) {
        this.logEvent('SyncedToBackend', { sessionId: this.sessionId });
        return true;
      } else {
        console.warn('[ConsumptionTracker] Backend sync failed:', response.status);
        return false;
      }
    } catch (error) {
      console.error('[ConsumptionTracker] Error syncing to backend:', error);
      return false;
    }
  }
  
  /**
   * Debug method to populate test data and render graphs
   */
  debugShowGraphs() {
    // Populate test data
    this.modelTokenUsage = {
      'gpt-4o': { input: 5000, output: 2000, cached: 1000 },
      'gpt-4o-mini': { input: 3000, output: 1500, cached: 500 },
      'gpt-4-turbo': { input: 2000, output: 1000, cached: 200 }
    };
    
    // Calculate costs
    this.calculateModelCosts();
    
    // Update both UIs
    this.updateTokenConsumptionPerModelUI();
    this.updateCostsPerModelUI();
    
    // Show sections
    const tokenSection = document.getElementById('tokenConsumptionPerModelSection');
    const costSection = document.getElementById('costsPerModelSection');
    if (tokenSection) tokenSection.style.display = 'block';
    if (costSection) costSection.style.display = 'block';
    
    console.log('[ConsumptionTracker] Debug graphs shown with test data', {
      modelTokenUsage: this.modelTokenUsage,
      modelCosts: this.modelCosts
    });
  }

  /**
   * Auto-save on session disconnect
   */
  handleSessionDisconnected() {
    this.sessionStatus = 'disconnected';
    this.stopDurationTimer();
    
    // Save to localStorage
    this.saveToLocalStorage();
    
    // Try to sync to backend
    this.syncToBackend().catch(err => {
      console.warn('[ConsumptionTracker] Backend sync failed on disconnect:', err);
    });
    
    this.updateDashboard();
  }
}

// Create singleton instance
export const consumptionTracker = new ConsumptionTracker();
