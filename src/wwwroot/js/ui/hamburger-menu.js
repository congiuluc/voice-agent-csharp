/**
 * Centralized Hamburger Menu Logic
 * Handles opening/closing the side menu and related interactions.
 */

export function initHamburgerMenu() {
    const hamburgerBtn = document.getElementById('hamburgerButton');
    const leftPanel = document.getElementById('leftPanel');
    const closePanelBtn = document.getElementById('closeLeftPanel');
    const lpThemeToggle = document.getElementById('lp_themeToggle');
    
    // If essential elements are missing, do nothing
    if (!hamburgerBtn || !leftPanel) return;

    // Ensure overlay exists
    let overlay = document.querySelector('.left-panel-overlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.className = 'left-panel-overlay';
        document.body.appendChild(overlay);
    }

    function openMenu() {
        leftPanel.setAttribute('aria-hidden', 'false');
        document.body.classList.add('menu-open');
        overlay.classList.add('visible');
    }

    function closeMenu() {
        leftPanel.setAttribute('aria-hidden', 'true');
        document.body.classList.remove('menu-open');
        overlay.classList.remove('visible');
    }

    hamburgerBtn.addEventListener('click', (e) => {
        e.stopPropagation(); // Prevent immediate closing if bubbling
        openMenu();
    });

    if (closePanelBtn) {
        closePanelBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            closeMenu();
        });
    }

    // Close menu when clicking overlay
    overlay.addEventListener('click', () => {
        closeMenu();
    });

    // Close menu when clicking outside (fallback)
    document.addEventListener('click', (event) => {
        if (document.body.classList.contains('menu-open') && 
            !leftPanel.contains(event.target) && 
            !hamburgerBtn.contains(event.target)) {
            closeMenu();
        }
    });

    // Handle Escape key
    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && document.body.classList.contains('menu-open')) {
            closeMenu();
        }
    });

    // Theme toggle in menu proxy
    if (lpThemeToggle) {
        lpThemeToggle.addEventListener('click', () => {
            const themeBtn = document.getElementById('themeToggleButton');
            if (themeBtn) themeBtn.click();
            closeMenu();
        });
    }

    // Settings proxy
    const lpSettingsBtn = document.getElementById('lp_settingsButton');
    if (lpSettingsBtn) {
        lpSettingsBtn.addEventListener('click', () => {
            const settingsBtn = document.getElementById('settingsButton');
            if (settingsBtn) settingsBtn.click();
            closeMenu();
        });
    }

    // Dashboard proxy
    const lpDashboardToggle = document.getElementById('lp_dashboardToggle');
    if (lpDashboardToggle) {
        lpDashboardToggle.addEventListener('click', () => {
            const dashboardToggle = document.getElementById('dashboardToggle');
            if (dashboardToggle) dashboardToggle.click();
            closeMenu();
        });
    }

    // Chat proxy
    const lpChatToggle = document.getElementById('lp_chatToggle');
    if (lpChatToggle) {
        lpChatToggle.addEventListener('click', () => {
            const chatToggle = document.getElementById('chatToggle');
            if (chatToggle) chatToggle.click();
            closeMenu();
        });
    }

    // Trace proxy
    const lpTraceToggle = document.getElementById('lp_traceToggle');
    if (lpTraceToggle) {
        lpTraceToggle.addEventListener('click', () => {
            const traceToggle = document.getElementById('traceToggle');
            if (traceToggle) traceToggle.click();
            closeMenu();
        });
    }

    // Incoming Call Settings proxy
    const lpIncomingSettingsBtn = document.getElementById('lp_incomingCallSettingsButton');
    if (lpIncomingSettingsBtn) {
        lpIncomingSettingsBtn.addEventListener('click', () => {
            const incomingSettingsBtn = document.getElementById('incomingCallSettingsButton');
            if (incomingSettingsBtn) incomingSettingsBtn.click();
            closeMenu();
        });
    }
}
