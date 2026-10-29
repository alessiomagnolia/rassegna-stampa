// Controllo mobile: elenca i problemi di impaginazione della pagina visibile a larghezza smartphone.
// Uso (in pagina, servita da serve.ps1): window.mobileAudit() → { overflow, overlaps, smallTargets, tinyText }
(function () {
    const isVisible = (el) => {
        const r = el.getBoundingClientRect();
        if (r.width < 1 || r.height < 1) return false;
        const cs = getComputedStyle(el);
        if (cs.visibility === 'hidden' || cs.display === 'none' || parseFloat(cs.opacity) === 0) return false;
        // nascosto dentro un contenitore chiuso (sidebar off-canvas, modali chiusi)
        for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
            const ps = getComputedStyle(p);
            if (ps.display === 'none' || ps.visibility === 'hidden') return false;
        }
        return true;
    };
    const label = (el) => {
        const t = (el.innerText || el.value || el.placeholder || el.getAttribute('aria-label') || '').trim().replace(/\s+/g, ' ').slice(0, 35);
        return el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + (typeof el.className === 'string' && el.className ? '.' + el.className.trim().split(/\s+/)[0] : '') + (t ? ' "' + t + '"' : '');
    };
    const inDrawer = (el) => !!el.closest('.sidebar:not(.open), .modal-overlay.hidden, .hidden, .app-dialog-overlay, .bg-animation');

    window.mobileAudit = function () {
        const vw = document.documentElement.clientWidth;
        const out = { width: vw, pageScrollWidth: document.documentElement.scrollWidth, overflow: [], overlaps: [], smallTargets: [], tinyText: [] };

        const all = [...document.body.querySelectorAll('*')].filter(el => !['SCRIPT', 'STYLE', 'svg', 'path'].includes(el.tagName) && !el.closest('svg') && !inDrawer(el) && isVisible(el));

        // 1. Elementi che escono dallo schermo a destra (o a sinistra)
        all.forEach(el => {
            const r = el.getBoundingClientRect();
            if (r.right > vw + 2 || r.left < -2) {
                // segnala solo il più esterno che sborda
                const parent = el.parentElement;
                const pr = parent ? parent.getBoundingClientRect() : null;
                if (!pr || (pr.right <= vw + 2 && pr.left >= -2)) out.overflow.push(`${label(el)} [${Math.round(r.left)}→${Math.round(r.right)}]`);
            }
        });

        // 2. Elementi interattivi sovrapposti
        const interactive = all.filter(el => el.matches('button, a[href], input:not([type=hidden]), select, textarea, [onclick], [role=button]'));
        for (let i = 0; i < interactive.length; i++) {
            const a = interactive[i], ra = a.getBoundingClientRect();
            for (let j = i + 1; j < interactive.length; j++) {
                const b = interactive[j];
                if (a.contains(b) || b.contains(a)) continue;
                const rb = b.getBoundingClientRect();
                const ix = Math.min(ra.right, rb.right) - Math.max(ra.left, rb.left);
                const iy = Math.min(ra.bottom, rb.bottom) - Math.max(ra.top, rb.top);
                if (ix > 4 && iy > 4) out.overlaps.push(`${label(a)}  ↔  ${label(b)}`);
            }
        }

        // 3. Bersagli tattili troppo piccoli (< 36px)
        interactive.forEach(el => {
            const r = el.getBoundingClientRect();
            if (el.matches('input[type=checkbox], input[type=radio], input[type=range], input[type=color]')) return;
            if (r.height < 36 || r.width < 36) out.smallTargets.push(`${label(el)} ${Math.round(r.width)}x${Math.round(r.height)}`);
        });

        // 4. Testo troppo piccolo (< 12px)
        all.forEach(el => {
            if (![...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim().length > 1)) return;
            const fs = parseFloat(getComputedStyle(el).fontSize);
            if (fs < 12) out.tinyText.push(`${label(el)} ${fs}px`);
        });

        // 5. Colonne schiacciate: blocchi stretti (< 140px) con molto testo, tipico di griglie a 2-3 colonne non impilate
        out.squeezed = [];
        all.forEach(el => {
            const r = el.getBoundingClientRect();
            const ownText = [...el.childNodes].filter(n => n.nodeType === 3).map(n => n.textContent).join('').trim();
            if (r.width < 140 && ownText.length > 50) out.squeezed.push(`${label(el)} largo ${Math.round(r.width)}px`);
        });

        out.counts = { overflow: out.overflow.length, overlaps: out.overlaps.length, smallTargets: out.smallTargets.length, tinyText: out.tinyText.length, squeezed: out.squeezed.length };
        return out;
    };
})();
