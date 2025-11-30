/**
 * Voice Agent Application Module
 * 
 * Specific logic for the Voice Agent page (Foundry enabled).
 */

import { wireFoundryUi } from './foundry-agents.js';
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
    
    // Theme state
    this.isDarkMode = this.loadThemePreference();
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
      this.applyTheme();
      
      // Initialize visualizer
      this.visualizer = new VoiceVisualizer(this.elements.canvas);
      
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
      
      // Populate settings
      this.populateSettings();

      // Relocate controls for small screens
      this.relocateControlsForSmallScreens();
      this.enableLeftPanelFocusTrap();
      
      // Initial mute state
      if (this.elements.muteButton) {
        this.elements.muteButton.classList.add('muted');
        try { this.elements.muteButton.setAttribute('aria-pressed', 'true'); } catch(e) {}
      }

      // Initial status
      updateStatus('In attesa di connessione...', 'disconnected');
      addTraceEntry('system', 'Applicazione Voice Agent inizializzata');
      
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
    if (element) element.addEventListener(event, handler);
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
        this.conditionalShowToast('Avvia una sessione prima di attivare il microfono', 'warning');
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
      this.conditionalShowToast('Conversazione cancellata', 'info');
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
      addTraceEntry('system', 'Trace cancellato');
    });
    
    // Theme
    this.safeAddListener(this.elements.themeToggleButton, 'click', () => this.toggleTheme());
    
    // Voice selection
    this.safeAddListener(this.elements.voiceSelect, 'change', () => {
      updateWelcomeMessageInput(this.elements.voiceSelect.value, this.elements.welcomeMessageInput);
    });
    
    // Mobile Menu
    this.safeAddListener(this.elements.hamburgerButton, 'click', () => this.openLeftPanel());
    this.safeAddListener(this.elements.closeLeftPanel, 'click', () => this.closeLeftPanel());
    
    // Left panel mappings
    this.safeAddListener(this.elements.lp_startButton, 'click', () => { this.elements.startButton.click(); this.closeLeftPanel(); });
    this.safeAddListener(this.elements.lp_muteButton, 'click', () => { this.elements.muteButton.click(); this.closeLeftPanel(); });
    this.safeAddListener(this.elements.lp_traceToggle, 'click', () => { this.elements.traceToggle.click(); this.closeLeftPanel(); });
    this.safeAddListener(this.elements.lp_settingsButton, 'click', () => { this.elements.settingsButton.click(); this.closeLeftPanel(); });
    this.safeAddListener(this.elements.lp_chatToggle, 'click', () => { this.elements.chatToggle.click(); this.closeLeftPanel(); });
    
    // Overlay click
    document.addEventListener('click', (e) => {
      const overlay = document.querySelector('.left-panel-overlay');
      if (overlay && overlay.classList.contains('visible') && e.target === overlay) {
        this.closeLeftPanel();
      }
    });
    
    // Escape key
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        hideSettingsModal();
        this.closeLeftPanel();
      }
    });
  }

  openLeftPanel() {
    if (!this.elements.leftPanel) return;
    this.elements.leftPanel.setAttribute('aria-hidden', 'false');
    let overlay = document.querySelector('.left-panel-overlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.className = 'left-panel-overlay visible';
      document.body.appendChild(overlay);
    } else {
      overlay.classList.add('visible');
    }
    document.body.style.overflow = 'hidden';
  }

  closeLeftPanel() {
    if (!this.elements.leftPanel) return;
    this.elements.leftPanel.setAttribute('aria-hidden', 'true');
    const overlay = document.querySelector('.left-panel-overlay');
    if (overlay) overlay.classList.remove('visible');
    document.body.style.overflow = '';
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
    ITALIAN_VOICES.forEach(voice => {
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
    if (this.elements.localeSelect) this.elements.localeSelect.value = this.currentSettings.locale || 'it-IT';
  }
  
  loadThemePreference() {
    const saved = localStorage.getItem(`voiceAgent_${this.pageName}_theme`);
    return saved ? saved === 'dark' : true;
  }
  
  toggleTheme() {
    this.isDarkMode = !this.isDarkMode;
    this.applyTheme();
    localStorage.setItem(`voiceAgent_${this.pageName}_theme`, this.isDarkMode ? 'dark' : 'light');
  }
  
  applyTheme() {
    this.isDarkMode ? document.body.classList.remove('light-mode') : document.body.classList.add('light-mode');
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
      
      // Foundry
      foundryAgentId: this.elements.foundryAgentInput ? this.elements.foundryAgentInput.value : '',
      foundryProjectName: this.elements.foundryProjectInput ? this.elements.foundryProjectInput.value : '',
      locale: this.elements.localeSelect ? this.elements.localeSelect.value : 'it-IT',
      language: this.elements.localeSelect ? this.elements.localeSelect.value : 'it-IT'
    };
    
    const validation = validateModelVoiceCompatibility(newSettings.voiceModel, newSettings.voice);
    if (!validation.valid) {
      this.conditionalShowToast(validation.message, 'error');
      return;
    }
    
    if (saveSettings(newSettings, this.pageName)) {
      this.currentSettings = newSettings;
      addTraceEntry('system', 'Impostazioni salvate');
      this.conditionalShowToast('Impostazioni salvate', 'success');
      hideSettingsModal();
      if (this.isSessionActive) {
        this.conditionalShowToast('Riavvia la sessione per applicare le modifiche', 'info');
      }
    }
  }
  
  async startSession() {
    try {
      // Refresh settings from UI
      this.saveSettingsFromModal(); // This saves and updates currentSettings
      
      updateStatus('Connessione in corso...', 'disconnected');
      addTraceEntry('system', 'Connessione in corso...');
      
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
      
      updateStatus('Sessione attiva', 'connected');
      this.conditionalShowToast('Sessione avviata', 'success');
      
      const voiceName = getVoiceName(this.currentSettings.voice);
      addTranscript('system', `Sessione avviata con ${voiceName}`);
      
    } catch (error) {
      console.error('Error starting session:', error);
      this.conditionalShowToast('Impossibile avviare la sessione', 'error');
      addTraceEntry('system', `Errore avvio sessione: ${error.message}`);
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
      
      updateStatus('Sessione terminata', 'disconnected');
      this.conditionalShowToast('Sessione terminata', 'info');
      addTranscript('system', 'Sessione terminata');
      
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
      this.conditionalShowToast('Microfono disattivato', 'warning');
    } else {
      this.elements.muteButton.classList.remove('muted');
      this.elements.muteButton.setAttribute('aria-pressed', 'false');
      this.conditionalShowToast('Microfono attivato', 'success');
    }
  }
  
  sendTextMessage() {
    const text = this.elements.textInput.value.trim();
    if (!text) return;
    
    if (!this.isSessionActive) {
      this.conditionalShowToast('Avvia una sessione per inviare messaggi', 'warning');
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
        addTraceEntry('system', `Messaggio inviato: ${text}`);
      } else {
        this.conditionalShowToast('Errore connessione', 'error');
      }
    } catch (error) {
      console.error('Error sending text:', error);
    }
  }
  
  handleWebSocketOpen() {
    updateStatus('Connesso', 'connected');
    addTraceEntry('system', 'WebSocket connesso');
  }
  
  handleWebSocketClose() {
    if (this.isSessionActive) {
      this.conditionalShowToast('Connessione persa', 'error');
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
    if (role === 'agent') updateStatus('Assistente sta parlando...', 'speaking');
  }
  
  handleStopAudio() {
    if (this.audioHandler) this.audioHandler.stopPlayback();
    updateStatus('Sessione attiva', 'connected');
  }
  
  handleWebSocketError(error) {
    console.error('WebSocket error:', error);
    addTraceEntry('system', `Errore WebSocket: ${error.message}`);
    if (this.isSessionActive) this.stopSession();
  }
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  const app = new VoiceAgentApp();
  app.init();
  window.voiceAgentApp = app;
});
