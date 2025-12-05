/**
 * Incoming Call Settings Module
 * 
 * Manages the incoming call settings modal on the homepage.
 * Handles configuration for Azure Communication Services (ACS) integration.
 */

/**
 * Default incoming call settings (only keys used by server/session)
 */
const DEFAULT_INCOMING_CALL_SETTINGS = {
  enableIncomingCalls: false,
  // ACS connection strings are not persisted for security reasons.
  // The frontend keeps resource/connection inputs for testing only.
  phoneNumber: '',
  voiceModel: 'gpt-4o',
  voice: 'it-IT-IsabellaNeural',
  greeting: 'Buongiorno! Come posso aiutarti?',
  instructions: '',
  callTimeout: 300
};

/**
 * Storage key for incoming call settings
 */
const STORAGE_KEY = 'incomingCallSettings';

/**
 * Initialize incoming call settings module
 */
function initializeIncomingCallSettings() {
  const modal = document.getElementById('incomingCallSettingsModal');
  const openButton = document.getElementById('incomingCallSettingsButton');
  const closeButton = document.getElementById('closeIncomingCallSettingsModal');
  const saveButton = document.getElementById('saveIncomingCallSettingsButton');
  const resetButton = document.getElementById('resetIncomingCallSettingsButton');
  const testButton = document.getElementById('testIncomingCallButton');

  // Load saved settings
  loadIncomingCallSettings();

  // Event listeners
  openButton?.addEventListener('click', () => openModal());
  closeButton?.addEventListener('click', () => closeModal());
  saveButton?.addEventListener('click', () => saveSettings());
  resetButton?.addEventListener('click', () => resetSettings());
  testButton?.addEventListener('click', () => testConfiguration());

  // Close modal when clicking outside
  modal?.addEventListener('click', (e) => {
    if (e.target === modal) {
      closeModal();
    }
  });

  // Close modal on Escape key
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && isModalVisible()) {
      closeModal();
    }
  });

  console.log('✓ Incoming call settings module initialized');
}

/**
 * Open the incoming call settings modal
 */
function openModal() {
  const modal = document.getElementById('incomingCallSettingsModal');
  if (modal) {
    modal.classList.add('show');
    modal.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
  }
}

/**
 * Close the incoming call settings modal
 */
function closeModal() {
  const modal = document.getElementById('incomingCallSettingsModal');
  if (modal) {
    modal.classList.remove('show');
    modal.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
  }
}

/**
 * Check if modal is currently visible
 */
function isModalVisible() {
  const modal = document.getElementById('incomingCallSettingsModal');
  return modal?.classList.contains('show') ?? false;
}

/**
 * Load incoming call settings from localStorage
 */
function loadIncomingCallSettings() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    const settings = saved ? JSON.parse(saved) : DEFAULT_INCOMING_CALL_SETTINGS;

    // Apply loaded settings to form
    document.getElementById('enableIncomingCallsToggle').checked = settings.enableIncomingCalls ?? false;
    // ACS resource/connection input are optional and not persisted by default.
    const acsResourceEl = document.getElementById('acsResourceInput');
    if (acsResourceEl) acsResourceEl.value = settings.acsResource ?? '';
    const acsConnEl = document.getElementById('acsConnectionStringInput');
    if (acsConnEl) acsConnEl.value = '';
    document.getElementById('phoneNumberInput').value = settings.phoneNumber ?? '';
    document.getElementById('incomingCallVoiceModelSelect').value = settings.voiceModel ?? 'gpt-4o';
    document.getElementById('incomingCallVoiceSelect').value = settings.voice ?? 'it-IT-IsabellaNeural';
    document.getElementById('incomingCallGreetingInput').value = settings.greeting ?? DEFAULT_INCOMING_CALL_SETTINGS.greeting;
    document.getElementById('incomingCallInstructionsInput').value = settings.instructions ?? '';
    document.getElementById('callTimeoutInput').value = settings.callTimeout ?? 300;

    console.log('✓ Incoming call settings loaded from storage');
  } catch (error) {
    console.error('Error loading incoming call settings:', error);
    resetSettings();
  }
}

/**
 * Save incoming call settings to localStorage
 */
function saveSettings() {
  try {
    const settings = {
      enableIncomingCalls: document.getElementById('enableIncomingCallsToggle').checked,
      // Do not persist connection string in localStorage (security)
      acsResource: (document.getElementById('acsResourceInput') ? document.getElementById('acsResourceInput').value.trim() : ''),
      phoneNumber: document.getElementById('phoneNumberInput').value.trim(),
      webhookUrl: '',
      websocketUrl: '',
      voiceModel: document.getElementById('incomingCallVoiceModelSelect').value,
      voice: document.getElementById('incomingCallVoiceSelect').value,
      greeting: document.getElementById('incomingCallGreetingInput').value.trim(),
      instructions: document.getElementById('incomingCallInstructionsInput').value.trim(),
      callTimeout: parseInt(document.getElementById('callTimeoutInput').value) || 300
    };

    // Validation
    if (settings.enableIncomingCalls) {
      const errors = [];
      
      if (!settings.acsResource && !settings.acsConnectionString) {
        errors.push('Specifica Risorsa ACS o Connection String');
      }
      if (!settings.phoneNumber) {
        errors.push('Numero telefonico obbligatorio');
      }
      if (!settings.greeting) {
        errors.push('Messaggio di benvenuto obbligatorio');
      }

      if (errors.length > 0) {
        showStatusMessage('error', 'Errore: ' + errors.join(', '));
        return;
      }
    }

    // Save to localStorage
    // Only persist non-secret settings
    const toPersist = {
      enableIncomingCalls: settings.enableIncomingCalls,
      phoneNumber: settings.phoneNumber,
      voiceModel: settings.voiceModel,
      voice: settings.voice,
      greeting: settings.greeting,
      instructions: settings.instructions,
      callTimeout: settings.callTimeout
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(toPersist));
    
    showStatusMessage('success', 'Impostazioni salvate con successo');
    console.log('✓ Incoming call settings saved', settings);

    // Auto-close modal after 2 seconds on success
    setTimeout(() => {
      if (isModalVisible()) {
        closeModal();
      }
    }, 2000);

  } catch (error) {
    console.error('Error saving incoming call settings:', error);
    showStatusMessage('error', 'Errore nel salvataggio delle impostazioni');
  }
}

/**
 * Reset settings to defaults
 */
function resetSettings() {
  document.getElementById('enableIncomingCallsToggle').checked = DEFAULT_INCOMING_CALL_SETTINGS.enableIncomingCalls;
  document.getElementById('acsResourceInput').value = DEFAULT_INCOMING_CALL_SETTINGS.acsResource;
  document.getElementById('acsConnectionStringInput').value = DEFAULT_INCOMING_CALL_SETTINGS.acsConnectionString;
  document.getElementById('phoneNumberInput').value = DEFAULT_INCOMING_CALL_SETTINGS.phoneNumber;
  document.getElementById('webhookUrlInput').value = DEFAULT_INCOMING_CALL_SETTINGS.webhookUrl;
  document.getElementById('websocketUrlInput').value = DEFAULT_INCOMING_CALL_SETTINGS.websocketUrl;
  document.getElementById('incomingCallVoiceModelSelect').value = DEFAULT_INCOMING_CALL_SETTINGS.voiceModel;
  document.getElementById('incomingCallVoiceSelect').value = DEFAULT_INCOMING_CALL_SETTINGS.voice;
  document.getElementById('incomingCallGreetingInput').value = DEFAULT_INCOMING_CALL_SETTINGS.greeting;
  document.getElementById('incomingCallInstructionsInput').value = DEFAULT_INCOMING_CALL_SETTINGS.instructions;
  document.getElementById('callTimeoutInput').value = DEFAULT_INCOMING_CALL_SETTINGS.callTimeout;

  localStorage.removeItem(STORAGE_KEY);
  showStatusMessage('info', 'Impostazioni ripristinate ai valori predefiniti');
  console.log('✓ Incoming call settings reset to defaults');
}

/**
 * Test incoming call configuration
 */
async function testConfiguration() {
  const testButton = document.getElementById('testIncomingCallButton');
  const acsResource = document.getElementById('acsResourceInput').value.trim();
  const phoneNumber = document.getElementById('phoneNumberInput').value.trim();

  if (!acsResource) {
    showStatusMessage('error', 'Specifica la Risorsa ACS');
    return;
  }

  if (!phoneNumber) {
    showStatusMessage('error', 'Specifica il numero telefonico');
    return;
  }

  try {
    testButton.disabled = true;
    testButton.textContent = 'Test in corso...';
    showStatusMessage('info', 'Test della configurazione ACS in corso...');

    // Simulate a test call to the server
    const response = await fetch('/api/incoming-call/test', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      // Only send data necessary for testing; connection string should be used server-side only when provided explicitly.
      body: JSON.stringify({
        acsResource,
        phoneNumber,
        webhookUrl: document.getElementById('webhookUrlInput') ? document.getElementById('webhookUrlInput').value.trim() : undefined,
        websocketUrl: document.getElementById('websocketUrlInput') ? document.getElementById('websocketUrlInput').value.trim() : undefined
      })
    });

    if (response.ok) {
      const result = await response.json();
      showStatusMessage('success', `Configurazione corretta. ${result.message || 'Pronto per ricevere chiamate.'}`);
    } else {
      const error = await response.json();
      showStatusMessage('error', `Errore: ${error.message || 'Configurazione non valida'}`);
    }
  } catch (error) {
    console.error('Error testing configuration:', error);
    showStatusMessage('error', `Errore di connessione: ${error.message}`);
  } finally {
    testButton.disabled = false;
    testButton.textContent = 'Testa Configurazione';
  }
}

/**
 * Show status message in the modal
 * @param {string} type - 'success', 'error', 'info'
 * @param {string} message - Message text
 */
function showStatusMessage(type, message) {
  const messageEl = document.getElementById('incomingCallStatusMessage');
  if (!messageEl) return;

  messageEl.textContent = message;
  messageEl.className = `status-message status-${type}`;
  messageEl.style.display = 'block';

  // Auto-hide after 5 seconds (except for errors)
  if (type !== 'error') {
    setTimeout(() => {
      messageEl.style.display = 'none';
    }, 5000);
  }
}

/**
 * Get current incoming call settings (for use by other modules)
 * @returns {Object} Current settings
 */
export function getIncomingCallSettings() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved ? JSON.parse(saved) : DEFAULT_INCOMING_CALL_SETTINGS;
  } catch (error) {
    console.error('Error getting incoming call settings:', error);
    return DEFAULT_INCOMING_CALL_SETTINGS;
  }
}

/**
 * Export current settings as JSON (for API calls)
 * @returns {Object} Settings ready for API call
 */
export function exportIncomingCallSettings() {
  return getIncomingCallSettings();
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeIncomingCallSettings);
} else {
  initializeIncomingCallSettings();
}

console.log('✓ Incoming call settings module loaded');
