/**
 * Voice Agent Application Module
 * 
 * Specific logic for the Voice Agent page (Foundry enabled).
 */

import { wireFoundryUi } from './foundry-agents.js';
import { VOICE_MODELS, VOICES, getVoiceName } from '../core/config.js';
import { VoiceVisualizerFactory } from '../modules/voice-visualizer-factory.js';
import { AudioHandler } from './audio-handler.js';
import { WebSocketHandler } from './websocket-handler.js';
import { SettingsManager } from '../modules/settings-manager.js';
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
} from '../ui/ui-utils.js';

import { getSavedTheme, applyThemeMode, toggleTheme, listenForExternalChanges, saveTheme } from '../ui/theme-sync.js';
import { initHamburgerMenu } from '/js/ui/hamburger-menu.js';

/**
 * Voice Agent Application Class
 */
class VoiceAgentApp {
  constructor() {
    this.pageName = 'VoiceAgent';
    
    // Application state
    this.isSessionActive = false;
    this.currentSettings = loadSettings(this.pageName);
    this.traceCount = 0;
    
    // Module instances
    this.visualizer = null;
    this.audioHandler = null;
    this.wsHandler = null;
    
    // DOM elements
    this.elements = {};
    
    // Theme state (use centralized theme)
    this.isDarkMode = getSavedTheme() === 'dark';
    
    // Event listener tracking for cleanup
    this.eventListeners = [];
  }

  /**
   * Initialize the application
   */
  async init() {
    try {
      // Initialize Foundry UI support
      await wireFoundryUi().catch(err => console.error('Error initializing Foundry UI:', err));

      // Get DOM references
      const uiPresent = this.initDOMReferences();
      if (!uiPresent) {
        console.log('Voice Agent UI not present. Skipping initialization.');
        return;
      }
      
      // Apply saved theme
      applyThemeMode(getSavedTheme());
      
      // Initialize visualizer using the configured type from shared uiSettings
      // Check both the shared uiSettings and the page-specific settings
      const sharedUISettings = new SettingsManager('uiSettings', {}).getAll();
      const visualizerType = sharedUISettings.visualizerType || this.currentSettings.visualizerType || 'wave';
      console.log('📊 Initializing visualizer with type:', visualizerType);
      this.visualizer = await VoiceVisualizerFactory.createVisualizer(visualizerType, this.elements.canvas);
      
      // Initialize audio handler
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
      
      // Setup audio data callback
      this.audioHandler.setAudioDataCallback((audioBuffer) => {
        if (this.wsHandler && this.wsHandler.isSocketConnected()) {
          this.wsHandler.sendAudio(audioBuffer);
        }
      });
      
      // Setup event listeners
      this.setupEventListeners();
      
      initHamburgerMenu();
      
      // Populate settings
      this.populateSettings();

      // Relocate controls for small screens
      // this.relocateControlsForSmallScreens();
      this.enableLeftPanelFocusTrap();
      
      // Initial mute state
      if (this.elements.muteButton) {
        this.elements.muteButton.classList.add('muted');
        try { this.elements.muteButton.setAttribute('aria-pressed', 'true'); } catch(e) {}
      }

      // Initial status
      updateStatus(window.APP_RESOURCES?.WaitingForConnection || 'Waiting for connection...', 'disconnected');
      addTraceEntry('system', window.APP_RESOURCES?.VoiceAgentAppInitialized || 'Voice Agent Application initialized');
      
      console.log('Voice Agent App initialized');
      
    } catch (error) {
      console.error('Fatal error during initialization:', error);
      addTraceEntry('system', (window.APP_RESOURCES?.InitializationError || 'Initialization error: {0}').replace('{0}', error.message));
      showErrorBoundary((window.APP_RESOURCES?.ErrorDuringAppInitialization || 'Error during application initialization: {0}').replace('{0}', error.message));
    }
  }
  
  /**
   * Initialize DOM element references
   */
  initDOMReferences() {
    this.elements = {
      canvas: document.getElementById('voiceCanvas'),
      startButton: document.getElementById('startButton'),
      muteButton: document.getElementById('muteButton'),
      settingsButton: document.getElementById('settingsButton'),
      themeToggleButton: document.getElementById('themeToggleButton'),
      chatToggle: document.getElementById('chatToggle'),
      traceToggle: document.getElementById('traceToggle'),
      clearChatButton: document.getElementById('clearChatButton'),
      clearTraceButton: document.getElementById('clearTraceButton'),
      
      settingsModal: document.getElementById('settingsModal'),
      closeSettingsButton: document.getElementById('closeSettingsButton'),
      saveSettingsButton: document.getElementById('saveSettingsButton'),
      voiceModelSelect: document.getElementById('voiceModelSelect'),
      voiceSelect: document.getElementById('voiceSelect'),
      welcomeMessageInput: document.getElementById('welcomeMessageInput'),
      voiceLiveEndpointInput: document.getElementById('voiceLiveEndpointInput'),
      voiceLiveApiKeyInput: document.getElementById('voiceLiveApiKeyInput'),
      modelInstructionsInput: document.getElementById('modelInstructionsInput'),
      toastNotificationsToggle: document.getElementById('toastNotificationsToggle'),
      
      // Foundry specific
      foundryProjectInput: document.getElementById('foundryProjectInput'),
      foundryAgentInput: document.getElementById('foundryAgentInput'),
      localeSelect: document.getElementById('localeSelect'),
      
      transcriptBox: document.getElementById('transcriptBox'),
      transcriptContent: document.getElementById('transcriptContent'),
      textInput: document.getElementById('textInput'),
      sendTextButton: document.getElementById('sendTextButton'),
      tracePanel: document.getElementById('tracePanel'),
      traceContent: document.getElementById('traceContent'),
      
      hamburgerButton: document.getElementById('hamburgerButton'),
      leftPanel: document.getElementById('leftPanel'),
      closeLeftPanel: document.getElementById('closeLeftPanel'),
      
      // Left panel mapped buttons (if they exist)
      lp_startButton: document.getElementById('lp_startButton'),
      lp_muteButton: document.getElementById('lp_muteButton'),
      lp_traceToggle: document.getElementById('lp_traceToggle'),
      lp_settingsButton: document.getElementById('lp_settingsButton'),
      lp_chatToggle: document.getElementById('lp_chatToggle')
    };
    
    return !!(this.elements.canvas && this.elements.startButton);
  }
  
  safeAddListener(element, event, handler) {
    if (element) {
      element.addEventListener(event, handler);
      // Track listener for cleanup
      this.eventListeners.push({ element, event, handler });
    }
  }

  /**
   * Remove all tracked event listeners (cleanup)
   */
  cleanup() {
    this.eventListeners.forEach(({ element, event, handler }) => {
      if (element && element.removeEventListener) {
        element.removeEventListener(event, handler);
      }
    });
    this.eventListeners = [];
  }

  conditionalShowToast(message, type = 'info') {
    if (this.currentSettings && this.currentSettings.showToastNotifications !== false) {
      showToast(message, type);
    }
  }

  setupEventListeners() {
    // Start/Stop
    this.safeAddListener(this.elements.startButton, 'click', () => {
      this.isSessionActive ? this.stopSession() : this.startSession();
    });
    
    // Mute
    this.safeAddListener(this.elements.muteButton, 'click', () => {
      // Prevent unmute if session not active
      const currentlyMuted = this.elements.muteButton.classList.contains('muted');
      if (!this.isSessionActive && currentlyMuted) {
        this.conditionalShowToast(window.APP_RESOURCES?.StartSessionBeforeMicrophone || 'Start a session before activating the microphone', 'warning');
        return;
      }
      this.toggleMute();
    });
    
    // Settings
    this.safeAddListener(this.elements.settingsButton, 'click', () => showSettingsModal());
    this.safeAddListener(this.elements.closeSettingsButton, 'click', () => hideSettingsModal());
    this.safeAddListener(this.elements.saveSettingsButton, 'click', () => this.saveSettingsFromModal());
    this.safeAddListener(this.elements.settingsModal, 'click', (e) => {
      if (e.target === this.elements.settingsModal) hideSettingsModal();
    });
    
    // Chat
    this.safeAddListener(this.elements.chatToggle, 'click', () => toggleTranscriptPanel());
    this.safeAddListener(this.elements.clearChatButton, 'click', () => {
      clearTranscripts();
      this.conditionalShowToast(window.APP_RESOURCES?.ConversationCleared || 'Conversation cleared', 'info');
    });
    this.safeAddListener(this.elements.sendTextButton, 'click', () => this.sendTextMessage());
    this.safeAddListener(this.elements.textInput, 'keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        this.sendTextMessage();
      }
    });
    this.safeAddListener(this.elements.textInput, 'input', () => autoResizeTextarea(this.elements.textInput));
    
    // Trace
    this.safeAddListener(this.elements.traceToggle, 'click', () => toggleTracePanel());
    this.safeAddListener(this.elements.clearTraceButton, 'click', () => {
      clearTraceEntries();
      addTraceEntry('system', window.APP_RESOURCES?.TraceCleared || 'Trace cleared');
    });
    
    // Theme
    this.safeAddListener(this.elements.themeToggleButton, 'click', () => {
      // toggle centrally and save
      toggleTheme();
      this.isDarkMode = getSavedTheme() === 'dark';
    });

    // Listen for theme changes from other tabs/pages
    listenForExternalChanges((mode) => {
      this.isDarkMode = mode === 'dark';
    });
    
    // Voice selection
    this.safeAddListener(this.elements.voiceSelect, 'change', () => {
      updateWelcomeMessageInput(this.elements.voiceSelect.value, this.elements.welcomeMessageInput);
    });
    
    // Mobile Menu - Handled by initHamburgerMenu
    
    // Left panel mappings
    this.safeAddListener(this.elements.lp_startButton, 'click', () => { this.elements.startButton.click(); document.body.classList.remove('menu-open'); });
    this.safeAddListener(this.elements.lp_muteButton, 'click', () => { this.elements.muteButton.click(); document.body.classList.remove('menu-open'); });
    this.safeAddListener(this.elements.lp_traceToggle, 'click', () => { this.elements.traceToggle.click(); document.body.classList.remove('menu-open'); });
    this.safeAddListener(this.elements.lp_settingsButton, 'click', () => { this.elements.settingsButton.click(); document.body.classList.remove('menu-open'); });
    this.safeAddListener(this.elements.lp_chatToggle, 'click', () => { this.elements.chatToggle.click(); document.body.classList.remove('menu-open'); });
    
    // Overlay click - Handled by initHamburgerMenu
    /*
    const overlayClickHandler = (e) => {
      const overlay = document.querySelector('.left-panel-overlay');
      if (overlay && overlay.classList.contains('visible') && e.target === overlay) {
        this.closeLeftPanel();
      }
    };
    document.addEventListener('click', overlayClickHandler);
    this.eventListeners.push({ element: document, event: 'click', handler: overlayClickHandler });
    */
    
    // Escape key - Handled by initHamburgerMenu (partially, for menu)
    const escapeHandler = (e) => {
      if (e.key === 'Escape') {
        hideSettingsModal();
        // this.closeLeftPanel(); // Handled by initHamburgerMenu
      }
    };
    document.addEventListener('keydown', escapeHandler);
    this.eventListeners.push({ element: document, event: 'keydown', handler: escapeHandler });
  }



  relocateControlsForSmallScreens() {
    const panelBody = document.getElementById('leftPanelBody');
    if (!panelBody || !this.elements.leftPanel) return;

    const mq = window.matchMedia('(max-width: 768px)');
    const moveIn = () => {
      if (mq.matches) {
        const controls = ['startButton','muteButton','traceToggle','settingsButton','chatToggle'];
        controls.forEach(id => {
          const el = document.getElementById(id);
          if (el && !panelBody.contains(el)) {
            const wrapper = document.createElement('div');
            wrapper.className = 'left-panel-control-wrapper';
            wrapper.appendChild(el);
            panelBody.appendChild(wrapper);
          }
        });
      } else {
        const wrappers = panelBody.querySelectorAll('.left-panel-control-wrapper');
        wrappers.forEach(w => {
          const child = w.firstElementChild;
          if (child) document.querySelector('.main-container').appendChild(child);
          w.remove();
        });
      }
    };
    moveIn();
    mq.addEventListener('change', moveIn);
  }

  enableLeftPanelFocusTrap() {
    const panel = this.elements.leftPanel;
    if (!panel) return;
    panel.addEventListener('keydown', (e) => {
      if (e.key !== 'Tab') return;
      const focusable = panel.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey) {
        if (document.activeElement === first) { e.preventDefault(); last.focus(); }
      } else {
        if (document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    });
  }
  
  populateSettings() {
    // Voice Models
    this.elements.voiceModelSelect.innerHTML = '';
    VOICE_MODELS.forEach(model => {
      const option = document.createElement('option');
      option.value = model.id;
      option.textContent = `${model.name} - ${model.description}`;
      if (model.id === this.currentSettings.voiceModel) option.selected = true;
      this.elements.voiceModelSelect.appendChild(option);
    });
    
    // Voices
    this.elements.voiceSelect.innerHTML = '';
    VOICES.forEach(voice => {
      const option = document.createElement('option');
      option.value = voice.id;
      option.textContent = voice.displayName;
      if (voice.id === this.currentSettings.voice) option.selected = true;
      this.elements.voiceSelect.appendChild(option);
    });
    
    // Other settings
    if (this.elements.welcomeMessageInput) this.elements.welcomeMessageInput.value = this.currentSettings.welcomeMessage || '';
    if (this.elements.modelInstructionsInput) this.elements.modelInstructionsInput.value = this.currentSettings.modelInstructions || '';
    if (this.elements.voiceLiveEndpointInput) this.elements.voiceLiveEndpointInput.value = this.currentSettings.voiceLiveEndpoint || '';
    if (this.elements.voiceLiveApiKeyInput) this.elements.voiceLiveApiKeyInput.value = this.currentSettings.voiceLiveApiKey || '';
    if (this.elements.toastNotificationsToggle) this.elements.toastNotificationsToggle.checked = this.currentSettings.showToastNotifications !== false;
    
    // Foundry
    if (this.elements.foundryProjectInput) this.elements.foundryProjectInput.value = this.currentSettings.foundryProjectName || '';
    if (this.elements.foundryAgentInput) this.elements.foundryAgentInput.value = this.currentSettings.foundryAgentId || '';
    if (this.elements.localeSelect) this.elements.localeSelect.value = this.currentSettings.locale || 'en-US';
  }
  
  // Deprecated per-page methods kept for compatibility (no-op)
  loadThemePreference() { return getSavedTheme() === 'dark'; }
  toggleTheme() { toggleTheme(); this.isDarkMode = getSavedTheme() === 'dark'; }
  applyTheme() { applyThemeMode(getSavedTheme()); }
  
  saveSettingsFromModal() {
    const newSettings = {
      voiceModel: this.elements.voiceModelSelect.value,
      voice: this.elements.voiceSelect.value,
      welcomeMessage: this.elements.welcomeMessageInput.value,
      modelInstructions: this.elements.modelInstructionsInput ? this.elements.modelInstructionsInput.value : '',
      voiceLiveEndpoint: this.elements.voiceLiveEndpointInput ? this.elements.voiceLiveEndpointInput.value.trim() : '',
      voiceLiveApiKey: this.elements.voiceLiveApiKeyInput ? this.elements.voiceLiveApiKeyInput.value.trim() : '',
      showToastNotifications: this.elements.toastNotificationsToggle ? this.elements.toastNotificationsToggle.checked : false,
      
      // Foundry
      foundryAgentId: this.elements.foundryAgentInput ? this.elements.foundryAgentInput.value : '',
      foundryProjectName: this.elements.foundryProjectInput ? this.elements.foundryProjectInput.value : '',
      locale: this.elements.localeSelect ? this.elements.localeSelect.value : 'en-US',
      language: this.elements.localeSelect ? this.elements.localeSelect.value : 'en-US'
    };
    
    const validation = validateModelVoiceCompatibility(newSettings.voiceModel, newSettings.voice);
    if (!validation.valid) {
      this.conditionalShowToast(validation.message, 'error');
      return;
    }
    
    if (saveSettings(newSettings, this.pageName)) {
      this.currentSettings = newSettings;
      addTraceEntry('system', window.APP_RESOURCES?.SettingsSaved || 'Settings saved');
        this.conditionalShowToast(window.APP_RESOURCES?.SettingsSaved || 'Settings saved', 'success');
      hideSettingsModal();
      if (this.isSessionActive) {
        this.conditionalShowToast(window.APP_RESOURCES?.RestartSessionForChanges || 'Restart the session to apply changes', 'info');
      }
    }
  }
  
  async startSession() {
    try {
      // Refresh settings from UI
      this.saveSettingsFromModal(); // This saves and updates currentSettings
      
      updateStatus(window.APP_RESOURCES?.Connecting || 'Connecting...', 'disconnected');
      addTraceEntry('system', window.APP_RESOURCES?.Connecting || 'Connecting...');
      
      await this.wsHandler.connect();
      
      const configToSend = {
        ...this.currentSettings,
        voiceLiveEndpoint: this.currentSettings.voiceLiveEndpoint || '',
        voiceLiveApiKey: this.currentSettings.voiceLiveApiKey || '',
        modelInstructions: this.currentSettings.modelInstructions || ''
      };
      
      this.wsHandler.sendConfig(configToSend);
      await this.audioHandler.startMicrophone();
      this.visualizer.setActive(true);
      
      this.isSessionActive = true;
      this.elements.startButton.classList.add('active');
      this.elements.muteButton.classList.remove('muted');
      
      updateStatus(window.APP_RESOURCES?.SessionActive || 'Session active', 'connected');
      this.conditionalShowToast(window.APP_RESOURCES?.SessionStarted || 'Session started', 'success');
      
      const voiceName = getVoiceName(this.currentSettings.voice);
      addTranscript('system', (window.APP_RESOURCES?.SessionStartedWith || 'Session started with {0}').replace('{0}', voiceName));
      
    } catch (error) {
      console.error('Error starting session:', error);
      this.conditionalShowToast(window.APP_RESOURCES?.SessionStartFailed || 'Unable to start session', 'error');
      addTraceEntry('system', (window.APP_RESOURCES?.SessionStartError || 'Session start error: {0}').replace('{0}', error.message));
      this.stopSession();
    }
  }
  
  stopSession() {
    try {
      if (this.wsHandler) this.wsHandler.sendStop();
      if (this.audioHandler) {
        this.audioHandler.stopMicrophone();
        this.audioHandler.stopPlayback();
      }
      if (this.visualizer) this.visualizer.setActive(false);
      if (this.wsHandler) this.wsHandler.disconnect();
      
      this.isSessionActive = false;
      this.elements.startButton.classList.remove('active');
      this.elements.muteButton.classList.add('muted');
      
      updateStatus(window.APP_RESOURCES?.SessionEnded || 'Session ended', 'disconnected');
      this.conditionalShowToast(window.APP_RESOURCES?.SessionEnded || 'Session ended', 'info');
      addTranscript('system', window.APP_RESOURCES?.SessionEnded || 'Session ended');
      
    } catch (error) {
      console.error('Error stopping session:', error);
    }
  }
  
  toggleMute() {
    if (!this.audioHandler) return;
    const isMuted = this.audioHandler.toggleMute();
    if (isMuted) {
      this.elements.muteButton.classList.add('muted');
      this.elements.muteButton.setAttribute('aria-pressed', 'true');
      this.conditionalShowToast(window.APP_RESOURCES?.MicrophoneMuted || 'Microphone muted', 'warning');
    } else {
      this.elements.muteButton.classList.remove('muted');
      this.elements.muteButton.setAttribute('aria-pressed', 'false');
      this.conditionalShowToast(window.APP_RESOURCES?.MicrophoneUnmuted || 'Microphone unmuted', 'success');
    }
  }
  
  sendTextMessage() {
    const text = this.elements.textInput.value.trim();
    if (!text) return;
    
    if (!this.isSessionActive) {
      this.conditionalShowToast(window.APP_RESOURCES?.StartSessionBeforeMessage || 'Start a session to send messages', 'warning');
      return;
    }
    
    addTranscript('user', text);
    addTraceEntry('user', text);
    this.elements.textInput.value = '';
    autoResizeTextarea(this.elements.textInput);
    
    this.sendTextMessageToServer(text);
  }

  sendTextMessageToServer(text) {
    try {
      if (this.wsHandler && this.wsHandler.isSocketConnected()) {
        this.wsHandler.sendMessage(text);
        addTraceEntry('system', (window.APP_RESOURCES?.MessageSent || 'Message sent: {0}').replace('{0}', text));
      } else {
        this.conditionalShowToast(window.APP_RESOURCES?.ConnectionError || 'Connection error', 'error');
      }
    } catch (error) {
      console.error('Error sending text:', error);
    }
  }
  
  handleWebSocketOpen() {
    updateStatus(window.APP_RESOURCES?.Connected || 'Connected', 'connected');
    addTraceEntry('system', window.APP_RESOURCES?.WebSocketConnected || 'WebSocket connected');
  }
  
  handleWebSocketClose() {
    if (this.isSessionActive) {
      this.conditionalShowToast(window.APP_RESOURCES?.ConnectionLost || 'Connection lost', 'error');
      this.stopSession();
    }
  }
  
  handleIncomingAudio(arrayBuffer) {
    const uint8Array = new Uint8Array(arrayBuffer);
    let binaryString = '';
    for (let i = 0; i < uint8Array.length; i++) binaryString += String.fromCharCode(uint8Array[i]);
    const base64 = btoa(binaryString);
    this.audioHandler.queueAudio(base64);
  }
  
  handleTranscription(text, role) {
    if (this.visualizer) this.visualizer.setMode(role === 'agent' ? 'assistant' : 'user');
    if (role === 'agent') updateStatus(window.APP_RESOURCES?.AssistantSpeaking || 'Assistant is speaking...', 'speaking');
  }
  
  handleStopAudio() {
    if (this.audioHandler) this.audioHandler.stopPlayback();
    updateStatus(window.APP_RESOURCES?.SessionActive || 'Session active', 'connected');
  }
  
  handleWebSocketError(error) {
    console.error('WebSocket error:', error);
    addTraceEntry('system', `${window.APP_RESOURCES?.WebSocketError || 'WebSocket error'}: ${error.message}`);
    if (this.isSessionActive) this.stopSession();
  }
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  const app = new VoiceAgentApp();
  app.init();
  window.voiceAgentApp = app;
  
  // Cleanup event listeners on unload
  window.addEventListener('beforeunload', () => {
    app.cleanup();
  });
});
