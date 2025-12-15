// Lightweight theme toggle for pages that do not load the full VoiceAgent app
import { getSavedTheme, applyThemeMode, toggleTheme, listenForExternalChanges } from './theme-sync.js';

// Lightweight theme toggle for pages that do not load the full VoiceAgent app
(function () {
  function animateButton() {
    const btn = document.getElementById('themeToggleButton');
    if (!btn) return;
    btn.classList.add('toggle-anim');
    window.setTimeout(() => btn.classList.remove('toggle-anim'), 350);
  }

  function init() {
    // Apply saved theme
    applyThemeMode(getSavedTheme());

    const btn = document.getElementById('themeToggleButton');
    if (!btn) return;
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      toggleTheme();
      animateButton();
    });

    // Listen for changes from other tabs
    listenForExternalChanges();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
