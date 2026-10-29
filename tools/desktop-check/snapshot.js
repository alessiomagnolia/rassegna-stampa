// Controllo desktop: rileva posizione e dimensione di ogni elemento visibile della pagina
// e la salva sul server di controllo, poi passa alla pagina successiva dell'elenco.
// Viene iniettato solo da tools/desktop-check/serve.ps1 (mai in produzione).
(function () {
    const PAGES = [
        { name: 'login', url: '/index.html' },
        {
            name: 'dashboard', url: '/dashboard.html',
            sections: ['home', 'rassegna', 'ricerca-notizie', 'focus-reader', 'briefing', 'analisi-rischio', 'reports',
                'storico', 'archivio', 'media-crm', 'clienti', 'profilo', 'team', 'piani', 'impostazioni', 'contatti']
        },
        { name: 'comunicati', url: '/press.html' },
        { name: 'linkedin', url: '/linkedin.html' },
        { name: 'locandine', url: '/locandine.html' },
        { name: 'save-the-date', url: '/save-the-date.html' },
        { name: 'editor', url: '/editor.html' },
        { name: 'admin', url: '/admin.html' }
    ];

    const params = new URLSearchParams(location.search);
    if (!params.has('__check')) return;
    const index = parseInt(params.get('__check'), 10) || 0;
    const page = PAGES[index];
    const wait = (ms) => new Promise(r => setTimeout(r, ms));

    // Percorso stabile dell'elemento nel DOM (indipendente da testi e date)
    function domPath(el) {
        const parts = [];
        while (el && el.nodeType === 1 && el !== document.body) {
            let i = 1, sib = el;
            while ((sib = sib.previousElementSibling)) if (sib.tagName === el.tagName) i++;
            parts.unshift(el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + ':' + i);
            el = el.parentElement;
        }
        return parts.join('>');
    }

    function collect() {
        const out = {};
        document.body.querySelectorAll('*').forEach(el => {
            const tag = el.tagName;
            if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'LINK' || tag === 'TEMPLATE') return;
            if (el.closest('svg') && tag !== 'svg' && tag !== 'SVG') return; // icone: basta il riquadro esterno
            if (el.closest('.bg-animation, .toast-container, #toastContainer, .app-dialog-overlay')) return; // elementi decorativi o temporanei
            const r = el.getBoundingClientRect();
            if (r.width === 0 && r.height === 0) return;
            const cs = getComputedStyle(el);
            if (cs.visibility === 'hidden' || cs.display === 'none') return;
            const label = (el.id ? '#' + el.id : '') + (typeof el.className === 'string' && el.className ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.') : '');
            const text = (el.childNodes.length && el.childNodes[0].nodeType === 3 ? el.childNodes[0].textContent : (el.innerText || '')).trim().slice(0, 40);
            out[domPath(el)] = {
                r: [Math.round(r.left + scrollX), Math.round(r.top + scrollY), Math.round(r.width), Math.round(r.height)],
                d: tag.toLowerCase() + label + (text ? ' "' + text + '"' : '')
            };
        });
        return out;
    }

    async function run() {
        await wait(2500);
        const result = { page: page.name, width: innerWidth, sections: {} };

        if (page.sections && typeof window.showDashboardPage === 'function') {
            for (const section of page.sections) {
                window.showDashboardPage(section, false);
                await wait(900);
                scrollTo(0, 0);
                result.sections[section] = collect();
            }
        } else {
            result.sections.main = collect();
        }

        await fetch('/__check/save?page=' + encodeURIComponent(page.name), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(result)
        });

        const next = PAGES[index + 1];
        if (next) {
            location.href = next.url + '?__check=' + (index + 1);
        } else {
            document.title = 'CONTROLLO DESKTOP COMPLETATO';
            const done = document.createElement('div');
            done.id = '__checkDone';
            done.textContent = 'Controllo desktop completato: rilevate ' + PAGES.length + ' pagine.';
            done.style.cssText = 'position:fixed;top:10px;left:10px;z-index:999999;background:#121212;color:#fff;padding:10px 14px;border-radius:8px;font:600 14px sans-serif';
            document.body.appendChild(done);
        }
    }

    if (document.readyState === 'complete') run();
    else window.addEventListener('load', run);
})();
