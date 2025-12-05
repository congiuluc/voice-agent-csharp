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
    
    // Streaming transcript tracking
    this.streamingTranscriptElement = null;
    this.streamingTranscriptText = '';
    this.currentStreamingResponseId = null;
    
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
    
    // UI elements cache
    this.dashboardElement = null;
    
    // Initialize UI
    this.initializeDashboard();
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
    
    // Reset counters for new session
    this.resetCounters();
    
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
    
    // Finalize streaming transcript
    this.finalizeStreamingTranscript();
    
    // Extract usage information
    const usage = response.usage || response.Usage || payload.Usage;
    if (usage) {
      // Cumulative token tracking
      const inputTokens = usage.input_tokens || usage.InputTokens || 0;
      const outputTokens = usage.output_tokens || usage.OutputTokens || 0;
      const totalTokens = usage.total_tokens || usage.TotalTokens || (inputTokens + outputTokens);
      
      this.totalInputTokens += inputTokens;
      this.totalOutputTokens += outputTokens;
      this.totalTokens += totalTokens;
      
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
   * and streams text word-by-word to the transcript panel
   * @param {Object} payload - Audio timestamp delta payload
   */
  handleAudioTimestampDelta(payload) {
    if (!payload) return;
    
    const responseId = payload.response_id || payload.ResponseId;
    const audioOffsetMs = payload.audio_offset_ms || payload.AudioOffsetMs || 0;
    const audioDurationMs = payload.audio_duration_ms || payload.AudioDurationMs || 0;
    const text = payload.text || payload.Text || '';
    const timestampType = payload.timestamp_type || payload.TimestampType;
    
    // Calculate the end time of this audio segment
    const audioEndMs = audioOffsetMs + audioDurationMs;
    
    // Track maximum end time for accurate total output duration
    if (audioEndMs > this.maxOutputAudioEndMs) {
      this.maxOutputAudioEndMs = audioEndMs;
      // Update the output duration with more precise timestamp-based value
      this.totalOutputAudioDurationMs = this.maxOutputAudioEndMs;
    }
    
    // Stream text to transcript panel (word-by-word)
    if (text && timestampType === 'word') {
      this.streamTextToTranscript(responseId, text);
    }
    
    // Update dashboard periodically
    if (audioOffsetMs % 500 < 100) {
      this.updateDashboard();
    }
    
    this.logEvent('AudioTimestampDelta', { 
      audioOffsetMs,
      audioDurationMs,
      audioEndMs,
      maxOutputAudioEndMs: this.maxOutputAudioEndMs,
      text,
      timestampType
    });
  }

  /**
   * Handle response.audio_transcript.delta event
   * Uses transcript delta for streaming text when audio_timestamp.delta is not available
   * @param {Object} payload - Transcript delta payload
   */
  handleTranscriptDelta(payload) {
    if (!payload) return;
    
    console.log('[DEBUG] handleTranscriptDelta called:', payload);
    
    const responseId = payload.response_id || payload.ResponseId;
    const itemId = payload.item_id || payload.ItemId;
    const delta = payload.delta || payload.Delta || '';
    
    console.log('[DEBUG] Parsed delta:', { responseId, itemId, delta });
    
    // Stream delta text to transcript panel
    if (delta) {
      this.streamTextToTranscript(responseId, delta, true); // true = is delta (append without space)
    }
    
    this.logEvent('TranscriptDelta', { 
      responseId,
      itemId,
      deltaLength: delta.length
    });
  }
  
  /**
   * Stream text word-by-word to the transcript panel
   * Creates or updates a streaming transcript element for the current response
   * @param {string} responseId - The response ID
   * @param {string} text - The text to append (word or delta)
   * @param {boolean} isDelta - If true, append without space (for transcript deltas)
   */
  streamTextToTranscript(responseId, text, isDelta = false) {
    const transcriptContent = document.getElementById('transcriptContent');
    if (!transcriptContent) return;
    
    // Check if we need to create a new streaming element for a new response
    if (responseId !== this.currentStreamingResponseId) {
      // Finalize previous streaming element if exists
      if (this.streamingTranscriptElement) {
        this.streamingTranscriptElement.classList.remove('streaming');
      }
      
      // Create new streaming transcript item
      this.currentStreamingResponseId = responseId;
      this.streamingTranscriptText = '';
      
      const item = document.createElement('div');
      item.className = 'transcript-item agent streaming';
      item.dataset.responseId = responseId;
      
      // Create icon element
      const iconDiv = document.createElement('div');
      iconDiv.className = 'transcript-icon';
      iconDiv.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="10" rx="2"></rect><circle cx="12" cy="5" r="2"></circle><path d="M12 7v4"></path><line x1="8" y1="16" x2="8" y2="16"></line><line x1="16" y1="16" x2="16" y2="16"></line></svg>`;
      
      const content = document.createElement('div');
      content.className = 'transcript-content streaming-text';
      
      item.appendChild(iconDiv);
      item.appendChild(content);
      transcriptContent.appendChild(item);
      
      this.streamingTranscriptElement = item;
    }
    
    // Append text to streaming text
    if (isDelta) {
      // For transcript deltas, append directly (they include their own spacing)
      this.streamingTranscriptText += text;
    } else {
      // For word-level timestamps, add space between words
      if (this.streamingTranscriptText) {
        this.streamingTranscriptText += ' ' + text;
      } else {
        this.streamingTranscriptText = text;
      }
    }
    
    // Update the content
    const contentElement = this.streamingTranscriptElement?.querySelector('.transcript-content');
    if (contentElement) {
      contentElement.textContent = this.streamingTranscriptText;
    }
    
    // Auto-scroll to bottom
    transcriptContent.scrollTop = transcriptContent.scrollHeight;
  }
  
  /**
   * Finalize streaming transcript when response is done
   * Called from handleResponseDone
   */
  finalizeStreamingTranscript() {
    if (this.streamingTranscriptElement) {
      this.streamingTranscriptElement.classList.remove('streaming');
      this.streamingTranscriptElement = null;
    }
    this.streamingTranscriptText = '';
    this.currentStreamingResponseId = null;
    this.maxOutputAudioEndMs = 0; // Reset for next response
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
    
    // Reset audio duration tracking
    this.totalInputAudioDurationMs = 0;
    this.totalOutputAudioDurationMs = 0;
    this.currentInputAudioStartMs = null;
    this.currentInputAudioBytes = 0;
    this.currentOutputAudioBytes = 0;
    
    // Reset audio timestamp tracking
    this.maxOutputAudioEndMs = 0;
    
    // Reset streaming transcript tracking
    this.streamingTranscriptElement = null;
    this.streamingTranscriptText = '';
    this.currentStreamingResponseId = null;
    
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
      outputTokenDetails: { ...this.outputTokenDetails }
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
