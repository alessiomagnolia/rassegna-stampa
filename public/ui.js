// ==========================================
// THEME MANAGEMENT & SHARED UI UTILITIES
// ==========================================

// Central function to apply theme across document, storage, and UI buttons
window.applyTheme = function(theme, notify = false) {
    const validTheme = (theme === 'dark') ? 'dark' : 'light';
    const isDark = (validTheme === 'dark');

    // 1. Set data-theme on both <html> and <body>
    document.documentElement.setAttribute('data-theme', validTheme);
    if (document.body) {
        document.body.setAttribute('data-theme', validTheme);
    }

    // 2. Persist to localStorage
    try {
        localStorage.setItem('rs_theme', validTheme);
    } catch(e) {
        console.warn('Could not save theme to localStorage', e);
    }

    // 3. Update top navbar theme toggle button (#themeToggle)
    const themeToggle = document.getElementById('themeToggle');
    if (themeToggle) {
        themeToggle.innerHTML = isDark
            ? '<i data-feather="sun" style="width:15px;height:15px;vertical-align:middle;"></i>'
            : '<i data-feather="moon" style="width:15px;height:15px;vertical-align:middle;"></i>';
        themeToggle.title = isDark ? 'Passa al Tema Chiaro' : 'Passa al Tema Scuro';
        themeToggle.setAttribute('aria-label', themeToggle.title);
    }

    // 4. Update settings theme toggle button (#themeToggleSettings)
    const themeToggleSettings = document.getElementById('themeToggleSettings');
    if (themeToggleSettings) {
        themeToggleSettings.innerHTML = isDark
            ? '<i data-feather="sun" style="width:14px;height:14px;vertical-align:middle;margin-right:6px;"></i> Passa a Tema Chiaro'
            : '<i data-feather="moon" style="width:14px;height:14px;vertical-align:middle;margin-right:6px;"></i> Passa a Tema Scuro';
        themeToggleSettings.title = isDark ? 'Clicca per attivare il tema chiaro' : 'Clicca per attivare il tema scuro';
    }

    // 5. Update settings theme label (#themeStatusLabel) if present
    const statusLabel = document.getElementById('themeStatusLabel');
    if (statusLabel) {
        statusLabel.textContent = isDark
            ? 'Attualmente attivo: Tema Scuro'
            : 'Attualmente attivo: Tema Chiaro';
    }

    // 6. Refresh Feather icons
    if (typeof feather !== 'undefined' && typeof feather.replace === 'function') {
        feather.replace();
    }

    // 7. Optional user toast feedback
    if (notify && typeof showToast === 'function') {
        showToast(`Tema impostato: ${isDark ? 'Scuro' : 'Chiaro'}`, 'info');
    }

    return validTheme;
};

// Toggle between light and dark
window.toggleTheme = function(notify = true) {
    const currentTheme = document.documentElement.getAttribute('data-theme')
        || (document.body && document.body.getAttribute('data-theme'))
        || localStorage.getItem('rs_theme')
        || 'light';
    const nextTheme = currentTheme === 'dark' ? 'light' : 'dark';
    return window.applyTheme(nextTheme, notify);
};

// Immediate application to avoid flicker on script load
(function initThemeImmediate() {
    try {
        const savedTheme = localStorage.getItem('rs_theme') || 'light';
        document.documentElement.setAttribute('data-theme', savedTheme);
        if (document.body) {
            document.body.setAttribute('data-theme', savedTheme);
        }
    } catch(e) {}
})();

// DOM Ready initialization and event binding
document.addEventListener('DOMContentLoaded', () => {
    const savedTheme = localStorage.getItem('rs_theme') || 'light';
    window.applyTheme(savedTheme, false);

    // Navbar toggle button
    const themeToggle = document.getElementById('themeToggle');
    if (themeToggle && !themeToggle.dataset.themeBound) {
        themeToggle.dataset.themeBound = 'true';
        themeToggle.addEventListener('click', (e) => {
            e.preventDefault();
            window.toggleTheme(true);
        });
    }

    // Settings toggle button
    const themeToggleSettings = document.getElementById('themeToggleSettings');
    if (themeToggleSettings && !themeToggleSettings.dataset.themeBound) {
        themeToggleSettings.dataset.themeBound = 'true';
        themeToggleSettings.addEventListener('click', (e) => {
            e.preventDefault();
            window.toggleTheme(true);
        });
    }

    // Inject Soft Blobs for Background
    const bgContainer = document.querySelector('.bg-animation');
    if (bgContainer) {
        bgContainer.innerHTML = `
            <div class="blob blob-1"></div>
            <div class="blob blob-2"></div>
        `;
    }
});
