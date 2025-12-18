/**
 * App Settings Module
 * 
 * Manages the simple settings modal on the homepage.
 * Handles: Language, Theme, and Visualizer settings.
 */

import { SettingsManager } from '../modules/settings-manager.js';
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
  const lpSettingsButton = document.getElementById('lp_settingsButton');
  const closeButton = document.getElementById('closeSettingsButton');
  const saveButton = document.getElementById('saveSettingsButton');

  // Initialize custom dropdowns
  initCustomDropdowns();

  // Load settings
  loadSettings();

  // Event listeners
  settingsButton?.addEventListener('click', (e) => {
    e.preventDefault();
    openModal();
  });

  lpSettingsButton?.addEventListener('click', (e) => {
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

/**
 * Initialize custom dropdowns (like the language selector with flags)
 */
function initCustomDropdowns() {
  const dropdowns = document.querySelectorAll('.custom-dropdown');
  
  dropdowns.forEach(dropdown => {
    const selected = dropdown.querySelector('.dropdown-selected');
    const options = dropdown.querySelector('.dropdown-options');
    const hiddenInput = dropdown.nextElementSibling; // Assuming hidden input follows dropdown

    if (!selected || !options) return;

    selected.addEventListener('click', (e) => {
      e.stopPropagation();
      options.classList.toggle('show');
    });

    options.querySelectorAll('.dropdown-option').forEach(option => {
      option.addEventListener('click', () => {
        const value = option.getAttribute('data-value');
        const flag = option.getAttribute('data-flag');
        const text = option.querySelector('span').textContent;

        // Update selected view
        selected.innerHTML = `
          <img src="https://flagcdn.com/w40/${flag}.png" class="flag-icon" alt="${flag}">
          <span>${text}</span>
        `;

        // Update hidden input
        if (hiddenInput && hiddenInput.id === 'languageSelect') {
          hiddenInput.value = value;
        }

        options.classList.remove('show');
      });
    });
  });

  // Close dropdowns when clicking outside
  document.addEventListener('click', () => {
    document.querySelectorAll('.dropdown-options').forEach(opt => opt.classList.remove('show'));
  });
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

  // Load current language
  const languageSelect = document.getElementById('languageSelect');
  const languageDropdown = document.getElementById('languageDropdown');
  
  if (languageSelect && languageDropdown) {
    const currentLang = languageSelect.value || document.documentElement.lang || 'en-US';
    
    // Find the option in the custom dropdown
    const options = languageDropdown.querySelectorAll('.dropdown-option');
    const currentOption = Array.from(options).find(opt => opt.getAttribute('data-value') === currentLang);
    
    if (currentOption) {
      const flag = currentOption.getAttribute('data-flag');
      const text = currentOption.querySelector('span').textContent;
      const selected = languageDropdown.querySelector('.dropdown-selected');
      
      selected.innerHTML = `
        <img src="https://flagcdn.com/w40/${flag}.png" class="flag-icon" alt="${flag}">
        <span>${text}</span>
      `;
      
      languageSelect.value = currentLang;
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
    const selectedTheme = document.getElementById('themeSelect')?.value || 'dark';
    const selectedVisualizer = document.getElementById('visualizerSelect')?.value || 'wave';
    const selectedLanguage = document.getElementById('languageSelect')?.value;
    
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
      params.append('returnUrl', window.location.pathname);
      
      const response = await fetch('/Language/SetLanguage', {
        method: 'POST',
        body: params,
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      });
      
      if (response.ok || response.status === 302 || response.status === 301) {
        localStorage.setItem('voiceAgent_language', selectedLanguage);
        window.location.reload();
        return;
      } else {
        showToast(window.APP_RESOURCES?.LanguageChangeError || 'Error changing language', 'error');
      }
    }
    
    showToast(window.APP_RESOURCES?.SettingsSaved || 'Settings saved', 'success');
    
    // Notify voice assistant that visualizer changed (via localStorage)
    window.dispatchEvent(new CustomEvent('settingsChanged', { detail: { visualizer: selectedVisualizer } }));

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
