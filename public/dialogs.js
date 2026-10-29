// Finestre di dialogo dell'app (al posto di alert / confirm / prompt del browser).
// Restituiscono una Promise: appConfirm → true/false, appPrompt → testo o null, appAlert → undefined.
(function () {
    const STYLE_ID = 'app-dialog-style';

    function injectStyle() {
        if (document.getElementById(STYLE_ID)) return;
        const style = document.createElement('style');
        style.id = STYLE_ID;
        style.textContent = `
            .app-dialog-overlay { position: fixed; inset: 0; z-index: 300000; display: flex; align-items: center; justify-content: center;
                padding: 16px; background: rgba(0,0,0,0.45); backdrop-filter: blur(6px); -webkit-backdrop-filter: blur(6px);
                animation: appDialogFade .15s ease-out; }
            .app-dialog { width: 100%; max-width: 420px; background: var(--bg-secondary, #fff); color: var(--text-primary, #121212);
                border: 1px solid var(--border-color, rgba(0,0,0,0.12)); border-radius: 16px; padding: 22px;
                box-shadow: 0 30px 70px -25px rgba(0,0,0,0.45); font-family: var(--font-sans, 'Inter', sans-serif);
                animation: appDialogUp .2s cubic-bezier(.2,.7,.2,1); }
            .app-dialog-title { font-weight: 700; font-size: 1rem; margin-bottom: 8px; }
            .app-dialog-message { font-size: 0.92rem; line-height: 1.5; color: var(--text-secondary, #4a4a4a); white-space: pre-line; }
            .app-dialog-input { width: 100%; margin-top: 14px; padding: 10px 12px; border-radius: 10px; font-size: 0.92rem;
                border: 1px solid var(--border-color, rgba(0,0,0,0.15)); background: var(--bg-primary, #f7f5f0); color: var(--text-primary, #121212); }
            .app-dialog-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 20px; flex-wrap: wrap; }
            .app-dialog-btn { border: 1px solid var(--border-color, rgba(0,0,0,0.15)); background: transparent; color: var(--text-primary, #121212);
                padding: 9px 16px; border-radius: 10px; font-weight: 600; font-size: 0.88rem; cursor: pointer; font-family: inherit; }
            .app-dialog-btn.primary { background: var(--text-primary, #121212); color: var(--bg-primary, #fff); border-color: var(--text-primary, #121212); }
            .app-dialog-btn.danger { background: #ef4444; color: #fff; border-color: #ef4444; }
            @keyframes appDialogFade { from { opacity: 0; } }
            @keyframes appDialogUp { from { opacity: 0; transform: translateY(12px); } }
        `;
        document.head.appendChild(style);
    }

    function openDialog({ title, message, input, defaultValue, okLabel, cancelLabel, danger }) {
        injectStyle();
        return new Promise((resolve) => {
            const overlay = document.createElement('div');
            overlay.className = 'app-dialog-overlay';
            const box = document.createElement('div');
            box.className = 'app-dialog';
            box.setAttribute('role', 'dialog');
            box.setAttribute('aria-modal', 'true');

            if (title) {
                const t = document.createElement('div');
                t.className = 'app-dialog-title';
                t.textContent = title;
                box.appendChild(t);
            }
            const m = document.createElement('div');
            m.className = 'app-dialog-message';
            m.textContent = message || '';
            box.appendChild(m);

            let field = null;
            if (input) {
                field = document.createElement('input');
                field.type = 'text';
                field.className = 'app-dialog-input';
                field.value = defaultValue || '';
                box.appendChild(field);
            }

            const actions = document.createElement('div');
            actions.className = 'app-dialog-actions';
            const close = (value) => {
                document.removeEventListener('keydown', onKey, true);
                overlay.remove();
                resolve(value);
            };
            const cancelValue = input ? null : false;

            if (cancelLabel) {
                const cancelBtn = document.createElement('button');
                cancelBtn.type = 'button';
                cancelBtn.className = 'app-dialog-btn';
                cancelBtn.textContent = cancelLabel;
                cancelBtn.onclick = () => close(cancelValue);
                actions.appendChild(cancelBtn);
            }
            const okBtn = document.createElement('button');
            okBtn.type = 'button';
            okBtn.className = 'app-dialog-btn ' + (danger ? 'danger' : 'primary');
            okBtn.textContent = okLabel || 'OK';
            okBtn.onclick = () => close(input ? field.value : (cancelLabel ? true : undefined));
            actions.appendChild(okBtn);
            box.appendChild(actions);

            const onKey = (e) => {
                if (e.key === 'Escape') { e.stopPropagation(); close(cancelLabel ? cancelValue : undefined); }
                if (e.key === 'Enter' && (input ? document.activeElement === field : true)) { e.preventDefault(); okBtn.click(); }
            };
            document.addEventListener('keydown', onKey, true);
            overlay.addEventListener('mousedown', (e) => { if (e.target === overlay && cancelLabel) close(cancelValue); });

            overlay.appendChild(box);
            document.body.appendChild(overlay);
            setTimeout(() => (field || okBtn).focus(), 30);
        });
    }

    window.appAlert = (message, title) => openDialog({ title, message, okLabel: 'OK' });
    window.appConfirm = (message, options = {}) => openDialog({
        title: options.title,
        message,
        okLabel: options.okLabel || (options.danger ? 'Elimina' : 'Conferma'),
        cancelLabel: options.cancelLabel || 'Annulla',
        danger: !!options.danger
    });
    window.appPrompt = (message, defaultValue = '', options = {}) => openDialog({
        title: options.title,
        message,
        input: true,
        defaultValue,
        okLabel: options.okLabel || 'Salva',
        cancelLabel: 'Annulla'
    });
})();
