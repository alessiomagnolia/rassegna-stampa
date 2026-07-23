document.addEventListener('DOMContentLoaded', () => {
    // Theme Management
    const themeToggle = document.getElementById('themeToggle');
    
    // Check saved theme
    const savedTheme = localStorage.getItem('rs_theme') || 'light';
    if (savedTheme === 'dark') {
        document.documentElement.setAttribute('data-theme', 'dark');
        if (themeToggle) themeToggle.textContent = '☀️';
    } else {
        document.documentElement.setAttribute('data-theme', 'light');
        if (themeToggle) themeToggle.textContent = '🌙';
    }

    if (themeToggle) {
        themeToggle.addEventListener('click', () => {
            const currentTheme = document.documentElement.getAttribute('data-theme');
            if (currentTheme === 'dark') {
                document.documentElement.setAttribute('data-theme', 'light');
                localStorage.setItem('rs_theme', 'light');
                themeToggle.textContent = '🌙';
            } else {
                document.documentElement.setAttribute('data-theme', 'dark');
                localStorage.setItem('rs_theme', 'dark');
                themeToggle.textContent = '☀️';
            }
        });
    }

    // Inject the SVG asterisk into the background
    const bgContainer = document.querySelector('.bg-animation');
    if (bgContainer) {
        bgContainer.innerHTML = `
            <svg class="asterisk-bg" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
                <path d="M 50 0 L 50 100 M 0 50 L 100 50 M 15 15 L 85 85 M 15 85 L 85 15" stroke="var(--accent-primary)" stroke-width="8" stroke-linecap="round" fill="none" opacity="0.1" />
            </svg>
        `;
        
        // Scroll animation logic
        const asterisk = document.querySelector('.asterisk-bg');
        if (asterisk) {
            window.addEventListener('scroll', () => {
                const scrollPos = window.scrollY;
                // Rotate 1 degree per pixel scrolled
                asterisk.style.transform = \`translate(-50%, -50%) rotate(\${scrollPos * 0.2}deg)\`;
            });
        }
    }
});
