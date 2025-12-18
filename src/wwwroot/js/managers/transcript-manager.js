/**
 * Transcript Manager Module
 * 
 * Manages the transcript panel: adding messages, clearing, toggling visibility
 */

import { markdownToHtml } from '../ui/ui-utils.js';

/**
 * Add a transcript entry to the transcript panel
 * @param {string} role - Role: 'user', 'agent', 'system'
 * @param {string} text - Text content
 */
export function addTranscript(role, text) {
  const transcriptContent = document.getElementById('transcriptContent');
  if (!transcriptContent) {
    console.warn('[addTranscript] transcriptContent element not found');
    return;
  }

  console.log('[addTranscript] Called with:', { role, text: text?.substring(0, 50) });

  // Only show user and assistant/agent messages in the transcript panel
  if (!role || role === 'system') {
    console.log('[addTranscript] Skipping system message');
    return;
  }

  // Normalize role naming: 'assistant' and 'agent' both become 'agent', 'user' stays 'user'
  const normalizedRole = (role === 'assistant' || role === 'agent') ? 'agent' : 'user';
  
  console.log('[addTranscript] Normalized role:', normalizedRole);

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
  
  console.log('[addTranscript] Item added to transcript:', { role: normalizedRole, itemCount: transcriptContent.children.length });

  // Auto-scroll to bottom
  transcriptContent.scrollTop = transcriptContent.scrollHeight;
}

/**
 * Clear all transcript entries
 */
export function clearTranscripts() {
  const transcriptContent = document.getElementById('transcriptContent');
  if (transcriptContent) {
    transcriptContent.innerHTML = '';
  }
}

/**
 * Toggle transcript panel visibility
 */
export function toggleTranscriptPanel() {
  const panel = document.getElementById('transcriptBox');
  if (panel) {
    panel.classList.toggle('visible');
  }
}
