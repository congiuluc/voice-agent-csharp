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
        });
    }
}
