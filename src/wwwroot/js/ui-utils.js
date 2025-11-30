/**
 * UI Utilities Module
 * 
 * Provides utility functions for UI interactions including toast notifications,
 * transcript management, voice name extraction, validation, and settings persistence.
 */

import { getVoiceName, validateCompatibility, DEFAULT_SETTINGS } from './config.js';

/**
 * Show a modern toast notification
 * @param {string} message - Message to display
 * @param {string} type - Toast type: 'info', 'success', 'warning', 'error'
 * @param {number} duration - Display duration in milliseconds (default: 4000)
 * @param {string} title - Optional title for the toast (default: auto-generated)
 */
export function showToast(message, type = 'info', duration = 4000, title = null) {
  const container = document.getElementById('toastContainer');
  if (!container) return;
  
  // Create toast element
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  
  // SVG icons based on type (use currentColor so CSS controls color)
  const iconsSvg = {
    info: `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>`,
    success: `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6L9 17l-5-5"></path></svg>`,
    warning: `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>`,
    error: `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>`
  };
  
  // Auto-generate title if not provided
  const toastTitle = title || {
    info: 'Informazione',
    success: 'Successo',
    warning: 'Attenzione',
    error: 'Errore'
  }[type] || 'Notifica';
  
  // Create icon element (SVG inserted inline so it inherits currentColor)
  const icon = document.createElement('span');
  icon.className = 'toast-icon';
  icon.innerHTML = iconsSvg[type] || iconsSvg.info;
  
  // Create content wrapper
  const contentWrapper = document.createElement('div');
  contentWrapper.className = 'toast-content';
  
  // Create title element
  const titleEl = document.createElement('div');
  titleEl.className = 'toast-title';
  titleEl.textContent = toastTitle;
  
  // Create message element
  const messageEl = document.createElement('div');
  messageEl.className = 'toast-message';
  messageEl.textContent = message;
  
  contentWrapper.appendChild(titleEl);
  contentWrapper.appendChild(messageEl);
  
  // Create close button
  const closeBtn = document.createElement('button');
  closeBtn.className = 'toast-close';
  closeBtn.innerHTML = '×';
  closeBtn.setAttribute('aria-label', 'Chiudi notifica');
  
  // Build toast structure
  toast.appendChild(icon);
  toast.appendChild(contentWrapper);
  toast.appendChild(closeBtn);
  
  // Add to container
  container.appendChild(toast);
  
  // Function to dismiss toast
  const dismissToast = () => {
    toast.classList.add('fade-out');
    setTimeout(() => {
      if (toast.parentNode) {
        toast.parentNode.removeChild(toast);
      }
    }, 300); // Wait for fade-out animation
  };
  
  // Auto-dismiss after duration
  const timeoutId = setTimeout(dismissToast, duration);
  
  // Allow manual dismiss by clicking close button
  closeBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    clearTimeout(timeoutId);
    dismissToast();
  });
}

/**
 * Add a transcript message to the conversation panel
 * @param {string} role - Message role: 'user', 'agent', or 'system'
 * @param {string} text - Message text content
 */
export function addTranscript(role, text) {
  const transcriptContent = document.getElementById('transcriptContent');
  if (!transcriptContent) return;

  // Only show user and assistant/agent messages in the transcript panel
  if (!role || role === 'system') return;

  // Normalize role naming: keep 'agent' and 'user'
  const normalizedRole = role === 'agent' ? 'agent' : role;

  // Build transcript item using .transcript-item markup for better styling
  const item = document.createElement('div');
  item.className = `transcript-item ${normalizedRole}`;

  // Create icon element
  const iconDiv = document.createElement('div');
  iconDiv.className = 'transcript-icon';
  
  if (normalizedRole === 'user') {
    iconDiv.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>`;
  } else {
    iconDiv.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="10" rx="2"></rect><circle cx="12" cy="5" r="2"></circle><path d="M12 7v4"></path><line x1="8" y1="16" x2="8" y2="16"></line><line x1="16" y1="16" x2="16" y2="16"></line></svg>`;
  }

  const content = document.createElement('div');
  content.className = 'transcript-content';
  content.innerHTML = escapeHtml(text);

  item.appendChild(iconDiv);
  item.appendChild(content);

  transcriptContent.appendChild(item);

  // Auto-scroll to bottom
  transcriptContent.scrollTop = transcriptContent.scrollHeight;
}

// Show a small floating message centered under the microphone button.
// type: 'info' | 'error'
export function showMicMessage(type, text, timeout = 4000) {
  let wrapper = document.querySelector('.mic-message-container');
  if (!wrapper) {
    wrapper = document.createElement('div');
    wrapper.className = 'mic-message-container';
    document.body.appendChild(wrapper);
  }

  const msg = document.createElement('div');
  msg.className = `mic-message ${type}`;
  msg.textContent = text;

  wrapper.appendChild(msg);

  // Force reflow then show
  void msg.offsetWidth;
  msg.classList.add('show');

  const remove = () => {
    msg.classList.remove('show');
    setTimeout(() => { try { wrapper.removeChild(msg); } catch(e) {} }, 220);
  };

  if (timeout > 0) {
    setTimeout(remove, timeout);
  }

  // allow click to dismiss
  msg.addEventListener('click', remove);

  return msg;
}

/**
 * Clear all transcript messages
 */
export function clearTranscripts() {
  const transcriptContent = document.getElementById('transcriptContent');
  if (transcriptContent) {
    transcriptContent.innerHTML = '';
  }
}

/**
 * Escape HTML to prevent XSS attacks
 * @param {string} text - Text to escape
 * @returns {string} - Escaped text
 */
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

/**
 * Extract voice display name from voice ID
 * Example: "it-IT-IsabellaNeural" -> "Isabella"
 * @param {string} voiceId - Voice identifier
 * @returns {string} - Extracted voice name
 */
export function extractVoiceName(voiceId) {
  return getVoiceName(voiceId);
}

/**
 * Generate welcome message with voice name
 * @param {string} voiceName - Name of the voice
 * @returns {string} - Welcome message
 */
export function generateWelcomeMessage(voiceName) {
  return `Ciao! Sono ${voiceName}, come posso aiutarti oggi?`;
}

/**
 * Validate model-voice compatibility
 * @param {string} model - Voice model ID
 * @param {string} voice - Voice ID
 * @returns {Object} - {valid: boolean, message: string}
 */
export function validateModelVoiceCompatibility(model, voice) {
  return validateCompatibility(model, voice);
}

/**
 * Get the storage key for the current page
 * @param {string} pageName - Name of the page (VoiceAssistant, VoiceAgent, VoiceAvatar)
 * @returns {string} - Storage key for this page
 */
function getSettingsKey(pageName) {
  return `voiceAgent_${pageName}_settings`;
}

/**
 * Save settings to localStorage
 * @param {Object} settings - Settings object to save
 * @param {string} pageName - Name of the page (VoiceAssistant, VoiceAgent, VoiceAvatar)
 */
export function saveSettings(settings, pageName = 'default') {
  try {
    localStorage.setItem(getSettingsKey(pageName), JSON.stringify(settings));
    return true;
  } catch (error) {
    console.error('Error saving settings:', error);
    showToast('Impossibile salvare le impostazioni', 'error');
    return false;
  }
}

/**
 * Load settings from localStorage
 * @param {string} pageName - Name of the page (VoiceAssistant, VoiceAgent, VoiceAvatar)
 * @returns {Object} - Loaded settings or defaults
 */
export function loadSettings(pageName = 'default') {
  try {
    const stored = localStorage.getItem(getSettingsKey(pageName));
    if (stored) {
      const settings = JSON.parse(stored);
      // Merge with defaults to ensure all properties exist
      return {
        ...DEFAULT_SETTINGS,
        ...settings
      };
    }
  } catch (error) {
    console.error('Error loading settings:', error);
  }
  
  // Return defaults if no stored settings or error
  return { ...DEFAULT_SETTINGS };
}

/**
 * Update status monitor display
 * @param {string} text - Status text to display
 * @param {string} statusClass - CSS class for indicator: 'connected', 'disconnected', 'speaking'
 */
export function updateStatus(text, statusClass = 'disconnected') {
  const statusText = document.getElementById('statusText');
  const statusIndicator = document.getElementById('statusIndicator');
  
  if (statusText) {
    statusText.textContent = text;
  }
  
  if (statusIndicator) {
    // Remove all status classes
    statusIndicator.classList.remove('connected', 'disconnected', 'speaking');
    // Add new status class
    statusIndicator.classList.add(statusClass);
  }
}

/**
 * Toggle visibility of transcript panel
 */
export function toggleTranscriptPanel() {
  const transcriptBox = document.getElementById('transcriptBox');
  if (transcriptBox) {
    transcriptBox.classList.toggle('visible');
  }
}

/**
 * Show settings modal
 */
export function showSettingsModal() {
  const modal = document.getElementById('settingsModal');
  if (modal) {
    modal.classList.add('visible');
  }
}

/**
 * Hide settings modal
 */
export function hideSettingsModal() {
  const modal = document.getElementById('settingsModal');
  if (modal) {
    modal.classList.remove('visible');
  }
}

/**
 * Update welcome message input with voice name
 * @param {string} voiceId - Voice ID
 * @param {HTMLTextAreaElement} welcomeInput - Welcome message textarea element
 */
export function updateWelcomeMessageInput(voiceId, welcomeInput) {
  if (!welcomeInput) return;
  
  const voiceName = extractVoiceName(voiceId);
  const currentMessage = welcomeInput.value;
  
  // Check if current message follows the template pattern
  const templatePattern = /^Ciao! Sono \w+, come posso aiutarti oggi\?$/;
  
  if (!currentMessage || templatePattern.test(currentMessage)) {
    // Update to new template with new voice name
    welcomeInput.value = generateWelcomeMessage(voiceName);
  }
  // Otherwise, preserve user's custom message
}

/**
 * Show error boundary with message
 * @param {string} message - Error message to display
 */
export function showErrorBoundary(message) {
  const errorBoundary = document.getElementById('errorBoundary');
  const errorMessage = document.getElementById('errorMessage');
  
  if (errorBoundary && errorMessage) {
    errorMessage.textContent = message;
    errorBoundary.classList.add('visible');
  }
}

/**
 * Auto-resize textarea based on content
 * @param {HTMLTextAreaElement} textarea - Textarea element
 */
export function autoResizeTextarea(textarea) {
  if (!textarea) return;
  
  // Reset height to auto to get correct scrollHeight
  textarea.style.height = 'auto';
  
  // Set height to scrollHeight (content height)
  textarea.style.height = textarea.scrollHeight + 'px';
}

/**
 * Add a trace entry to the trace panel
 * @param {string} role - Entry role: 'user', 'assistant', 'system'
 * @param {string} message - Message text
 */
export function addTraceEntry(role = 'system', message = '') {
  const traceContent = document.getElementById('traceContent');
  if (!traceContent) return;
  
  // Create timestamp
  const now = new Date();
  const timestamp = now.toLocaleTimeString('it-IT', { 
    hour: '2-digit', 
    minute: '2-digit', 
    second: '2-digit' 
  });
  
  // Create trace entry element
  const entry = document.createElement('div');
  entry.className = `trace-entry ${role}`;
  
  // Create timestamp span
  const timeSpan = document.createElement('span');
  timeSpan.className = 'trace-timestamp';
  timeSpan.textContent = `[${timestamp}]`;
  
  // Create message span
  const msgSpan = document.createElement('span');
  msgSpan.textContent = message;
  
  entry.appendChild(timeSpan);
  entry.appendChild(msgSpan);
  
  // Add to trace content
  traceContent.appendChild(entry);
  
  // Update badge counter
  const badge = document.querySelector('.trace-badge');
  if (badge) {
    const currentCount = parseInt(badge.textContent) || 0;
    badge.textContent = currentCount + 1;
  }
  
  // Auto-scroll to bottom
  traceContent.scrollTop = traceContent.scrollHeight;
}

/**
 * Clear all trace entries
 */
export function clearTraceEntries() {
  const traceContent = document.getElementById('traceContent');
  if (traceContent) {
    traceContent.innerHTML = '';
  }
  
  // Reset badge counter
  const badge = document.querySelector('.trace-badge');
  if (badge) {
    badge.textContent = '0';
  }
}

/**
 * Toggle trace panel visibility
 */
export function toggleTracePanel() {
  const tracePanel = document.getElementById('tracePanel');
  if (!tracePanel) return;
  
  const isVisible = tracePanel.classList.toggle('visible');
  
  // Reset badge counter when opening the panel
  if (isVisible) {
    const badge = document.querySelector('.trace-badge');
    if (badge) {
      badge.textContent = '0';
    }
  }
}

// Scroll hint utilities: add classes when panels are scrollable to show visual hints
function updateScrollHintsFor(element) {
  if (!element) return;

  const check = () => {
    const isScrollable = element.scrollHeight > element.clientHeight + 2;
    element.classList.toggle('has-scroll', isScrollable);
    // If scrolled away from top, show top hint
    element.classList.toggle('scrolled', element.scrollTop > 4);
  };

  // Initial check
  check();

  // Wire scroll listener
  element.addEventListener('scroll', () => {
    check();
  });

  // Observe size/content changes
  const ro = new ResizeObserver(check);
  ro.observe(element);

  // Also observe child list changes for dynamic content
  const mo = new MutationObserver(check);
  mo.observe(element, { childList: true, subtree: true });
}

// Attach on DOM ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    updateScrollHintsFor(document.getElementById('traceContent'));
    updateScrollHintsFor(document.getElementById('transcriptContent'));
  });
} else {
  updateScrollHintsFor(document.getElementById('traceContent'));
  updateScrollHintsFor(document.getElementById('transcriptContent'));
}

