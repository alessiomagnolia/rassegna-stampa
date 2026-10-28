// Tema "Inchiostro": solo effetti visivi. Non aggiunge, toglie o sposta tasti,
// non intercetta click e non modifica la logica della piattaforma.
(function () {
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    // Sfondo: sostituisce le due macchie statiche che ui.js mette in .bg-animation
    function applyInk() {
        const bg = document.querySelector('.bg-animation');
        if (!bg) return;
        bg.innerHTML =
            '<div class="ink-blob ink-1"></div><div class="ink-blob ink-2"></div><div class="ink-blob ink-3"></div>' +
            '<div class="ink-blob ink-4"></div><div class="ink-blob ink-5"></div><div class="ink-blob ink-follow"></div>';
        const follow = bg.querySelector('.ink-follow');
        window.addEventListener('mousemove', e => {
            follow.style.transform = `translate(${e.clientX - 140}px, ${e.clientY - 140}px)`;
        }, { passive: true });
    }

    // Menu laterale: indice per la comparsa a cascata
    function indexSidebar() {
        document.querySelectorAll('.sidebar-nav > *').forEach((el, i) => el.style.setProperty('--ink-i', i));
        document.documentElement.classList.add('ink-ready');
    }

    // Alone che segue il mouse (card della Home e box di accesso)
    function trackPointer(selector) {
        document.addEventListener('mousemove', e => {
            const el = e.target.closest && e.target.closest(selector);
            if (!el) return;
            const r = el.getBoundingClientRect();
            el.style.setProperty('--ink-mx', (e.clientX - r.left) + 'px');
            el.style.setProperty('--ink-my', (e.clientY - r.top) + 'px');
        }, { passive: true });
    }

    // Box di accesso: leggera inclinazione 3D
    function tiltLogin() {
        if (reduceMotion) return;
        document.querySelectorAll('.hero-auth-col .auth-container').forEach(box => {
            box.addEventListener('mousemove', e => {
                const r = box.getBoundingClientRect();
                const x = (e.clientX - r.left) / r.width - 0.5, y = (e.clientY - r.top) / r.height - 0.5;
                box.style.transform = `rotateX(${y * -4}deg) rotateY(${x * 4}deg)`;
            });
            box.addEventListener('mouseleave', () => { box.style.transform = ''; });
        });
    }

    // Lo script è in fondo al body: il menu esiste già, così la cascata parte senza sfarfallio
    indexSidebar();

    function init() {
        applyInk();
        trackPointer('.home-service-card');
        trackPointer('.auth-container');
        tiltLogin();
    }
    // ui.js riempie .bg-animation su DOMContentLoaded: interveniamo subito dopo
    if (document.readyState === 'complete') init();
    else window.addEventListener('load', init);
})();
