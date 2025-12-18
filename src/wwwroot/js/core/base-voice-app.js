/**
 * Base Voice Application Class
 * 
 * Provides common functionality for Voice Agent, Voice Assistant, and Voice Avatar.
 */

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

import { getSavedTheme, applyThemeMode, toggleTheme, listenForExternalChanges } from '../ui/theme-sync.js';
import { initHamburgerMenu } from '/js/ui/hamburger-menu.js';
import { VOICE_MODELS, VOICES } from './config.js';

export class BaseVoiceApp {
  constructor(pageName) {
    this.pageName = pageName;
    
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
    
    // Theme state
    this.isDarkMode = getSavedTheme() === 'dark';
    
    // Event listener tracking for cleanup
    this.eventListeners = [];
  }

  /**
   * Initialize the application
   */
  async init() {
    try {
      // Apply saved theme
      applyThemeMode(getSavedTheme());
      
      initHamburgerMenu();

      // Get DOM references
      const uiPresent = this.initDOMReferences();
      if (!uiPresent) {
        console.log(`${this.pageName} UI not present on this page. Skipping full app initialization.`);
        return false;
      }
      
      // Setup event listeners
      this.setupEventListeners();
      
      // Populate settings
      await this.populateSettings();

      // Initial status
      updateStatus(window.APP_RESOURCES?.WaitingForConnection || 'Waiting for connection...', 'disconnected');
      addTraceEntry('system', `${this.pageName} Application initialized`);
      
      // Listen for external theme changes
      listenForExternalChanges((mode) => {
        this.isDarkMode = mode === 'dark';
      });

      return true;
    } catch (error) {
      console.error(`Fatal error during ${this.pageName} initialization:`, error);
      showErrorBoundary((window.APP_RESOURCES?.ErrorDuringAppInitialization || 'Error during application initialization: {0}').replace('{0}', error.message));
      return false;
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
      
      transcriptBox: document.getElementById('transcriptBox'),
      transcriptContent: document.getElementById('transcriptContent'),
      textInput: document.getElementById('textInput'),
      sendTextButton: document.getElementById('sendTextButton'),
      tracePanel: document.getElementById('tracePanel'),
      traceContent: document.getElementById('traceContent'),
      
      hamburgerButton: document.getElementById('hamburgerButton'),
      leftPanel: document.getElementById('leftPanel'),
      closeLeftPanel: document.getElementById('closeLeftPanel'),
      
      // Left panel mapped buttons
      lp_startButton: document.getElementById('lp_startButton'),
      lp_muteButton: document.getElementById('lp_muteButton'),
      lp_traceToggle: document.getElementById('lp_traceToggle'),
      lp_settingsButton: document.getElementById('lp_settingsButton'),
      lp_chatToggle: document.getElementById('lp_chatToggle')
    };
    
    return !!(this.elements.canvas || this.elements.startButton);
  }

  safeAddListener(element, event, handler) {
    if (element) {
      element.addEventListener(event, handler);
      this.eventListeners.push({ element, event, handler });
    }
  }

  setupEventListeners() {
    // Start/Stop
    this.safeAddListener(this.elements.startButton, 'click', () => {
      this.isSessionActive ? this.stopSession() : this.startSession();
    });
    
    // Mute
    this.safeAddListener(this.elements.muteButton, 'click', () => {
      this.toggleMute();
    });
    
    // Settings
    this.safeAddListener(this.elements.settingsButton, 'click', () => showSettingsModal());
    this.safeAddListener(this.elements.closeSettingsButton, 'click', () => hideSettingsModal());
    this.safeAddListener(this.elements.saveSettingsButton, 'click', () => this.saveSettingsFromModal());
    
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
      toggleTheme();
      this.isDarkMode = getSavedTheme() === 'dark';
    });

    // Voice selection
    this.safeAddListener(this.elements.voiceSelect, 'change', () => {
      updateWelcomeMessageInput(this.elements.voiceSelect.value, this.elements.welcomeMessageInput);
    });
    
    // Left panel mappings
    this.safeAddListener(this.elements.lp_startButton, 'click', () => { this.elements.startButton?.click(); document.body.classList.remove('menu-open'); });
    this.safeAddListener(this.elements.lp_muteButton, 'click', () => { this.elements.muteButton?.click(); document.body.classList.remove('menu-open'); });
    this.safeAddListener(this.elements.lp_traceToggle, 'click', () => { this.elements.traceToggle?.click(); document.body.classList.remove('menu-open'); });
    this.safeAddListener(this.elements.lp_settingsButton, 'click', () => { this.elements.settingsButton?.click(); document.body.classList.remove('menu-open'); });
    this.safeAddListener(this.elements.lp_chatToggle, 'click', () => { this.elements.chatToggle?.click(); document.body.classList.remove('menu-open'); });
  }

  async populateSettings() {
    if (!this.elements.voiceModelSelect) return;

    // Voice Models
    this.elements.voiceModelSelect.innerHTML = '';
    VOICE_MODELS.forEach(model => {
      const option = document.createElement('option');
      option.value = model.id;
      option.textContent = model.name;
      option.selected = model.id === this.currentSettings.voiceModel;
      this.elements.voiceModelSelect.appendChild(option);
    });
    
    // Voices
    this.elements.voiceSelect.innerHTML = '';
    VOICES.forEach(voice => {
      const option = document.createElement('option');
      option.value = voice.id;
      option.textContent = voice.name;
      option.selected = voice.id === this.currentSettings.voice;
      this.elements.voiceSelect.appendChild(option);
    });
    
    // Other settings
    if (this.elements.welcomeMessageInput) this.elements.welcomeMessageInput.value = this.currentSettings.welcomeMessage || '';
    if (this.elements.modelInstructionsInput) this.elements.modelInstructionsInput.value = this.currentSettings.modelInstructions || '';
    if (this.elements.voiceLiveEndpointInput) this.elements.voiceLiveEndpointInput.value = this.currentSettings.voiceLiveEndpoint || '';
    if (this.elements.voiceLiveApiKeyInput) this.elements.voiceLiveApiKeyInput.value = this.currentSettings.voiceLiveApiKey || '';
    if (this.elements.toastNotificationsToggle) this.elements.toastNotificationsToggle.checked = this.currentSettings.showToastNotifications !== false;
  }

  saveSettingsFromModal() {
    const newSettings = {
      voiceModel: this.elements.voiceModelSelect.value,
      voice: this.elements.voiceSelect.value,
      welcomeMessage: this.elements.welcomeMessageInput.value,
      modelInstructions: this.elements.modelInstructionsInput ? this.elements.modelInstructionsInput.value : '',
      voiceLiveEndpoint: this.elements.voiceLiveEndpointInput ? this.elements.voiceLiveEndpointInput.value.trim() : '',
      voiceLiveApiKey: this.elements.voiceLiveApiKeyInput ? this.elements.voiceLiveApiKeyInput.value.trim() : '',
      showToastNotifications: this.elements.toastNotificationsToggle ? this.elements.toastNotificationsToggle.checked : false
    };
    
    const validation = validateModelVoiceCompatibility(newSettings.voiceModel, newSettings.voice);
    if (!validation.valid) {
      this.conditionalShowToast(validation.message, 'warning');
    }
    
    if (saveSettings(newSettings, this.pageName)) {
      this.currentSettings = newSettings;
      hideSettingsModal();
      this.conditionalShowToast(window.APP_RESOURCES?.SettingsSavedSuccessfully || 'Settings saved successfully', 'success');
    }
  }

  conditionalShowToast(message, type = 'info') {
    if (this.currentSettings && this.currentSettings.showToastNotifications !== false) {
      showToast(message, type);
    }
  }

  toggleMute() {
    if (!this.audioHandler) return;
    const isMuted = this.audioHandler.toggleMute();
    this.updateMuteUI(isMuted);
  }

  updateMuteUI(isMuted) {
    if (!this.elements.muteButton) return;
    
    if (isMuted) {
      this.elements.muteButton.classList.add('muted');
      this.conditionalShowToast(window.APP_RESOURCES?.MicrophoneMuted || 'Microphone muted', 'info');
    } else {
      this.elements.muteButton.classList.remove('muted');
      this.conditionalShowToast(window.APP_RESOURCES?.MicrophoneUnmuted || 'Microphone unmuted', 'info');
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
    if (this.wsHandler && this.wsHandler.isConnected()) {
      this.wsHandler.sendText(text);
    }
  }

  handleWebSocketOpen() {
    updateStatus(window.APP_RESOURCES?.Connected || 'Connected', 'connected');
    addTraceEntry('system', window.APP_RESOURCES?.WebSocketConnected || 'WebSocket connected');
  }

  handleWebSocketClose() {
    updateStatus(window.APP_RESOURCES?.Disconnected || 'Disconnected', 'disconnected');
    addTraceEntry('system', window.APP_RESOURCES?.WebSocketClosed || 'WebSocket closed');
    if (this.isSessionActive) {
      this.stopSession();
    }
  }

  cleanup() {
    this.eventListeners.forEach(({ element, event, handler }) => {
      if (element && element.removeEventListener) {
        element.removeEventListener(event, handler);
      }
    });
    this.eventListeners = [];
  }
}
