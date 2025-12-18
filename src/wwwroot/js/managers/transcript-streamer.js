/**
 * Transcript Streamer
 * Handles synchronized streaming of transcript text with audio playback
 * Uses audio_timestamp.delta events for word-level synchronization
 */

import { markdownToHtml } from '../ui/ui-utils.js';

export class TranscriptStreamer {
  constructor() {
    // Streaming state
    this.currentStreamingResponseId = null;
    this.streamingTranscriptElement = null;
    this.streamingTranscriptText = '';
    
    // Audio synchronization
    this.streamingStartTime = null; // Time when audio started playing
    this.pendingWords = []; // Queue of words with timestamps waiting to be displayed
    this.streamingIntervalId = null; // Interval ID for synchronized streaming
  }
  
  /**
   * Handle response.audio_timestamp.delta event
   * Queues words for synchronized display based on audio timestamps
   * @param {Object} payload - Audio timestamp delta payload
   */
  handleAudioTimestampDelta(payload) {
    if (!payload) return;
    
    const responseId = payload.response_id || payload.ResponseId;
    const audioOffsetMs = payload.audio_offset_ms || payload.AudioOffsetMs || 0;
    const text = payload.text || payload.Text || '';
    const timestampType = payload.timestamp_type || payload.TimestampType;
    
    // Queue text for synchronized streaming (word-by-word)
    if (text && timestampType === 'word') {
      this.queueWordForSyncStreaming(responseId, text, audioOffsetMs);
    }
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
    const delta = payload.delta || payload.Delta || '';
    
    console.log('[DEBUG] Parsed delta:', { responseId, delta });
    
    // Stream delta text to transcript panel
    if (delta) {
      this.streamTextToTranscript(responseId, delta, true); // true = is delta (append without space)
    }
  }
  
  /**
   * Queue a word for synchronized streaming based on audio timestamp
   * @param {string} responseId - The response ID
   * @param {string} word - The word to display
   * @param {number} audioOffsetMs - When this word should appear (ms from audio start)
   */
  queueWordForSyncStreaming(responseId, word, audioOffsetMs) {
    // Add word to queue
    this.pendingWords.push({ responseId, word, audioOffsetMs });
    
    // Start streaming interval if not already running
    if (!this.streamingIntervalId) {
      this.startSynchronizedStreaming();
    }
  }
  
  /**
   * Start the synchronized streaming interval
   * Displays words from queue based on their audio timestamps
   */
  startSynchronizedStreaming() {
    // Record when audio started playing (or use current time as approximation)
    if (!this.streamingStartTime) {
      this.streamingStartTime = Date.now();
    }
    
    // Check every 50ms if any words should be displayed
    this.streamingIntervalId = setInterval(() => {
      const elapsedMs = Date.now() - this.streamingStartTime;
      
      // Find all words that should be displayed by now
      const wordsToDisplay = [];
      this.pendingWords = this.pendingWords.filter(wordData => {
        if (wordData.audioOffsetMs <= elapsedMs) {
          wordsToDisplay.push(wordData);
          return false; // Remove from queue
        }
        return true; // Keep in queue
      });
      
      // Display the words
      wordsToDisplay.forEach(({ responseId, word }) => {
        this.streamTextToTranscript(responseId, word, false);
      });
      
      // Stop interval if no more words pending
      if (this.pendingWords.length === 0) {
        this.stopSynchronizedStreaming();
      }
    }, 50); // Check every 50ms for smooth streaming
  }
  
  /**
   * Stop the synchronized streaming interval
   */
  stopSynchronizedStreaming() {
    if (this.streamingIntervalId) {
      clearInterval(this.streamingIntervalId);
      this.streamingIntervalId = null;
    }
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
   */
  finalizeStreamingTranscript() {
    // Display any remaining words immediately
    this.pendingWords.forEach(({ responseId, word }) => {
      this.streamTextToTranscript(responseId, word, false);
    });
    this.pendingWords = [];
    
    // Stop streaming interval
    this.stopSynchronizedStreaming();
    
    // Reset streaming state
    this.streamingStartTime = null;
    
    if (this.streamingTranscriptElement) {
      this.streamingTranscriptElement.classList.remove('streaming');
      this.streamingTranscriptElement = null;
    }
    this.streamingTranscriptText = '';
    this.currentStreamingResponseId = null;
  }
  
  /**
   * Reset streamer state
   */
  reset() {
    this.pendingWords.forEach(({ responseId, word }) => {
      this.streamTextToTranscript(responseId, word, false);
    });
    this.pendingWords = [];
    this.stopSynchronizedStreaming();
    this.streamingStartTime = null;
    
    if (this.streamingTranscriptElement) {
      this.streamingTranscriptElement.classList.remove('streaming');
      this.streamingTranscriptElement = null;
    }
    this.streamingTranscriptText = '';
    this.currentStreamingResponseId = null;
  }
}

// Create and export singleton instance
export const transcriptStreamer = new TranscriptStreamer();
