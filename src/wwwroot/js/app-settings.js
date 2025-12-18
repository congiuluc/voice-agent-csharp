/**
 * App Settings Module
 * 
 * Manages the simple settings modal on the homepage.
 * Handles: Language, Theme, and Visualizer settings.
 */

import { SettingsManager } from './modules/settings-manager.js';
import { getSavedTheme, applyThemeMode, saveTheme } from './theme-sync.js';
import { showToast } from './ui-utils.js';

const DEFAULT_UI_SETTINGS = {
  language: 'en-US',
  theme: 'dark',
  visualizerType: 'wave'
};

const uiSettingsManager = new SettingsManager('uiSettings', DEFAULT_UI_SETTINGS);

/**
 * Initialize settings modal
 */
function initializeSettingsModal() {
  const modal = document.getElementById('settingsModal');
  const settingsButton = document.getElementById('settingsButton');
  const closeButton = document.getElementById('closeSettingsButton');
  const saveButton = document.getElementById('saveSettingsButton');

  // Load settings
  loadSettings();

  // Event listeners
  settingsButton?.addEventListener('click', (e) => {
    e.preventDefault();
    openModal();
  });
  
  closeButton?.addEventListener('click', () => closeModal());
  saveButton?.addEventListener('click', () => saveSettings());

  // Theme selector change
  const themeSelect = document.getElementById('themeSelect');
  themeSelect?.addEventListener('change', (e) => {
    const newTheme = e.target.value;
    applyThemeMode(newTheme);
    saveTheme(newTheme);
  });

  // Close modal when clicking outside
  modal?.addEventListener('click', (e) => {
    if (e.target === modal) {
      closeModal();
    }
  });

  // Close modal on Escape
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && isModalVisible()) {
      closeModal();
    }
  });

  // Language will be saved when user clicks Save button, not on change

  console.log('✓ App settings module initialized');
}

function openModal() {
  const modal = document.getElementById('settingsModal');
  if (modal) {
    modal.classList.add('visible');
    document.body.style.overflow = 'hidden';
    // Reload settings when opening modal to ensure current selections are displayed
    loadSettings();
  }
}

function closeModal() {
  const modal = document.getElementById('settingsModal');
  if (modal) {
    modal.classList.remove('visible');
    document.body.style.overflow = '';
  }
}

function isModalVisible() {
  const modal = document.getElementById('settingsModal');
  return modal?.classList.contains('visible') ?? false;
}

/**
 * Load settings from storage
 */
function loadSettings() {
  // Load current theme from central theme-sync module (only if theme selector exists)
  const themeSelect = document.getElementById('themeSelect');
  if (themeSelect) {
    themeSelect.value = getSavedTheme();
  }

  // Load current language from document html lang attribute or saved value
  const languageSelect = document.getElementById('languageSelect');
  if (languageSelect) {
    // Prefer server-marked data-current attribute on options (avoids Razor attribute expressions)
    const options = Array.from(languageSelect.querySelectorAll('option'));
    const serverMarked = options.find(opt => opt.getAttribute('data-current') === 'True' || opt.getAttribute('data-current') === 'true');
    if (serverMarked) {
      serverMarked.selected = true;
      console.log('✓ Language selected from data-current attribute:', serverMarked.value);
    } else {
      // Try to get current language from document html lang attribute
      let currentLang = document.documentElement.lang || 'en-US';
      // Normalize to canonical casing: xx-XX (e.g. it-IT, en-US)
      if (currentLang && currentLang.includes('-')) {
        const parts = currentLang.split('-');
        if (parts.length >= 2) {
          currentLang = parts[0].toLowerCase() + '-' + parts[1].toUpperCase();
        }
      } else if (currentLang) {
        // Map short codes to full form
        currentLang = currentLang.toLowerCase() === 'it' ? 'it-IT' : 'en-US';
      } else {
        currentLang = 'en-US';
      }

      languageSelect.value = currentLang;
      console.log('✓ Current language set to:', currentLang);
    }
  }

  // Load visualizer setting (only if visualizer selector exists)
  const visualizerSelect = document.getElementById('visualizerSelect');
  if (visualizerSelect) {
    const uiSettings = uiSettingsManager.getAll();
    visualizerSelect.value = uiSettings.visualizerType || 'wave';
  }

  console.log('✓ Settings loaded');
}

/**
 * Save settings
 */
async function saveSettings() {
  try {
    const selectedTheme = document.getElementById('themeSelect').value;
    const selectedVisualizer = document.getElementById('visualizerSelect').value;
    const selectedLanguage = document.getElementById('languageSelect').value;
    
    // Save theme and visualizer settings
    uiSettingsManager.set('theme', selectedTheme);
    uiSettingsManager.set('visualizerType', selectedVisualizer);
    
    // Save theme to persistent storage and apply it
    saveTheme(selectedTheme);
    applyThemeMode(selectedTheme);

    // Change language if selected
    if (selectedLanguage) {
      console.log('🌍 Language changed to:', selectedLanguage);
      showToast('Changing language...', 'info');
      
      // Submit via fetch API to /Language/SetLanguage
      const params = new URLSearchParams();
      params.append('culture', selectedLanguage);
      params.append('returnUrl', '/');
      
      console.log('📤 Sending POST to /Language/SetLanguage');
      console.log('📊 Form data:', { culture: selectedLanguage, returnUrl: '/' });
      
      const response = await fetch('/Language/SetLanguage', {
        method: 'POST',
        body: params,
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      });
      
      console.log('✓ Response status:', response.status);
      console.log('✓ Response OK:', response.ok);
      
      if (response.ok || response.status === 302 || response.status === 301) {
        // Save to localStorage as backup
        localStorage.setItem('voiceAgent_language', selectedLanguage);
        console.log('✓ Language saved to localStorage:', selectedLanguage);
        
        // Redirect to home page to reload with new language
        console.log('🔄 Redirecting to / to reload with new language...');
        window.location.href = '/';
        return; // Exit early since we're redirecting
      } else {
        const errorText = await response.text();
        console.error('❌ Error response:', errorText);
        showToast(window.APP_RESOURCES?.LanguageChangeError || 'Error changing language', 'error');
      }
    }
    
    // Verify settings are saved
    const savedSettings = uiSettingsManager.getAll();
    console.log('✓ Settings saved to localStorage:', savedSettings);
    console.log('✓ localStorage content:', localStorage.getItem('uiSettings'));

    showToast(window.APP_RESOURCES?.SettingsSaved || 'Settings saved', 'success');
    console.log('✓ Settings saved successfully');
    
    // Notify voice assistant that visualizer changed (via localStorage)
    window.dispatchEvent(new CustomEvent('settingsChanged', { detail: { visualizer: selectedVisualizer } }));

    // Auto-close after 1.5 seconds
    setTimeout(() => {
      if (isModalVisible()) {
        closeModal();
      }
    }, 1500);

  } catch (error) {
    console.error('Error saving settings:', error);
    showToast(window.APP_RESOURCES?.SettingsSaveError || 'Error saving settings', 'error');
  }
}

/**
 * Export settings getter for other modules
 */
export function getUISettings() {
  return uiSettingsManager.getAll();
}

/**
 * Get the saved visualizer type
 */
export function getSavedVisualizerType() {
  const uiSettings = uiSettingsManager.getAll();
  return uiSettings.visualizerType || 'wave';
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeSettingsModal);
} else {
  initializeSettingsModal();
}

console.log('✓ App settings module loaded');
