document.addEventListener('DOMContentLoaded', () => {
    // Theme Management
    const themeToggle = document.getElementById('themeToggle');
    
    // Check saved theme
    const savedTheme = localStorage.getItem('rs_theme') || 'light';
    if (savedTheme === 'dark') {
        document.documentElement.setAttribute('data-theme', 'dark');
        if (themeToggle) themeToggle.innerHTML = '<i data-feather="sun"></i>';
    } else {
        document.documentElement.setAttribute('data-theme', 'light');
        if (themeToggle) themeToggle.innerHTML = '<i data-feather="moon"></i>';
    }

    if (themeToggle) {
        themeToggle.addEventListener('click', () => {
            const currentTheme = document.documentElement.getAttribute('data-theme');
            if (currentTheme === 'dark') {
                document.documentElement.setAttribute('data-theme', 'light');
                localStorage.setItem('rs_theme', 'light');
                themeToggle.innerHTML = '<i data-feather="moon"></i>';
            } else {
                document.documentElement.setAttribute('data-theme', 'dark');
                localStorage.setItem('rs_theme', 'dark');
                themeToggle.innerHTML = '<i data-feather="sun"></i>';
            }
            if (typeof feather !== 'undefined') feather.replace();
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
