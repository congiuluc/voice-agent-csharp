/**
 * WebSocket Handler Module
 * 
 * Manages WebSocket connection, message protocol handling (binary PCM16 + JSON),
 * and communication with the voice agent server.
 */

import { showToast, addTranscript, updateStatus, addTraceEntry, showMicMessage } from './ui-utils.js';
import { consumptionTracker } from './consumption-tracker.js';
import { transcriptStreamer } from './transcript-streamer.js';

/**
 * WebSocketHandler class
 * Handles WebSocket connection and message protocol
 */
export class WebSocketHandler {
  /**
   * @param {Object} callbacks - Event callbacks
   * @param {Function} callbacks.onOpen - Called when connection opens
   * @param {Function} callbacks.onClose - Called when connection closes
   * @param {Function} callbacks.onAudio - Called with audio data: (arrayBuffer) => void
   * @param {Function} callbacks.onTranscription - Called with transcription: (text, role) => void
   * @param {Function} callbacks.onStopAudio - Called when audio should stop
   * @param {Function} callbacks.onError - Called on error: (error) => void
   */
  constructor(callbacks = {}) {
    this.callbacks = {
      onOpen: callbacks.onOpen || (() => {}),
      onClose: callbacks.onClose || (() => {}),
      onAudio: callbacks.onAudio || (() => {}),
      onTranscription: callbacks.onTranscription || (() => {}),
      onStopAudio: callbacks.onStopAudio || (() => {}),
      onError: callbacks.onError || (() => {})
    };
    
    this.socket = null;
    this.isConnected = false;
  }
  
  /**
   * Connect to WebSocket server
   * @returns {Promise<void>}
   */
  async connect() {
    return new Promise((resolve, reject) => {
      try {
        // Determine WebSocket protocol (ws or wss)
        const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
        const host = window.location.host;
        const wsUrl = `${protocol}://${host}/web/ws`;
        
        // Create WebSocket connection
        this.socket = new WebSocket(wsUrl);
        this.socket.binaryType = 'arraybuffer';
        
        // Connection opened
        this.socket.onopen = () => {
          console.log('WebSocket connected');
          this.isConnected = true;
          updateStatus('Connesso', 'connected');
          this.callbacks.onOpen();
          resolve();
        };
        
        // Handle incoming messages
        this.socket.onmessage = (event) => {
          this.handleMessage(event);
        };
        
        // Connection closed
        this.socket.onclose = () => {
          console.log('WebSocket disconnected');
          this.isConnected = false;
          updateStatus('Disconnesso', 'disconnected');
          consumptionTracker.handleSessionDisconnected();
          consumptionTracker.stopDurationTimer();
          this.callbacks.onClose();
        };
        
        // Connection error
        this.socket.onerror = (error) => {
          console.error('WebSocket error:', error);
          showToast('Errore di connessione WebSocket', 'error');
          this.callbacks.onError(error);
          reject(error);
        };
        
      } catch (error) {
        console.error('Error creating WebSocket:', error);
        showToast('Impossibile connettersi al server', 'error');
        reject(error);
      }
    });
  }
  
  /**
   * Disconnect from WebSocket server
   */
  disconnect() {
    if (this.socket) {
      consumptionTracker.handleSessionDisconnected();
      consumptionTracker.stopDurationTimer();
      this.socket.close();
      this.socket = null;
      this.isConnected = false;
    }
  }
  
  /**
   * Send configuration message to server
   * @param {Object} settings - Settings object with voiceModel, voice, welcomeMessage, foundry agent params, etc.
   */
  sendConfig(settings) {
    if (!this.isConnected) {
      console.warn('Cannot send config: WebSocket not connected');
      return;
    }
    
    try {
      const configMessage = {
        Kind: 'Config',
        WelcomeMessage: settings.welcomeMessage || '',
        VoiceModel: settings.voiceModel || '',
        Voice: settings.voice || '',
        // Optional Voice Live connection settings
        VoiceLiveEndpoint: settings.voiceLiveEndpoint || '',
        VoiceLiveApiKey: settings.voiceLiveApiKey || '',
        // Model instructions / system prompt
        VoiceModelInstructions: settings.modelInstructions || '',
        // Locale for voice recognition and synthesis
        Locale: settings.locale || settings.language || 'it-IT',
        // Microsoft Foundry Agent Service parameters
        FoundryAgentId: settings.foundryAgentId || '',
        FoundryProjectName: settings.foundryProjectName || ''
      };
      
      const jsonString = JSON.stringify(configMessage);
      this.socket.send(jsonString);
      
      console.log('Config sent:', configMessage);
    } catch (error) {
      console.error('Error sending config:', error);
      showToast('Errore durante l\'invio della configurazione', 'warning');
    }
  }
  
  /**
   * Send audio data to server (PCM16)
   * @param {ArrayBuffer} audioBuffer - PCM16 audio data
   */
  sendAudio(audioBuffer) {
    if (!this.isConnected) {
      return;
    }
    
    try {
      this.socket.send(audioBuffer);
    } catch (error) {
      console.error('Error sending audio:', error);
    }
  }

   sendMessage(message) {
    if (!this.isConnected) {
      return;
    }
    
    try {
      const configMessage = {
        Kind: 'Message',
        Text: message || ''
      };
      const jsonString = JSON.stringify(configMessage);
      this.socket.send(jsonString);
    } catch (error) {
      console.error('Error sending message:', error);
    }
  }
  
  /**
   * Send stop message to server
   */
  sendStop() {
    if (!this.isConnected) {
      return;
    }
    
    try {
      const stopMessage = {
        Kind: 'Stop'
      };
      
      const jsonString = JSON.stringify(stopMessage);
      this.socket.send(jsonString);
      
      console.log('Stop message sent');
    } catch (error) {
      console.error('Error sending stop message:', error);
    }
  }
  
  /**
   * Handle incoming WebSocket message
   * Routes to appropriate handler based on message type
   * @param {MessageEvent} event - WebSocket message event
   */
  handleMessage(event) {
    // Binary message - audio data
    if (event.data instanceof ArrayBuffer) {
      this.handleBinaryMessage(event.data);
    }
    // Text message - JSON protocol
    else if (typeof event.data === 'string') {
      this.handleJSONMessage(event.data);
    }
    else {
      console.warn('Unknown message type:', typeof event.data);
      showToast('Tipo di messaggio sconosciuto ricevuto', 'warning');
    }
  }
  
  /**
   * Handle binary audio message
   * @param {ArrayBuffer} arrayBuffer - Audio data
   */
  handleBinaryMessage(arrayBuffer) {
    try {
      // Pass audio to callback for playback
      this.callbacks.onAudio(arrayBuffer);
    } catch (error) {
      console.error('Error handling binary message:', error);
    }
  }
  
  /**
   * Handle JSON text message
   * @param {string} jsonString - JSON message string
   */
  handleJSONMessage(jsonString) {
    try {
      // Skip empty or whitespace-only messages
      if (!jsonString || jsonString.trim().length === 0) {
        console.debug('Skipping empty JSON message');
        return;
      }

      const message = JSON.parse(jsonString);
      
      console.log('[DEBUG] JSON message received:', message);
      
      // Check for Kind property (supports both PascalCase and camelCase)
      const messageKind = message.Kind || message.kind;
      if (!messageKind) {
        console.warn('Received message without Kind property:', message);
        return;
      }
      
      console.log('[DEBUG] Message Kind:', messageKind);
      
      // Route based on message kind
      switch (messageKind) {
        case 'Transcription':
          this.handleTranscription(message);
          break;

        case 'SessionEvent':
          this.handleSessionEvent(message);
          break;
          
        case 'StopAudio':
          this.handleStopAudio(message);
          break;
          
        case 'Error':
          this.handleError(message);
          break;
          
        default:
          console.warn('Unknown message kind:', messageKind);
          showToast(`Messaggio sconosciuto: ${messageKind}`, 'warning');
      }
    } catch (error) {
      console.error('Error parsing JSON message:', error, 'Message was:', jsonString);
      showToast('Errore durante l\'elaborazione del messaggio', 'warning');
    }
  }

  /**
   * Handle transcription message
   * @param {Object} message - Transcription message object
   */
  handleTranscription(message) {
    try {
      const text = message.text || message.Text || '';
      const role = message.role || message.Role || 'agent'; // 'user' or 'agent'
      
      console.log('[DEBUG] handleTranscription called:', { text, role, message });
      console.log('[DEBUG] Role check - message.role:', message.role, 'message.Role:', message.Role, 'final role:', role);
      
      if (text) {
        // USER MESSAGES: Always add to transcript (no duplication check needed)
        if (role === 'user') {
          console.log('[DEBUG] USER transcription - adding to transcript:', text);
          addTranscript(role, text);
          this.callbacks.onTranscription(text, role);
          console.log(`User transcription added: ${text}`);
          return;
        }
        
        // AGENT MESSAGES: Check for duplicates from streaming
        if (role === 'agent') {
          const streamingElement = document.querySelector('.transcript-item.agent.streaming .transcript-content');
          if (streamingElement) {
            // Streaming element exists - skip adding duplicate, it will be finalized by consumption tracker
            console.log('Skipping agent transcription - streaming element active');
            this.callbacks.onTranscription(text, role);
            return;
          }
          
          // Check if there's a recently finalized element with same/similar content
          const lastAgentItem = document.querySelector('.transcript-item.agent:last-of-type .transcript-content');
          if (lastAgentItem && lastAgentItem.textContent.trim().startsWith(text.trim().substring(0, 20))) {
            console.log('Skipping agent transcription - similar content already in transcript');
            this.callbacks.onTranscription(text, role);
            return;
          }
        }
        
        // Add to transcript UI
        addTranscript(role, text);
        
        // Call callback
        this.callbacks.onTranscription(text, role);
        
        console.log(`Transcription [${role}]:`, text);
      }
    } catch (error) {
      console.error('Error handling transcription:', error);
    }
  }

  /**
   * Handle session events sent from server for tracing / UI
   * @param {Object} message
   */
  handleSessionEvent(message) {
    try {
      const eventType = message.event || message.Event || 'unknown';
      const payload = message.payload || message.Payload || null;

      console.log('[DEBUG] SessionEvent received:', { eventType, payload });

      // Add to trace panel
      addTraceEntry('system', `${eventType}${payload ? ': ' + JSON.stringify(payload) : ''}`);

      // ===== Consumption Tracking Integration =====
      
      // Track session.created event
      if (eventType === 'SessionCreated' || eventType === 'session.created') {
        consumptionTracker.handleSessionCreated(payload);
        consumptionTracker.startDurationTimer();
        if (payload && payload.SessionId) {
          updateStatus(`Session: ${payload.SessionId.substring(0, 8)}...`, 'connected');
        }
      }
      
      // Track session.updated event
      if (eventType === 'SessionUpdated' || eventType === 'session.updated') {
        consumptionTracker.handleSessionUpdated(payload);
      }

      // Handle disconnection events
      if (eventType === 'SessionDisconnected' || eventType === 'SessionClosed' || eventType === 'SessionEnded' || eventType === 'Disconnected') {
        consumptionTracker.handleSessionDisconnected();
        consumptionTracker.stopDurationTimer();
        updateStatus('Disconnesso', 'disconnected');
      }
      
      // Track response.created event
      if (eventType === 'ResponseCreated' || eventType === 'response.created') {
        consumptionTracker.handleResponseCreated(payload);
        updateStatus('Generazione risposta...', 'connected');
      }

      // Track response.done event with token usage
      if (eventType === 'ResponseDone' || eventType === 'response.done') {
        updateStatus('Sessione attiva', 'connected');
        
        // Update consumption tracker with response done data
        consumptionTracker.handleResponseDone(payload);
        
        // Extract token usage from payload for legacy display
        // Payload format: { ResponseId, Status, Usage: { InputTokens, OutputTokens, TotalTokens } }
        if (payload && payload.Usage) {
          const usage = payload.Usage;
          const inputTokens = usage.InputTokens || usage.input_tokens || 0;
          const outputTokens = usage.OutputTokens || usage.output_tokens || 0;
          const totalTokens = usage.TotalTokens || usage.total_tokens || (inputTokens + outputTokens);
          
          console.log(`Token usage - Input: ${inputTokens}, Output: ${outputTokens}, Total: ${totalTokens}`);
          
          // Update legacy token display in UI if available
          this.updateTokenDisplay(inputTokens, outputTokens, totalTokens);
        }
      }
      
      // Track rate_limits.updated event
      if (eventType === 'RateLimitsUpdated' || eventType === 'rate_limits.updated') {
        consumptionTracker.handleRateLimitsUpdated(payload);
      }
         
      // Show user-visible info/error messages under mic for certain events
      if (eventType === 'SessionError' || eventType === 'Error' || eventType === 'error') {
        const msg = (payload && payload.Message) ? payload.Message : (payload && payload.Error) ? payload.Error : 'Errore di sessione';
        showMicMessage('error', msg, 6000);
      }

      if (eventType === 'SessionInfo' || eventType === 'Info') {
        const msg = (payload && payload.Message) ? payload.Message : (payload && payload.Info) ? payload.Info : 'Informazione';
        showMicMessage('info', msg, 4500);
      }

      // Update status for speech events and track audio duration
      if (eventType === 'SpeechStarted' || eventType === 'input_audio_buffer.speech_started') {
        updateStatus('Utente parla...', 'speaking');
        consumptionTracker.handleInputAudioSpeechStarted(payload);
      }

      if (eventType === 'SpeechStopped' || eventType === 'input_audio_buffer.speech_stopped') {
        updateStatus('Elaborazione...', 'connected');
        consumptionTracker.handleInputAudioSpeechStopped(payload);
      }

      if (eventType === 'ResponseAudioDelta' || eventType === 'response.audio.delta') {
        updateStatus('Assistente parla...', 'speaking');
        consumptionTracker.handleOutputAudioDelta(payload);
      }

      if (eventType === 'ResponseAudioDone' || eventType === 'response.audio.done') {
        consumptionTracker.handleOutputAudioDone(payload);
      }

      if (eventType === 'AudioTimestampDelta' || eventType === 'response.audio_timestamp.delta') {
        consumptionTracker.handleAudioTimestampDelta(payload);
        transcriptStreamer.handleAudioTimestampDelta(payload);
      }

      // Handle transcript delta for streaming text (alternative to audio_timestamp.delta)
      if (eventType === 'ResponseAudioTranscriptDelta' || eventType === 'response.audio_transcript.delta') {
        transcriptStreamer.handleTranscriptDelta(payload);
      }

      // Finalize transcript streaming when response is done
      if (eventType === 'ResponseDone' || eventType === 'response.done') {
        transcriptStreamer.finalizeStreamingTranscript();
      }

    } catch (error) {
      console.error('Error handling session event:', error);
    }
  }
  
  /**
   * Handle stop audio message
   * @param {Object} message - StopAudio message object
   */
  handleStopAudio(message) {
    try {
      console.log('StopAudio received');
      
      // Call callback to stop audio playback
      this.callbacks.onStopAudio();
    } catch (error) {
      console.error('Error handling stop audio:', error);
    }
  }
  
  /**
   * Handle error message from server
   * @param {Object} message - Error message object
   */
  handleError(message) {
    const errorText = message.message || message.Message || message.error || message.Error || 'Errore sconosciuto dal server';
    console.error('Server error:', errorText);
    showToast(errorText, 'error');
    
    // Call error callback
    this.callbacks.onError(new Error(errorText));
  }
  
  /**
   * Update token usage display in the UI
   * @param {number} inputTokens - Number of input tokens
   * @param {number} outputTokens - Number of output tokens
   * @param {number} totalTokens - Total tokens used
   */
  updateTokenDisplay(inputTokens, outputTokens, totalTokens) {
    // Update individual token displays if they exist
    const inputDisplay = document.getElementById('inputTokens');
    const outputDisplay = document.getElementById('outputTokens');
    const totalDisplay = document.getElementById('totalTokens');
    
    if (inputDisplay) {
      const currentInput = parseInt(inputDisplay.textContent) || 0;
      inputDisplay.textContent = currentInput + inputTokens;
    }
    
    if (outputDisplay) {
      const currentOutput = parseInt(outputDisplay.textContent) || 0;
      outputDisplay.textContent = currentOutput + outputTokens;
    }
    
    if (totalDisplay) {
      const currentTotal = parseInt(totalDisplay.textContent) || 0;
      totalDisplay.textContent = currentTotal + totalTokens;
    }
    
    // Also update compact token counter if it exists
    const tokenCounter = document.getElementById('tokenCounter');
    if (tokenCounter) {
      const currentTotal = parseInt(tokenCounter.dataset.total) || 0;
      const newTotal = currentTotal + totalTokens;
      tokenCounter.dataset.total = newTotal;
      tokenCounter.textContent = `${newTotal.toLocaleString()} tokens`;
    }
  }
  
  /**
   * Check if WebSocket is connected
   * @returns {boolean}
   */
  isSocketConnected() {
    return this.isConnected && this.socket && this.socket.readyState === WebSocket.OPEN;
  }
  
  /**
   * Get connection state
   * @returns {string} - 'connecting', 'open', 'closing', 'closed'
   */
  getState() {
    if (!this.socket) return 'closed';
    
    switch (this.socket.readyState) {
      case WebSocket.CONNECTING:
        return 'connecting';
      case WebSocket.OPEN:
        return 'open';
      case WebSocket.CLOSING:
        return 'closing';
      case WebSocket.CLOSED:
        return 'closed';
      default:
        return 'unknown';
    }
  }
}
