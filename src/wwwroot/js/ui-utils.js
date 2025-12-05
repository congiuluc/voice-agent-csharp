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
  content.innerHTML = markdownToHtml(text);

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
 * Convert markdown syntax to HTML
 * Supports: **bold**, *italic*, `code`, ```code blocks```, [links](url), line breaks
 * @param {string} text - Markdown text
 * @returns {string} - HTML formatted text
 */
function markdownToHtml(text) {
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
 * @param {string} role - Entry role: 'user', 'assistant', 'system', 'event', 'error'
 * @param {string} message - Message text or event type
 * @param {Object|null} payload - Optional structured payload for events
 */
export function addTraceEntry(role = 'system', message = '', payload = null) {
  const traceContent = document.getElementById('traceContent');
  if (!traceContent) return;
  
  // Create timestamp
  const now = new Date();
  const timestamp = now.toLocaleTimeString('it-IT', { 
    hour: '2-digit', 
    minute: '2-digit', 
    second: '2-digit',
    fractionalSecondDigits: 3
  });
  
  // Create trace entry element
  const entry = document.createElement('div');
  entry.className = `trace-entry ${role}`;
  
  // Create timestamp span
  const timeSpan = document.createElement('span');
  timeSpan.className = 'trace-timestamp';
  timeSpan.textContent = `[${timestamp}]`;
  
  // Create event type badge for events
  const eventTypeSpan = document.createElement('span');
  eventTypeSpan.className = 'trace-event-type';
  
  // Determine event icon based on message/type
  const eventIcon = getEventIcon(message);
  eventTypeSpan.innerHTML = `${eventIcon} <strong>${message}</strong>`;
  
  // Create message/payload span
  const msgSpan = document.createElement('span');
  msgSpan.className = 'trace-message';
  
  if (payload) {
    // Format payload for display
    const formattedPayload = formatTracePayload(payload);
    if (formattedPayload) {
      msgSpan.innerHTML = formattedPayload;
    }
  }
  
  entry.appendChild(timeSpan);
  entry.appendChild(eventTypeSpan);
  if (payload) {
    entry.appendChild(msgSpan);
  }
  
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
  
  // Limit entries to prevent memory issues (keep last 500)
  while (traceContent.children.length > 500) {
    traceContent.removeChild(traceContent.firstChild);
  }
}

/**
 * Get icon for event type
 * @param {string} eventType - The event type name
 * @returns {string} - Emoji/icon for the event
 */
// SVG icons for trace events (inline, small)
const TRACE_ICONS = {
  rocket: `<svg class="trace-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z"/><path d="M12 15l-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z"/></svg>`,
  refresh: `<svg class="trace-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>`,
  error: `<svg class="trace-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>`,
  plug: `<svg class="trace-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22v-5"/><path d="M9 7V2"/><path d="M15 7V2"/><path d="M6 7h12a2 2 0 0 1 2 2v5a8 8 0 0 1-16 0V9a2 2 0 0 1 2-2z"/></svg>`,
  lock: `<svg class="trace-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>`,
  mic: `<svg class="trace-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>`,
  micOff: `<svg class="trace-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="1" y1="1" x2="23" y2="23"/><path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6"/><path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>`,
  upload: `<svg class="trace-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="16 16 12 12 8 16"/><line x1="12" y1="12" x2="12" y2="21"/><path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3"/></svg>`,
  trash: `<svg class="trace-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>`,
  volume: `<svg class="trace-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/></svg>`,
  check: `<svg class="trace-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>`,
  user: `<svg class="trace-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`,
  warning: `<svg class="trace-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`,
  fileText: `<svg class="trace-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>`,
  message: `<svg class="trace-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>`,
  mail: `<svg class="trace-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>`,
  plus: `<svg class="trace-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>`,
  checkSmall: `<svg class="trace-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 11 12 14 20 6"/></svg>`,
  file: `<svg class="trace-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>`,
  edit: `<svg class="trace-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>`,
  book: `<svg class="trace-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>`,
  thought: `<svg class="trace-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>`,
  settings: `<svg class="trace-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>`,
  tool: `<svg class="trace-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>`,
  chart: `<svg class="trace-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>`,
  list: `<svg class="trace-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>`
};

function getEventIcon(eventType) {
  const eventIcons = {
    // Session events
    'SessionCreated': TRACE_ICONS.rocket,
    'SessionUpdated': TRACE_ICONS.refresh,
    'SessionError': TRACE_ICONS.error,
    'SessionDisconnected': TRACE_ICONS.plug,
    'SessionClosed': TRACE_ICONS.lock,
    
    // Speech events
    'SpeechStarted': TRACE_ICONS.mic,
    'SpeechStopped': TRACE_ICONS.micOff,
    
    // Audio events
    'AudioBufferCommitted': TRACE_ICONS.upload,
    'AudioBufferCleared': TRACE_ICONS.trash,
    'ResponseAudioDelta': TRACE_ICONS.volume,
    'ResponseAudioDone': TRACE_ICONS.check,
    
    // Transcription events
    'UserTranscription': TRACE_ICONS.user,
    'UserTranscriptionFailed': TRACE_ICONS.warning,
    'ResponseAudioTranscriptDelta': TRACE_ICONS.fileText,
    'ResponseAudioTranscriptDone': TRACE_ICONS.message,
    
    // Response events
    'ResponseCreated': TRACE_ICONS.mail,
    'ResponseOutputItemAdded': TRACE_ICONS.plus,
    'ResponseOutputItemDone': TRACE_ICONS.checkSmall,
    'ResponseContentPartAdded': TRACE_ICONS.file,
    'ResponseContentPartDone': TRACE_ICONS.checkSmall,
    'ResponseTextDelta': TRACE_ICONS.edit,
    'ResponseTextDone': TRACE_ICONS.book,
    'ResponseDone': TRACE_ICONS.check,
    
    // Conversation events
    'ConversationItemCreated': TRACE_ICONS.thought,
    
    // Function/Tool events
    'FunctionCallArgumentsDelta': TRACE_ICONS.settings,
    'FunctionCallArgumentsDone': TRACE_ICONS.tool,
    'FunctionCallCompleted': TRACE_ICONS.check,
    
    // Rate limits
    'RateLimitsUpdated': TRACE_ICONS.chart,
    
    // Error events
    'Error': TRACE_ICONS.error,
    'EventProcessingError': TRACE_ICONS.warning,
    
    // Default
    'default': TRACE_ICONS.list
  };
  
  return eventIcons[eventType] || eventIcons['default'];
}

/**
 * Format trace payload for display
 * @param {Object} payload - The event payload
 * @returns {string} - Formatted HTML string
 */
function formatTracePayload(payload) {
  if (!payload || typeof payload !== 'object') return '';
  
  const parts = [];
  
  for (const [key, value] of Object.entries(payload)) {
    if (value === null || value === undefined) continue;
    
    let displayValue = value;
    
    // Handle Usage object specially for better readability
    if (key === 'Usage' && typeof value === 'object') {
      const usage = value;
      const inputTokens = usage.InputTokens || 0;
      const outputTokens = usage.OutputTokens || 0;
      const totalTokens = usage.TotalTokens || (inputTokens + outputTokens);
      displayValue = `${TRACE_ICONS.chart} In: ${inputTokens} | Out: ${outputTokens} | Total: ${totalTokens}`;
      parts.push(`<span class="trace-key trace-tokens">${displayValue}</span>`);
      continue;
    }
    // Handle other nested objects
    else if (typeof value === 'object' && !Array.isArray(value)) {
      displayValue = JSON.stringify(value);
    }
    // Truncate long strings
    else if (typeof value === 'string' && value.length > 100) {
      displayValue = value.substring(0, 100) + '...';
    }
    // Format arrays
    else if (Array.isArray(value)) {
      displayValue = `[${value.length} items]`;
    }
    
    parts.push(`<span class="trace-key">${key}:</span> <span class="trace-value">${escapeHtmlForTrace(String(displayValue))}</span>`);
  }
  
  return parts.length > 0 ? parts.join(' | ') : '';
}

/**
 * Escape HTML for trace display
 * @param {string} text - Text to escape
 * @returns {string} - Escaped text
 */
function escapeHtmlForTrace(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
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

