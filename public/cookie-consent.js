/**
 * Rassegna Stampa - Privacy & Cookie Consent Manager
 * Conforme a GDPR (Regolamento UE 2016/679) e Linee Guida Cookie Garante Privacy
 */
(function() {
    const CONSENT_KEY = 'rs_cookie_consent';
    const CONSENT_DATE_KEY = 'rs_cookie_consent_date';
    const ANALYTICS_OPTIN_KEY = 'rs_cookie_analytics';

    // Rende le funzioni accessibili globalmente
    window.openCookiePolicy = function() {
        initModal();
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
        removeBanner();
        window.closeCookiePolicy();
        if (typeof showToast === 'function') {
            showToast('Preferenze privacy salvate: Tutti i cookie accettati', 'success');
        }
    };

    window.acceptEssentialOnly = function() {
        localStorage.setItem(CONSENT_KEY, 'essential');
        localStorage.setItem(CONSENT_DATE_KEY, new Date().toISOString());
        localStorage.setItem(ANALYTICS_OPTIN_KEY, 'false');
        removeBanner();
        window.closeCookiePolicy();
        if (typeof showToast === 'function') {
            showToast('Preferenze privacy salvate: Solo cookie tecnici essenziali', 'info');
        }
    };

    window.saveCustomCookiePreferences = function() {
        const analyticsCheckbox = document.getElementById('cookieAnalyticsToggle');
        const allowsAnalytics = analyticsCheckbox ? analyticsCheckbox.checked : false;

        localStorage.setItem(CONSENT_KEY, allowsAnalytics ? 'all' : 'essential');
        localStorage.setItem(CONSENT_DATE_KEY, new Date().toISOString());
        localStorage.setItem(ANALYTICS_OPTIN_KEY, allowsAnalytics ? 'true' : 'false');
        removeBanner();
        window.closeCookiePolicy();
        if (typeof showToast === 'function') {
            showToast('Preferenze cookie aggiornate con successo', 'success');
        }
    };

    window.resetCookieConsent = function() {
        localStorage.removeItem(CONSENT_KEY);
        localStorage.removeItem(CONSENT_DATE_KEY);
        localStorage.removeItem(ANALYTICS_OPTIN_KEY);
        window.closeCookiePolicy();
        renderBanner();
        if (typeof showToast === 'function') {
            showToast('Consenso cookie revocato. Puoi impostare nuovamente le preferenze.', 'info');
        }
    };

    function removeBanner() {
        const banner = document.getElementById('cookieConsentBanner');
        if (banner) {
            banner.style.transition = 'opacity 0.25s, transform 0.25s';
            banner.style.opacity = '0';
            banner.style.transform = 'translateY(20px)';
            setTimeout(() => banner.remove(), 260);
        }
    }

    function renderBanner() {
        if (document.getElementById('cookieConsentBanner')) return;

        const banner = document.createElement('div');
        banner.id = 'cookieConsentBanner';
        banner.className = 'cookie-banner-wrapper';
        banner.innerHTML = `
            <div class="cookie-banner-card">
                <div class="cookie-banner-content">
                    <div class="cookie-banner-icon">🍪</div>
                    <div class="cookie-banner-text">
                        <h4>Informativa Privacy &amp; Cookie</h4>
                        <p>
                            Utilizziamo <strong>cookie e archivi tecnici</strong> strettamente necessari per garantire l'accesso sicuro (login), le tue sessioni e il funzionamento della piattaforma. Non usiamo cookie di profilazione commerciale per finalità pubblicitarie.
                        </p>
                    </div>
                </div>
                <div class="cookie-banner-actions">
                    <button type="button" class="btn btn-outline btn-sm" onclick="openCookiePolicy()" style="border-radius:6px; font-size:0.85rem; padding:8px 14px;">Personalizza</button>
                    <button type="button" class="btn btn-outline btn-sm" onclick="acceptEssentialOnly()" style="border-radius:6px; font-size:0.85rem; padding:8px 14px;">Solo Necessari</button>
                    <button type="button" class="btn btn-primary btn-sm" onclick="acceptAllCookies()" style="border-radius:6px; font-size:0.85rem; padding:8px 16px; font-weight:600;">Accetta Tutti</button>
                </div>
            </div>
        `;
        document.body.appendChild(banner);
    }

    function initModal() {
        if (document.getElementById('cookiePolicyModal')) {
            // Aggiorna lo stato dello switch se già renderizzato
            const currentConsent = localStorage.getItem(CONSENT_KEY);
            const toggle = document.getElementById('cookieAnalyticsToggle');
            if (toggle) toggle.checked = (currentConsent === 'all');
            return;
        }

        const currentConsent = localStorage.getItem(CONSENT_KEY);
        const modal = document.createElement('div');
        modal.id = 'cookiePolicyModal';
        modal.className = 'modal-overlay hidden';
        modal.innerHTML = `
            <div class="modal-content glass-card" style="max-width: 680px; width: 92%; max-height: 88vh; padding: 2rem; display: flex; flex-direction: column;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.25rem; border-bottom: 1px solid var(--border-color); padding-bottom: 1rem;">
                    <div style="display:flex; align-items:center; gap:10px;">
                        <span style="font-size:1.5rem;">🛡️</span>
                        <div>
                            <h3 style="margin:0; font-size:1.25rem;">Informativa Privacy &amp; Gestione Cookie</h3>
                            <span style="font-size:0.75rem; color:var(--text-muted);">Conforme a GDPR (Reg. UE 2016/679) &amp; Linee Guida Garante Privacy</span>
                        </div>
                    </div>
                    <button type="button" class="btn-icon" onclick="closeCookiePolicy()" style="font-size:1.5rem; line-height:1; cursor:pointer;" aria-label="Chiudi">&times;</button>
                </div>

                <div class="cookie-modal-body">
                    <p style="font-size:0.88rem; line-height:1.5; color:var(--text-secondary); margin-bottom:1.25rem;">
                        La piattaforma <strong>Rassegna Stampa Generator</strong> tutela la riservatezza e la sicurezza dei tuoi dati. Questa pagina ti consente di comprendere quali strumenti di archiviazione (cookie e local storage) vengono impiegati e di gestire liberamente le tue preferenze.
                    </p>

                    <!-- Sezione 1: Cookie Tecnici Essenziali -->
                    <div class="cookie-category-box">
                        <div class="cookie-category-header">
                            <div class="cookie-category-title">
                                <span>🔒 Cookie e Archivi Tecnici Essenziali</span>
                            </div>
                            <span class="cookie-badge-always-active">Sempre Attivi</span>
                        </div>
                        <p style="font-size:0.82rem; color:var(--text-secondary); line-height:1.45; margin:0 0 0.75rem 0;">
                            Questi elementi sono indispensabili per navigare sul sito e usufruire dei servizi. Permettono il login, la sicurezza dell'account, il mantenimento delle bozze di rassegna e la persistenza del tema. Non possono essere disattivati.
                        </p>
                        <div style="background:rgba(0,0,0,0.15); border-radius:6px; padding:0.65rem 0.85rem; font-size:0.78rem; font-family:monospace; color:var(--text-primary); line-height:1.6;">
                            <div>• <strong>rs_token</strong>: Token JWT cifrato per l'autenticazione protetta (Archivio Locale)</div>
                            <div>• <strong>rs_theme</strong>: Preferenza grafica dell'interfaccia (Chiaro/Scuro) (Archivio Locale)</div>
                            <div>• <strong>rs_draft_articles</strong>: Bozze di lavoro per articoli e rassegne in corso (Archivio Sessione)</div>
                            <div>• <strong>rs_cookie_consent</strong>: Registro della scelta del consenso privacy espresso (Archivio Locale)</div>
                        </div>
                    </div>

                    <!-- Sezione 2: Cookie Statistici / Analitici -->
                    <div class="cookie-category-box">
                        <div class="cookie-category-header">
                            <div class="cookie-category-title">
                                <span>📊 Cookie Statistici e Prestazionali (Anonimi)</span>
                            </div>
                            <label style="display:flex; align-items:center; cursor:pointer; gap:8px;">
                                <input type="checkbox" id="cookieAnalyticsToggle" ${currentConsent === 'all' ? 'checked' : ''} style="width:18px; height:18px; accent-color:var(--accent-primary); cursor:pointer;">
                                <span style="font-size:0.8rem; font-weight:600; color:var(--text-primary);">Abilita</span>
                            </label>
                        </div>
                        <p style="font-size:0.82rem; color:var(--text-secondary); line-height:1.45; margin:0;">
                            Servono a raccogliere metriche aggregate e anonime sulle prestazioni dei server e sui tempi di caricamento delle pagine per migliorare la stabilità e la velocità del servizio. Nessun dato identificativo o profilo personale viene salvato.
                        </p>
                    </div>

                    <!-- Sezione 3: Cookie di Profilazione & Terze Parti -->
                    <div class="cookie-category-box">
                        <div class="cookie-category-header">
                            <div class="cookie-category-title">
                                <span>🚫 Cookie di Profilazione Pubblicitaria &amp; Marketing</span>
                            </div>
                            <span class="cookie-badge-disabled">Non Utilizzati</span>
                        </div>
                        <p style="font-size:0.82rem; color:var(--text-secondary); line-height:1.45; margin:0;">
                            <strong>Assenti:</strong> Non utilizziamo cookie di tracciamento pubblicitario, pixel di Facebook, né strumenti di profilazione commerciale. I tuoi dati professionali non vengono mai ceduti, né venduti a terzi per scopi di marketing.
                        </p>
                    </div>

                    <!-- Sezione Diritti GDPR -->
                    <div style="border-top:1px solid var(--border-color); padding-top:1rem; margin-top:1.25rem;">
                        <h5 style="margin:0 0 6px 0; font-size:0.88rem; color:var(--text-primary);">Diritti dell'Interessato (GDPR Artt. 15-22)</h5>
                        <p style="font-size:0.78rem; line-height:1.45; color:var(--text-muted); margin:0;">
                            Hai il diritto di accedere in qualsiasi momento ai tuoi dati personali, richiederne la rettifica o la cancellazione, oppure revocare il consenso precedentemente accordato tramite il pulsante "Revoca Consenso" sottostante. Per qualsiasi richiesta privacy: contattaci tramite il modulo di supporto della piattaforma.
                        </p>
                    </div>
                </div>

                <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px; margin-top:1.25rem; border-top:1px solid var(--border-color); padding-top:1.25rem;">
                    <div>
                        <button type="button" class="btn btn-outline btn-sm" onclick="resetCookieConsent()" style="color:var(--danger); border-color:var(--danger-border); font-size:0.8rem;" title="Azzera la scelta e mostra nuovamente il banner">Revoca Consenso</button>
                    </div>
                    <div style="display:flex; gap:8px; flex-wrap:wrap;">
                        <button type="button" class="btn btn-outline btn-sm" onclick="acceptEssentialOnly()" style="font-size:0.85rem;">Solo Necessari</button>
                        <button type="button" class="btn btn-primary btn-sm" onclick="saveCustomCookiePreferences()" style="font-size:0.85rem; font-weight:600;">Salva Preferenze</button>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(modal);

        // Chiude cliccando sull'overlay esterno
        modal.addEventListener('click', (e) => {
            if (e.target === modal) window.closeCookiePolicy();
        });
    }

    // Inizializzazione automatica al caricamento del DOM
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            initModal();
            if (!localStorage.getItem(CONSENT_KEY)) {
                renderBanner();
            }
        });
    } else {
        initModal();
        if (!localStorage.getItem(CONSENT_KEY)) {
            renderBanner();
        }
    }
})();
