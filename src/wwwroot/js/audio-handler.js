/**
 * Audio Handler Module
 * 
 * Manages microphone capture, audio playback queue, RMS calculation,
 * and audio resampling for the voice agent application.
 */

import { AUDIO_CONFIG } from './config.js';
import { showToast } from './ui-utils.js';

/**
 * AudioHandler class
 * Handles all audio input/output operations
 */
export class AudioHandler {
  /**
   * @param {Function} onRMS - Callback for RMS values: (rms, source) => void
   */
  constructor(onRMS) {
    this.onRMS = onRMS || (() => {});
    
    // Audio context for processing
    this.audioContext = null;
    
    // Microphone state
    this.mediaStream = null;
    this.micSource = null;
    this.audioWorkletNode = null;
    this.isMuted = true;
    
    // Playback state
    this.playbackQueue = []; // Queue of audio buffers to play
    this.isPlaying = false;
    this.currentPlaybackSource = null;
    this.analyserNode = null;
    
    // For frequency analysis
    this.frequencyData = null;
  }
  
  /**
   * Start microphone capture
   * @returns {Promise<void>}
   */
  async startMicrophone() {
    try {
      // Create audio context if needed
      if (!this.audioContext) {
        this.audioContext = new (window.AudioContext || window.webkitAudioContext)({
          sampleRate: AUDIO_CONFIG.SAMPLE_RATE_INPUT
        });
      }
      
      // Resume context if suspended
      if (this.audioContext.state === 'suspended') {
        await this.audioContext.resume();
      }
      
      // Request microphone access
      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: AUDIO_CONFIG.SAMPLE_RATE_INPUT
        }
      });
      
      // Create media stream source
      this.micSource = this.audioContext.createMediaStreamSource(this.mediaStream);
      
      // Load audio worklet module
      try {
        await this.audioContext.audioWorklet.addModule('js/audio-processor.js');
      } catch (e) {
        console.error('Failed to load audio processor:', e);
        throw e;
      }

      // Create AudioWorkletNode
      this.audioWorkletNode = new AudioWorkletNode(this.audioContext, 'audio-processor');

      // Handle messages from processor
      this.audioWorkletNode.port.onmessage = (event) => {
        const { type, rms, buffer } = event.data;
        
        if (type === 'audio-data') {
          // RMS callback
          this.onRMS(rms, 'user');
          
          // Audio data callback (if not muted)
          if (!this.isMuted && this.onAudioData) {
            this.onAudioData(buffer);
          }
        }
      };

      // Connect audio graph: microphone -> worklet
      this.micSource.connect(this.audioWorkletNode);
      // Note: AudioWorkletNode doesn't need to be connected to destination to run,
      // unlike ScriptProcessorNode. We avoid connecting to destination to prevent feedback.
      
      this.isMuted = false;
      
    } catch (error) {
      console.error('Error starting microphone:', error);
      showToast('Impossibile accedere al microfono', 'error');
      throw error;
    }
  }
  
  /**
   * Stop microphone capture
   */
  stopMicrophone() {
    // Disconnect audio worklet
    if (this.audioWorkletNode) {
      this.audioWorkletNode.disconnect();
      this.audioWorkletNode = null;
    }
    
    // Disconnect microphone source
    if (this.micSource) {
      this.micSource.disconnect();
      this.micSource = null;
    }
    
    // Stop all media tracks
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach(track => track.stop());
      this.mediaStream = null;
    }
    
    this.isMuted = true;
  }
  
  /**
   * Set callback for audio data (PCM16 from microphone)
   * @param {Function} callback - (arrayBuffer) => void
   */
  setAudioDataCallback(callback) {
    this.onAudioData = callback;
  }
  
  /**
   * Toggle mute state
   * @returns {boolean} - New mute state
   */
  toggleMute() {
    this.isMuted = !this.isMuted;
    return this.isMuted;
  }
  
  /**
   * Get current mute state
   * @returns {boolean}
   */
  isMicrophoneMuted() {
    return this.isMuted;
  }
  
  /**
   * Queue audio for playback (base64 encoded PCM16)
   * @param {string} base64Audio - Base64 encoded audio data
   */
  async queueAudio(base64Audio) {
    try {
      // Decode base64 to ArrayBuffer
      const binaryString = atob(base64Audio);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      
      // Add to queue
      this.playbackQueue.push(bytes.buffer);
      
      // Start playback if not already playing and queue has enough buffered
      if (!this.isPlaying && this.playbackQueue.length >= AUDIO_CONFIG.MIN_BUFFER_SIZE) {
        this.playNextAudio();
      }
    } catch (error) {
      console.error('Error queuing audio:', error);
    }
  }
  
  /**
   * Play next audio chunk from queue
   */
  async playNextAudio() {
    // Check if queue is empty
    if (this.playbackQueue.length === 0) {
      this.isPlaying = false;
      return;
    }
    
    this.isPlaying = true;
    const arrayBuffer = this.playbackQueue.shift();
    
    try {
      // Ensure audio context exists
      if (!this.audioContext) {
        this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
      }
      
      // Resume context if suspended
      if (this.audioContext.state === 'suspended') {
        await this.audioContext.resume();
      }
      
      // Convert PCM16 to Float32 and resample to browser's sample rate
      const audioBuffer = await this.resampleAudio(arrayBuffer);
      
      // Create buffer source
      const source = this.audioContext.createBufferSource();
      source.buffer = audioBuffer;
      
      // Create analyser for frequency visualization
      if (!this.analyserNode) {
        this.analyserNode = this.audioContext.createAnalyser();
        this.analyserNode.fftSize = 256;
        this.frequencyData = new Uint8Array(this.analyserNode.frequencyBinCount);
      }
      
      // Connect audio graph: source -> analyser -> destination
      source.connect(this.analyserNode);
      this.analyserNode.connect(this.audioContext.destination);
      
      // Track RMS during playback
      const trackPlaybackRMS = () => {
        if (this.currentPlaybackSource === source) {
          this.analyserNode.getByteFrequencyData(this.frequencyData);
          
          // Calculate RMS from frequency data (focus on speech frequencies 300Hz-3400Hz)
          const speechBins = this.frequencyData.slice(2, 30); // Approximate speech range
          let sum = 0;
          for (let i = 0; i < speechBins.length; i++) {
            const normalized = speechBins[i] / 255;
            sum += normalized * normalized;
          }
          const rms = Math.sqrt(sum / speechBins.length);
          
          this.onRMS(rms, 'agent');
          
          requestAnimationFrame(trackPlaybackRMS);
        }
      };
      
      // Handle playback completion
      source.onended = () => {
        if (this.currentPlaybackSource === source) {
          this.currentPlaybackSource = null;
          // Play next audio in queue
          this.playNextAudio();
        }
      };
      
      // Start playback
      this.currentPlaybackSource = source;
      source.start(0);
      
      // Start RMS tracking
      trackPlaybackRMS();
      
    } catch (error) {
      console.error('Error playing audio:', error);
      this.isPlaying = false;
      // Try next in queue
      if (this.playbackQueue.length > 0) {
        this.playNextAudio();
      }
    }
  }
  
  /**
   * Resample PCM16 audio to browser's native sample rate
   * @param {ArrayBuffer} pcm16Buffer - PCM16 audio data
   * @returns {Promise<AudioBuffer>} - Resampled audio buffer
   */
  async resampleAudio(pcm16Buffer) {
    // Convert Int16 PCM to Float32
    const int16Array = new Int16Array(pcm16Buffer);
    const float32Array = new Float32Array(int16Array.length);
    
    for (let i = 0; i < int16Array.length; i++) {
      // Convert to float [-1, 1]
      float32Array[i] = int16Array[i] / (int16Array[i] < 0 ? 0x8000 : 0x7FFF);
    }
    
    // Apply fade-in/fade-out to prevent clicks
    const fadeLength = Math.min(AUDIO_CONFIG.FADE_SAMPLES, float32Array.length / 2);
    
    // Fade in (first samples)
    for (let i = 0; i < fadeLength; i++) {
      float32Array[i] *= i / fadeLength;
    }
    
    // Fade out (last samples)
    for (let i = 0; i < fadeLength; i++) {
      const index = float32Array.length - 1 - i;
      float32Array[index] *= i / fadeLength;
    }
    
    // Create offline context for resampling
    const offlineContext = new OfflineAudioContext(
      1, // mono
      float32Array.length,
      AUDIO_CONFIG.SAMPLE_RATE_INPUT
    );
    
    // Create buffer with input data
    const inputBuffer = offlineContext.createBuffer(1, float32Array.length, AUDIO_CONFIG.SAMPLE_RATE_INPUT);
    inputBuffer.getChannelData(0).set(float32Array);
    
    // Create source
    const source = offlineContext.createBufferSource();
    source.buffer = inputBuffer;
    source.connect(offlineContext.destination);
    source.start(0);
    
    // Render (resample) to browser's sample rate
    const renderedBuffer = await offlineContext.startRendering();
    
    return renderedBuffer;
  }
  
  /**
   * Stop all audio playback
   */
  stopPlayback() {
    // Clear queue
    this.playbackQueue = [];
    
    // Stop current playback
    if (this.currentPlaybackSource) {
      try {
        this.currentPlaybackSource.stop();
      } catch (e) {
        // Ignore if already stopped
      }
      this.currentPlaybackSource = null;
    }
    
    this.isPlaying = false;
  }
  
  /**
   * Cleanup resources
   */
  destroy() {
    this.stopMicrophone();
    this.stopPlayback();
    
    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }
  }
}
