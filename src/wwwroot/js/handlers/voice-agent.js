import { BaseVoiceApp } from '../core/base-voice-app.js';
import { wireFoundryUi } from './foundry-agents.js';
import { VOICE_MODELS, VOICES, getVoiceName } from '../core/config.js';
import { VoiceVisualizerFactory } from '../modules/voice-visualizer-factory.js';
import { AudioHandler } from './audio-handler.js';
import { WebSocketHandler } from './websocket-handler.js';
import { SettingsManager } from '../modules/settings-manager.js';
import {
  addTranscript,
  clearTranscripts,
  updateStatus,
  toggleTranscriptPanel,
  hideSettingsModal,
  updateWelcomeMessageInput,
  validateModelVoiceCompatibility,
  saveSettings,
  autoResizeTextarea,
  addTraceEntry,
  clearTraceEntries,
  toggleTracePanel
} from '../ui/ui-utils.js';

/**
 * Voice Agent Application Class
 */
class VoiceAgentApp extends BaseVoiceApp {
  constructor() {
    super('VoiceAgent');
    
    // Module instances
    this.visualizer = null;
    this.audioHandler = null;
    this.wsHandler = null;
  }

  /**
   * Initialize DOM element references
   */
  initDOMReferences() {
    const baseResult = super.initDOMReferences();
    
    // Add page-specific elements
    this.elements = {
      ...this.elements,
      foundryProjectInput: document.getElementById('foundryProjectInput'),
      foundryAgentInput: document.getElementById('foundryAgentInput'),
      localeSelect: document.getElementById('localeSelect')
    };
    
    return baseResult;
  }

  /**
   * Initialize the application
   */
  async init() {
    try {
      // Initialize Foundry UI support
      await wireFoundryUi().catch(err => console.error('Error initializing Foundry UI:', err));

      await super.init();
      
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
      // showErrorBoundary is not imported, but it's in ui-utils.js. I should import it if needed.
      // Actually, BaseVoiceApp handles the error display in its init.
    }
  }
  
  setupEventListeners() {
    super.setupEventListeners();

    // Chat specific
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
    
    // Trace specific
    this.safeAddListener(this.elements.clearTraceButton, 'click', () => {
      clearTraceEntries();
      addTraceEntry('system', window.APP_RESOURCES?.TraceCleared || 'Trace cleared');
    });
    
    // Voice selection
    this.safeAddListener(this.elements.voiceSelect, 'change', () => {
      updateWelcomeMessageInput(this.elements.voiceSelect.value, this.elements.welcomeMessageInput);
    });
    
    // Escape key
    const escapeHandler = (e) => {
      if (e.key === 'Escape') {
        hideSettingsModal();
      }
    };
    document.addEventListener('keydown', escapeHandler);
    this.eventListeners.push({ element: document, event: 'keydown', handler: escapeHandler });
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
  
  async populateSettings() {
    await super.populateSettings();
    
    // Foundry specific
    if (this.elements.foundryProjectInput) this.elements.foundryProjectInput.value = this.currentSettings.foundryProjectName || '';
    if (this.elements.foundryAgentInput) this.elements.foundryAgentInput.value = this.currentSettings.foundryAgentId || '';
    if (this.elements.localeSelect) this.elements.localeSelect.value = this.currentSettings.locale || 'en-US';
  }
  
  saveSettingsFromModal() {
    const newSettings = {
      voiceModel: this.elements.voiceModelSelect.value,
      voice: this.elements.voiceSelect.value,
      welcomeMessage: this.elements.welcomeMessageInput.value,
      modelInstructions: this.elements.modelInstructionsInput ? this.elements.modelInstructionsInput.value : '',
      voiceLiveEndpoint: this.elements.voiceLiveEndpointInput ? this.elements.voiceLiveEndpointInput.value.trim() : '',
      voiceLiveApiKey: this.elements.voiceLiveApiKeyInput ? this.elements.voiceLiveApiKeyInput.value.trim() : '',
      showToastNotifications: this.elements.toastNotificationsToggle ? this.elements.toastNotificationsToggle.checked : false,
      
      // Foundry specific
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
      // Use currentSettings as last explicitly saved by the user
      
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
