/**
 * UI Utilities Module
 * 
 * Core UI utilities for toast notifications, status updates, modals,
 * settings persistence, voice validation, and markdown rendering.
 * 
 * NOTE: Transcript and Trace management have been moved to dedicated modules:
 * - transcript-manager.js for transcript panel
 * - trace-manager.js for trace/debug panel
 */

import { getVoiceName, validateCompatibility, DEFAULT_SETTINGS } from '../core/config.js';
import { SettingsManager } from '../modules/settings-manager.js';

// Re-export transcript and trace functions from their dedicated modules
export { addTranscript, clearTranscripts, toggleTranscriptPanel } from '../managers/transcript-manager.js';
export { addTraceEntry, clearTraceEntries, toggleTracePanel } from '../managers/trace-manager.js';

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
    info: window.APP_RESOURCES?.Information || 'Information',
    success: window.APP_RESOURCES?.Success || 'Success',
    warning: window.APP_RESOURCES?.Warning || 'Warning',
    error: window.APP_RESOURCES?.Error || 'Error'
  }[type] || window.APP_RESOURCES?.Notification || 'Notification';
  
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
  closeBtn.setAttribute('aria-label', window.APP_RESOURCES?.CloseNotification || 'Close notification');
  
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
 * Show a small floating message centered under the microphone button
 * @param {string} type - Message type: 'info' or 'error'
 * @param {string} text - Message text
 * @param {number} timeout - Auto-dismiss timeout in ms (default: 4000)
 * @returns {HTMLElement} - The message element
 */
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
 * Convert markdown syntax to HTML
 * Supports: **bold**, *italic*, `code`, ```code blocks```, [links](url), line breaks
 * @param {string} text - Markdown text
 * @returns {string} - HTML formatted text
 */
export function markdownToHtml(text) {
  if (!text) return '';
  
  // First escape HTML to prevent XSS
  let html = escapeHtml(text);
  
  // Code blocks (```code```) - must be processed before inline code
  html = html.replace(/```([\s\S]*?)```/g, '<pre><code>$1</code></pre>');
  
  // Inline code (`code`)
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
  
  // Bold (**text** or __text__)
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/__([^_]+)__/g, '<strong>$1</strong>');
  
  // Italic (*text* or _text_) - be careful not to match already processed bold
  html = html.replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, '<em>$1</em>');
  html = html.replace(/(?<!_)_([^_]+)_(?!_)/g, '<em>$1</em>');
  
  // Links [text](url)
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
  
  // Line breaks (two spaces at end of line or actual newlines)
  html = html.replace(/  \n/g, '<br>');
  html = html.replace(/\n/g, '<br>');
  
  // Unordered lists (- item or * item)
  html = html.replace(/(?:^|<br>)[-*]\s+(.+?)(?=<br>|$)/g, '<li>$1</li>');
  html = html.replace(/(<li>.*<\/li>)+/g, '<ul>$&</ul>');
  
  // Ordered lists (1. item)
  html = html.replace(/(?:^|<br>)\d+\.\s+(.+?)(?=<br>|$)/g, '<li>$1</li>');
  
  return html;
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
  const template = window.APP_RESOURCES?.WelcomeMessageTemplate || 'Hello! I am {0}, how can I help you today?';
  return template.replace('{0}', voiceName);
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
 * Save settings using SettingsManager
 * @param {Object} settings - Settings object to save
 * @param {string} pageName - Name of the page (VoiceAssistant, VoiceAgent, VoiceAvatar)
 * @returns {boolean} - True if settings saved successfully
 */
export function saveSettings(settings, pageName = 'default') {
  try {
    const storageKey = `voiceAgent_${pageName}_settings`;
    const manager = new SettingsManager(storageKey, DEFAULT_SETTINGS);
    manager.set(settings);
    manager.save();
    return true;
  } catch (error) {
    console.error('Error saving settings:', error);
    showToast(window.APP_RESOURCES?.UnableToSaveSettings || 'Unable to save settings', 'error');
    return false;
  }
}

/**
 * Load settings using SettingsManager
 * @param {string} pageName - Name of the page (VoiceAssistant, VoiceAgent, VoiceAvatar)
 * @returns {Object} - Loaded settings or defaults
 */
export function loadSettings(pageName = 'default') {
  try {
    const storageKey = `voiceAgent_${pageName}_settings`;
    const manager = new SettingsManager(storageKey, DEFAULT_SETTINGS);
    const settings = manager.getAll();
    // Merge with defaults to ensure all properties exist
    return {
      ...DEFAULT_SETTINGS,
      ...settings
    };
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

