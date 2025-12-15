// Centralized theme sync helper
// Exposes functions to get/apply/toggle theme and sync across tabs
const THEME_KEY = 'voiceAgent_theme';

function getSavedTheme() {
  const saved = localStorage.getItem(THEME_KEY);
  if (!saved) return 'dark';
  return saved === 'dark' ? 'dark' : 'light';
}

function applyThemeMode(mode) {
  if (mode === 'dark') document.body.classList.remove('light-mode');
  else document.body.classList.add('light-mode');

  const btn = document.getElementById('themeToggleButton');
  if (btn) {
    btn.setAttribute('aria-pressed', String(mode === 'dark'));
    btn.setAttribute('aria-label', mode === 'dark'
      ? 'Tema scuro attivo. Premi per cambiare.'
      : 'Tema chiaro attivo. Premi per cambiare.');
  }
}

function saveTheme(mode) {
  localStorage.setItem(THEME_KEY, mode === 'dark' ? 'dark' : 'light');
  // Broadcast to other tabs using BroadcastChannel if available
  try {
    if (window.BroadcastChannel) {
      const bc = new BroadcastChannel('voiceAgent_theme_channel');
      bc.postMessage(mode === 'dark' ? 'dark' : 'light');
      bc.close();
    }
  } catch (e) {
    // ignore
  }
}

function toggleTheme() {
  const current = getSavedTheme();
  const next = current === 'dark' ? 'light' : 'dark';
  saveTheme(next);
  applyThemeMode(next);
}

// Listen for storage events (other tabs) and BroadcastChannel messages
function listenForExternalChanges(onChange) {
  window.addEventListener('storage', (e) => {
    if (e.key === THEME_KEY && e.newValue) {
      applyThemeMode(e.newValue === 'dark' ? 'dark' : 'light');
      if (onChange) onChange(e.newValue === 'dark' ? 'dark' : 'light');
    }
  });

  if (window.BroadcastChannel) {
    try {
      const bc = new BroadcastChannel('voiceAgent_theme_channel');
      bc.addEventListener('message', (ev) => {
        const mode = ev.data === 'dark' ? 'dark' : 'light';
        applyThemeMode(mode);
        if (onChange) onChange(mode);
      });
      // keep bc open for page lifetime
      window.__voiceAgent_theme_bc = bc;
    } catch (e) {
      // ignore
    }
  }
}

export { getSavedTheme, applyThemeMode, toggleTheme, saveTheme, listenForExternalChanges };
