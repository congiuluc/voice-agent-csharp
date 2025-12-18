/**
 * Trace Manager Module
 * 
 * Manages the trace/debug panel for event logging and debugging
 */

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
  const timestamp = now.toLocaleTimeString('en-US', {
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
