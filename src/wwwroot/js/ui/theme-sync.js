import { SettingsManager } from '../modules/settings-manager.js';

// Centralized theme sync helper
// Exposes functions to get/apply/toggle theme and sync across tabs
const THEME_KEY = 'voiceAgent_theme';
const themeManager = new SettingsManager(THEME_KEY, { theme: 'dark' });

function getSavedTheme() {
  try {
    const theme = themeManager.get('theme');
    const finalTheme = (theme === 'dark' || theme === 'light') ? theme : 'dark';
    console.log('Retrieved theme from storage:', theme, '-> using:', finalTheme);
    console.log('localStorage voiceAgent_theme:', localStorage.getItem('voiceAgent_theme'));
    return finalTheme;
  } catch (error) {
    console.error('Error loading theme:', error);
    return 'dark';
  }
}

function applyThemeMode(mode) {
  console.log('Applying theme mode:', mode);
  document.documentElement.setAttribute('data-theme', mode);
  if (mode === 'dark') {
    document.body.classList.remove('light-mode');
    console.log('✓ Removed light-mode class, body is now dark');
  } else {
    document.body.classList.add('light-mode');
    console.log('✓ Added light-mode class, body is now light');
  }

  const btn = document.getElementById('themeToggleButton');
  if (btn) {
    btn.setAttribute('aria-pressed', String(mode === 'dark'));
    btn.setAttribute('aria-label', mode === 'dark'
      ? (window.APP_RESOURCES?.DarkThemeActive || 'Dark theme active. Press to change.')
      : (window.APP_RESOURCES?.LightThemeActive || 'Light theme active. Press to change.'));
    console.log('✓ Updated button aria attributes for', mode, 'theme');
  }
}

function saveTheme(mode) {
  try {
    const themeValue = mode === 'dark' ? 'dark' : 'light';
    themeManager.set('theme', themeValue);
    console.log('✓ Theme saved:', themeValue);
    console.log('✓ localStorage theme:', localStorage.getItem('voiceAgent_theme'));
  } catch (error) {
    console.error('Error saving theme:', error);
  }
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
  console.log('Toggling theme from', current, 'to', next);
  saveTheme(next);
  applyThemeMode(next);
  console.log('✓ Theme toggled and applied:', next);
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
