/**
 * Configuration Module
 * 
 * Centralized configuration for voice models, Italian voices, compatibility rules,
 * and default settings for the voice agent application.
 */

/**
 * Supported voice models for Azure Voice Live
 * Each model has different capabilities and characteristics
 */
export const VOICE_MODELS = [
  { id: 'gpt-realtime-mini', name: 'GPT-4o Mini Realtime', description: 'Modello leggero e veloce (consigliato)' },
  { id: 'gpt-4o-realtime-preview', name: 'GPT-4o Realtime', description: 'Modello realtime standard' },
  { id: 'gpt-4o', name: 'GPT-4o', description: 'Modello GPT-4 ottimizzato' },
  { id: 'gpt-4.1', name: 'GPT-4.1', description: 'Versione aggiornata di GPT-4' },
  { id: 'gpt-5-mini-realtime', name: 'GPT-5 Mini Realtime', description: 'Nuova generazione - Mini' },
  { id: 'gpt-5-realtime', name: 'GPT-5 Realtime', description: 'Nuova generazione - Standard' },
  { id: 'phi4-mm-realtime', name: 'Phi-4 MM Realtime', description: 'Modello multimodale Phi-4' },
  { id: 'phi4-mini', name: 'Phi-4 Mini', description: 'Versione compatta di Phi-4' }
];

/**
 * Italian TTS voices available in Azure
 * Each voice has a unique personality and gender
 */
export const ITALIAN_VOICES = [
  { 
    id: 'it-IT-IsabellaNeural', 
    name: 'Isabella', 
    displayName: 'Isabella (Femminile)',
    gender: 'female',
    description: 'Voce femminile italiana standard'
  },
  { 
    id: 'it-IT-ElsaNeural', 
    name: 'Elsa', 
    displayName: 'Elsa (Femminile)',
    gender: 'female',
    description: 'Voce femminile italiana alternativa'
  },
  { 
    id: 'it-IT-DiegoNeural', 
    name: 'Diego', 
    displayName: 'Diego (Maschile)',
    gender: 'male',
    description: 'Voce maschile italiana standard'
  },
  { 
    id: 'it-IT-GiuseppeNeural', 
    name: 'Giuseppe', 
    displayName: 'Giuseppe (Maschile)',
    gender: 'male',
    description: 'Voce maschile italiana alternativa'
  },
  { 
    id: 'it-IT-BenignoNeural', 
    name: 'Benigno', 
    displayName: 'Benigno (Maschile)',
    gender: 'male',
    description: 'Voce maschile italiana espressiva'
  },
  { 
    id: 'it-IT-CalimeroNeural', 
    name: 'Calimero', 
    displayName: 'Calimero (Maschile)',
    gender: 'male',
    description: 'Voce maschile italiana giovanile'
  }
];

/**
 * Model-Voice compatibility matrix
 * Defines which voices are compatible with which models
 * 
 * Rules:
 * - Realtime models (gpt-realtime*) support all Azure TTS voices
 * - GPT-4/GPT-5 models require specific Azure TTS voices
 * - Phi models have their own compatibility requirements
 */
export const MODEL_VOICE_COMPATIBILITY = {
  // Realtime models support all Italian voices
  'gpt-realtime-mini': 'all',
  'gpt-4o-realtime-preview': 'all',
  
  // GPT-4 models support Azure TTS voices
  'gpt-4o': ['it-IT-IsabellaNeural', 'it-IT-ElsaNeural', 'it-IT-DiegoNeural', 'it-IT-GiuseppeNeural', 'it-IT-BenignoNeural', 'it-IT-CalimeroNeural'],
  'gpt-4.1': ['it-IT-IsabellaNeural', 'it-IT-ElsaNeural', 'it-IT-DiegoNeural', 'it-IT-GiuseppeNeural', 'it-IT-BenignoNeural', 'it-IT-CalimeroNeural'],
  
  // GPT-5 models support Azure TTS voices
  'gpt-5-mini-realtime': ['it-IT-IsabellaNeural', 'it-IT-ElsaNeural', 'it-IT-DiegoNeural', 'it-IT-GiuseppeNeural', 'it-IT-BenignoNeural', 'it-IT-CalimeroNeural'],
  'gpt-5-realtime': ['it-IT-IsabellaNeural', 'it-IT-ElsaNeural', 'it-IT-DiegoNeural', 'it-IT-GiuseppeNeural', 'it-IT-BenignoNeural', 'it-IT-CalimeroNeural'],
  
  // Phi models support Azure TTS voices
  'phi4-mm-realtime': ['it-IT-IsabellaNeural', 'it-IT-ElsaNeural', 'it-IT-DiegoNeural', 'it-IT-GiuseppeNeural', 'it-IT-BenignoNeural', 'it-IT-CalimeroNeural'],
  'phi4-mini': ['it-IT-IsabellaNeural', 'it-IT-ElsaNeural', 'it-IT-DiegoNeural', 'it-IT-GiuseppeNeural', 'it-IT-BenignoNeural', 'it-IT-CalimeroNeural']
};

/**
 * Default application settings
 */
export const DEFAULT_SETTINGS = {
  voiceModel: 'gpt-4o', // Fast and efficient
  voice: 'it-IT-IsabellaNeural', // Female Italian voice
  welcomeMessage: 'Ciao! Sono Isabella, come posso aiutarti oggi?',
  // System/model instructions that the user can provide via the settings dialog.
  // This will be sent to the server as part of the session configuration and used as the model's system prompt.
  modelInstructions: '',
  showToastNotifications: false, // Enable toast notifications by default
  language: 'it-IT',
  // Voice Live service connection settings
  voiceLiveEndpoint: '',
  voiceLiveApiKey: '',
  // Microsoft Foundry Agent Service settings
  foundryAgentId: '',        // Foundry Agent ID (e.g., "asst_123")
  foundryProjectName: '',    // Foundry Project name containing the agent
  locale: 'it-IT'            // Locale for voice recognition and synthesis
};

/**
 * Audio processing constants
 */
export const AUDIO_CONFIG = {
  SAMPLE_RATE_INPUT: 24000, // 24kHz for input (server expects this)
  MIN_BUFFER_SIZE: 3, // Minimum number of audio chunks to buffer before playback
  FADE_SAMPLES: 64, // Number of samples for fade-in/fade-out smoothing
  RMS_SMOOTHING_USER: 0.3, // Energy smoothing factor for user (microphone) visualization
  RMS_SMOOTHING_AGENT: 0.15 // Energy smoothing factor for agent (playback) visualization
};

/**
 * Extract the display name from a voice ID
 * Example: "it-IT-IsabellaNeural" -> "Isabella"
 * 
 * @deprecated DUPLICATION: Use 'extractVoiceName' from 'ui-utils.js' instead.
 * @param {string} voiceId - Full voice identifier (e.g., "it-IT-IsabellaNeural")
 * @returns {string} - Extracted voice name (e.g., "Isabella")
 */
export function getVoiceName(voiceId) {
  // TODO: Refactor consumers to import { extractVoiceName } from './ui-utils.js'
  try {
    // Voice IDs follow pattern: "language-country-NameNeural"
    // Split by hyphen and get the third part, then remove "Neural" suffix
    const parts = voiceId.split('-');
    if (parts.length >= 3) {
      const nameWithNeural = parts[2];
      return nameWithNeural.replace('Neural', '');
    }
    return 'Assistente'; // Fallback name
  } catch (error) {
    console.error('Error extracting voice name:', error);
    return 'Assistente';
  }
}

/**
 * Validate if a voice is compatible with a model
 * 
 * @deprecated DUPLICATION: Use 'validateModelVoiceCompatibility' from 'ui-utils.js' instead.
 * @param {string} modelId - Voice model identifier
 * @param {string} voiceId - Voice identifier
 * @returns {Object} - {valid: boolean, message: string}
 */
export function validateCompatibility(modelId, voiceId) {
  // TODO: Refactor consumers to import { validateModelVoiceCompatibility } from './ui-utils.js'
  try {
    const compatibility = MODEL_VOICE_COMPATIBILITY[modelId];
    
    // Model not found in compatibility matrix
    if (!compatibility) {
      return {
        valid: false,
        message: `Modello "${modelId}" non riconosciuto`
      };
    }
    
    // Model supports all voices
    if (compatibility === 'all') {
      return {
        valid: true,
        message: 'Compatibilità verificata'
      };
    }
    
    // Check if voice is in the allowed list
    if (Array.isArray(compatibility) && compatibility.includes(voiceId)) {
      return {
        valid: true,
        message: 'Compatibilità verificata'
      };
    }
    
    // Voice not compatible with this model
    return {
      valid: false,
      message: `La voce selezionata non è compatibile con il modello ${modelId}`
    };
  } catch (error) {
    console.error('Error validating compatibility:', error);
    return {
      valid: false,
      message: 'Errore durante la verifica della compatibilità'
    };
  }
}

/**
 * Get default settings (deep copy to avoid mutations)
 * 
 * @returns {Object} - Copy of default settings
 */
export function getDefaultSettings() {
  return {
    ...DEFAULT_SETTINGS
  };
}

/**
 * Find voice information by ID
 * 
 * @param {string} voiceId - Voice identifier
 * @returns {Object|null} - Voice information or null if not found
 */
export function getVoiceInfo(voiceId) {
  return ITALIAN_VOICES.find(voice => voice.id === voiceId) || null;
}

/**
 * Find model information by ID
 * 
 * @param {string} modelId - Model identifier
 * @returns {Object|null} - Model information or null if not found
 */
export function getModelInfo(modelId) {
  return VOICE_MODELS.find(model => model.id === modelId) || null;
}
