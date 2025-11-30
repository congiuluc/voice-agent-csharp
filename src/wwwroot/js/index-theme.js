// Lightweight theme toggle for pages that do not load the full VoiceAgent app
(function () {
  const THEME_KEY = 'voiceAgentTheme';

  function loadTheme() {
    const saved = localStorage.getItem(THEME_KEY);
    if (saved) return saved === 'dark' ? 'dark' : 'light';
    return 'dark';
  }

  function applyTheme(mode) {
    if (mode === 'dark') {
      document.body.classList.remove('light-mode');
    } else {
      document.body.classList.add('light-mode');
    }

    const btn = document.getElementById('themeToggleButton');
    if (btn) {
      btn.setAttribute('aria-pressed', String(mode === 'dark'));
      btn.setAttribute('aria-label', mode === 'dark'
        ? 'Tema scuro attivo. Premi per cambiare.'
        : 'Tema chiaro attivo. Premi per cambiare.');
    }
  }

  function toggleTheme() {
    const current = loadTheme();
    const next = current === 'dark' ? 'light' : 'dark';
    localStorage.setItem(THEME_KEY, next);
    applyTheme(next);
  }

  // small visual nudge on the button for better feedback
  function animateButton() {
    const btn = document.getElementById('themeToggleButton');
    if (!btn) return;
    btn.classList.add('toggle-anim');
    window.setTimeout(() => btn.classList.remove('toggle-anim'), 350);
  }

  function init() {
    // Apply saved theme
    applyTheme(loadTheme());

    const btn = document.getElementById('themeToggleButton');
    if (!btn) return;
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      toggleTheme();
      animateButton();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    // DOM already loaded
    init();
  }
})();
