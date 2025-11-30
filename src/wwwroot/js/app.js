/**
 * Main Application Module
 * 
 * Coordinates all application modules and manages the voice agent lifecycle.
 * This is the entry point for the ES6 modular application.
 */

import { VOICE_MODELS, ITALIAN_VOICES, getVoiceName } from './config.js';
import { VoiceVisualizer } from './voice-visualizer.js';
import { AudioHandler } from './audio-handler.js';
import { WebSocketHandler } from './websocket-handler.js';
import {
  showToast,
  addTranscript,
  clearTranscripts,
  updateStatus,
  toggleTranscriptPanel,
  showSettingsModal,
  hideSettingsModal,
  updateWelcomeMessageInput,
  validateModelVoiceCompatibility,
  saveSettings,
  loadSettings,
  showErrorBoundary,
  autoResizeTextarea,
  addTraceEntry,
  clearTraceEntries,
  toggleTracePanel
} from './ui-utils.js';

/**
 * Main application class
 */
class VoiceAgentApp {
  constructor() {
    // Detect page name from title or URL
    this.pageName = this.detectPageName();
    
    // Application state
    this.isSessionActive = false;
    this.currentSettings = loadSettings(this.pageName);
    this.traceCount = 0;
    
    // Module instances
    this.visualizer = null;
    this.audioHandler = null;
    this.wsHandler = null;
    
    // DOM elements (will be initialized in init())
    this.elements = {};
    
    // Theme state
    this.isDarkMode = this.loadThemePreference();
  }

  /**
   * Detect the current page name from document title or URL
   * @returns {string} - Page name (VoiceAgent, VoiceAssistant, VoiceAvatar, or 'default')
   */
  detectPageName() {
    const title = document.title.toLowerCase();
    const url = window.location.pathname.toLowerCase();
    
    if (title.includes('agent') || url.includes('agent')) return 'VoiceAgent';
    if (title.includes('assistant') || url.includes('assistant')) return 'VoiceAssistant';
    if (title.includes('avatar') || url.includes('avatar')) return 'VoiceAvatar';
    
    return 'default';
  }

  /**
   * Open the left panel (slideover)
   */
  openLeftPanel() {
    const panel = this.elements.leftPanel;
    if (!panel) return;
    panel.setAttribute('aria-hidden', 'false');
    // show overlay
    let overlay = document.querySelector('.left-panel-overlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.className = 'left-panel-overlay visible';
      document.body.appendChild(overlay);
    } else {
      overlay.classList.add('visible');
    }
    // lock body scroll
    document.body.style.overflow = 'hidden';

    // focus the first focusable element inside the panel
    setTimeout(() => {
      try {
        const focusable = panel.querySelector('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
        if (focusable) focusable.focus();
      } catch (e) {}
    }, 50);
  }

  /**
   * Close the left panel
   */
  closeLeftPanel() {
    const panel = this.elements.leftPanel;
    if (!panel) return;
    panel.setAttribute('aria-hidden', 'true');
    const overlay = document.querySelector('.left-panel-overlay');
    if (overlay) {
      overlay.classList.remove('visible');
    }
    // restore body scroll
    document.body.style.overflow = '';

    // return focus to hamburger button for accessibility
    try {
      const hb = this.elements.hamburgerButton;
      if (hb) hb.focus();
    } catch (e) {}
  }
  
  /**
   * Initialize the application
   */
  async init() {
    try {
      // Get DOM references
      const uiPresent = this.initDOMReferences();
      if (!uiPresent) {
        // Not a VoiceAgent page — skip heavy initialization but keep module loaded safely
        console.log('Voice Agent UI not present on this page. Skipping app initialization.');
        return;
      }
      
      // Apply saved theme
      this.applyTheme();
      
      // Initialize visualizer
      this.visualizer = new VoiceVisualizer(this.elements.canvas);
      
      // Initialize audio handler with RMS callback for visualizer
      this.audioHandler = new AudioHandler((rms, source) => {
        if (this.visualizer) {
          this.visualizer.ingestRMS(rms, source);
        }
      });
      
      // Initialize WebSocket handler
      this.wsHandler = new WebSocketHandler({
        onOpen: () => this.handleWebSocketOpen(),
        onClose: () => this.handleWebSocketClose(),
        onAudio: (arrayBuffer) => this.handleIncomingAudio(arrayBuffer),
        onTranscription: (text, role) => this.handleTranscription(text, role),
        onStopAudio: () => this.handleStopAudio(),
        onError: (error) => this.handleWebSocketError(error)
      });
      
      // Setup audio data callback for WebSocket transmission
      this.audioHandler.setAudioDataCallback((audioBuffer) => {
        if (this.wsHandler && this.wsHandler.isSocketConnected()) {
          this.wsHandler.sendAudio(audioBuffer);
        }
      });
      
      // Setup event listeners
      this.setupEventListeners();
      
      // Populate settings modal with current settings
      this.populateSettings();

      // Relocate controls for small screens and enable focus trap
      this.relocateControlsForSmallScreens();
      this.enableLeftPanelFocusTrap();
      
      // Ensure initial mute UI state reflects audio handler (muted by default)
      if (this.elements.muteButton) {
        this.elements.muteButton.classList.add('muted');
        try { this.elements.muteButton.setAttribute('aria-pressed', 'true'); } catch(e) {}
        try { this.elements.muteButton.setAttribute('aria-label', 'Microfono disattivato'); } catch(e) {}
      }

      // Initial status
      updateStatus('In attesa di connessione...', 'disconnected');
      addTraceEntry('system', 'Applicazione inizializzata');
      
      console.log('Voice Agent App initialized');
      
    } catch (error) {
      console.error('Fatal error during initialization:', error);
      addTraceEntry('system', `Errore di inizializzazione: ${error.message}`);
      showErrorBoundary(`Errore durante l'inizializzazione dell'applicazione: ${error.message}`);
    }
  }
  
  /**
   * Initialize DOM element references
   */
  initDOMReferences() {
    this.elements = {
      // Canvas
      canvas: document.getElementById('voiceCanvas'),
      
      // Buttons
      startButton: document.getElementById('startButton'),
      muteButton: document.getElementById('muteButton'),
      settingsButton: document.getElementById('settingsButton'),
      themeToggleButton: document.getElementById('themeToggleButton'),
      chatToggle: document.getElementById('chatToggle'),
      traceToggle: document.getElementById('traceToggle'),
      clearChatButton: document.getElementById('clearChatButton'),
      clearTraceButton: document.getElementById('clearTraceButton'),
      
      // Settings modal
      settingsModal: document.getElementById('settingsModal'),
      closeSettingsButton: document.getElementById('closeSettingsButton'),
      saveSettingsButton: document.getElementById('saveSettingsButton'),
      voiceModelSelect: document.getElementById('voiceModelSelect'),
      voiceSelect: document.getElementById('voiceSelect'),
      welcomeMessageInput: document.getElementById('welcomeMessageInput'),
      voiceLiveEndpointInput: document.getElementById('voiceLiveEndpointInput'),
      voiceLiveEndpointCopy: document.getElementById('voiceLiveEndpointCopy'),
      voiceLiveEndpointTest: document.getElementById('voiceLiveEndpointTest'),
      voiceLiveEndpointFeedback: document.getElementById('voiceLiveEndpointFeedback'),
      voiceLiveApiKeyInput: document.getElementById('voiceLiveApiKeyInput'),
      modelInstructionsInput: document.getElementById('modelInstructionsInput'),
      toastNotificationsToggle: document.getElementById('toastNotificationsToggle'),
      // Foundry Agent settings
      foundryProjectInput: document.getElementById('foundryProjectInput'),
      foundryAgentInput: document.getElementById('foundryAgentInput'),
      localeSelect: document.getElementById('localeSelect'),
      
      // Transcript and trace
      transcriptBox: document.getElementById('transcriptBox'),
      transcriptContent: document.getElementById('transcriptContent'),
      textInput: document.getElementById('textInput'),
      sendTextButton: document.getElementById('sendTextButton'),
      tracePanel: document.getElementById('tracePanel'),
      traceContent: document.getElementById('traceContent')
      ,
      // Left panel elements (may not exist on desktop)
      hamburgerButton: document.getElementById('hamburgerButton'),
      leftPanel: document.getElementById('leftPanel'),
      closeLeftPanel: document.getElementById('closeLeftPanel'),
      lp_startButton: document.getElementById('lp_startButton'),
      lp_muteButton: document.getElementById('lp_muteButton'),
      lp_traceToggle: document.getElementById('lp_traceToggle'),
      lp_settingsButton: document.getElementById('lp_settingsButton'),
      lp_chatToggle: document.getElementById('lp_chatToggle')
    };
    // Verify critical elements exist. Return true if present, false otherwise.
    const criticalElements = ['canvas', 'startButton', 'muteButton'];
    for (const key of criticalElements) {
      if (!this.elements[key]) {
        return false;
      }
    }
    return true;
  }
  
  /**
   * Helper to safely add event listener with null check
   */
  safeAddListener(element, event, handler) {
    if (element) {
      element.addEventListener(event, handler);
    }
  }

  /**
   * Conditionally show toast based on settings
   */
  conditionalShowToast(message, type = 'info', duration = 4000) {
    if (this.currentSettings && this.currentSettings.showToastNotifications !== false) {
      showToast(message, type, duration);
    }
  }

  /**
   * Setup all event listeners
   */
  setupEventListeners() {
    // Start/Stop session button
    this.safeAddListener(this.elements.startButton, 'click', () => {
      if (this.isSessionActive) {
        this.stopSession();
      } else {
        this.startSession();
      }
    });
    
    // Mute/Unmute button
    this.safeAddListener(this.elements.muteButton, 'click', () => {
      try {
        const btn = this.elements.muteButton;
        // Prefer the DOM class as the source of truth for UI state, but
        // fall back to the audioHandler internal state if the class is missing.
        let currentlyMuted = false;
        if (btn) {
          currentlyMuted = btn.classList.contains('muted');
        } else if (this.audioHandler && typeof this.audioHandler.isMicrophoneMuted === 'function') {
          currentlyMuted = this.audioHandler.isMicrophoneMuted();
        }

        // If no session is active, prevent enabling the mic (unmuting)
        // currentlyMuted === true means the button is currently muted and clicking would unmute
        if (!this.isSessionActive && currentlyMuted) {
          this.conditionalShowToast('Avvia una sessione prima di attivare il microfono', 'warning');
          addTraceEntry('system', 'Tentativo di attivare microfono senza sessione');
          return;
        }
      } catch (e) {
        // ignore and proceed to toggle as fallback
      }
      this.toggleMute();
    });
    
    // Settings button
    this.safeAddListener(this.elements.settingsButton, 'click', () => {
      showSettingsModal();
    });
    
    // Close settings modal
    this.safeAddListener(this.elements.closeSettingsButton, 'click', () => {
      hideSettingsModal();
    });
    
    // Save settings
    this.safeAddListener(this.elements.saveSettingsButton, 'click', () => {
      this.saveSettingsFromModal();
    });
    
    // Chat toggle
    this.safeAddListener(this.elements.chatToggle, 'click', () => {
      toggleTranscriptPanel();
    });
    
    // Clear chat
    this.safeAddListener(this.elements.clearChatButton, 'click', () => {
      clearTranscripts();
      this.conditionalShowToast('Conversazione cancellata', 'info');
    });
    
    // Send text message
    this.safeAddListener(this.elements.sendTextButton, 'click', () => {
      this.sendTextMessage();
    });
    
    // Text input - send on Enter (Shift+Enter for new line)
    this.safeAddListener(this.elements.textInput, 'keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        this.sendTextMessage();
      }
    });
    
    // Auto-resize text input
    this.safeAddListener(this.elements.textInput, 'input', () => {
      autoResizeTextarea(this.elements.textInput);
    });
    
    // Voice selection change - update welcome message
    this.safeAddListener(this.elements.voiceSelect, 'change', () => {
      const voiceId = this.elements.voiceSelect.value;
      updateWelcomeMessageInput(voiceId, this.elements.welcomeMessageInput);
    });
    
    // Close modal on background click
    this.safeAddListener(this.elements.settingsModal, 'click', (e) => {
      if (e.target === this.elements.settingsModal) {
        hideSettingsModal();
      }
    });
    
    // Theme toggle
    this.safeAddListener(this.elements.themeToggleButton, 'click', () => {
      this.toggleTheme();
    });
    
    // Trace toggle
    this.safeAddListener(this.elements.traceToggle, 'click', () => {
      toggleTracePanel();
    });
    
    // Keyboard support for trace and chat toggles
    this.safeAddListener(this.elements.chatToggle, 'keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        toggleTranscriptPanel();
      }
    });
    
    this.safeAddListener(this.elements.traceToggle, 'keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        toggleTracePanel();
      }
    });
    
    // Escape key closes modals
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        hideSettingsModal();
        // Could also close panels here if needed
      }
    });
    
    // Clear trace
    this.safeAddListener(this.elements.clearTraceButton, 'click', () => {
      clearTraceEntries();
      addTraceEntry('system', 'Trace cancellato');
    });

    // Voice Live endpoint copy/test buttons
    this.safeAddListener(this.elements.voiceLiveEndpointCopy, 'click', async () => {
      try {
        const val = this.elements.voiceLiveEndpointInput ? this.elements.voiceLiveEndpointInput.value.trim() : '';
        if (!val) {
          this.showEndpointFeedback('Nessun endpoint da copiare', 'error');
          return;
        }
        await navigator.clipboard.writeText(val);
        this.showEndpointFeedback('Endpoint copiato negli appunti', 'success');
        this.conditionalShowToast('Endpoint copiato', 'success');
      } catch (err) {
        console.error('Copy failed', err);
        this.showEndpointFeedback('Impossibile copiare endpoint', 'error');
      }
    });

    this.safeAddListener(this.elements.voiceLiveEndpointTest, 'click', async () => {
      const url = this.elements.voiceLiveEndpointInput ? this.elements.voiceLiveEndpointInput.value.trim() : '';
      if (!url) {
        this.showEndpointFeedback('Inserisci un URL valido prima del test', 'error');
        return;
      }
      this.showEndpointFeedback('Testing endpoint...', '');
      try {
        const ok = await this.testEndpoint(url, 6000);
        if (ok) {
          this.showEndpointFeedback('Endpoint raggiungibile ✅', 'success');
          this.conditionalShowToast('Endpoint raggiungibile', 'success');
        } else {
          this.showEndpointFeedback('Endpoint non raggiungibile (timeout o risposta non valida)', 'error');
          this.conditionalShowToast('Endpoint non raggiungibile', 'error');
        }
      } catch (err) {
        this.showEndpointFeedback(`Errore test endpoint: ${err.message}`, 'error');
        this.conditionalShowToast('Errore durante il test endpoint', 'error');
      }
    });

    // Hamburger / left-panel toggle
    this.safeAddListener(this.elements.hamburgerButton, 'click', () => {
      this.openLeftPanel();
    });

    this.safeAddListener(this.elements.closeLeftPanel, 'click', () => {
      this.closeLeftPanel();
    });

    // Left-panel buttons mapping to main actions
    this.safeAddListener(this.elements.lp_startButton, 'click', () => { this.elements.startButton && this.elements.startButton.click(); this.closeLeftPanel(); });
    this.safeAddListener(this.elements.lp_muteButton, 'click', () => { this.elements.muteButton && this.elements.muteButton.click(); this.closeLeftPanel(); });
    this.safeAddListener(this.elements.lp_traceToggle, 'click', () => { this.elements.traceToggle && this.elements.traceToggle.click(); this.closeLeftPanel(); });
    this.safeAddListener(this.elements.lp_settingsButton, 'click', () => { this.elements.settingsButton && this.elements.settingsButton.click(); this.closeLeftPanel(); });
    this.safeAddListener(this.elements.lp_chatToggle, 'click', () => { this.elements.chatToggle && this.elements.chatToggle.click(); this.closeLeftPanel(); });

    // Close left panel when clicking overlay (we add overlay dynamically)
    document.addEventListener('click', (e) => {
      const overlay = document.querySelector('.left-panel-overlay');
      if (overlay && overlay.classList.contains('visible') && e.target === overlay) {
        this.closeLeftPanel();
      }
    });

    // Ensure Escape closes left panel as well
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        this.closeLeftPanel();
      }
    });
  }

  showEndpointFeedback(text, type) {
    try {
      const el = this.elements.voiceLiveEndpointFeedback;
      if (!el) return;
      el.textContent = text || '';
      el.classList.remove('success', 'error');
      if (type === 'success') el.classList.add('success');
      if (type === 'error') el.classList.add('error');
    } catch (e) {}
  }

  async testEndpoint(url, timeout = 6000) {
    // Attempt a HEAD first, fallback to GET. Use AbortController for timeout.
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    try {
      // Ensure URL has protocol
      let testUrl = url;
      if (!/^https?:\/\//i.test(testUrl)) {
        testUrl = 'https://' + testUrl;
      }
      // Try HEAD
      let resp = await fetch(testUrl, { method: 'HEAD', mode: 'cors', signal: controller.signal });
      clearTimeout(timer);
      return resp && resp.ok;
    } catch (e) {
      // If HEAD failed (CORS or not allowed), try GET without throwing immediately
      try {
        const controller2 = new AbortController();
        const timer2 = setTimeout(() => controller2.abort(), timeout);
        let testUrl = url;
        if (!/^https?:\/\//i.test(testUrl)) {
          testUrl = 'https://' + testUrl;
        }
        const resp2 = await fetch(testUrl, { method: 'GET', mode: 'cors', signal: controller2.signal });
        clearTimeout(timer2);
        return resp2 && resp2.ok;
      } catch (err2) {
        // network error or timeout
        return false;
      }
    }
  }

  /**
   * Move primary controls into left panel on small screens for cleaner DOM
   */
  relocateControlsForSmallScreens() {
    const panelBody = document.getElementById('leftPanelBody');
    if (!panelBody || !this.elements.leftPanel) return;

    const mq = window.matchMedia('(max-width: 768px)');
    const moveIn = () => {
      if (mq.matches) {
        // Move the primary controls into the panel if not already there
        const controls = ['startButton','muteButton','traceToggle','settingsButton','chatToggle'];
        controls.forEach(id => {
          const el = document.getElementById(id);
          if (el && !panelBody.contains(el)) {
            // Create wrapper for consistent styling in panel
            const wrapper = document.createElement('div');
            wrapper.className = 'left-panel-control-wrapper';
            wrapper.appendChild(el);
            panelBody.appendChild(wrapper);
          }
        });
      } else {
        // Move controls back to original positions by unwrapping
        const wrappers = panelBody.querySelectorAll('.left-panel-control-wrapper');
        wrappers.forEach(w => {
          const child = w.firstElementChild;
          if (child) {
            // Insert back into body (append to main container)
            document.querySelector('.main-container').appendChild(child);
          }
          w.remove();
        });
      }
    };

    // Run once and listen for changes
    moveIn();
    mq.addEventListener('change', moveIn);
  }

  /**
   * Focus trap for left panel to keep tab focus inside the panel while open
   */
  enableLeftPanelFocusTrap() {
    const panel = this.elements.leftPanel;
    if (!panel) return;

    panel.addEventListener('keydown', (e) => {
      if (e.key !== 'Tab') return;
      const focusable = panel.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (e.shiftKey) { // shift+tab
        if (document.activeElement === first) {
          e.preventDefault();
          last.focus();
        }
      } else { // tab
        if (document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    });
  }
  
  /**
   * Populate settings modal with voice models and voices
   */
  populateSettings() {
    // Populate voice models
    this.elements.voiceModelSelect.innerHTML = '';
    VOICE_MODELS.forEach(model => {
      const option = document.createElement('option');
      option.value = model.id;
      option.textContent = `${model.name} - ${model.description}`;
      if (model.id === this.currentSettings.voiceModel) {
        option.selected = true;
      }
      this.elements.voiceModelSelect.appendChild(option);
    });
    
    // Populate voices
    this.elements.voiceSelect.innerHTML = '';
    ITALIAN_VOICES.forEach(voice => {
      const option = document.createElement('option');
      option.value = voice.id;
      option.textContent = voice.displayName;
      if (voice.id === this.currentSettings.voice) {
        option.selected = true;
      }
      this.elements.voiceSelect.appendChild(option);
    });
    
    // Set welcome message
    this.elements.welcomeMessageInput.value = this.currentSettings.welcomeMessage;
    // Set model instructions if present
    if (this.elements.modelInstructionsInput) {
      this.elements.modelInstructionsInput.value = this.currentSettings.modelInstructions || '';
    }
    // Voice Live endpoint / api key
    if (this.elements.voiceLiveEndpointInput) {
      this.elements.voiceLiveEndpointInput.value = this.currentSettings.voiceLiveEndpoint || '';
    }
    if (this.elements.voiceLiveApiKeyInput) {
      this.elements.voiceLiveApiKeyInput.value = this.currentSettings.voiceLiveApiKey || '';
    }
    
    // Set toast notifications toggle
    if (this.elements.toastNotificationsToggle) {
      this.elements.toastNotificationsToggle.checked = this.currentSettings.showToastNotifications !== false;
    }

    // Set Foundry Agent settings
    if (this.elements.foundryProjectInput) {
      this.elements.foundryProjectInput.value = this.currentSettings.foundryProjectName || '';
    }
    if (this.elements.foundryAgentInput) {
      this.elements.foundryAgentInput.value = this.currentSettings.foundryAgentId || '';
    }
    if (this.elements.localeSelect) {
      this.elements.localeSelect.value = this.currentSettings.locale || this.currentSettings.language || 'it-IT';
    }
  }
  
  /**
   * Load theme preference from localStorage
   */
  loadThemePreference() {
    const themeKey = `voiceAgent_${this.pageName}_theme`;
    const savedTheme = localStorage.getItem(themeKey);
    if (savedTheme) {
      return savedTheme === 'dark';
    }
    // Default to dark mode
    return true;
  }
  
  /**
   * Toggle theme between dark and light mode
   */
  toggleTheme() {
    this.isDarkMode = !this.isDarkMode;
    this.applyTheme();
    const themeKey = `voiceAgent_${this.pageName}_theme`;
    localStorage.setItem(themeKey, this.isDarkMode ? 'dark' : 'light');
    addTraceEntry('system', `Tema cambiato a ${this.isDarkMode ? 'scuro' : 'chiaro'}`);
  }
  
  /**
   * Apply the current theme to the document
   */
  applyTheme() {
    if (this.isDarkMode) {
      document.body.classList.remove('light-mode');
    } else {
      document.body.classList.add('light-mode');
    }
    // Accessibility: update toggle button aria state and label
    try {
      const btn = this.elements && this.elements.themeToggleButton;
      if (btn) {
        // aria-pressed reflects whether dark mode is active
        btn.setAttribute('aria-pressed', String(!!this.isDarkMode));
        btn.setAttribute('aria-label', this.isDarkMode ? 'Tema scuro attivo. Premi per cambiare.' : 'Tema chiaro attivo. Premi per cambiare.');
      }
    } catch (e) {
      // ignore if elements not initialized
    }
  }
  
  /**
   * Save settings from modal
   */
  saveSettingsFromModal() {
    const newSettings = {
      voiceModel: this.elements.voiceModelSelect.value,
      voice: this.elements.voiceSelect.value,
      welcomeMessage: this.elements.welcomeMessageInput.value,
      modelInstructions: this.elements.modelInstructionsInput ? this.elements.modelInstructionsInput.value : '',
      voiceLiveEndpoint: this.elements.voiceLiveEndpointInput ? this.elements.voiceLiveEndpointInput.value.trim() : '',
      voiceLiveApiKey: this.elements.voiceLiveApiKeyInput ? this.elements.voiceLiveApiKeyInput.value.trim() : '',
      showToastNotifications: this.elements.toastNotificationsToggle ? this.elements.toastNotificationsToggle.checked : false,
      // Foundry Agent settings
      foundryAgentId: this.elements.foundryAgentInput ? this.elements.foundryAgentInput.value : '',
      foundryProjectName: this.elements.foundryProjectInput ? this.elements.foundryProjectInput.value : '',
      locale: this.elements.localeSelect ? this.elements.localeSelect.value : 'it-IT',
      language: this.elements.localeSelect ? this.elements.localeSelect.value : 'it-IT'
    };
    
    // Validate compatibility
    const validation = validateModelVoiceCompatibility(newSettings.voiceModel, newSettings.voice);
    if (!validation.valid) {
      this.conditionalShowToast(validation.message, 'error');
      return;
    }
    
    // Save to localStorage
    if (saveSettings(newSettings, this.pageName)) {
      this.currentSettings = newSettings;
      addTraceEntry('system', 'Impostazioni salvate');
      this.conditionalShowToast('Impostazioni salvate con successo', 'success');
      hideSettingsModal();
      
      // If session is active, notify user to restart
      if (this.isSessionActive) {
        this.conditionalShowToast('Riavvia la sessione per applicare le nuove impostazioni', 'info');
      }
    }
  }
  
  /**
   * Start voice agent session
   */
  async startSession() {
    try {
      // Refresh currentSettings from modal inputs in case user changed values but did not click Save
      this.currentSettings = {
        ...this.currentSettings,
        voiceModel: this.elements.voiceModelSelect ? this.elements.voiceModelSelect.value : this.currentSettings.voiceModel,
        voice: this.elements.voiceSelect ? this.elements.voiceSelect.value : this.currentSettings.voice,
        welcomeMessage: this.elements.welcomeMessageInput ? this.elements.welcomeMessageInput.value : this.currentSettings.welcomeMessage,
        modelInstructions: this.elements.modelInstructionsInput ? this.elements.modelInstructionsInput.value : this.currentSettings.modelInstructions,
        voiceLiveEndpoint: this.elements.voiceLiveEndpointInput ? this.elements.voiceLiveEndpointInput.value.trim() : this.currentSettings.voiceLiveEndpoint,
        voiceLiveApiKey: this.elements.voiceLiveApiKeyInput ? this.elements.voiceLiveApiKeyInput.value.trim() : this.currentSettings.voiceLiveApiKey,
        showToastNotifications: this.elements.toastNotificationsToggle ? this.elements.toastNotificationsToggle.checked : this.currentSettings.showToastNotifications,
        // Foundry Agent settings
        foundryAgentId: this.elements.foundryAgentInput ? this.elements.foundryAgentInput.value : this.currentSettings.foundryAgentId,
        foundryProjectName: this.elements.foundryProjectInput ? this.elements.foundryProjectInput.value : this.currentSettings.foundryProjectName,
        locale: this.elements.localeSelect ? this.elements.localeSelect.value : this.currentSettings.locale
      };

      // Validate settings
      const validation = validateModelVoiceCompatibility(
        this.currentSettings.voiceModel,
        this.currentSettings.voice
      );
      
      if (!validation.valid) {
        this.conditionalShowToast(validation.message, 'error');
        showSettingsModal();
        return;
      }
      
      updateStatus('Connessione in corso...', 'disconnected');
      addTraceEntry('system', 'Connessione in corso...');
      
      // Connect WebSocket
      await this.wsHandler.connect();
      
      // Send configuration
      // Ensure the settings include voice live fields before sending
      const configToSend = {
        ...this.currentSettings,
        voiceLiveEndpoint: this.currentSettings.voiceLiveEndpoint || '',
        voiceLiveApiKey: this.currentSettings.voiceLiveApiKey || ''
      };
      // Ensure model instructions key exists and is included in the config
      configToSend.modelInstructions = this.currentSettings.modelInstructions || '';
      this.wsHandler.sendConfig(configToSend);
      
      // Start microphone
      await this.audioHandler.startMicrophone();
      
      // Activate visualizer
      this.visualizer.setActive(true);
      
      // Update UI state
      this.isSessionActive = true;
      this.elements.startButton.classList.add('active');
      this.elements.muteButton.classList.remove('muted');
      
      updateStatus('Sessione attiva', 'connected');
      this.conditionalShowToast('Sessione avviata', 'success');
      
      // Add system message to transcript
      const voiceName = getVoiceName(this.currentSettings.voice);
      addTranscript('system', `Sessione avviata con ${voiceName}`);
      addTraceEntry('system', `Sessione avviata con ${voiceName}`);
      
    } catch (error) {
      console.error('Error starting session:', error);
      this.conditionalShowToast('Impossibile avviare la sessione', 'error');
      addTraceEntry('system', `Errore avvio sessione: ${error.message}`);
      this.stopSession();
    }
  }
  
  /**
   * Stop voice agent session
   */
  stopSession() {
    try {
      // Send stop message to server
      if (this.wsHandler) {
        this.wsHandler.sendStop();
      }
      
      // Stop microphone
      if (this.audioHandler) {
        this.audioHandler.stopMicrophone();
        this.audioHandler.stopPlayback();
      }
      
      // Deactivate visualizer
      if (this.visualizer) {
        this.visualizer.setActive(false);
      }
      
      // Disconnect WebSocket
      if (this.wsHandler) {
        this.wsHandler.disconnect();
      }
      
      // Update UI state
      this.isSessionActive = false;
      this.elements.startButton.classList.remove('active');
      this.elements.muteButton.classList.add('muted');
      
      updateStatus('Sessione terminata', 'disconnected');
      this.conditionalShowToast('Sessione terminata', 'info');
      
      // Add system message to transcript
      addTranscript('system', 'Sessione terminata');
      addTraceEntry('system', 'Sessione terminata');
      
    } catch (error) {
      console.error('Error stopping session:', error);
      addTraceEntry('system', `Errore arresto sessione: ${error.message}`);
    }
  }
  
  /**
   * Toggle microphone mute
   */
  toggleMute() {
    if (!this.audioHandler) return;
    
    const isMuted = this.audioHandler.toggleMute();
    
    if (isMuted) {
      this.elements.muteButton.classList.add('muted');
      // Accessibility: reflect pressed state and label
      try { this.elements.muteButton.setAttribute('aria-pressed', 'true'); } catch(e) {}
      try { this.elements.muteButton.setAttribute('aria-label', 'Microfono disattivato'); } catch(e) {}
      this.conditionalShowToast('Microfono disattivato', 'warning');
      addTraceEntry('system', 'Microfono disattivato');
    } else {
      this.elements.muteButton.classList.remove('muted');
      try { this.elements.muteButton.setAttribute('aria-pressed', 'false'); } catch(e) {}
      try { this.elements.muteButton.setAttribute('aria-label', 'Microfono attivato'); } catch(e) {}
      this.conditionalShowToast('Microfono attivato', 'success');
      addTraceEntry('system', 'Microfono attivato');
    }
  }
  
  /**
   * Send text message to agent
   */
  sendTextMessage() {
    const text = this.elements.textInput.value.trim();
    
    if (!text) return;
    
    if (!this.isSessionActive) {
      this.conditionalShowToast('Avvia una sessione per inviare messaggi', 'warning');
      addTraceEntry('system', 'Tentativo di inviare messaggio senza sessione attiva');
      return;
    }
    
    // Add to transcript
    addTranscript('user', text);
    addTraceEntry('user', text);
    
    // Clear input
    this.elements.textInput.value = '';
    autoResizeTextarea(this.elements.textInput);
    
    // TODO: Send text to server via WebSocket
    // This would require a new message type in the protocol
    //this.conditionalShowToast('Invio di messaggi di testo non ancora supportato dal server', 'info');
    //addTraceEntry('system', 'Tentativo invio messaggio di testo (non ancora supportato)');
    this.sendTextMessageToServer(text);

  }

  /**
   * Send a plain text message to the server over the WebSocket
   * @param {string} text - Message text
   */
  sendTextMessageToServer(text) {
    try {
      if (!text) return;

      if (!this.wsHandler || !this.wsHandler.isSocketConnected()) {
        this.conditionalShowToast('Connessione assente: impossibile inviare messaggio', 'error');
        addTraceEntry('system', 'Tentativo invio messaggio senza connessione WebSocket');
        return;
      }

      // Use WebSocketHandler.sendMessage which follows the server protocol (Kind: 'Message')
      this.wsHandler.sendMessage(text);
      addTraceEntry('system', `Messaggio inviato al server: ${text}`);
      this.conditionalShowToast('Messaggio inviato', 'success');
    } catch (error) {
      console.error('Error sending text message to server:', error);
      addTraceEntry('system', `Errore invio messaggio: ${error.message}`);
      this.conditionalShowToast('Errore durante l\'invio del messaggio', 'error');
    }
  }
  
  /**
   * Handle WebSocket connection opened
   */
  handleWebSocketOpen() {
    updateStatus('In attesa della sessione...', 'disconnected');
    addTraceEntry('system', 'WebSocket connesso');
  }
  
  /**
   * Handle WebSocket connection closed
   */
  handleWebSocketClose() {
    if (this.isSessionActive) {
      // Unexpected disconnect
      this.conditionalShowToast('Connessione persa', 'error');
      addTraceEntry('system', 'Connessione WebSocket persa');
      this.stopSession();
    }
  }
  
  /**
   * Handle incoming audio from server
   * @param {ArrayBuffer} arrayBuffer - Audio data
   */
  handleIncomingAudio(arrayBuffer) {
    // Convert ArrayBuffer to base64 for queueing
    // (AudioHandler expects base64 from original implementation)
    const uint8Array = new Uint8Array(arrayBuffer);
    let binaryString = '';
    for (let i = 0; i < uint8Array.length; i++) {
      binaryString += String.fromCharCode(uint8Array[i]);
    }
    const base64 = btoa(binaryString);
    
    // Queue for playback
    this.audioHandler.queueAudio(base64);
  }
  
  /**
   * Handle transcription from server
   * @param {string} text - Transcribed text
   * @param {string} role - 'user' or 'agent'
   */
  handleTranscription(text, role) {
    // Visualizer handles speaking animation via RMS ingestion.
    // Update visualizer mode so it can react differently for assistant vs user.
    if (this.visualizer) {
      this.visualizer.setMode(role === 'agent' ? 'assistant' : 'user');
    }

    // Update status if agent is speaking
    if (role === 'agent') {
      updateStatus('Assistente sta parlando...', 'speaking');
    }
  }
  
  /**
   * Handle stop audio command from server
   */
  handleStopAudio() {
    if (this.audioHandler) {
      this.audioHandler.stopPlayback();
    }
    updateStatus('Sessione attiva', 'connected');
  }
  
  /**
   * Handle WebSocket error
   * @param {Error} error - Error object
   */
  handleWebSocketError(error) {
    console.error('WebSocket error:', error);
    addTraceEntry('system', `Errore WebSocket: ${error.message}`);
    if (this.isSessionActive) {
      this.stopSession();
    }
  }
}

/**
 * Initialize application when DOM is ready
 */
document.addEventListener('DOMContentLoaded', () => {
  try {
    const app = new VoiceAgentApp();
    app.init();
    
    // Make app globally accessible for debugging (optional)
    window.voiceAgentApp = app;
    
  } catch (error) {
    console.error('Fatal error:', error);
    showErrorBoundary(`Errore critico: ${error.message}`);
  }
});
