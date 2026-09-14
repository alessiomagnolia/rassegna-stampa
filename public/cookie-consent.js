/**
 * Rassegna Stampa - Privacy & Cookie Consent Manager (Finestrella Modale GDPR)
 * Conforme al GDPR (Reg. UE 2016/679) e Linee Guida Garante Privacy
 */
(function() {
    const CONSENT_KEY = 'rs_cookie_consent';
    const CONSENT_DATE_KEY = 'rs_cookie_consent_date';
    const ANALYTICS_OPTIN_KEY = 'rs_cookie_analytics';

    window.openCookiePolicy = function() {
        initModal();
        const popup = document.getElementById('cookieConsentPopup');
        if (popup) popup.classList.add('hidden');

        const modal = document.getElementById('cookiePolicyModal');
        if (modal) modal.classList.remove('hidden');
    };

    window.openCookieSettings = function() {
        window.openCookiePolicy();
    };

    window.closeCookiePolicy = function() {
        const modal = document.getElementById('cookiePolicyModal');
        if (modal) modal.classList.add('hidden');
    };

    window.acceptAllCookies = function() {
        localStorage.setItem(CONSENT_KEY, 'all');
        localStorage.setItem(CONSENT_DATE_KEY, new Date().toISOString());
        localStorage.setItem(ANALYTICS_OPTIN_KEY, 'true');
        closeAllCookieWindows();
        if (typeof showToast === 'function') {
            showToast('Preferenze privacy salvate: Tutti i cookie accettati', 'success');
        }
    };

    window.acceptEssentialOnly = function() {
        localStorage.setItem(CONSENT_KEY, 'essential');
        localStorage.setItem(CONSENT_DATE_KEY, new Date().toISOString());
        localStorage.setItem(ANALYTICS_OPTIN_KEY, 'false');
        closeAllCookieWindows();
        if (typeof showToast === 'function') {
            showToast('Preferenze privacy salvate: Solo tecnici essenziali', 'info');
        }
    };

    window.saveCustomCookiePreferences = function() {
        const analyticsCheckbox = document.getElementById('cookieAnalyticsToggle');
        const allowsAnalytics = analyticsCheckbox ? analyticsCheckbox.checked : false;

        localStorage.setItem(CONSENT_KEY, allowsAnalytics ? 'all' : 'essential');
        localStorage.setItem(CONSENT_DATE_KEY, new Date().toISOString());
        localStorage.setItem(ANALYTICS_OPTIN_KEY, allowsAnalytics ? 'true' : 'false');
        closeAllCookieWindows();
        if (typeof showToast === 'function') {
            showToast('Preferenze privacy aggiornate con successo', 'success');
        }
    };

    window.resetCookieConsent = function() {
        localStorage.removeItem(CONSENT_KEY);
        localStorage.removeItem(CONSENT_DATE_KEY);
        localStorage.removeItem(ANALYTICS_OPTIN_KEY);
        window.closeCookiePolicy();
        renderPopup();
        if (typeof showToast === 'function') {
            showToast('Consenso revocato. Puoi impostare nuovamente le preferenze.', 'info');
        }
    };

    function closeAllCookieWindows() {
        const popup = document.getElementById('cookieConsentPopup');
        if (popup) {
            popup.style.transition = 'opacity 0.2s ease, transform 0.2s ease';
            popup.style.opacity = '0';
            setTimeout(() => popup.remove(), 220);
        }
        window.closeCookiePolicy();
    }

    function renderPopup() {
        if (document.getElementById('cookieConsentPopup')) return;

        const overlay = document.createElement('div');
        overlay.id = 'cookieConsentPopup';
        overlay.className = 'cookie-popup-overlay';
        overlay.style.cssText = 'position:fixed; top:0; left:0; width:100vw; height:100vh; background:rgba(0,0,0,0.72); backdrop-filter:blur(6px); -webkit-backdrop-filter:blur(6px); z-index:999999; display:flex; align-items:center; justify-content:center; padding:1.25rem;';

        overlay.innerHTML = `
            <div class="cookie-popup-card" style="background:var(--bg-secondary, #18181b); color:var(--text-primary, #ffffff); border:1px solid var(--border-color, rgba(255,255,255,0.12)); border-radius:16px; padding:2rem; max-width:500px; width:100%; box-shadow:0 24px 60px rgba(0,0,0,0.6); font-family:var(--font-sans, system-ui, sans-serif);">
                <div class="cookie-popup-header" style="margin-bottom:1rem;">
                    <div style="font-size:0.75rem; text-transform:uppercase; letter-spacing:1px; color:var(--accent-primary, #a78bfa); font-weight:700; margin-bottom:6px;">Gestione Privacy</div>
                    <h3 class="cookie-popup-title" style="margin:0; font-size:1.25rem; font-weight:700; color:var(--text-primary, #ffffff);">Informativa sulla Privacy e Cookie</h3>
                </div>
                <p class="cookie-popup-text" style="margin:0 0 1.5rem 0; font-size:0.9rem; line-height:1.55; color:var(--text-secondary, #b3b3b3);">
                    Utilizziamo strumenti e cookie tecnici strettamente necessari per consentire l'accesso sicuro (login), gestire le tue sessioni di lavoro e garantire il corretto funzionamento della piattaforma. <strong>Non utilizziamo cookie di profilazione per finalità pubblicitarie.</strong>
                </p>
                <div class="cookie-popup-actions" style="display:flex; flex-direction:column; gap:12px;">
                    <div class="cookie-popup-buttons-row" style="display:flex; gap:10px;">
                        <button type="button" class="btn btn-outline" onclick="acceptEssentialOnly()" style="flex:1; padding:11px 16px; font-size:0.9rem; font-weight:600; border-radius:8px; cursor:pointer; text-align:center;">Solo Necessari</button>
                        <button type="button" class="btn btn-primary" onclick="acceptAllCookies()" style="flex:1; padding:11px 16px; font-size:0.9rem; font-weight:600; border-radius:8px; cursor:pointer; text-align:center;">Accetta Tutti</button>
                    </div>
                    <button type="button" class="cookie-popup-customize-btn" onclick="openCookiePolicy()" style="background:transparent; border:none; color:var(--text-muted, #888888); font-size:0.82rem; text-decoration:underline; cursor:pointer; text-align:center; padding:4px;">
                        Personalizza preferenze o leggi l'informativa
                    </button>
                </div>
            </div>
        `;
        document.body.appendChild(overlay);
    }

    function initModal() {
        if (document.getElementById('cookiePolicyModal')) {
            const currentConsent = localStorage.getItem(CONSENT_KEY);
            const toggle = document.getElementById('cookieAnalyticsToggle');
            if (toggle) toggle.checked = (currentConsent === 'all');
            return;
        }

        const currentConsent = localStorage.getItem(CONSENT_KEY);
        const modal = document.createElement('div');
        modal.id = 'cookiePolicyModal';
        modal.className = 'modal-overlay hidden';
        modal.style.cssText = 'position:fixed; top:0; left:0; width:100vw; height:100vh; background:rgba(0,0,0,0.72); backdrop-filter:blur(6px); -webkit-backdrop-filter:blur(6px); z-index:9999999; display:flex; align-items:center; justify-content:center; padding:1rem;';

        modal.innerHTML = `
            <div class="modal-content glass-card" style="max-width: 660px; width: 94%; max-height: 88vh; padding: 2rem; display: flex; flex-direction: column; background:var(--bg-secondary, #18181b); border:1px solid var(--border-color, rgba(255,255,255,0.12)); border-radius:16px;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.25rem; border-bottom: 1px solid var(--border-color, rgba(255,255,255,0.1)); padding-bottom: 1rem;">
                    <div>
                        <h3 style="margin:0 0 4px 0; font-size:1.2rem; font-weight:700; color:var(--text-primary, #ffffff);">Informativa Privacy &amp; Cookie</h3>
                        <span style="font-size:0.75rem; color:var(--text-muted, #888888);">Conforme a GDPR (Reg. UE 2016/679) &amp; Direttiva ePrivacy</span>
                    </div>
                    <button type="button" class="btn-icon" onclick="closeCookiePolicy()" style="font-size:1.5rem; line-height:1; cursor:pointer; background:none; border:none; color:var(--text-primary, #ffffff);" aria-label="Chiudi">&times;</button>
                </div>

                <div class="cookie-modal-body" style="max-height:60vh; overflow-y:auto; padding-right:6px;">
                    <p style="font-size:0.88rem; line-height:1.5; color:var(--text-secondary, #b3b3b3); margin-bottom:1.25rem;">
                        La piattaforma <strong>Rassegna Stampa Generator</strong> protegge la tua privacy. Questa sezione ti permette di comprendere come vengono impiegati i dati di navigazione e gli archivi locali del browser.
                    </p>

                    <!-- Cookie Tecnici Essenziali -->
                    <div class="cookie-category-box">
                        <div class="cookie-category-header">
                            <div class="cookie-category-title">
                                <span>Strumenti e Cookie Tecnici Essenziali</span>
                            </div>
                            <span class="cookie-badge-always-active">Sempre Attivi</span>
                        </div>
                        <p style="font-size:0.82rem; color:var(--text-secondary, #b3b3b3); line-height:1.45; margin:0 0 0.75rem 0;">
                            Indispensabili per consentire l'accesso protetto all'account, la persistenza del tema grafico e la conservazione delle bozze delle rassegne durante il lavoro.
                        </p>
                        <div style="background:rgba(0,0,0,0.25); border-radius:6px; padding:0.65rem 0.85rem; font-size:0.78rem; font-family:monospace; color:var(--text-primary, #ffffff); line-height:1.6;">
                            <div>• <strong>rs_token</strong>: Token JWT di autenticazione crittografato</div>
                            <div>• <strong>rs_theme</strong>: Preferenza grafica dell'interfaccia (Chiaro/Scuro)</div>
                            <div>• <strong>rs_draft_articles</strong>: Bozze di lavoro delle notizie in rassegna</div>
                            <div>• <strong>rs_cookie_consent</strong>: Registro del consenso privacy espresso</div>
                        </div>
                    </div>

                    <!-- Cookie Analitici Anonimi -->
                    <div class="cookie-category-box">
                        <div class="cookie-category-header">
                            <div class="cookie-category-title">
                                <span>Metriche e Statistiche Tecniche (Anonime)</span>
                            </div>
                            <label style="display:flex; align-items:center; cursor:pointer; gap:8px;">
                                <input type="checkbox" id="cookieAnalyticsToggle" ${currentConsent === 'all' ? 'checked' : ''} style="width:18px; height:18px; accent-color:var(--accent-primary); cursor:pointer;">
                                <span style="font-size:0.8rem; font-weight:600; color:var(--text-primary, #ffffff);">Abilita</span>
                            </label>
                        </div>
                        <p style="font-size:0.82rem; color:var(--text-secondary, #b3b3b3); line-height:1.45; margin:0;">
                            Permettono di raccogliere dati anonimi e aggregati sulle prestazioni e la velocità dei server per garantire la stabilità della piattaforma. Nessun profilo personale viene creato.
                        </p>
                    </div>

                    <!-- Profilazione -->
                    <div class="cookie-category-box">
                        <div class="cookie-category-header">
                            <div class="cookie-category-title">
                                <span>Tracciamento Pubblicitario e Marketing</span>
                            </div>
                            <span class="cookie-badge-disabled">Non Utilizzati</span>
                        </div>
                        <p style="font-size:0.82rem; color:var(--text-secondary, #b3b3b3); line-height:1.45; margin:0;">
                            <strong>Assenti:</strong> Non installiamo cookie pubblicitari, pixel di tracciamento social (Facebook, TikTok) né cediamo dati a terze parti.
                        </p>
                    </div>

                    <!-- Diritti GDPR -->
                    <div style="border-top:1px solid var(--border-color, rgba(255,255,255,0.1)); padding-top:1rem; margin-top:1.25rem;">
                        <h5 style="margin:0 0 6px 0; font-size:0.88rem; color:var(--text-primary, #ffffff);">Diritti dell'Interessato (GDPR Artt. 15-22)</h5>
                        <p style="font-size:0.78rem; line-height:1.45; color:var(--text-muted, #888888); margin:0;">
                            Hai il diritto di accedere in qualsiasi momento ai tuoi dati personali, richiederne la cancellazione o revocare il consenso con il pulsante "Revoca Consenso" qui sotto.
                        </p>
                    </div>
                </div>

                <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px; margin-top:1.25rem; border-top:1px solid var(--border-color, rgba(255,255,255,0.1)); padding-top:1.25rem;">
                    <div>
                        <button type="button" class="btn btn-outline btn-sm" onclick="resetCookieConsent()" style="color:var(--danger, #ff5252); border-color:var(--danger-border, rgba(255,82,82,0.3)); font-size:0.8rem;" title="Azzera la scelta e mostra nuovamente la finestra">Revoca Consenso</button>
                    </div>
                    <div style="display:flex; gap:8px; flex-wrap:wrap;">
                        <button type="button" class="btn btn-outline btn-sm" onclick="acceptEssentialOnly()" style="font-size:0.85rem;">Solo Necessari</button>
                        <button type="button" class="btn btn-primary btn-sm" onclick="saveCustomCookiePreferences()" style="font-size:0.85rem; font-weight:600;">Salva Preferenze</button>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(modal);

        modal.addEventListener('click', (e) => {
            if (e.target === modal) window.closeCookiePolicy();
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            initModal();
            if (!localStorage.getItem(CONSENT_KEY)) {
                renderPopup();
            }
        });
    } else {
        initModal();
        if (!localStorage.getItem(CONSENT_KEY)) {
            renderPopup();
        }
    }
})();
