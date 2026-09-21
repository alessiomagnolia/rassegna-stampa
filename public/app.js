// State Management
const state = {
    token: localStorage.getItem('rs_token'),
    user: null,
    articles: [],
    history: [],
    isExtracting: false,
    isGenerating: false,
    clientLogoBase64: null,
    currentReviewId: null
};

let logoArchive = [];
let currentEditingArticleIndex = -1;
let selectedTemplateId = 'classic';

// Init fetch
fetch('/assets/logos.json')
    .then(res => res.json())
    .then(data => { logoArchive = data; })
    .catch(err => console.log('Logos non caricati', err));


// --- UTILS ---

function fileToBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => resolve(reader.result);
        reader.onerror = error => reject(error);
    });
}

function showToast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    if (!container) return;
    
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `
        <span style="font-size: 1.2rem; display: flex; align-items: center;">
            ${type === 'success' ? '<i data-feather="check-circle" style="color:var(--success)"></i>' : type === 'error' ? '<i data-feather="alert-circle" style="color:var(--danger)"></i>' : '<i data-feather="info" style="color:var(--accent-primary)"></i>'}
        </span>
        <div style="flex:1; font-size:0.9rem; line-height:1.4;">${message}</div>
    `;
    
    container.appendChild(toast);
    feather.replace();
    
    setTimeout(() => {
        toast.classList.add('fade-out');
        setTimeout(() => toast.remove(), 300);
    }, 4000);
}

function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}
window.escapeHtml = escapeHtml;

async function apiCall(method, endpoint, body = null, isFormData = false) {
    const headers = {};
    
    const token = state.token || localStorage.getItem('rs_token');
    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
    }
    
    if (!isFormData) {
        headers['Content-Type'] = 'application/json';
    }

    const options = {
        method,
        headers
    };

    if (body) {
        options.body = isFormData ? body : JSON.stringify(body);
    }

    try {
        const response = await fetch(endpoint, options);
        
        if (response.status === 401) {
            localStorage.removeItem('rs_token');
            state.token = null;
            if (window.location.pathname.includes('dashboard')) {
                window.location.href = 'index.html';
            }
            throw new Error('Sessione scaduta');
        }

        const isJson = response.headers.get('content-type')?.includes('application/json');
        
        if (!response.ok) {
            let errorMsg = 'Errore sconosciuto';
            if (isJson) {
                const errData = await response.json();
                errorMsg = errData.error || errorMsg;
            }
            throw new Error(errorMsg);
        }

        if (isJson) {
            return await response.json();
        } else {
            return await response.blob();
        }
    } catch (error) {
        throw error;
    }
}

// --- AUTH (index.html) ---

async function handleLogin(e) {
    e.preventDefault();
    const email = document.getElementById('loginEmail').value;
    const password = document.getElementById('loginPassword').value;
    const btn = e.target.querySelector('button');
    const originalText = btn.innerText;

    try {
        btn.disabled = true;
        btn.innerText = 'Accesso in corso...';
        
        const data = await apiCall('POST', '/api/auth/login', { email, password });
        localStorage.setItem('rs_token', data.token);
        window.location.href = 'dashboard.html';
    } catch (error) {
        showToast(error.message, 'error');
        btn.disabled = false;
        btn.innerText = originalText;
    }
}

async function handleRegister(e) {
    e.preventDefault();
    const company_name = document.getElementById('registerCompanyName').value;
    const email = document.getElementById('registerEmail').value;
    const password = document.getElementById('registerPassword').value;
    const btn = e.target.querySelector('button');
    const originalText = btn.innerText;

    if (password.length < 6) {
        return showToast('La password deve avere almeno 6 caratteri.', 'error');
    }

    try {
        btn.disabled = true;
        btn.innerText = 'Registrazione in corso...';
        
        const data = await apiCall('POST', '/api/auth/register', { email, password, company_name });
        localStorage.setItem('rs_token', data.token);
        window.location.href = 'dashboard.html';
    } catch (error) {
        showToast(error.message, 'error');
        btn.disabled = false;
        btn.innerText = originalText;
    }
}

// --- DASHBOARD (dashboard.html) ---

async function loadProfile() {
    try {
        const data = await apiCall('GET', '/api/auth/profile');
        state.user = data.user;
        updateProfileUI();
        loadHistory();
    } catch (error) {
        console.error('Failed to load profile');
    }
}

function updateProfileUI() {
    const { user } = state;
    if (!user) return;

    // Navbar
    const compName = user.company_name || user.email;
    const navCompanyEl = document.getElementById('navCompany');
    const navCompanyHeaderEl = document.getElementById('navCompanyHeader');
    if (navCompanyEl) navCompanyEl.innerText = compName;
    if (navCompanyHeaderEl) navCompanyHeaderEl.innerText = compName;
    
    // Sidebar footer
    const sidebarCompany = document.getElementById('sidebarCompany');
    if (sidebarCompany) sidebarCompany.textContent = compName;

    if (user.logo_path) {
        const navLogo = document.getElementById('navLogo');
        if (navLogo) {
            navLogo.src = user.logo_path;
            navLogo.classList.remove('hidden');
        }
    }

    // Profile Section
    const companyInput = document.getElementById('companyName');
    if (companyInput) companyInput.value = user.company_name || '';

    const logoPreviewContainer = document.getElementById('logoPreviewContainer');
    const dropZone = document.getElementById('dropZone');
    const logoPreview = document.getElementById('logoPreview');

    if (user.logo_path && logoPreviewContainer) {
        logoPreview.src = user.logo_path;
        logoPreviewContainer.classList.remove('hidden');
        dropZone.style.display = 'none';
    } else if (logoPreviewContainer) {
        logoPreviewContainer.classList.add('hidden');
        dropZone.style.display = 'block';
    }
}

async function saveProfile() {
    const companyName = document.getElementById('companyName').value;
    const btn = document.getElementById('btnSaveProfile');
    const originalText = btn.innerText;

    try {
        btn.disabled = true;
        btn.innerText = 'Salvataggio...';
        const data = await apiCall('PUT', '/api/auth/profile', { company_name: companyName });
        state.user = data.user;
        updateProfileUI();
        showToast('Profilo aggiornato con successo', 'success');
    } catch (error) {
        showToast(error.message, 'error');
    } finally {
        btn.disabled = false;
        btn.innerText = originalText;
    }
}

async function handleLogoUpload(file) {
    if (!file) return;
    
    const formData = new FormData();
    formData.append('logo', file);

    try {
        showToast('Upload del logo in corso...', 'info');
        const data = await apiCall('POST', '/api/auth/upload-logo', formData, true);
        state.user.logo_path = data.logo_path;
        updateProfileUI();
        showToast('Logo caricato con successo', 'success');
    } catch (error) {
        showToast(error.message, 'error');
    }
}

async function removeLogo() {
    try {
        await apiCall('DELETE', '/api/auth/logo');
        state.user.logo_path = '';
        updateProfileUI();
        document.getElementById('navLogo')?.classList.add('hidden');
        showToast('Logo rimosso', 'success');
    } catch (error) {
        showToast(error.message, 'error');
    }
}

// --- ARTICLES ---

async function addArticle() {
    const urlInput = document.getElementById('articleUrl');
    const url = urlInput.value.trim();
    
    if (!url) {
        return showToast('Inserisci un URL valido', 'warning');
    }
    
    try {
        new URL(url);
    } catch (e) {
        return showToast('Formato URL non valido', 'warning');
    }

    const btn = document.getElementById('btnAddArticle');
    const loading = document.getElementById('extractionLoading');
    
    try {
        btn.disabled = true;
        urlInput.disabled = true;
        loading.classList.remove('hidden');
        
        const article = await apiCall('POST', '/api/articles/extract', { url, skipScreenshot: true });
        
        state.articles.push(article);
        urlInput.value = '';
        renderArticles();
        showToast('Articolo aggiunto con successo', 'success');
    } catch (error) {
        console.error('Extraction error:', error);
        showToast(error.message || 'Impossibile estrarre automaticamente l\'articolo', 'error');
        
        // Auto-open manual modal pre-filled with the URL so the user is never blocked
        try {
            const manualModal = document.getElementById('manualEntryModal');
            if (manualModal) {
                const manualUrl = document.getElementById('manualUrl');
                if (manualUrl) manualUrl.value = url;
                
                const manualDate = document.getElementById('manualDate');
                if (manualDate && !manualDate.value) {
                    manualDate.value = new Date().toISOString().split('T')[0];
                }
                
                const manualSourceName = document.getElementById('manualSourceName');
                if (manualSourceName && !manualSourceName.value) {
                    try {
                        const h = new URL(url).hostname.replace(/^www\./, '').split('.')[0];
                        manualSourceName.value = h.charAt(0).toUpperCase() + h.slice(1);
                    } catch(e) {}
                }
                
                manualModal.classList.remove('hidden');
                setTimeout(() => {
                    document.getElementById('manualTitle')?.focus();
                }, 100);
            }
        } catch(e) {}
    } finally {
        btn.disabled = false;
        urlInput.disabled = false;
        loading.classList.add('hidden');
        urlInput.focus();
    }
}

async function saveManualArticle() {
    const title = document.getElementById('manualTitle').value.trim();
    const text = document.getElementById('manualText').value.trim();
    const sourceName = document.getElementById('manualSourceName').value.trim();
    const sourceType = document.getElementById('manualSourceType').value;
    const date = document.getElementById('manualDate').value;
    const url = document.getElementById('manualUrl').value.trim();
    const imageFile = document.getElementById('manualImage').files[0];
    const logoFile = document.getElementById('manualLogo').files[0];

    if (!title || !text || !sourceName || !date) {
        return showToast('Compila tutti i campi obbligatori (*)', 'warning');
    }

    // Format date from YYYY-MM-DD to DD/MM/YYYY
    const d = new Date(date);
    const formattedDate = `${d.getDate().toString().padStart(2, '0')}/${(d.getMonth() + 1).toString().padStart(2, '0')}/${d.getFullYear()}`;

    const btn = document.getElementById('btnSaveManual');
    const originalText = btn.innerText;

    try {
        btn.disabled = true;
        btn.innerText = 'Salvataggio...';

        let imageBase64 = null;
        let logoBase64 = null;

        if (imageFile) {
            imageBase64 = await fileToBase64(imageFile);
        }
        if (logoFile) {
            logoBase64 = await fileToBase64(logoFile);
        }

        const newArticle = {
            title,
            excerpt: text,
            source_name: sourceName,
            source_type: sourceType,
            published_date: formattedDate,
            url: url || '',
            imageBase64,
            logoBase64,
            screenshotBase64: null,
            author: 'Autore non disponibile'
        };

        state.articles.push(newArticle);
        renderArticles();
        showToast('Articolo manuale aggiunto con successo', 'success');

        // Close modal and reset form
        document.getElementById('manualEntryModal').classList.add('hidden');
        document.getElementById('manualTitle').value = '';
        document.getElementById('manualText').value = '';
        document.getElementById('manualSourceName').value = '';
        document.getElementById('manualSourceType').value = 'Web';
        document.getElementById('manualDate').value = '';
        document.getElementById('manualUrl').value = '';
        document.getElementById('manualImage').value = '';
        document.getElementById('manualLogo').value = '';

    } catch (error) {
        showToast(error.message, 'error');
    } finally {
        btn.disabled = false;
        btn.innerText = originalText;
    }
}

function removeArticle(index) {
    state.articles.splice(index, 1);
    renderArticles();
}

function renderArticles() {
    const list = document.getElementById('articlesList');
    const empty = document.getElementById('emptyArticles');
    const btnGenerate = document.getElementById('btnGeneratePDF');
    const btnEditor = document.getElementById('btnOpenEditor');
    const btnArchive = document.getElementById('btnArchiveReview');
    const btnCopyLinks = document.getElementById('btnCopyAllLinks');
    const btnResetAndNew = document.getElementById('btnResetAndNewReview');
    
    if (!list) return;

    // Clear existing cards
    Array.from(list.children).forEach(child => {
        if (child.id !== 'emptyArticles') child.remove();
    });

    // Update article count badge
    const countBadge = document.getElementById('articleCountBadge');
    if (countBadge) countBadge.textContent = state.articles.length;

    if (state.articles.length === 0) {
        sessionStorage.removeItem('rs_draft_articles');
        empty.classList.remove('hidden');
        if (btnGenerate)    btnGenerate.classList.add('hidden');
        if (btnEditor)      btnEditor.classList.add('hidden');
        if (btnArchive)     btnArchive.classList.add('hidden');
        if (btnCopyLinks)   btnCopyLinks.classList.add('hidden');
        if (btnResetAndNew) btnResetAndNew.classList.add('hidden');
        if (typeof updateLiveKpis === 'function') updateLiveKpis();
        return;
    }

    sessionStorage.setItem('rs_draft_articles', JSON.stringify(state.articles));
    empty.classList.add('hidden');
    if (btnGenerate)    btnGenerate.classList.remove('hidden');
    if (btnEditor)      btnEditor.classList.remove('hidden');
    if (btnArchive)     btnArchive.classList.remove('hidden');
    if (btnCopyLinks)   btnCopyLinks.classList.remove('hidden');
    if (btnResetAndNew) btnResetAndNew.classList.remove('hidden');
    if (typeof updateLiveKpis === 'function') updateLiveKpis();

    state.articles.forEach((article, idx) => {
        const card = document.createElement('div');
        card.className = 'article-card';
        card.dataset.idx = idx;
        card.style.animationDelay = `${idx * 0.1}s`;
        
        const imgSrc = article.imageBase64 || article.screenshotBase64 || 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxMDAlIiBoZWlnaHQ9IjEwMCUiIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgc3Ryb2tlPSIjNjZhNjgyIiBzdHJva2Utd2lkdGg9IjIiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIgc3Ryb2tlLWxpbmVqb2luPSJyb3VuZCI+PHJlY3QgeD0iMyIgeT0iMyIgd2lkdGg9IjE4IiBoZWlnaHQ9IjE4IiByeD0iMiIgcnk9IjIiPjwvcmVjdD48Y2lyY2xlIGN4PSI4LjUiIGN5PSI4LjUiIHI9IjEuNSI+PC9jaXJjbGU+PHBvbHlsaW5lIHBvaW50cz0iMjEgMTUgMTYgMTAgNSAyMSI+PC9wb2x5bGluZT48L3N2Zz4=';
        
        card.innerHTML = `
            <div class="article-card-left">
                <span class="drag-handle" title="Trascina per riordinare"><i data-feather="move"></i></span>
                <img src="${imgSrc}" class="article-thumb" alt="Thumb">
            </div>
            <div class="article-content">
                <div class="article-card-header">
                    <div class="article-source-meta">
                        ${article.logoBase64 ? `<img src="${article.logoBase64}" class="article-source-logo" alt="Logo">` : ''}
                        <span class="article-source-name">${article.source_name || 'Fonte'}</span>
                        <span class="article-meta-dot">&bull;</span>
                        <span class="article-date">${article.published_date || ''}</span>
                    </div>
                    <div class="article-category-pill">
                        <select onchange="changeArticleType(event, ${idx})" class="article-category-select" title="Cambia Categoria / Tipo Fonte">
                            <option value="Web" ${article.source_type === 'Web' ? 'selected' : ''}>🌐 Web</option>
                            <option value="Quotidiano Nazionale" ${article.source_type === 'Quotidiano Nazionale' ? 'selected' : ''}>📰 Quotidiano Nazionale</option>
                            <option value="Quotidiano Locale" ${article.source_type === 'Quotidiano Locale' ? 'selected' : ''}>🏙️ Quotidiano Locale</option>
                            <option value="Agenzia di Stampa" ${article.source_type === 'Agenzia di Stampa' ? 'selected' : ''}>⚡ Agenzia di Stampa</option>
                            <option value="Periodico" ${article.source_type === 'Periodico' ? 'selected' : ''}>📑 Periodico</option>
                            <option value="Radio/TV" ${article.source_type === 'Radio/TV' ? 'selected' : ''}>📺 Radio/TV</option>
                        </select>
                    </div>
                </div>
                <div class="article-title">${article.title || 'Senza titolo'}</div>
                <div class="article-excerpt">${article.excerpt || 'Nessun estratto disponibile per questo articolo.'}</div>
                <div class="article-card-footer">
                    <div class="article-card-actions-left">
                        <label for="uploadLogo_${idx}" class="btn-card-action" title="Carica file logo dal tuo computer">
                            <i data-feather="upload"></i> <span>Carica logo</span>
                        </label>
                        <input type="file" id="uploadLogo_${idx}" style="display:none;" accept="image/*" onchange="changeArticleLogo(event, ${idx})">
                        <button type="button" class="btn-card-action" onclick="openLogoArchive(${idx})" title="Scegli logo dall'archivio testate">
                            <i data-feather="archive"></i> <span>Archivio loghi</span>
                        </button>
                        <button type="button" class="btn-card-action" onclick="copyArticleLink(${idx})" title="Copia link originale">
                            <i data-feather="copy"></i> <span>Copia link</span>
                        </button>
                    </div>
                </div>
            </div>
            <button type="button" class="btn-article-delete" onclick="removeArticle(${idx})" title="Rimuovi notizia" aria-label="Rimuovi notizia">
                <i data-feather="trash-2"></i>
            </button>
        `;
        list.appendChild(card);
    });

    // Init drag-and-drop after rendering
    feather.replace();
    initArticlesSortable();
}

window.copyArticleLink = function(idx) {
    const article = state.articles[idx];
    if (!article || !article.url) {
        showToast('Link non disponibile per questo articolo', 'warning');
        return;
    }
    navigator.clipboard.writeText(article.url).then(() => {
        showToast('Link dell\'articolo copiato negli appunti!', 'success');
    }).catch(() => {
        showToast('Errore durante la copia del link', 'error');
    });
};

window.copyAllArticleLinks = function() {
    if (!state.articles || state.articles.length === 0) {
        showToast('Nessun articolo presente in rassegna', 'warning');
        return;
    }

    const formattedList = state.articles.map((art, i) => {
        const title = art.title || 'Senza titolo';
        const source = art.source_name || art.source_type || 'Web';
        const url = art.url || '';
        return `${i + 1}. ${title} (${source})\n   ${url}`;
    }).join('\n\n');

    navigator.clipboard.writeText(formattedList).then(() => {
        showToast('Elenco completo dei link copiato negli appunti!', 'success');
    }).catch(() => {});

    const modal = document.getElementById('allLinksModal');
    const textarea = document.getElementById('allLinksTextarea');
    if (textarea) textarea.value = formattedList;
    if (modal) {
        modal.classList.remove('hidden');
        modal.style.display = 'flex';
    }
};

window.closeAllLinksModal = function() {
    const modal = document.getElementById('allLinksModal');
    if (modal) {
        modal.classList.add('hidden');
        modal.style.display = 'none';
    }
};

window.copyAllLinksTextarea = function() {
    const textarea = document.getElementById('allLinksTextarea');
    if (textarea) {
        textarea.select();
        navigator.clipboard.writeText(textarea.value);
        showToast('Tutti i link copiati negli appunti!', 'success');
    }
};

function initArticlesSortable() {
    if (typeof Sortable === 'undefined') return;
    const list = document.getElementById('articlesList');
    if (!list) return;

    // Distrugge eventuale istanza precedente per evitare riferimenti obsoleti o listener duplicati
    if (list._sortable) {
        try { list._sortable.destroy(); } catch (e) {}
        list._sortable = null;
    }

    const cards = list.querySelectorAll('.article-card');
    if (cards.length < 2) return;

    list._sortable = Sortable.create(list, {
        handle: '.drag-handle',
        draggable: '.article-card',
        animation: 200,
        ghostClass: 'article-card--ghost',
        chosenClass: 'article-card--chosen',
        fallbackOnBody: true,
        swapThreshold: 0.65,
        onEnd(evt) {
            // Legge il nuovo ordine effettivo degli elementi nel DOM tramite i loro data-idx originali
            const currentCards = Array.from(list.querySelectorAll('.article-card'));
            if (!currentCards.length) return;

            const newArticles = currentCards
                .map(c => state.articles[parseInt(c.dataset.idx, 10)])
                .filter(Boolean);

            if (newArticles.length === state.articles.length) {
                state.articles = newArticles;
                sessionStorage.setItem('rs_draft_articles', JSON.stringify(state.articles));
                renderArticles();
            }
        }
    });
}

function changeArticleLogo(event, idx) {
    const file = event.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = function(e) {
            state.articles[idx].logoBase64 = e.target.result;
            renderArticles();
        };
        reader.readAsDataURL(file);
    }
}

window.changeArticleType = function(event, idx) {
    if (state.articles[idx]) {
        state.articles[idx].source_type = event.target.value;
        sessionStorage.setItem('rs_draft_articles', JSON.stringify(state.articles));
    }
};

// --- PDF GENERATION & ARCHIVING ---

async function archiveReview() {
    if (state.articles.length === 0) return;
    const title = document.getElementById('rassegnaTitle')?.value.trim() || 'Rassegna Stampa';
    const clientName = document.getElementById('clientName')?.value.trim() || '';
    const btn = document.getElementById('btnArchiveReview');

    try {
        if (btn) {
            btn.disabled = true;
            btn.innerHTML = '<i data-feather="loader" class="spinPulse" style="width:14px;height:14px;margin-right:6px;"></i> Archiviazione...';
            feather.replace();
        }

        const res = await apiCall('POST', '/api/pdf/archive', {
            id: state.currentReviewId || undefined,
            articles: state.articles,
            title,
            clientName,
            clientLogo: state.clientLogoBase64
        });

        if (res && res.id) {
            state.currentReviewId = res.id;
            sessionStorage.setItem('rs_draft_review_id', res.id);
        }

        showToast('Rassegna salvata ed archiviata con successo nello Storico!', 'success');
        loadHistory();
    } catch (err) {
        showToast('Errore durante l\'archiviazione: ' + err.message, 'error');
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = '<i data-feather="bookmark" style="width:14px;height:14px;margin-right:4px;"></i> Archivia in Storico';
            feather.replace();
        }
    }
}

async function startNewReview() {
    const count = (state.articles && Array.isArray(state.articles)) ? state.articles.length : 0;

    if (count > 0) {
        const confirmMsg = `Vuoi creare una nuova rassegna da zero?\n\nLa rassegna attuale (${count} articol${count === 1 ? 'o' : 'i'}) verrà archiviata automaticamente nel tuo Storico.`;
        if (!confirm(confirmMsg)) {
            return;
        }

        const title = document.getElementById('rassegnaTitle')?.value.trim() || ('Rassegna Stampa del ' + new Date().toLocaleDateString('it-IT'));
        const clientName = document.getElementById('clientName')?.value.trim() || '';
        const clientLogo = state.clientLogoBase64 || null;

        const btn1 = document.getElementById('btnStartNewReview');
        const btn2 = document.getElementById('btnNewReviewAction');
        const btn3 = document.getElementById('btnResetAndNewReview');
        const originalHtml1 = btn1 ? btn1.innerHTML : '';
        const originalHtml2 = btn2 ? btn2.innerHTML : '';
        const originalHtml3 = btn3 ? btn3.innerHTML : '';

        try {
            if (btn1) {
                btn1.disabled = true;
                btn1.innerHTML = '<i data-feather="loader" class="spinPulse" style="width:16px;height:16px;margin-right:6px;"></i> <span>Archiviazione...</span>';
            }
            if (btn2) {
                btn2.disabled = true;
                btn2.innerHTML = '<i data-feather="loader" class="spinPulse" style="width:13px;height:13px;margin-right:4px;"></i> <span>Salvataggio...</span>';
            }
            if (btn3) {
                btn3.disabled = true;
                btn3.innerHTML = '<i data-feather="loader" class="spinPulse" style="width:14px;height:14px;margin-right:4px;"></i> <span>Salvataggio...</span>';
            }
            if (window.feather) feather.replace();

            await apiCall('POST', '/api/pdf/archive', {
                id: state.currentReviewId || undefined,
                articles: state.articles,
                title,
                clientName,
                clientLogo
            });

            loadHistory();
            showToast('Rassegna precedente archiviata con successo nello Storico!', 'success');
        } catch (err) {
            showToast('Errore durante l\'archiviazione nello Storico: ' + err.message, 'error');
            return; // Non azzera gli articoli in caso di fallimento del salvataggio
        } finally {
            if (btn1) {
                btn1.disabled = false;
                btn1.innerHTML = originalHtml1;
            }
            if (btn2) {
                btn2.disabled = false;
                btn2.innerHTML = originalHtml2;
            }
            if (btn3) {
                btn3.disabled = false;
                btn3.innerHTML = originalHtml3;
            }
            if (window.feather) feather.replace();
        }
    }

    // Reset stato rassegna in memoria e storage
    state.articles = [];
    state.currentReviewId = null;
    sessionStorage.removeItem('rs_draft_articles');
    sessionStorage.removeItem('rs_draft_review_id');
    localStorage.removeItem('rs_editor_state');

    // Reset input rassegna
    const urlInput = document.getElementById('articleUrl');
    if (urlInput) urlInput.value = '';

    const titleInput = document.getElementById('rassegnaTitle');
    if (titleInput) titleInput.value = '';

    const clientInput = document.getElementById('clientName');
    const logoInput = document.getElementById('clientLogoInput');
    if (logoInput) logoInput.value = '';
    const logoPrev = document.getElementById('clientLogoPreview');
    const logoPrevCont = document.getElementById('clientLogoPreviewContainer');

    // Ripristina cliente attivo globale se presente, altrimenti azzera
    const activeClientStr = localStorage.getItem('rs_active_client');
    if (activeClientStr) {
        try {
            const client = JSON.parse(activeClientStr);
            if (clientInput) clientInput.value = client.name || '';
            if (client.logo_base64) {
                state.clientLogoBase64 = client.logo_base64;
                if (logoPrev) logoPrev.src = client.logo_base64;
                if (logoPrevCont) logoPrevCont.style.display = 'flex';
            } else {
                state.clientLogoBase64 = null;
                if (logoPrev) logoPrev.src = '';
                if (logoPrevCont) logoPrevCont.style.display = 'none';
            }
        } catch (e) {
            state.clientLogoBase64 = null;
            if (clientInput) clientInput.value = '';
            if (logoPrev) logoPrev.src = '';
            if (logoPrevCont) logoPrevCont.style.display = 'none';
        }
    } else {
        state.clientLogoBase64 = null;
        if (clientInput) clientInput.value = '';
        if (logoPrev) logoPrev.src = '';
        if (logoPrevCont) logoPrevCont.style.display = 'none';
    }

    // Ridisegna lista articoli (mostra empty state)
    renderArticles();

    // Focus sull'omnibar per inserire il primo link della nuova rassegna
    if (urlInput) {
        urlInput.focus();
        urlInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    if (count === 0) {
        showToast('Campi azzerati. Pronto per una nuova rassegna!', 'info');
    } else {
        showToast('Nuova rassegna avviata! La precedente è al sicuro nello Storico.', 'success');
    }
}
window.startNewReview = startNewReview;

// Client Logo Logic
document.getElementById('clientLogoInput')?.addEventListener('change', function(e) {
    const file = e.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = function(event) {
            state.clientLogoBase64 = event.target.result;
            document.getElementById('clientLogoPreview').src = state.clientLogoBase64;
            document.getElementById('clientLogoPreviewContainer').style.display = 'flex';
        };
        reader.readAsDataURL(file);
    }
});

document.getElementById('btnRemoveClientLogo')?.addEventListener('click', function() {
    state.clientLogoBase64 = null;
    if(document.getElementById('clientLogoInput')) document.getElementById('clientLogoInput').value = '';
    if(document.getElementById('clientLogoPreviewContainer')) document.getElementById('clientLogoPreviewContainer').style.display = 'none';
});

function openEditor() {
    if (state.articles.length === 0) return;
    const title    = document.getElementById('rassegnaTitle')?.value.trim() || '';
    const clientName = document.getElementById('clientName')?.value.trim() || '';
    const includeAnalytics = document.getElementById('includeAnalyticsPdf') ? document.getElementById('includeAnalyticsPdf').checked : true;
    const editorState = {
        articles: state.articles,
        currentReviewId: state.currentReviewId || null,
        options: { title, clientName, clientLogo: state.clientLogoBase64 || null, templateId: selectedTemplateId, includeAnalytics }
    };
    localStorage.setItem('rs_editor_state', JSON.stringify(editorState));
    window.location.href = 'editor.html';
}

async function generatePDF() {
    if (state.articles.length === 0) return;
    
    const title = document.getElementById('rassegnaTitle').value.trim();
    const clientName = document.getElementById('clientName')?.value.trim() || '';
    const btn = document.getElementById('btnGeneratePDF');
    const loading = document.getElementById('generationLoading');
    
    try {
        state.isGenerating = true;
        btn.classList.add('hidden');
        loading.classList.remove('hidden');
        
        const includeAnalytics = document.getElementById('includeAnalyticsPdf') ? document.getElementById('includeAnalyticsPdf').checked : true;
        
        const response = await apiCall('POST', '/api/pdf/generate', { 
            articles: state.articles,
            title,
            clientName,
            clientLogo: state.clientLogoBase64,
            templateId: selectedTemplateId,
            includeAnalytics
        });
        
        if (response && response.id) {
            state.currentReviewId = response.id;
            sessionStorage.setItem('rs_draft_review_id', response.id);
        }
        if (response && response.shareUrl) {
            state.currentShareUrl = response.shareUrl;
        }

        showToast('PDF generato! Download in corso...', 'success');
        triggerDownload(response.downloadUrl, response.filename);
        
        // Reload history list automatically
        loadHistory();
        
    } catch (error) {
        showToast(error.message, 'error');
        btn.classList.remove('hidden');
    } finally {
        state.isGenerating = false;
        loading.classList.add('hidden');
    }
}

async function triggerDownload(url, filename) {
    try {
        const token = state.token || localStorage.getItem('rs_token');
        const headers = {};
        if (token) headers['Authorization'] = `Bearer ${token}`;

        const res = await fetch(url, { headers });
        if (!res.ok) {
            let errMsg = 'HTTP ' + res.status;
            try {
                const errJson = await res.json();
                if (errJson && errJson.error) errMsg = errJson.error;
            } catch(e) {}
            throw new Error(errMsg);
        }
        const blob = await res.blob();
        const objectUrl = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = objectUrl;
        a.download = filename || 'Rassegna_Stampa.pdf';
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.URL.revokeObjectURL(objectUrl);
    } catch (error) {
        console.error('triggerDownload error:', error);
        showToast('Errore durante il download: ' + error.message, 'error');
        throw error;
    }
}
window.triggerDownload = triggerDownload;

// --- HISTORY (Organizzato per Cliente e per Data) ---

let rawHistoryItems = [];
let selectedHistoryIds = new Set();
let currentHistoryGrouping = 'date'; // 'date' | 'client'

const ITALIAN_DAYS = ['Domenica', 'Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato'];
const ITALIAN_MONTHS = [
    'Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno',
    'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre'
];

function toYYYYMMDD(d) {
    if (!d || isNaN(d.getTime())) return '';
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function getItemDateKey(dateStr) {
    if (!dateStr) return '0000-00-00';
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) {
        const match = String(dateStr).match(/^(\d{4})-(\d{2})-(\d{2})/);
        return match ? `${match[1]}-${match[2]}-${match[3]}` : '0000-00-00';
    }
    return toYYYYMMDD(d);
}

function formatDayLabel(dateKey) {
    if (!dateKey || dateKey === '0000-00-00') return 'Data non specificata';
    const now = new Date();
    const todayKey = toYYYYMMDD(now);
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayKey = toYYYYMMDD(yesterday);

    const [y, m, d] = dateKey.split('-').map(Number);
    const dateObj = new Date(y, m - 1, d);
    const dayName = ITALIAN_DAYS[dateObj.getDay()] || '';
    const monthName = ITALIAN_MONTHS[m - 1] || '';

    let prefix = '';
    if (dateKey === todayKey) {
        prefix = 'Oggi &bull; ';
    } else if (dateKey === yesterdayKey) {
        prefix = 'Ieri &bull; ';
    }

    return `${prefix}${dayName} ${d} ${monthName} ${y}`;
}

function formatMonthLabel(dateStr) {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return 'Senza data';
    return `${ITALIAN_MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

function getYearMonthKey(dateStr) {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return '0000-00';
    const m = String(d.getMonth() + 1).padStart(2, '0');
    return `${d.getFullYear()}-${m}`;
}

function populateHistoryFilters(items) {
    const clientSelect = document.getElementById('historyClientFilter');
    const periodSelect = document.getElementById('historyPeriodPreset');
    if (!clientSelect) return;

    const currentClient = clientSelect.value;
    const currentPreset = periodSelect ? periodSelect.value : 'all';

    // Raccoglie clienti con conteggio
    const clientCounts = {};
    let noClientCount = 0;
    const monthMap = {};

    items.forEach(item => {
        // Cliente
        const cName = (item.client_name || '').trim();
        if (cName) {
            clientCounts[cName] = (clientCounts[cName] || 0) + 1;
        } else {
            noClientCount++;
        }

        // Mesi presenti
        const ymKey = getYearMonthKey(item.created_at);
        if (!monthMap[ymKey]) {
            monthMap[ymKey] = {
                label: formatMonthLabel(item.created_at),
                count: 0
            };
        }
        monthMap[ymKey].count++;
    });

    // Popola Clienti
    let clientOptionsHtml = `<option value="all">Tutti i Clienti (${items.length})</option>`;
    const sortedClients = Object.keys(clientCounts).sort((a, b) => a.localeCompare(b, 'it'));
    sortedClients.forEach(c => {
        clientOptionsHtml += `<option value="${escapeHtml(c)}">${escapeHtml(c)} (${clientCounts[c]})</option>`;
    });
    if (noClientCount > 0) {
        clientOptionsHtml += `<option value="__none__">Rassegne Generali / Senza Cliente (${noClientCount})</option>`;
    }
    clientSelect.innerHTML = clientOptionsHtml;
    if (currentClient && Array.from(clientSelect.options).some(o => o.value === currentClient)) {
        clientSelect.value = currentClient;
    }

    // Popola Periodo / Preset
    if (periodSelect) {
        let periodOptionsHtml = `
            <option value="all">Tutte le Date</option>
            <option value="today">Oggi</option>
            <option value="yesterday">Ieri</option>
            <option value="last7">Ultimi 7 giorni</option>
            <option value="last30">Ultimi 30 giorni</option>
            <option value="this_month">Questo mese</option>
            <option value="last_month">Mese scorso</option>
        `;

        const sortedMonths = Object.keys(monthMap).sort((a, b) => b.localeCompare(a));
        if (sortedMonths.length > 0) {
            periodOptionsHtml += `<optgroup label="Mesi Specifici">`;
            sortedMonths.forEach(ym => {
                periodOptionsHtml += `<option value="month:${ym}">${monthMap[ym].label} (${monthMap[ym].count})</option>`;
            });
            periodOptionsHtml += `</optgroup>`;
        }
        periodOptionsHtml += `<option value="custom">Giorno / Periodo specifico</option>`;
        periodSelect.innerHTML = periodOptionsHtml;

        if (currentPreset && Array.from(periodSelect.options).some(o => o.value === currentPreset)) {
            periodSelect.value = currentPreset;
        }
    }
}

function applyHistoryPeriodPreset(presetVal) {
    const inputFrom = document.getElementById('historyDateFrom');
    const inputTo   = document.getElementById('historyDateTo');
    const presetSel = document.getElementById('historyPeriodPreset');
    const btnReset  = document.getElementById('btnResetDates');
    if (!inputFrom || !inputTo) return;

    const now = new Date();
    const todayStr = toYYYYMMDD(now);

    let fromStr = '';
    let toStr   = '';

    if (presetVal === 'all') {
        fromStr = '';
        toStr = '';
    } else if (presetVal === 'today') {
        fromStr = todayStr;
        toStr = todayStr;
    } else if (presetVal === 'yesterday') {
        const y = new Date();
        y.setDate(y.getDate() - 1);
        fromStr = toYYYYMMDD(y);
        toStr = toYYYYMMDD(y);
    } else if (presetVal === 'last7') {
        const d7 = new Date();
        d7.setDate(d7.getDate() - 6);
        fromStr = toYYYYMMDD(d7);
        toStr = todayStr;
    } else if (presetVal === 'last30') {
        const d30 = new Date();
        d30.setDate(d30.getDate() - 29);
        fromStr = toYYYYMMDD(d30);
        toStr = todayStr;
    } else if (presetVal === 'this_month') {
        fromStr = toYYYYMMDD(new Date(now.getFullYear(), now.getMonth(), 1));
        toStr = todayStr;
    } else if (presetVal === 'last_month') {
        fromStr = toYYYYMMDD(new Date(now.getFullYear(), now.getMonth() - 1, 1));
        toStr = toYYYYMMDD(new Date(now.getFullYear(), now.getMonth(), 0));
    } else if (presetVal && presetVal.startsWith('month:')) {
        const ym = presetVal.replace('month:', '');
        const [year, month] = ym.split('-').map(Number);
        fromStr = `${year}-${String(month).padStart(2, '0')}-01`;
        const lastDay = new Date(year, month, 0).getDate();
        toStr = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
    } else if (presetVal === 'custom') {
        fromStr = inputFrom.value;
        toStr = inputTo.value;
    }

    inputFrom.value = fromStr;
    inputTo.value = toStr;

    if (presetSel && presetSel.value !== presetVal) {
        presetSel.value = presetVal;
    }

    updateDateChipsActive(presetVal);

    if (btnReset) {
        btnReset.style.display = (fromStr || toStr) ? 'inline-flex' : 'none';
    }

    filterAndRenderHistory();
}
window.applyHistoryPeriodPreset = applyHistoryPeriodPreset;

function applyHistoryDateChip(chipKey) {
    applyHistoryPeriodPreset(chipKey);
}
window.applyHistoryDateChip = applyHistoryDateChip;

function onHistoryDateInputChange() {
    const inputFrom = document.getElementById('historyDateFrom');
    const inputTo   = document.getElementById('historyDateTo');
    const presetSel = document.getElementById('historyPeriodPreset');
    const btnReset  = document.getElementById('btnResetDates');
    if (!inputFrom || !inputTo) return;

    const fromVal = inputFrom.value;
    const toVal   = inputTo.value;

    if (presetSel) {
        presetSel.value = 'custom';
    }
    updateDateChipsActive('custom');

    if (btnReset) {
        btnReset.style.display = (fromVal || toVal) ? 'inline-flex' : 'none';
    }

    filterAndRenderHistory();
}
window.onHistoryDateInputChange = onHistoryDateInputChange;

function clearHistoryDateFilter() {
    applyHistoryPeriodPreset('all');
}
window.clearHistoryDateFilter = clearHistoryDateFilter;

function updateDateChipsActive(activeKey) {
    const chips = {
        'all': 'chipDateAll',
        'today': 'chipDateToday',
        'yesterday': 'chipDateYesterday',
        'last7': 'chipDateLast7',
        'this_month': 'chipDateThisMonth',
        'last_month': 'chipDateLastMonth'
    };
    Object.keys(chips).forEach(k => {
        const el = document.getElementById(chips[k]);
        if (el) {
            el.classList.toggle('active', k === activeKey);
        }
    });
}

function setHistoryGrouping(mode) {
    currentHistoryGrouping = mode;
    const btnDate   = document.getElementById('btnGroupDate');
    const btnClient = document.getElementById('btnGroupClient');
    if (btnDate && btnClient) {
        if (mode === 'date') {
            btnDate.classList.add('active');
            btnClient.classList.remove('active');
        } else {
            btnClient.classList.add('active');
            btnDate.classList.remove('active');
        }
    }
    filterAndRenderHistory();
}
window.setHistoryGrouping = setHistoryGrouping;

function filterAndRenderHistory() {
    const searchInput  = document.getElementById('historySearchInput');
    const clientSelect = document.getElementById('historyClientFilter');
    const inputFrom    = document.getElementById('historyDateFrom');
    const inputTo      = document.getElementById('historyDateTo');
    const listEl       = document.getElementById('historyList');
    const countEl      = document.getElementById('historyCountSummary');
    if (!listEl) return;

    const query = (searchInput?.value || '').toLowerCase().trim();
    const selClient = clientSelect?.value || 'all';
    const dateFrom  = (inputFrom?.value || '').trim();
    const dateTo    = (inputTo?.value || '').trim();

    const filtered = rawHistoryItems.filter(item => {
        // Filtro testo (titolo o cliente)
        if (query) {
            const titleMatch  = (item.title || '').toLowerCase().includes(query);
            const clientMatch = (item.client_name || '').toLowerCase().includes(query);
            if (!titleMatch && !clientMatch) return false;
        }

        // Filtro cliente
        if (selClient !== 'all') {
            if (selClient === '__none__') {
                if ((item.client_name || '').trim() !== '') return false;
            } else {
                if ((item.client_name || '').trim() !== selClient) return false;
            }
        }

        // Filtro per data precisa a livello di giorno
        const itemDateKey = getItemDateKey(item.created_at);
        if (dateFrom && itemDateKey < dateFrom) return false;
        if (dateTo && itemDateKey > dateTo) return false;

        return true;
    });

    if (countEl) {
        let filterNote = '';
        if (dateFrom && dateTo) {
            if (dateFrom === dateTo) {
                const [y, m, d] = dateFrom.split('-');
                filterNote = ` &bull; Giorno: <strong>${d}/${m}/${y}</strong>`;
            } else {
                const [y1, m1, d1] = dateFrom.split('-');
                const [y2, m2, d2] = dateTo.split('-');
                filterNote = ` &bull; Dal <strong>${d1}/${m1}/${y1}</strong> al <strong>${d2}/${m2}/${y2}</strong>`;
            }
        } else if (dateFrom) {
            const [y, m, d] = dateFrom.split('-');
            filterNote = ` &bull; Dal <strong>${d}/${m}/${y}</strong>`;
        } else if (dateTo) {
            const [y, m, d] = dateTo.split('-');
            filterNote = ` &bull; Fino al <strong>${d}/${m}/${y}</strong>`;
        }
        countEl.innerHTML = `Visualizzate <strong>${filtered.length}</strong> rassegne su ${rawHistoryItems.length} totali${filterNote}`;
    }

    renderGroupedHistory(filtered, currentHistoryGrouping);
    updateBatchActionsBar();
}
window.filterAndRenderHistory = filterAndRenderHistory;

function renderGroupedHistory(items, groupBy) {
    const list = document.getElementById('historyList');
    if (!list) return;

    list.innerHTML = '';

    if (!items || items.length === 0) {
        const isFiltered = rawHistoryItems.length > 0;
        list.innerHTML = `
            <div class="empty-state" style="padding:3rem 1.5rem; text-align:center;">
                <p style="margin-bottom:0.75rem; color:var(--text-muted);">
                    ${isFiltered ? 'Nessuna rassegna trovata con i filtri selezionati.' : 'Nessuna rassegna generata finora.'}
                </p>
                ${isFiltered ? `<button class="btn btn-outline btn-sm" onclick="resetHistoryFilters()">Reimposta Filtri</button>` : ''}
            </div>`;
        return;
    }

    if (groupBy === 'client') {
        // ── RAGGRUPPATO PER CLIENTE ──────────────────────────────────────────
        const clientGroups = {};
        items.forEach(item => {
            const cName = (item.client_name || '').trim() || 'Rassegne Generali (senza cliente)';
            if (!clientGroups[cName]) clientGroups[cName] = [];
            clientGroups[cName].push(item);
        });

        // Ordina clienti (quelli col nome prima in ordine alfabetico, 'senza cliente' alla fine)
        const sortedClientKeys = Object.keys(clientGroups).sort((a, b) => {
            if (a.startsWith('Rassegne Generali')) return 1;
            if (b.startsWith('Rassegne Generali')) return -1;
            return a.localeCompare(b, 'it');
        });

        sortedClientKeys.forEach(groupName => {
            const groupItems = clientGroups[groupName];
            renderHistoryGroupCard(list, groupName, groupItems, 'user');
        });

    } else {
        // ── RAGGRUPPATO PER DATA (Giorno) ────────────────────────────────────
        const dayGroups = {};
        items.forEach(item => {
            const dayKey = getItemDateKey(item.created_at);
            if (!dayGroups[dayKey]) {
                dayGroups[dayKey] = {
                    label: formatDayLabel(dayKey),
                    items: []
                };
            }
            dayGroups[dayKey].items.push(item);
        });

        // Ordina dal giorno più recente al più vecchio
        const sortedDayKeys = Object.keys(dayGroups).sort((a, b) => b.localeCompare(a));

        sortedDayKeys.forEach(dayKey => {
            const group = dayGroups[dayKey];
            renderHistoryGroupCard(list, group.label, group.items, 'calendar');
        });
    }

    if (window.feather) feather.replace();
}

function renderHistoryGroupCard(container, groupTitle, items, iconName) {
    const card = document.createElement('div');
    card.className = 'history-group-card';

    // Calcola se tutte le rassegne del gruppo sono selezionate
    const allGroupSelected = items.every(it => selectedHistoryIds.has(it.id));
    const itemIdsAttr = items.map(it => it.id).join(',');

    const isHtmlTitle = typeof groupTitle === 'string' && groupTitle.includes('&bull;');
    const displayTitle = isHtmlTitle ? groupTitle : escapeHtml(groupTitle);

    const header = document.createElement('div');
    header.className = 'history-group-header';
    header.innerHTML = `
        <div class="history-group-title">
            <i data-feather="${iconName}" style="width:18px;height:18px;color:var(--accent-primary);"></i>
            <span>${displayTitle}</span>
            <span class="history-group-badge">${items.length} rassegn${items.length === 1 ? 'a' : 'e'}</span>
        </div>
        <div style="display:flex; align-items:center; gap:12px; font-size:0.8rem; flex-wrap:wrap;">
            <button class="btn btn-sm btn-outline" onclick="downloadGroupReviews([${itemIdsAttr}])" style="padding:4px 10px; font-size:0.75rem;">
                <i data-feather="download" style="width:12px;height:12px;margin-right:4px;"></i> Scarica tutto (${items.length})
            </button>
            <label style="display:inline-flex; align-items:center; gap:6px; cursor:pointer; color:var(--text-secondary);">
                <input type="checkbox" class="history-checkbox group-checkbox" data-ids="${itemIdsAttr}"
                    ${allGroupSelected ? 'checked' : ''}
                    onchange="toggleGroupSelection([${itemIdsAttr}], this.checked)">
                <span>Seleziona</span>
            </label>
        </div>
    `;
    card.appendChild(header);

    const itemsContainer = document.createElement('div');
    itemsContainer.className = 'history-group-items';

    const isDateGrouping = (iconName === 'calendar');

    items.forEach(item => {
        const isSelected = selectedHistoryIds.has(item.id);
        const itemRow = document.createElement('div');
        itemRow.className = `history-item ${isSelected ? 'selected' : ''}`;
        itemRow.id = `history-item-${item.id}`;

        const d = new Date(item.created_at);
        const timeStr = !isNaN(d.getTime())
            ? d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })
            : '';
        const fullDateStr = !isNaN(d.getTime())
            ? d.toLocaleDateString('it-IT', { day: '2-digit', month: 'short', year: 'numeric' })
            : '';

        const dateMetaHtml = isDateGrouping
            ? (timeStr ? `<span><i data-feather="clock" style="width:12px;height:12px;vertical-align:middle;margin-right:3px;"></i>Ore ${timeStr}</span><span>&bull;</span>` : '')
            : `<span><i data-feather="calendar" style="width:12px;height:12px;vertical-align:middle;margin-right:3px;"></i>${fullDateStr}${timeStr ? ', ' + timeStr : ''}</span><span>&bull;</span>`;

        const clientBadgeHtml = item.client_name
            ? `<span class="history-client-badge"><i data-feather="user" style="width:11px;height:11px;"></i> ${escapeHtml(item.client_name)}</span>`
            : '';

        itemRow.innerHTML = `
            <div style="display:flex; align-items:flex-start; gap:12px; flex:1; min-width:0;">
                <input type="checkbox" class="history-checkbox item-checkbox" data-id="${item.id}"
                    ${isSelected ? 'checked' : ''}
                    onchange="toggleSelectReview(${item.id}, this.checked)" style="margin-top:4px;">
                <div class="history-info">
                    <strong>${escapeHtml(item.title)}</strong>
                    <div class="history-meta">
                        ${dateMetaHtml}
                        <span><i data-feather="file-text" style="width:12px;height:12px;vertical-align:middle;margin-right:3px;"></i>${item.article_count} articol${item.article_count === 1 ? 'o' : 'i'}</span>
                        ${clientBadgeHtml}
                        ${item.team_id ? `<span style="display:inline-flex; align-items:center; gap:4px; font-size:0.75rem; color:var(--accent-primary); background:rgba(124,92,255,0.12); padding:2px 8px; border-radius:6px; font-weight:600;"><i data-feather="users" style="width:11px;height:11px;"></i> Progetto Team</span>` : `<span style="font-size:0.75rem; color:var(--text-muted); background:rgba(255,255,255,0.05); padding:2px 8px; border-radius:6px;">Personale</span>`}
                    </div>
                </div>
            </div>
            <div class="history-actions">
                <button class="btn btn-primary btn-sm" onclick="triggerDownload('${item.downloadUrl}', '${escapeHtml(item.filename)}')">
                    <i data-feather="download" style="width:14px;height:14px;margin-right:4px;"></i> Scarica PDF
                </button>
                <button class="btn btn-secondary btn-sm" onclick="reopenFromHistory(${item.id})" title="Riapri per modificare">
                    <i data-feather="edit-2" style="width:14px;height:14px;margin-right:4px;"></i> Modifica
                </button>
                <button class="btn btn-outline btn-sm" onclick="openProjectTeamModal(${item.id})" title="Lavora in team su questo progetto" style="border-color:rgba(124,92,255,0.45); color:var(--accent-primary); font-weight:600; background:rgba(124,92,255,0.06);">
                    <i data-feather="users" style="width:13px;height:13px;margin-right:4px;"></i> Team
                </button>
                <button class="btn btn-outline btn-sm" onclick="openShareModal(${item.id})" title="Condividi rassegna con cliente">
                    <i data-feather="share-2" style="width:14px;height:14px;"></i>
                </button>
                <button class="btn btn-outline btn-sm" onclick="openMorningDigestFromHistory(${item.id})" title="Briefing Esecutivo AI">
                    <i data-feather="zap" style="width:14px;height:14px;color:var(--accent-primary);"></i>
                </button>
                <button class="btn btn-danger btn-sm" onclick="deleteHistory(${item.id})" title="Elimina rassegna">
                    <i data-feather="trash-2" style="width:14px;height:14px;"></i>
                </button>
            </div>
        `;
        itemsContainer.appendChild(itemRow);
    });

    card.appendChild(itemsContainer);
    container.appendChild(card);
}

function resetHistoryFilters() {
    const searchInput  = document.getElementById('historySearchInput');
    const clientSelect = document.getElementById('historyClientFilter');
    const inputFrom    = document.getElementById('historyDateFrom');
    const inputTo      = document.getElementById('historyDateTo');
    const presetSel    = document.getElementById('historyPeriodPreset');
    const btnReset     = document.getElementById('btnResetDates');
    if (searchInput)  searchInput.value = '';
    if (clientSelect) clientSelect.value = 'all';
    if (inputFrom)    inputFrom.value = '';
    if (inputTo)      inputTo.value = '';
    if (presetSel)    presetSel.value = 'all';
    if (btnReset)     btnReset.style.display = 'none';
    updateDateChipsActive('all');
    filterAndRenderHistory();
}
window.resetHistoryFilters = resetHistoryFilters;

// ── GESTIONE SELEZIONE E AZIONI CUMULATIVE ──────────────────────────────────

function toggleSelectReview(id, checked) {
    if (checked) {
        selectedHistoryIds.add(id);
    } else {
        selectedHistoryIds.delete(id);
    }
    const itemEl = document.getElementById(`history-item-${id}`);
    if (itemEl) itemEl.classList.toggle('selected', checked);
    updateBatchActionsBar();
}
window.toggleSelectReview = toggleSelectReview;

function toggleGroupSelection(ids, checked) {
    ids.forEach(id => {
        if (checked) {
            selectedHistoryIds.add(id);
        } else {
            selectedHistoryIds.delete(id);
        }
        const itemEl = document.getElementById(`history-item-${id}`);
        if (itemEl) {
            itemEl.classList.toggle('selected', checked);
            const chk = itemEl.querySelector('.item-checkbox');
            if (chk) chk.checked = checked;
        }
    });
    updateBatchActionsBar();
}
window.toggleGroupSelection = toggleGroupSelection;

function toggleSelectAllVisible(checked) {
    const allVisibleCheckboxes = document.querySelectorAll('#historyList .item-checkbox');
    allVisibleCheckboxes.forEach(chk => {
        const id = parseInt(chk.dataset.id);
        if (!isNaN(id)) {
            if (checked) selectedHistoryIds.add(id);
            else selectedHistoryIds.delete(id);
            chk.checked = checked;
            const itemEl = document.getElementById(`history-item-${id}`);
            if (itemEl) itemEl.classList.toggle('selected', checked);
        }
    });
    document.querySelectorAll('#historyList .group-checkbox').forEach(gc => gc.checked = checked);
    updateBatchActionsBar();
}
window.toggleSelectAllVisible = toggleSelectAllVisible;

function deselectAllReviews() {
    selectedHistoryIds.clear();
    document.querySelectorAll('#historyList .item-checkbox').forEach(c => c.checked = false);
    document.querySelectorAll('#historyList .group-checkbox').forEach(c => c.checked = false);
    document.querySelectorAll('#historyList .history-item').forEach(it => it.classList.remove('selected'));
    const chkAll = document.getElementById('chkSelectAllVisible');
    if (chkAll) chkAll.checked = false;
    updateBatchActionsBar();
}
window.deselectAllReviews = deselectAllReviews;

function updateBatchActionsBar() {
    const bar = document.getElementById('historyBatchActions');
    const badge = document.getElementById('selectedCountBadge');
    if (!bar || !badge) return;

    const count = selectedHistoryIds.size;
    if (count > 0) {
        bar.style.display = 'flex';
        badge.textContent = `${count} selezionat${count === 1 ? 'a' : 'e'}`;
    } else {
        bar.style.display = 'none';
    }
}

// ── ESPORTAZIONE E DOWNLOAD CUMULATIVO ──────────────────────────────────────

async function downloadSelectedReviews() {
    if (selectedHistoryIds.size === 0) {
        showToast('Nessuna rassegna selezionata.', 'warning');
        return;
    }

    const itemsToDownload = rawHistoryItems.filter(it => selectedHistoryIds.has(it.id));
    if (itemsToDownload.length === 0) return;

    const btn = document.getElementById('btnDownloadSelected');
    if (btn) {
        btn.disabled = true;
        btn.textContent = `Download di ${itemsToDownload.length} PDF...`;
    }

    showToast(`Avvio download di ${itemsToDownload.length} rassegne in corso...`, 'info');

    let count = 0;
    for (const item of itemsToDownload) {
        triggerDownload(item.downloadUrl, item.filename);
        count++;
        await new Promise(r => setTimeout(r, 450));
    }

    if (btn) {
        btn.disabled = false;
        btn.innerHTML = `<i data-feather="download" style="width:14px;height:14px;"></i> Scarica Selezionate`;
        if (window.feather) feather.replace();
    }

    showToast(`Tutti i ${count} PDF sono stati avviati per il download!`, 'success');
}
window.downloadSelectedReviews = downloadSelectedReviews;

async function downloadGroupReviews(ids) {
    if (!ids || ids.length === 0) return;
    const items = rawHistoryItems.filter(it => ids.includes(it.id));
    showToast(`Avvio download di ${items.length} rassegne...`, 'info');
    for (const item of items) {
        triggerDownload(item.downloadUrl, item.filename);
        await new Promise(r => setTimeout(r, 450));
    }
    showToast(`Download di ${items.length} rassegne completato!`, 'success');
}
window.downloadGroupReviews = downloadGroupReviews;

function exportHistoryCsv() {
    const searchInput  = document.getElementById('historySearchInput');
    const clientSelect = document.getElementById('historyClientFilter');
    const inputFrom    = document.getElementById('historyDateFrom');
    const inputTo      = document.getElementById('historyDateTo');
    const query = (searchInput?.value || '').toLowerCase().trim();
    const selClient = clientSelect?.value || 'all';
    const dateFrom  = (inputFrom?.value || '').trim();
    const dateTo    = (inputTo?.value || '').trim();

    let itemsToExport = rawHistoryItems.filter(item => {
        if (selectedHistoryIds.size > 0) {
            return selectedHistoryIds.has(item.id);
        }
        if (query) {
            const titleMatch  = (item.title || '').toLowerCase().includes(query);
            const clientMatch = (item.client_name || '').toLowerCase().includes(query);
            if (!titleMatch && !clientMatch) return false;
        }
        if (selClient !== 'all') {
            if (selClient === '__none__') {
                if ((item.client_name || '').trim() !== '') return false;
            } else {
                if ((item.client_name || '').trim() !== selClient) return false;
            }
        }
        const itemDateKey = getItemDateKey(item.created_at);
        if (dateFrom && itemDateKey < dateFrom) return false;
        if (dateTo && itemDateKey > dateTo) return false;
        return true;
    });

    if (itemsToExport.length === 0) {
        showToast('Nessuna rassegna da esportare.', 'warning');
        return;
    }

    // Costruisce il file CSV
    const rows = [
        ['ID', 'Titolo Rassegna', 'Cliente', 'Data Creazione', 'Ora', 'Numero Articoli', 'Nome File PDF', 'Link Download']
    ];

    const origin = window.location.origin;

    itemsToExport.forEach(it => {
        const d = new Date(it.created_at);
        const dateStr = !isNaN(d.getTime()) ? d.toLocaleDateString('it-IT') : '';
        const timeStr = !isNaN(d.getTime()) ? d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' }) : '';
        rows.push([
            it.id,
            `"${(it.title || '').replace(/"/g, '""')}"`,
            `"${(it.client_name || 'Generale').replace(/"/g, '""')}"`,
            dateStr,
            timeStr,
            it.article_count,
            `"${(it.filename || '').replace(/"/g, '""')}"`,
            `${origin}${it.downloadUrl}`
        ]);
    });

    const csvContent = "\uFEFF" + rows.map(e => e.join(';')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const today = new Date().toISOString().slice(0, 10);
    a.download = `Indice_Rassegne_${today}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    showToast(`Indice esportato con successo (${itemsToExport.length} rassegne)!`, 'success');
}
window.exportHistoryCsv = exportHistoryCsv;

// ── CARICAMENTO STORICO DAL SERVER ──────────────────────────────────────────

async function loadHistory() {
    const list = document.getElementById('historyList');
    if (!list) return;

    // Cache locale rapida per evitare schermate vuote
    const cachedStr = localStorage.getItem('rs_cached_history');
    if (cachedStr && rawHistoryItems.length === 0) {
        try {
            const cached = JSON.parse(cachedStr);
            if (Array.isArray(cached) && cached.length > 0) {
                rawHistoryItems = cached;
                populateHistoryFilters(rawHistoryItems);
                filterAndRenderHistory();
            }
        } catch (e) {}
    }

    try {
        const history = await apiCall('GET', '/api/pdf/history');
        if (Array.isArray(history)) {
            rawHistoryItems = history;
            try { localStorage.setItem('rs_cached_history', JSON.stringify(history)); } catch (e) {}
            populateHistoryFilters(rawHistoryItems);
            filterAndRenderHistory();
        }
    } catch (error) {
        if (rawHistoryItems.length === 0) {
            list.innerHTML = `
                <div class="empty-state" style="text-align:center; padding:2rem;">
                    <p style="color:var(--danger-color, #dc2626); margin-bottom:12px;">Impossibile caricare lo storico: ${escapeHtml(error.message)}</p>
                    <button class="btn btn-outline btn-sm" onclick="loadHistory()">Riprova</button>
                </div>`;
        }
    }
}
window.loadHistory = loadHistory;

async function deleteHistory(id) {
    if (!confirm('Sei sicuro di voler eliminare questa rassegna?')) return;
    
    try {
        await apiCall('DELETE', `/api/pdf/${id}`);
        showToast('Rassegna eliminata dallo storico', 'success');
        loadHistory();
    } catch (error) {
        showToast(error.message, 'error');
    }
}

async function reopenFromHistory(reviewId) {
    try {
        // Se l'utente ha articoli attualmente aperti e sta aprendo una rassegna DIVERSA
        if (state.articles && state.articles.length > 0 && state.currentReviewId != reviewId) {
            showToast('Salvataggio automatico della rassegna precedente nello Storico...', 'info');
            const currentTitle = document.getElementById('rassegnaTitle')?.value.trim() || ('Rassegna Stampa del ' + new Date().toLocaleDateString('it-IT'));
            const currentClientName = document.getElementById('clientName')?.value.trim() || '';
            const currentClientLogo = state.clientLogoBase64 || null;

            try {
                await apiCall('POST', '/api/pdf/archive', {
                    id: state.currentReviewId || undefined,
                    articles: state.articles,
                    title: currentTitle,
                    clientName: currentClientName,
                    clientLogo: currentClientLogo
                });
                showToast('Rassegna precedente archiviata con successo nello Storico!', 'success');
            } catch (saveErr) {
                console.warn('Auto-save error before reopen:', saveErr);
                const proceed = confirm(`Non è stato possibile salvare automaticamente la rassegna attuale (${saveErr.message}).\n\nVuoi comunque procedere e caricare quella selezionata?`);
                if (!proceed) {
                    return; // Protegge il lavoro dell'utente da perdite
                }
            }
        }

        showToast('Caricamento rassegna per modifica...', 'info');
        const data = await apiCall('GET', `/api/pdf/review/${reviewId}`);
        if (data.articles && data.articles.length > 0) {
            state.currentReviewId = data.id;
            sessionStorage.setItem('rs_draft_review_id', data.id);
            state.articles = data.articles;
            
            const titleEl = document.getElementById('rassegnaTitle');
            if (titleEl) titleEl.value = data.title || '';

            const clientEl = document.getElementById('clientName');
            if (clientEl) clientEl.value = data.clientName || '';

            if (data.clientLogo) {
                state.clientLogoBase64 = data.clientLogo;
                const logoPrev = document.getElementById('clientLogoPreview');
                const logoPrevCont = document.getElementById('clientLogoPreviewContainer');
                if (logoPrev && logoPrevCont) {
                    logoPrev.src = data.clientLogo;
                    logoPrevCont.style.display = 'flex';
                }
            } else {
                state.clientLogoBase64 = null;
                const logoPrev = document.getElementById('clientLogoPreview');
                const logoPrevCont = document.getElementById('clientLogoPreviewContainer');
                if (logoPrev) logoPrev.src = '';
                if (logoPrevCont) logoPrevCont.style.display = 'none';
            }

            renderArticles();
            loadHistory(); // Ricarica lo storico per mostrare la rassegna precedente appena auto-salvata
            const rassegnaNav = document.querySelector('.sidebar-item[data-page="rassegna"]');
            if (rassegnaNav) rassegnaNav.click();
            window.scrollTo({ top: 0, behavior: 'smooth' });
            if (typeof refreshProjectModalData === 'function') refreshProjectModalData(data.id);
            showToast('Rassegna riaperta per la modifica!', 'success');
        } else {
            showToast('Nessun articolo trovato in questa rassegna.', 'warning');
        }
    } catch (err) {
        showToast('Errore nel caricamento della rassegna: ' + err.message, 'error');
    }
}

// --- INITIALIZATION & EVENT LISTENERS ---

document.addEventListener('DOMContentLoaded', () => {
    feather.replace();
    // Auth page specific
    const loginForm = document.getElementById('loginForm');
    const registerForm = document.getElementById('registerForm');
    
    if (loginForm) loginForm.addEventListener('submit', handleLogin);
    if (registerForm) registerForm.addEventListener('submit', handleRegister);
    
    // Dashboard specific
    if (window.location.pathname.includes('dashboard')) {
        loadProfile();
        loadClients();

        // Template Selector Cards Listener
        document.querySelectorAll('.template-card[data-template]').forEach(card => {
            card.addEventListener('click', () => {
                document.querySelectorAll('.template-card').forEach(c => {
                    c.classList.remove('active');
                    c.style.border = '1px solid var(--border-color)';
                    c.style.background = 'var(--bg-secondary)';
                    c.querySelector('.template-check')?.classList.add('hidden');
                });
                card.classList.add('active');
                card.style.border = '2px solid var(--accent-primary)';
                card.style.background = 'rgba(124,92,255,0.05)';
                card.querySelector('.template-check')?.classList.remove('hidden');
                selectedTemplateId = card.dataset.template;
            });
        });

        // Client Selector Event Listeners
        const handleSelectChange = (e) => applyActiveClient(e.target.value);
        document.getElementById('globalClientSelect')?.addEventListener('change', handleSelectChange);
        document.getElementById('activeClientSelector')?.addEventListener('change', handleSelectChange);

        document.getElementById('btnManageClient')?.addEventListener('click', openClientModal);
        document.getElementById('btnManageClients')?.addEventListener('click', openClientModal);
        document.getElementById('btnCloseClientModal')?.addEventListener('click', closeClientModal);
        document.getElementById('btnCancelClientEdit')?.addEventListener('click', resetClientForm);
        document.getElementById('btnSaveClient')?.addEventListener('click', saveClientFromForm);

        document.getElementById('clientLogoFileInput')?.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (!file) return;
            clientFormLogoBase64 = await fileToBase64(file);
            const logoPrevContainer = document.getElementById('clientLogoPreviewContainer');
            const logoPrev = document.getElementById('clientLogoPreview');
            if (logoPrevContainer && logoPrev) {
                logoPrev.src = clientFormLogoBase64;
                logoPrevContainer.classList.remove('hidden');
            }
            e.target.value = '';
        });

        // ── Restore editor state if coming back from editor ──
        const savedEditorState = localStorage.getItem('rs_editor_state');
        if (savedEditorState) {
            try {
                const editorState = JSON.parse(savedEditorState);
                if (editorState.articles && editorState.articles.length > 0) {
                    state.articles = editorState.articles;
                    if (editorState.currentReviewId) {
                        state.currentReviewId = editorState.currentReviewId;
                        sessionStorage.setItem('rs_draft_review_id', editorState.currentReviewId);
                    }

                    // Restore title
                    const titleInput = document.getElementById('rassegnaTitle');
                    if (titleInput && editorState.options?.title) {
                        titleInput.value = editorState.options.title;
                    }

                    // Restore client name
                    const clientInput = document.getElementById('clientName');
                    if (clientInput && editorState.options?.clientName) {
                        clientInput.value = editorState.options.clientName;
                    }

                    // Restore client logo
                    if (editorState.options?.clientLogo) {
                        state.clientLogoBase64 = editorState.options.clientLogo;
                        const prev = document.getElementById('clientLogoPreview');
                        const prevCont = document.getElementById('clientLogoPreviewContainer');
                        if (prev) prev.src = state.clientLogoBase64;
                        if (prevCont) prevCont.style.display = 'flex';
                    }

                    renderArticles();
                    showToast(`${state.articles.length} articoli ripristinati dall'editor`, 'success');
                }
            } catch(e) {
                localStorage.removeItem('rs_editor_state');
            }
        } else if (state.articles.length === 0) {
            // Restore draft articles on simple page refresh
            const savedDraft = sessionStorage.getItem('rs_draft_articles');
            if (savedDraft) {
                try {
                    const draft = JSON.parse(savedDraft);
                    if (Array.isArray(draft) && draft.length > 0) {
                        state.articles = draft;
                        const savedReviewId = sessionStorage.getItem('rs_draft_review_id');
                        if (savedReviewId) {
                            state.currentReviewId = parseInt(savedReviewId, 10) || null;
                        }
                        renderArticles();
                    }
                } catch(e) {
                    sessionStorage.removeItem('rs_draft_articles');
                    sessionStorage.removeItem('rs_draft_review_id');
                }
            }
        }
        
        // ── Auto-open team project if redirected from accept-invite ──
        const autoProject = localStorage.getItem('rs_open_review');
        if (autoProject) {
            localStorage.removeItem('rs_open_review');
            setTimeout(() => {
                reopenFromHistory(parseInt(autoProject, 10));
                showToast('Progetto condiviso del team aperto con successo!', 'success');
            }, 350);
        } else if (state.currentReviewId) {
            setTimeout(() => {
                if (typeof refreshProjectModalData === 'function') {
                    refreshProjectModalData(state.currentReviewId);
                }
            }, 350);
        }
        
        document.getElementById('btnLogout').addEventListener('click', () => {
            localStorage.removeItem('rs_token');
            window.location.href = 'index.html';
        });
        
        // Profile toggle
        const toggleProfile = document.getElementById('toggleProfile');
        if (toggleProfile) {
            toggleProfile.addEventListener('click', () => {
                const content = document.getElementById('profileContent');
                const icon = toggleProfile.querySelector('.icon-toggle');
                if (content.style.display === 'none') {
                    content.style.display = 'block';
                    icon.classList.add('open');
                } else {
                    content.style.display = 'none';
                    icon.classList.remove('open');
                }
            });
        }
        
        document.getElementById('btnSaveProfile')?.addEventListener('click', saveProfile);
        document.getElementById('btnRemoveLogo')?.addEventListener('click', removeLogo);
        
        // Drag & Drop
        const dropZone = document.getElementById('dropZone');
        const logoInput = document.getElementById('logoInput');
        
        if (dropZone && logoInput) {
            dropZone.addEventListener('click', () => logoInput.click());
            
            logoInput.addEventListener('change', (e) => {
                if (e.target.files && e.target.files[0]) {
                    handleLogoUpload(e.target.files[0]);
                }
            });
            
            dropZone.addEventListener('dragover', (e) => {
                e.preventDefault();
                dropZone.classList.add('dragover');
            });
            
            dropZone.addEventListener('dragleave', (e) => {
                e.preventDefault();
                dropZone.classList.remove('dragover');
            });
            
            dropZone.addEventListener('drop', (e) => {
                e.preventDefault();
                dropZone.classList.remove('dragover');
                if (e.dataTransfer.files && e.dataTransfer.files[0]) {
                    handleLogoUpload(e.dataTransfer.files[0]);
                }
            });
        }
        
        // Articles
        document.getElementById('btnAddArticle')?.addEventListener('click', addArticle);
        document.getElementById('articleUrl')?.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') addArticle();
        });

        // Paste URL Helper Button
        document.getElementById('btnPasteUrl')?.addEventListener('click', async () => {
            try {
                const text = await navigator.clipboard.readText();
                if (text && text.trim()) {
                    const urlInput = document.getElementById('articleUrl');
                    if (urlInput) {
                        urlInput.value = text.trim();
                        urlInput.focus();
                        showToast('Link incollato dagli appunti', 'info');
                    }
                } else {
                    showToast('Nessun testo trovato negli appunti', 'warning');
                }
            } catch (err) {
                // If clipboard permission is not granted, simply focus the input
                document.getElementById('articleUrl')?.focus();
            }
        });
        
        // Manual Entry Modal
        document.getElementById('btnOpenManual')?.addEventListener('click', () => {
            document.getElementById('manualEntryModal').classList.remove('hidden');
        });
        document.getElementById('btnCloseManual')?.addEventListener('click', () => {
            document.getElementById('manualEntryModal').classList.add('hidden');
        });
        document.getElementById('btnSaveManual')?.addEventListener('click', saveManualArticle);
        
        // Generate PDF / Open Editor / Archive Review
        document.getElementById('btnGeneratePDF')?.addEventListener('click', generatePDF);
        document.getElementById('btnOpenEditor')?.addEventListener('click', openEditor);
        document.getElementById('btnArchiveReview')?.addEventListener('click', archiveReview);
        
        // Logo Archive Logic
        document.getElementById('logoSearchInput')?.addEventListener('input', (e) => {
            const term = e.target.value.toLowerCase();
            const filtered = logoArchive.filter(l => l.name.toLowerCase().includes(term));
            renderLogoArchive(filtered);
        });
        
        document.getElementById('btnCloseLogoArchive')?.addEventListener('click', closeLogoArchive);
        
        document.getElementById('manualLogoUpload')?.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (!file || currentEditingArticleIndex === -1) return;
            try {
                const base64 = await fileToBase64(file);
                state.articles[currentEditingArticleIndex].logoBase64 = base64;
                renderArticles();
                closeLogoArchive();
                showToast('Logo aggiornato manualmente', 'success');
            } catch (err) {
                showToast('Errore file', 'error');
            }
        });

        // Multi Link Modal
        document.getElementById('btnOpenMultiLink')?.addEventListener('click', openMultiLinkModal);
        document.getElementById('btnCloseMultiLink')?.addEventListener('click', closeMultiLinkModal);
        document.getElementById('btnCloseMultiLinkDone')?.addEventListener('click', closeMultiLinkModal);
        document.getElementById('btnStartMultiLink')?.addEventListener('click', startMultiLinkExtraction);
        document.getElementById('multiLinkTextarea')?.addEventListener('input', updateMultiLinkCount);

        // News Search Events
        document.getElementById('btnSearchNews')?.addEventListener('click', searchNews);
        document.getElementById('newsKeyword')?.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                searchNews();
            }
        });
        document.getElementById('btnResetSearchNews')?.addEventListener('click', resetNewsSearch);
        document.getElementById('btnSelectAllNews')?.addEventListener('click', () => toggleAllNewsSelection(true));
        document.getElementById('btnDeselectAllNews')?.addEventListener('click', () => toggleAllNewsSelection(false));
        document.getElementById('btnSaveCollection')?.addEventListener('click', saveNewsCollection);
        document.getElementById('btnUseSelectedNews')?.addEventListener('click', useSelectedNews);
        document.getElementById('btnRefreshCollections')?.addEventListener('click', loadNewsCollections);

        // Load collections initially
        if (state.token && document.getElementById('page-ricerca-notizie')) {
            loadNewsCollections();
        }
    }
});

// ============================================================
// MULTI LINK
// ============================================================

function openMultiLinkModal() {
    const modal = document.getElementById('multiLinkModal');
    // Reset to input state
    document.getElementById('multiLinkInputArea').classList.remove('hidden');
    document.getElementById('multiLinkProgress').classList.add('hidden');
    document.getElementById('mlResults').classList.add('hidden');
    document.getElementById('mlLogList').innerHTML = '';
    document.getElementById('mlProgressBar').style.width = '0%';
    document.getElementById('multiLinkTextarea').value = '';
    document.getElementById('multiLinkCount').textContent = '0 link inseriti';
    modal.classList.remove('hidden');
    setTimeout(() => document.getElementById('multiLinkTextarea').focus(), 100);
}

function closeMultiLinkModal() {
    document.getElementById('multiLinkModal').classList.add('hidden');
    // If articles were added, re-render
    renderArticles();
}

window.goToRassegnaFromModal = function() {
    closeMultiLinkModal();
    const rassegnaNav = document.querySelector('.sidebar-item[data-page="rassegna"]');
    if (rassegnaNav) {
        rassegnaNav.click();
    } else {
        const pageRassegna = document.getElementById('page-rassegna');
        if (pageRassegna) {
            document.querySelectorAll('.page-view').forEach(p => p.classList.remove('active'));
            pageRassegna.classList.add('active');
        }
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
    showToast('Nuova rassegna pronta con gli articoli estratti!', 'success');
};

function updateMultiLinkCount() {
    const urls = parseMultiLinkUrls();
    const count = urls.length;
    document.getElementById('multiLinkCount').textContent =
        count === 0 ? '0 link inseriti' : count === 1 ? '1 link valido' : `${count} link validi`;
}

function parseMultiLinkUrls() {
    const raw = document.getElementById('multiLinkTextarea').value;
    return raw.split('\n')
        .map(l => l.trim())
        .filter(l => {
            if (!l) return false;
            try { new URL(l); return true; } catch { return false; }
        })
        .slice(0, 50); // max 50
}

function mlLog(text, type = 'normal') {
    const log = document.getElementById('mlLogList');
    const item = document.createElement('div');
    item.className = `ml-log-item ml-log-${type}`;
    item.innerHTML = text;
    log.appendChild(item);
    log.scrollTop = log.scrollHeight;
    feather.replace();
}

async function startMultiLinkExtraction() {
    const urls = parseMultiLinkUrls();
    if (urls.length === 0) {
        showToast('Incolla almeno un link valido', 'warning');
        return;
    }
    if (urls.length > 50) {
        showToast('Massimo 50 link per volta', 'warning');
        return;
    }

    // Disable button to prevent double-click duplicates
    const startBtn = document.getElementById('btnStartMultiLink');
    startBtn.disabled = true;
    startBtn.innerHTML = '<div class="spinner" style="width:14px;height:14px;margin-right:6px;"></div> In elaborazione...';

    // Switch to progress view
    document.getElementById('multiLinkInputArea').classList.add('hidden');
    document.getElementById('multiLinkProgress').classList.remove('hidden');
    document.getElementById('mlResults').classList.add('hidden');
    document.getElementById('mlLogList').innerHTML = '';

    const total = urls.length;
    let succeeded = 0;
    let failed = 0;

    for (let i = 0; i < total; i++) {
        const url = urls[i];
        const current = i + 1;
        const pct = Math.round((i / total) * 100);

        // Update progress UI
        document.getElementById('mlProgressBar').style.width = `${pct}%`;
        document.getElementById('mlProgressLabel').textContent = `Estrazione ${current} di ${total}...`;
        document.getElementById('mlProgressCount').textContent = url.length > 55 ? url.slice(0, 55) + '...' : url;

        try {
            const article = await apiCall('POST', '/api/articles/extract', { url, skipScreenshot: true });
            state.articles.push(article);
            succeeded++;
            mlLog(`<i data-feather="check" style="color:var(--success);width:14px;height:14px;vertical-align:middle;"></i> ${article.source_name} — ${article.title.slice(0, 60)}${article.title.length > 60 ? '...' : ''}`, 'success');
        } catch (err) {
            failed++;
            const shortUrl = url.length > 55 ? url.slice(0, 55) + '...' : url;
            mlLog(`<i data-feather="x" style="color:var(--danger);width:14px;height:14px;vertical-align:middle;"></i> ${shortUrl} (${err.message || 'Errore estrazione'})`, 'error');
        }
    }

    // Done!
    document.getElementById('mlProgressBar').style.width = '100%';
    document.getElementById('mlProgressLabel').textContent = 'Estrazione completata!';
    document.getElementById('mlProgressCount').textContent = '';

    document.getElementById('mlResultTitle').textContent =
        `${succeeded} articolo${succeeded === 1 ? '' : 'i'} estratto${succeeded === 1 ? '' : 'i'} con successo`;
    document.getElementById('mlResultSub').textContent =
        failed > 0 ? `${failed} link non estratto${failed === 1 ? '' : 'i'} (sito non supportato o bloccato)` : 'Tutti i link sono stati elaborati correttamente!';
    document.getElementById('mlResults').classList.remove('hidden');

    // Switch to rassegna page only after extraction is triggered and finished
    if (succeeded > 0) {
        document.querySelector('[data-page=rassegna]')?.click();
    }

    // Re-enable button for potential re-use
    startBtn.disabled = false;
    startBtn.innerHTML = '<i data-feather="zap" style="width:16px;height:16px;vertical-align:middle;margin-right:4px;"></i> Estrai tutti';
    feather.replace();
}

// Logo Archive Functions
function openLogoArchive(idx) {
    currentEditingArticleIndex = idx;
    document.getElementById('logoArchiveModal').classList.remove('hidden');
    document.getElementById('logoSearchInput').value = '';
    
    if (!logoArchive || logoArchive.length === 0) {
        fetch('/assets/logos.json?v=' + Date.now())
            .then(res => res.json())
            .then(data => {
                logoArchive = data;
                renderLogoArchive(logoArchive);
            })
            .catch(() => renderLogoArchive([]));
    } else {
        renderLogoArchive(logoArchive);
    }
}

function closeLogoArchive() {
    document.getElementById('logoArchiveModal').classList.add('hidden');
    currentEditingArticleIndex = -1;
    document.getElementById('manualLogoUpload').value = '';
}

function renderLogoArchive(logos) {
    const grid = document.getElementById('logoGrid');
    grid.innerHTML = '';
    if (!logos || logos.length === 0) {
        grid.innerHTML = '<p style="color: var(--text-muted); grid-column: 1 / -1; text-align: center; padding: 2rem;">Nessun logo trovato.</p>';
        return;
    }
    
    logos.forEach(logo => {
        const div = document.createElement('div');
        div.className = 'logo-picker-item';
        div.style.cssText = 'background: rgba(255,255,255,0.03); border: 1px solid var(--border-color); border-radius: 8px; padding: 0.75rem 0.5rem; text-align: center; cursor: pointer; transition: all 0.2s ease; display: flex; flex-direction: column; justify-content: space-between; align-items: center; min-height: 110px; user-select: none;';
        div.onmouseover = () => {
            div.style.borderColor = 'var(--accent-primary)';
            div.style.background = 'rgba(124, 92, 255, 0.08)';
            div.style.transform = 'translateY(-2px)';
            div.style.boxShadow = '0 6px 16px rgba(0,0,0,0.25)';
        };
        div.onmouseout = () => {
            div.style.borderColor = 'var(--border-color)';
            div.style.background = 'rgba(255,255,255,0.03)';
            div.style.transform = 'translateY(0)';
            div.style.boxShadow = 'none';
        };
        div.onclick = () => selectLogoFromArchive(logo.url, logo.name);
        
        // Percorsi locali o data:URI usati direttamente, percorsi esterni via proxy
        const imgSrc = (logo.url && (logo.url.startsWith('/') || logo.url.startsWith('data:')))
            ? logo.url
            : (logo.url ? `/api/proxy-image?url=${encodeURIComponent(logo.url)}` : '');

        div.innerHTML = `
            <div style="width: 100%; height: 50px; background: #ffffff; border-radius: 6px; display: flex; align-items: center; justify-content: center; padding: 4px 8px; margin-bottom: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.12); overflow: hidden;">
                <img src="${imgSrc}" alt="${logo.name}" loading="lazy" style="max-width: 100%; max-height: 42px; width: auto; height: auto; object-fit: contain;" onerror="this.parentElement.style.background='rgba(255,255,255,0.05)'; this.style.display='none';">
            </div>
            <span style="font-size: 0.78rem; font-weight: 500; color: var(--text-primary); line-height: 1.25; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;" title="${logo.name}">${logo.name}</span>
        `;
        grid.appendChild(div);
    });
}

async function selectLogoFromArchive(url, name) {
    if (currentEditingArticleIndex === -1) return;
    try {
        state.articles[currentEditingArticleIndex].logoBase64 = url;
        state.articles[currentEditingArticleIndex].source_logo = url;
        if (name && (!state.articles[currentEditingArticleIndex].source_name || state.articles[currentEditingArticleIndex].source_name === 'Fonte' || state.articles[currentEditingArticleIndex].source_name === 'Web')) {
            state.articles[currentEditingArticleIndex].source_name = name;
        }
        sessionStorage.setItem('rs_draft_articles', JSON.stringify(state.articles));
        renderArticles();
        closeLogoArchive();
        showToast(`Logo ${name ? '"' + name + '" ' : ''}aggiornato!`, 'success');
    } catch (err) {
        console.error(err);
        showToast("Errore durante l'aggiornamento del logo", 'error');
    }
}
window.openLogoArchive = openLogoArchive;
window.closeLogoArchive = closeLogoArchive;
window.selectLogoFromArchive = selectLogoFromArchive;

// ============================================================
// NEWS SEARCH & COLLECTIONS
// ============================================================
let currentNewsResults = [];
let selectedNewsIndices = new Set();
let activeNewsSourceFilter = 'all';

window.toggleQuickFiltersPanel = function(btn) {
    try {
        const panel = document.getElementById('quickFiltersPanel');
        if (!panel) return;
        const isHidden = panel.classList.contains('hidden');
        if (isHidden) {
            panel.classList.remove('hidden');
            panel.style.display = 'block';
        } else {
            panel.classList.add('hidden');
            panel.style.display = 'none';
        }
        const chevron = btn ? btn.querySelector('.icon-toggle-filter') : document.querySelector('.icon-toggle-filter');
        if (chevron) {
            chevron.style.transform = isHidden ? 'rotate(180deg)' : 'rotate(0deg)';
        }
    } catch(err) {
        console.error('toggleQuickFiltersPanel error:', err);
    }
};

window.onNewsDateRangeSelectChange = function(val) {
    const customBox = document.getElementById('customDateRangeBox');
    if (val === 'custom') {
        if (customBox) {
            customBox.classList.remove('hidden');
            customBox.style.display = 'grid';
        }
    } else {
        if (customBox) {
            customBox.classList.add('hidden');
            customBox.style.display = 'none';
        }
        setNewsDatePreset(val);
    }
};

window.setNewsDatePreset = function(preset, btn) {
    try {
        document.querySelectorAll('.news-date-preset').forEach(b => b.classList.remove('active'));
        if (btn) btn.classList.add('active');

        const toDate = new Date();
        let fromDate = new Date();

        if (preset === 'today') {
            fromDate = new Date();
        } else if (preset === '3days') {
            fromDate.setDate(toDate.getDate() - 3);
        } else if (preset === '7days') {
            fromDate.setDate(toDate.getDate() - 7);
        } else if (preset === '30days') {
            fromDate.setDate(toDate.getDate() - 30);
        }

        const formatDateStr = d => {
            const year = d.getFullYear();
            const month = String(d.getMonth() + 1).padStart(2, '0');
            const day = String(d.getDate()).padStart(2, '0');
            return `${year}-${month}-${day}`;
        };
        
        const fromInput = document.getElementById('newsDateFrom');
        if (fromInput) fromInput.value = formatDateStr(fromDate);
        const toInput = document.getElementById('newsDateTo');
        if (toInput) toInput.value = formatDateStr(toDate);

        showToast('Filtro data impostato', 'info');
    } catch(err) {
        console.error('setNewsDatePreset error:', err);
    }
};

window.filterNewsSource = function(category, btn) {
    try {
        activeNewsSourceFilter = category;
        document.querySelectorAll('.news-source-filter').forEach(b => b.classList.remove('active'));
        if (btn) btn.classList.add('active');
        renderNewsResults();
    } catch(err) {
        console.error('filterNewsSource error:', err);
    }
};

let excludeSocialNetworks = true;

function toggleSocialFilter(btn) {
    excludeSocialNetworks = !excludeSocialNetworks;
    if (excludeSocialNetworks) {
        btn.classList.add('active');
        btn.innerHTML = '<i data-feather="shield-off" style="width:12px;height:12px;vertical-align:middle;margin-right:4px;"></i> Social Network: Esclusi (Default)';
    } else {
        btn.classList.remove('active');
        btn.innerHTML = '<i data-feather="share-2" style="width:12px;height:12px;vertical-align:middle;margin-right:4px;"></i> Social Network: Inclusi';
    }
    feather.replace();
}

function resetNewsSearch() {
    const kw = document.getElementById('newsKeyword');
    if (kw) kw.value = '';
    const df = document.getElementById('newsDateFrom');
    if (df) df.value = '';
    const dt = document.getElementById('newsDateTo');
    if (dt) dt.value = '';
    currentNewsResults = [];
    selectedNewsIndices.clear();
    const emptyState = document.getElementById('newsEmptyState');
    if (emptyState) emptyState.classList.remove('hidden');
    const grid = document.getElementById('newsResultsGrid');
    if (grid) grid.classList.add('hidden');
    const toolbar = document.getElementById('newsResultsToolbar');
    if (toolbar) toolbar.classList.add('hidden');
    updateNewsSelectionUI();
}
window.resetNewsSearch = resetNewsSearch;

async function searchNews() {
    const keywordInput = document.getElementById('newsKeyword');
    const q = keywordInput ? keywordInput.value.trim() : '';
    const fromInput = document.getElementById('newsDateFrom');
    const from = fromInput ? fromInput.value : '';
    const toInput = document.getElementById('newsDateTo');
    const to = toInput ? toInput.value : '';

    if (!q) return showToast('Inserisci una parola chiave per la ricerca', 'warning');

    const btn = document.getElementById('btnSearchNews');
    const originalText = btn ? btn.innerHTML : '';
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<div class="spinner" style="width:14px;height:14px;margin-right:4px;"></div> Ricerca...';
    }

    const emptyState = document.getElementById('newsEmptyState');
    const grid = document.getElementById('newsResultsGrid');
    const toolbar = document.getElementById('newsResultsToolbar');
    const loadingState = document.getElementById('newsLoadingState');

    if (emptyState) emptyState.classList.add('hidden');
    if (grid) grid.classList.add('hidden');
    if (toolbar) toolbar.classList.add('hidden');
    if (loadingState) loadingState.classList.remove('hidden');

    try {
        let url = `/api/news/search?q=${encodeURIComponent(q)}`;
        if (!excludeSocialNetworks) {
            url += `&includeSocial=true`;
        }
        // Convert YYYY-MM-DD to DD/MM/YYYY for backend
        if (from) {
            const [y, m, d] = from.split('-');
            url += `&from=${d}/${m}/${y}`;
        }
        if (to) {
            const [y, m, d] = to.split('-');
            url += `&to=${d}/${m}/${y}`;
        }

        const data = await apiCall('GET', url);
        currentNewsResults = data.results || [];

        selectedNewsIndices.clear();
        
        if (loadingState) loadingState.classList.add('hidden');
        
        if (currentNewsResults.length === 0) {
            if (emptyState) {
                emptyState.classList.remove('hidden');
                emptyState.innerHTML = '<div style="margin-bottom:1rem;"><i data-feather="search" style="width:48px;height:48px;color:var(--text-muted);"></i></div><p style="font-size:1.1rem; font-weight:600;">Nessun risultato trovato.</p><p style="font-size:0.9rem;">Prova con un\'altra parola chiave o allarga le date.</p>';
                if (typeof feather !== 'undefined') feather.replace();
            }
            return;
        } else {
            const countEl = document.getElementById('newsResultCount');
            if (countEl) countEl.textContent = `${currentNewsResults.length} risultati trovati`;
            if (toolbar) toolbar.classList.remove('hidden');
            renderNewsResults();
            updateNewsSelectionUI();
        }
    } catch (err) {
        if (loadingState) loadingState.classList.add('hidden');
        if (emptyState) emptyState.classList.remove('hidden');
        showToast(err.message, 'error');
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = originalText;
        }
        if (typeof feather !== 'undefined') feather.replace();
    }
}
window.searchNews = searchNews;

function renderNewsResults() {
    const grid = document.getElementById('newsResultsGrid');
    if (!grid) return;
    grid.innerHTML = '';
    grid.classList.remove('hidden');

    const filtered = currentNewsResults.filter((news) => {
        if (activeNewsSourceFilter === 'all') return true;
        const src = `${news.source || ''} ${news.domain || ''}`.toLowerCase();
        if (activeNewsSourceFilter === 'nazionale') {
            return src.includes('repubblica') || src.includes('corriere') || src.includes('lastampa') || src.includes('stampa') || 
                   src.includes('giornale') || src.includes('libero') || src.includes('sole24') || src.includes('sole') || 
                   src.includes('avvenire') || src.includes('fattoquotidiano') || src.includes('fatto') || src.includes('messaggero') || 
                   src.includes('iltempo') || src.includes('tempo') || src.includes('foglio') || src.includes('manifesto') || 
                   src.includes('verita') || src.includes('quotidiano.net') || src.includes('lidentita');
        }
        if (activeNewsSourceFilter === 'locale') {
            return src.includes('lecco') || src.includes('sannio') || src.includes('benevento') || src.includes('mattino') || 
                   src.includes('gazzettino') || src.includes('gazzetta') || src.includes('resto') || src.includes('carlino') || 
                   src.includes('nazione') || src.includes('giorno') || src.includes('secolo') || src.includes('tirreno') || 
                   src.includes('arena') || src.includes('brescia') || src.includes('bergamo') || src.includes('adige') || 
                   src.includes('trentino') || src.includes('padova') || src.includes('vicenza') || src.includes('treviso') || 
                   src.includes('venezia') || src.includes('verona') || src.includes('friuli') || src.includes('piccolo') || 
                   src.includes('unione sarda') || src.includes('nuova sardegna') || src.includes('sicilia') || src.includes('calabria') || 
                   src.includes('puglia') || src.includes('bari') || src.includes('lecce') || src.includes('foggia') || 
                   src.includes('taranto') || src.includes('lucania') || src.includes('basilicata') || src.includes('salerno') || 
                   src.includes('caserta') || src.includes('campania') || src.includes('abruzzo') || src.includes('umbria') || 
                   src.includes('marche') || src.includes('emilia') || src.includes('romagna') || src.includes('bologna') || 
                   src.includes('parma') || src.includes('modena') || src.includes('reggio') || src.includes('torino') || 
                   src.includes('cuneo') || src.includes('alessandria') || src.includes('genova') || src.includes('liguria') || 
                   src.includes('milano') || src.includes('como') || src.includes('varese') || src.includes('monza') || 
                   src.includes('lombardia') || src.includes('roma') || src.includes('latina') || src.includes('lazio');
        }
        if (activeNewsSourceFilter === 'web') {
            return src.includes('web') || src.includes('fanpage') || src.includes('open.online') || src.includes('open') || 
                   src.includes('diario') || src.includes('ilpost') || src.includes('post') || src.includes('today') || 
                   src.includes('tpi') || src.includes('tgcom') || src.includes('huffington') || src.includes('wired') || 
                   src.includes('linkiesta') || src.includes('sky') || src.includes('notizie');
        }
        if (activeNewsSourceFilter === 'agenzia') {
            return src.includes('ansa') || src.includes('adnkronos') || src.includes('agi') || src.includes('askanews') || 
                   src.includes('dire') || src.includes('lapresse') || src.includes('italpress') || src.includes('teleborsa') || 
                   src.includes('agenzianova');
        }
        return true;
    });

    if (filtered.length === 0) {
        grid.innerHTML = '<div style="grid-column:1/-1; text-align:center; padding:3rem; color:var(--text-muted);">Nessuna notizia corrispondente al filtro fonti selezionato.</div>';
        return;
    }

    filtered.forEach((news) => {
        const idx = currentNewsResults.indexOf(news);
        const isSelected = selectedNewsIndices.has(idx);
        const card = document.createElement('div');
        card.className = `news-card ${isSelected ? 'selected' : ''}`;
        card.onclick = () => toggleNewsSelection(idx);
        
        card.innerHTML = `
            <div style="display:flex; align-items:center; gap:0.5rem; margin-bottom:0.75rem;">
                ${news.favicon ? `<img src="${news.favicon}" alt="" style="width:16px;height:16px;">` : '<i data-feather="globe" style="width:16px;height:16px;color:var(--text-muted);"></i>'}
                <span style="font-size:0.8rem; font-weight:600; color:var(--text-muted); text-transform:uppercase; letter-spacing:0.5px;">${news.source}</span>
                <span style="font-size:0.8rem; color:var(--text-muted); margin-left:auto;">${news.date}</span>
            </div>
            <h4 style="margin:0 0 0.5rem 0; font-size:1rem; font-weight:700; line-height:1.4;">${news.title}</h4>
            <p style="font-size:0.85rem; color:var(--text-secondary); margin-bottom:0.5rem; line-height:1.5;">${news.snippet}...</p>
            <div style="display:flex; justify-content:space-between; align-items:center; margin-top:1rem; gap:0.5rem; flex-wrap:wrap;">
                <a href="${news.url}" target="_blank" onclick="event.stopPropagation()" style="color:var(--text-muted); font-size:0.8rem; text-decoration:none;"><i data-feather="external-link" style="width:12px;height:12px;vertical-align:middle;margin-right:2px;"></i> Apri link</a>
                <button type="button" class="btn-include-rassegna" onclick="includeSingleNewsInRassegna(${idx}, event)">
                    <i data-feather="plus-circle" style="width:13px;height:13px;"></i> Includi in rassegna
                </button>
                <div class="news-card-checkbox ${isSelected ? 'checked' : ''}"></div>
            </div>
        `;

        grid.appendChild(card);
    });
    feather.replace();
}

async function resolveAndInsertUrlsIntoRassegna(urls) {
    if (!urls || urls.length === 0) return;
    
    // Open multi-link modal on current page (do not redirect until user clicks Estrai tutti)
    openMultiLinkModal();
    const textarea = document.getElementById('multiLinkTextarea');
    if (textarea) {
        textarea.value = 'Risoluzione e pulizia link in corso...';
        updateMultiLinkCount();
    }

    try {
        const res = await apiCall('POST', '/api/news/resolve-urls', { urls });
        const resolved = res.resolvedUrls || urls;
        if (textarea) {
            textarea.value = resolved.join('\n');
            updateMultiLinkCount();
        }
    } catch(err) {
        if (textarea) {
            textarea.value = urls.join('\n');
            updateMultiLinkCount();
        }
    }
}

function includeSingleNewsInRassegna(idx, event) {
    if (event) event.stopPropagation();
    const news = currentNewsResults[idx];
    if (!news || !news.url) return;
    resolveAndInsertUrlsIntoRassegna([news.url]);
}


function toggleNewsSelection(idx) {
    if (selectedNewsIndices.has(idx)) {
        selectedNewsIndices.delete(idx);
    } else {
        selectedNewsIndices.add(idx);
    }
    renderNewsResults();
    updateNewsSelectionUI();
}

function toggleAllNewsSelection(select) {
    if (select) {
        currentNewsResults.forEach((_, idx) => selectedNewsIndices.add(idx));
    } else {
        selectedNewsIndices.clear();
    }
    renderNewsResults();
    updateNewsSelectionUI();
}

function updateNewsSelectionUI() {
    const count = selectedNewsIndices.size;
    document.getElementById('newsSelectedCount').textContent = `${count} selezionat${count === 1 ? 'o' : 'i'}`;
    const canAction = count > 0;
    document.getElementById('btnSaveCollection').disabled = !canAction;
    document.getElementById('btnUseSelectedNews').disabled = !canAction;
    if (canAction) {
        document.getElementById('btnSaveCollection').innerHTML = '<i data-feather="bookmark" style="width:14px;height:14px;vertical-align:middle;margin-right:4px;"></i> Salva raccolta';
        feather.replace();
    }
}

async function saveNewsCollection() {
    if (selectedNewsIndices.size === 0) return;
    const name = prompt('Dai un nome a questa raccolta (es. "Rassegna Tech Luglio"):');
    if (!name) return;

    const selectedLinks = Array.from(selectedNewsIndices).map(idx => currentNewsResults[idx]);
    const keyword = document.getElementById('newsKeyword').value.trim();

    try {
        const btn = document.getElementById('btnSaveCollection');
        btn.disabled = true;
        btn.innerText = 'Salvataggio...';

        await apiCall('POST', '/api/news/collections', { name, keyword, links: selectedLinks });
        showToast('Raccolta salvata con successo!', 'success');
        loadNewsCollections();
    } catch (err) {
        showToast('Errore durante il salvataggio: ' + err.message, 'error');
    } finally {
        updateNewsSelectionUI();
        document.getElementById('btnSaveCollection').innerHTML = '<i data-feather="bookmark" style="width:14px;height:14px;vertical-align:middle;margin-right:4px;"></i> Salva raccolta';
        feather.replace();
    }
}

async function loadNewsCollections() {
    const container = document.getElementById('newsCollectionsList');
    if (!container) return;
    container.innerHTML = '<div style="color:var(--text-muted); font-size:0.9rem;">Caricamento raccolte...</div>';
    try {
        const collections = await apiCall('GET', '/api/news/collections');
        if (collections.length === 0) {
            container.innerHTML = '<div style="color:var(--text-muted); font-size:0.9rem;">Nessuna raccolta salvata.</div>';
            return;
        }

        container.innerHTML = '';
        collections.forEach(coll => {
            const d = new Date(coll.created_at);
            const dateStr = `${d.getDate().toString().padStart(2,'0')}/${(d.getMonth()+1).toString().padStart(2,'0')} ${d.getHours()}:${d.getMinutes().toString().padStart(2,'0')}`;
            
            const div = document.createElement('div');
            div.style.cssText = 'background:rgba(255,255,255,0.03); border:1px solid var(--border-color); border-radius:8px; padding:1rem; margin-bottom:0.75rem; display:flex; justify-content:space-between; align-items:center;';
            div.innerHTML = `
                <div>
                    <h4 style="margin:0 0 4px 0; font-size:1rem; color:var(--text-primary);">${coll.name}</h4>
                    <div style="font-size:0.8rem; color:var(--text-muted); margin-bottom:0.75rem;">
                        ${coll.link_count} link • Creato il ${dateStr} ${coll.keyword ? `• Keyword: "${coll.keyword}"` : ''}
                    </div>
                </div>
                <div style="display:flex; gap:0.5rem;">
                    <button class="btn btn-outline btn-sm" onclick="useCollection(${coll.id})"><i data-feather="check" style="width:14px;height:14px;vertical-align:middle;margin-right:4px;"></i> Usa per Rassegna</button>
                    <button class="btn btn-outline btn-sm" style="color:var(--danger); border-color:rgba(255,107,107,0.3);" onclick="deleteCollection(${coll.id})"><i data-feather="trash-2" style="width:14px;height:14px;vertical-align:middle;"></i></button>
                </div>
            `;
            container.appendChild(div);
        });
        feather.replace();
    } catch (err) {
        container.innerHTML = '<div style="color:var(--danger); font-size:0.9rem;">Errore caricamento raccolte.</div>';
    }
}

async function useCollection(id) {
    try {
        const coll = await apiCall('GET', `/api/news/collections/${id}`);
        if (!coll.links || coll.links.length === 0) return showToast('La raccolta è vuota', 'warning');
        
        const urls = coll.links.map(l => l.url);
        resolveAndInsertUrlsIntoRassegna(urls);
        showToast(`Raccolta "${coll.name}" caricata pronta per l'estrazione`, 'success');
    } catch (err) {
        showToast('Errore caricamento raccolta', 'error');
    }
}

async function deleteCollection(id) {
    if (!confirm('Sei sicuro di voler eliminare questa raccolta?')) return;
    try {
        await apiCall('DELETE', `/api/news/collections/${id}`);
        showToast('Raccolta eliminata', 'success');
        loadNewsCollections();
    } catch (err) {
        showToast('Errore eliminazione', 'error');
    }
}

function useSelectedNews() {
    if (selectedNewsIndices.size === 0) return;
    const selectedLinks = Array.from(selectedNewsIndices).map(idx => currentNewsResults[idx].url);
    resolveAndInsertUrlsIntoRassegna(selectedLinks);
}

// ============================================================
// CLIENT MEMORY MANAGEMENT & WORKSPACE CONTEXT
// ============================================================
let userClients = [];
let activeClientId = localStorage.getItem('rs_active_client_id') || '';
let clientFormLogoBase64 = null;

async function loadClients() {
    if (!state.token) return;
    try {
        const res = await apiCall('GET', '/api/clients');
        userClients = res.clients || [];
        renderClientSelectors();
        
        if (activeClientId) {
            const exists = userClients.find(c => c.id == activeClientId);
            if (exists) {
                applyActiveClient(activeClientId);
            } else {
                activeClientId = '';
                localStorage.removeItem('rs_active_client_id');
                applyActiveClient('');
            }
        }
    } catch (err) {
        console.error('Errore caricamento clienti:', err);
    }
}

function renderClientSelectors() {
    const selects = [
        document.getElementById('globalClientSelect'),
        document.getElementById('activeClientSelector')
    ];

    selects.forEach(select => {
        if (!select) return;
        select.innerHTML = '<option value="" style="color:black;">Nessun Cliente</option>';
        userClients.forEach(c => {
            const opt = document.createElement('option');
            opt.value = c.id;
            opt.textContent = c.name;
            opt.style.color = 'black';
            if (c.id == activeClientId) opt.selected = true;
            select.appendChild(opt);
        });
    });

    renderClientModalList();
}

function applyActiveClient(clientId) {
    activeClientId = clientId;
    if (clientId) {
        localStorage.setItem('rs_active_client_id', clientId);
    } else {
        localStorage.removeItem('rs_active_client_id');
        localStorage.removeItem('rs_active_client');
    }

    const selects = [
        document.getElementById('globalClientSelect'),
        document.getElementById('activeClientSelector')
    ];
    selects.forEach(s => { if (s) s.value = clientId; });

    const client = userClients.find(c => c.id == clientId);
    if (client) {
        localStorage.setItem('rs_active_client', JSON.stringify(client));

        // 1. Nuova Rassegna Stampa
        const clientNameInput = document.getElementById('clientName');
        if (clientNameInput) clientNameInput.value = client.name;
        
        if (client.logo_base64) {
            state.clientLogoBase64 = client.logo_base64;
            const logoPrev = document.getElementById('clientLogoPreview');
            const logoPrevCont = document.getElementById('clientLogoPreviewContainer');
            if (logoPrev && logoPrevCont) {
                logoPrev.src = client.logo_base64;
                logoPrevCont.style.display = 'block';
            }
        }

        // 2. Ricerca Notizie - Suggerimenti
        renderNewsKeywordSuggestions();

        showToast(`Cliente attivo: ${client.name}`, 'info');
    } else {
        renderNewsKeywordSuggestions();
        showToast('Nessun cliente attivo', 'info');
    }
}

function renderNewsKeywordSuggestions() {
    const container = document.getElementById('newsKeywordSuggestions');
    if (!container) return;
    
    const client = userClients.find(c => c.id == activeClientId);
    if (!client || (!client.keywords && !client.name)) {
        container.innerHTML = '';
        container.classList.add('hidden');
        return;
    }

    const rawKw = client.keywords || client.name;
    const keywords = rawKw.split(/[,;\-]+/).map(k => k.trim()).filter(Boolean);

    container.innerHTML = `<span style="font-size:0.75rem; color:var(--text-muted); margin-right:4px;">Suggerimenti cliente:</span>` + 
        keywords.map(kw => `
            <button type="button" class="btn btn-outline btn-sm" onclick="applyKeywordSuggestion('${kw.replace(/'/g, "\\'")}')" style="font-size:0.75rem; padding:2px 8px; border-radius:12px; background:var(--bg-secondary);">
                <i data-feather="plus" style="width:12px;height:12px;vertical-align:middle;margin-right:2px;"></i> ${kw}
            </button>
        `).join('');
    container.classList.remove('hidden');
    feather.replace();
}

window.applyKeywordSuggestion = function(kw) {
    const input = document.getElementById('newsKeyword');
    if (!input) return;
    if (input.value.trim().length > 0) {
        if (!input.value.includes(kw)) {
            input.value += ' ' + kw;
        }
    } else {
        input.value = kw;
    }
};

window.openClientModal = function() {
    const modal = document.getElementById('clientModal');
    if (!modal) return;
    resetClientForm();
    loadClients();
    modal.classList.remove('hidden');
    modal.style.display = 'flex';
};

window.closeClientModal = function() {
    const modal = document.getElementById('clientModal');
    if (!modal) return;
    modal.classList.add('hidden');
    modal.style.display = 'none';
    resetClientForm();
};

window.resetClientForm = function() {
    if (document.getElementById('clientId')) document.getElementById('clientId').value = '';
    if (document.getElementById('clientNameInput')) document.getElementById('clientNameInput').value = '';
    if (document.getElementById('clientKeywordsInput')) document.getElementById('clientKeywordsInput').value = '';
    if (document.getElementById('clientToneInput')) document.getElementById('clientToneInput').value = '';
    if (document.getElementById('clientNotesInput')) document.getElementById('clientNotesInput').value = '';
    clientFormLogoBase64 = null;
    const logoPrevContainer = document.getElementById('clientLogoPreviewContainer');
    if (logoPrevContainer) {
        logoPrevContainer.classList.add('hidden');
        logoPrevContainer.style.display = 'none';
    }
    const logoPrev = document.getElementById('clientLogoPreview');
    if (logoPrev) logoPrev.src = '';
    const title = document.getElementById('clientFormTitle');
    if (title) title.innerHTML = '<i data-feather="plus-circle" style="width:16px;height:16px;"></i> Aggiungi Nuovo Cliente';
    const cancelBtn = document.getElementById('btnCancelClientEdit');
    if (cancelBtn) cancelBtn.classList.add('hidden');
    feather.replace();
};

window.handleClientLogoChange = async function(e) {
    const file = e.target.files[0];
    if (!file) return;
    try {
        clientFormLogoBase64 = await fileToBase64(file);
        const logoPrevContainer = document.getElementById('clientLogoPreviewContainer');
        const logoPrev = document.getElementById('clientLogoPreview');
        if (logoPrevContainer && logoPrev) {
            logoPrev.src = clientFormLogoBase64;
            logoPrevContainer.classList.remove('hidden');
            logoPrevContainer.style.display = 'block';
        }
        showToast('Logo del cliente caricato!', 'success');
    } catch (err) {
        showToast('Errore nel caricamento del logo', 'error');
    }
};

window.removeClientFormLogo = function() {
    clientFormLogoBase64 = '';
    const logoPrevContainer = document.getElementById('clientLogoPreviewContainer');
    if (logoPrevContainer) {
        logoPrevContainer.classList.add('hidden');
        logoPrevContainer.style.display = 'none';
    }
    const logoPrev = document.getElementById('clientLogoPreview');
    if (logoPrev) logoPrev.src = '';
};

let isSavingClient = false;

window.saveClientFromForm = async function() {
    if (isSavingClient) return;

    const id = document.getElementById('clientId').value;
    const name = document.getElementById('clientNameInput').value.trim();
    const keywords = document.getElementById('clientKeywordsInput').value.trim();
    const tone_of_voice = document.getElementById('clientToneInput').value.trim();
    const notes = document.getElementById('clientNotesInput').value.trim();

    if (!name) return showToast('Inserisci il nome del cliente', 'warning');

    isSavingClient = true;
    const saveBtn = document.getElementById('btnSaveClient');
    const prevText = saveBtn ? saveBtn.textContent : '';
    if (saveBtn) {
        saveBtn.disabled = true;
        saveBtn.textContent = 'Salvataggio...';
    }

    try {
        const payload = {
            id: id || Date.now(),
            name,
            keywords,
            tone_of_voice,
            notes,
            logo_base64: clientFormLogoBase64 || ''
        };

        if (state.token) {
            try {
                let res;
                if (id) {
                    res = await apiCall('PUT', `/api/clients/${id}`, payload);
                    showToast('Cliente aggiornato!', 'success');
                } else {
                    res = await apiCall('POST', '/api/clients', payload);
                    showToast('Nuovo cliente creato!', 'success');
                }
                resetClientForm();
                await loadClients();
                if (res.client) applyActiveClient(res.client.id);
                return;
            } catch (err) {
                console.log('Salvataggio API client fallito, uso memoria locale:', err);
            }
        }

        // Local Storage Fallback
        let localList = localStorage.getItem('rs_local_clients');
        localList = localList ? JSON.parse(localList) : [];

        if (id) {
            const idx = localList.findIndex(c => c.id == id);
            if (idx !== -1) localList[idx] = payload;
            else localList.push(payload);
            showToast('Cliente aggiornato!', 'success');
        } else {
            localList.push(payload);
            showToast('Nuovo cliente creato!', 'success');
        }

        localStorage.setItem('rs_local_clients', JSON.stringify(localList));
        userClients = localList;

        resetClientForm();
        renderClientSelectors();
        applyActiveClient(payload.id);
    } finally {
        isSavingClient = false;
        if (saveBtn) {
            saveBtn.disabled = false;
            saveBtn.textContent = prevText || 'Salva Cliente';
        }
    }
};

window.editClient = function(id) {
    const client = userClients.find(c => c.id == id);
    if (!client) return;

    document.getElementById('clientId').value = client.id;
    document.getElementById('clientNameInput').value = client.name || '';
    document.getElementById('clientKeywordsInput').value = client.keywords || '';
    document.getElementById('clientToneInput').value = client.tone_of_voice || '';
    document.getElementById('clientNotesInput').value = client.notes || '';
    clientFormLogoBase64 = client.logo_base64 || null;

    if (client.logo_base64) {
        const logoPrevContainer = document.getElementById('clientLogoPreviewContainer');
        const logoPrev = document.getElementById('clientLogoPreview');
        if (logoPrevContainer && logoPrev) {
            logoPrev.src = client.logo_base64;
            logoPrevContainer.classList.remove('hidden');
            logoPrevContainer.style.display = 'block';
        }
    }

    const title = document.getElementById('clientFormTitle');
    if (title) title.innerHTML = `<i data-feather="edit-2" style="width:16px;height:16px;"></i> Modifica Cliente: ${client.name}`;
    const cancelBtn = document.getElementById('btnCancelClientEdit');
    if (cancelBtn) cancelBtn.classList.remove('hidden');
    feather.replace();
};

window.deleteClient = async function(id) {
    if (!confirm('Sei sicuro di voler eliminare questo cliente?')) return;
    if (state.token) {
        try {
            await apiCall('DELETE', `/api/clients/${id}`);
        } catch(e){}
    }

    let localList = localStorage.getItem('rs_local_clients');
    if (localList) {
        let list = JSON.parse(localList).filter(c => c.id != id);
        localStorage.setItem('rs_local_clients', JSON.stringify(list));
    }

    userClients = userClients.filter(c => c.id != id);
    if (activeClientId == id) {
        applyActiveClient('');
    }
    renderClientSelectors();
    showToast('Cliente eliminato', 'success');
};

function renderClientModalList() {
    const list = document.getElementById('clientModalList');
    if (!list) return;
    if (userClients.length === 0) {
        list.innerHTML = '<div style="color:var(--text-muted); font-size:0.85rem;">Nessun cliente salvato finora.</div>';
        return;
    }

    list.innerHTML = '';
    userClients.forEach(c => {
        const div = document.createElement('div');
        div.style.cssText = 'display:flex; justify-content:space-between; align-items:center; background:rgba(255,255,255,0.03); border:1px solid var(--border-color); padding:8px 12px; border-radius:6px;';
        div.innerHTML = `
            <div style="display:flex; align-items:center; gap:10px;">
                ${c.logo_base64 ? `<img src="${c.logo_base64}" style="max-height:30px; border-radius:3px;">` : `<div style="width:30px; height:30px; border-radius:3px; background:var(--bg-secondary); display:flex; align-items:center; justify-content:center; font-size:0.8rem; font-weight:700;">${c.name.charAt(0).toUpperCase()}</div>`}
                <div>
                    <div style="font-weight:600; font-size:0.9rem;">${c.name} ${c.id == activeClientId ? '<span style="font-size:0.7rem; background:var(--accent-primary); color:white; padding:2px 6px; border-radius:10px; margin-left:6px;">ATTIVO</span>' : ''}</div>
                    <div style="font-size:0.75rem; color:var(--text-muted);">
                        ${c.keywords ? `KW: ${c.keywords}` : ''} ${c.tone_of_voice ? `• Tone: ${c.tone_of_voice}` : ''}
                    </div>
                </div>
            </div>
            <div style="display:flex; gap:4px;">
                <button class="btn btn-outline btn-sm" style="padding:2px 6px; font-size:0.75rem;" onclick="applyActiveClient(${c.id})">Seleziona</button>
                <button class="btn btn-outline btn-sm" style="padding:2px 6px; font-size:0.75rem;" onclick="editClient(${c.id})"><i data-feather="edit-2" style="width:12px;height:12px;"></i></button>
                <button class="btn btn-outline btn-sm" style="padding:2px 6px; font-size:0.75rem; color:#ff4d4d; border-color:rgba(255,77,77,0.3);" onclick="deleteClient(${c.id})"><i data-feather="trash-2" style="width:12px;height:12px;"></i></button>
            </div>
        `;
        list.appendChild(div);
    });
    feather.replace();
}


window.toggleTemplateCard = function() {
    const content = document.getElementById('templateSectionContent');
    const header = document.getElementById('toggleTemplateSection');
    if (!content) return;
    const icon = header ? header.querySelector('.icon-toggle') : null;
    const isHidden = content.style.display === 'none' || getComputedStyle(content).display === 'none';
    content.style.display = isHidden ? 'block' : 'none';
    if (icon) {
        if (isHidden) icon.classList.add('open');
        else icon.classList.remove('open');
    }
};

window.toggleCoverMetaCard = function() {
    const content = document.getElementById('coverMetaContent');
    const icon = document.getElementById('coverMetaToggleIcon');
    if (!content) return;
    const isHidden = content.style.display === 'none';
    content.style.display = isHidden ? 'grid' : 'none';
    if (icon) {
        icon.style.transform = isHidden ? 'rotate(0deg)' : 'rotate(-90deg)';
    }
};

// --- FULL PROFILE & SETTINGS MANAGEMENT ---

function loadFullProfileData() {
    const savedProf = localStorage.getItem('rs_full_profile');
    if (savedProf) {
        try {
            const data = JSON.parse(savedProf);
            if (document.getElementById('profFullName')) document.getElementById('profFullName').value = data.fullName || '';
            if (document.getElementById('profEmail')) document.getElementById('profEmail').value = data.email || '';
            if (document.getElementById('profRole')) document.getElementById('profRole').value = data.role || '';
            if (document.getElementById('profPhone')) document.getElementById('profPhone').value = data.phone || '';
            if (document.getElementById('profCompanyName')) document.getElementById('profCompanyName').value = data.companyName || state.user?.companyName || '';
            if (document.getElementById('profWebsite')) document.getElementById('profWebsite').value = data.website || '';
            if (data.logoBase64 && document.getElementById('profLogoPreview')) {
                document.getElementById('profLogoPreview').src = data.logoBase64;
                const container = document.getElementById('profLogoPreviewContainer');
                if (container) container.style.display = 'block';
            }
        } catch(e){}
    } else {
        if (document.getElementById('profCompanyName')) document.getElementById('profCompanyName').value = localStorage.getItem('rs_company_name') || '';
    }
}

window.handleProfileLogoUpload = async function(e) {
    const file = e.target.files[0];
    if (!file) return;
    try {
        const base64 = await fileToBase64(file);
        const img = document.getElementById('profLogoPreview');
        const container = document.getElementById('profLogoPreviewContainer');
        if (img && container) {
            img.src = base64;
            container.style.display = 'block';
        }
        showToast('Logo aziendale caricato!', 'success');
    } catch(err) {
        showToast('Errore caricamento logo', 'error');
    }
};

function saveFullProfileData() {
    const fullName = document.getElementById('profFullName')?.value.trim() || '';
    const email = document.getElementById('profEmail')?.value.trim() || '';
    const role = document.getElementById('profRole')?.value.trim() || '';
    const phone = document.getElementById('profPhone')?.value.trim() || '';
    const companyName = document.getElementById('profCompanyName')?.value.trim() || '';
    const website = document.getElementById('profWebsite')?.value.trim() || '';
    const logoBase64 = document.getElementById('profLogoPreview')?.src || null;

    const profileData = { fullName, email, role, phone, companyName, website, logoBase64 };
    localStorage.setItem('rs_full_profile', JSON.stringify(profileData));

    if (companyName) {
        localStorage.setItem('rs_company_name', companyName);
        const compEl = document.getElementById('navCompany');
        const compHeaderEl = document.getElementById('navCompanyHeader');
        if (compEl) compEl.textContent = companyName;
        if (compHeaderEl) compHeaderEl.textContent = companyName;
    }

    showToast('Profilo aggiornato con successo!', 'success');
}

function loadPlatformSettings() {
    const savedSet = localStorage.getItem('rs_platform_settings');
    if (savedSet) {
        try {
            const set = JSON.parse(savedSet);
            if (document.getElementById('setAnimationsToggle')) document.getElementById('setAnimationsToggle').checked = set.animations !== false;
            if (document.getElementById('setLanguageSelect')) document.getElementById('setLanguageSelect').value = set.language || 'it';
            if (document.getElementById('setPdfTheme')) document.getElementById('setPdfTheme').value = set.pdfTheme || 'modern_slate';
            if (document.getElementById('setPdfTocToggle')) document.getElementById('setPdfTocToggle').checked = set.pdfToc !== false;
            if (document.getElementById('setPdfPageNumbersToggle')) document.getElementById('setPdfPageNumbersToggle').checked = set.pdfPageNumbers !== false;
            if (document.getElementById('setEmailNotifToggle')) document.getElementById('setEmailNotifToggle').checked = set.emailNotif !== false;
            if (document.getElementById('setWeeklyDigestToggle')) document.getElementById('setWeeklyDigestToggle').checked = set.weeklyDigest !== false;
        } catch(e){}
    }
}

function savePlatformSettings() {
    const settings = {
        animations: document.getElementById('setAnimationsToggle')?.checked ?? true,
        language: document.getElementById('setLanguageSelect')?.value || 'it',
        pdfTheme: document.getElementById('setPdfTheme')?.value || 'modern_slate',
        pdfToc: document.getElementById('setPdfTocToggle')?.checked ?? true,
        pdfPageNumbers: document.getElementById('setPdfPageNumbersToggle')?.checked ?? true,
        emailNotif: document.getElementById('setEmailNotifToggle')?.checked ?? true,
        weeklyDigest: document.getElementById('setWeeklyDigestToggle')?.checked ?? true
    };
    localStorage.setItem('rs_platform_settings', JSON.stringify(settings));
    showToast('Impostazioni salvate con successo!', 'success');
}

window.clearPlatformCache = function() {
    if (confirm('Vuoi davvero pulire la cache locale? I dati salvati verranno mantenuti.')) {
        sessionStorage.clear();
        showToast('Cache locale pulita!', 'success');
    }
};

document.addEventListener('DOMContentLoaded', () => {
    loadFullProfileData();
    loadPlatformSettings();

    const btnSaveProf = document.getElementById('btnSaveFullProfile');
    if (btnSaveProf) btnSaveProf.addEventListener('click', saveFullProfileData);

    const btnSaveSet = document.getElementById('btnSaveSettings');
    if (btnSaveSet) btnSaveSet.addEventListener('click', savePlatformSettings);

    const themeToggleSettings = document.getElementById('themeToggleSettings');
    if (themeToggleSettings && !themeToggleSettings.dataset.themeBound) {
        themeToggleSettings.dataset.themeBound = 'true';
        themeToggleSettings.addEventListener('click', (e) => {
            e.preventDefault();
            if (typeof window.toggleTheme === 'function') {
                window.toggleTheme(true);
            }
        });
    }
});

// --- BILLING & CHECKOUT SYSTEM ---
var selectedCheckoutPlan = { name: 'Professional', price: 59 };
var isYearlyBilling = false;

window.toggleBillingCycle = function(isYearly) {
    isYearlyBilling = isYearly;
    const priceEls = document.querySelectorAll('.price-val');
    const slider = document.getElementById('billingSlider');
    if (slider) slider.style.left = isYearly ? '27px' : '3px';

    priceEls.forEach(el => {
        const val = isYearly ? el.dataset.yearly : el.dataset.monthly;
        if (val) el.textContent = val;
    });
};

window.openCheckoutModal = function(planName, monthlyPrice) {
    const finalPrice = isYearlyBilling ? Math.round(monthlyPrice * 0.8) : monthlyPrice;
    selectedCheckoutPlan = { name: planName, price: finalPrice };

    const nameEl = document.getElementById('checkoutPlanName');
    const priceEl = document.getElementById('checkoutPlanPrice');
    const cycleEl = document.getElementById('checkoutCycleLabel');
    const modal = document.getElementById('checkoutModal');

    if (nameEl) nameEl.textContent = `Piano ${planName}`;
    if (priceEl) priceEl.textContent = `€${finalPrice}`;
    if (cycleEl) cycleEl.textContent = isYearlyBilling ? 'Fatturazione annuale (risparmio 20%)' : 'Fatturazione con rinnovo mensile';

    if (modal) {
        modal.classList.remove('hidden');
        modal.style.display = 'flex';
    }
};

window.closeCheckoutModal = function() {
    const modal = document.getElementById('checkoutModal');
    if (modal) {
        modal.classList.add('hidden');
        modal.style.display = 'none';
    }
};

window.processPayment = function() {
    const cardName = document.getElementById('payCardName')?.value.trim();
    const cardNumber = document.getElementById('payCardNumber')?.value.trim();

    if (!cardName || !cardNumber) {
        showToast('Compila l\'intestatario ed il numero di carta', 'error');
        return;
    }

    const btn = document.getElementById('btnConfirmPayment');
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<i data-feather="loader" class="spinPulse" style="width:18px;height:18px;vertical-align:middle;margin-right:6px;"></i> Elaborazione pagamento...';
        feather.replace();
    }

    setTimeout(() => {
        closeCheckoutModal();
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = '<i data-feather="check-circle" style="width:18px;height:18px;vertical-align:middle;margin-right:6px;"></i> Conferma e Paga Ora';
        }

        // Save active plan to localStorage
        const activePlanStr = `Piano ${selectedCheckoutPlan.name}`;
        localStorage.setItem('rs_active_plan', activePlanStr);

        const profPlanName = document.getElementById('userProfilePlanName');
        if (profPlanName) profPlanName.textContent = activePlanStr;

        const sidebarPlan = document.querySelector('.sidebar-plan');
        if (sidebarPlan) sidebarPlan.textContent = activePlanStr;

        showToast(`Abbonamento a ${activePlanStr} attivato con successo!`, 'success');
        feather.replace();
    }, 1500);
};

window.handleContactSubmit = function(e) {
    e.preventDefault();
    const btn = e.target.querySelector('button[type=submit]');
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<i data-feather="loader" class="spinPulse" style="width:16px;height:16px;vertical-align:middle;margin-right:6px;"></i> Invio in corso...';
        feather.replace();
    }

    setTimeout(() => {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = '<i data-feather="send" style="width:16px;height:16px;vertical-align:middle;margin-right:6px;"></i> Invia Messaggio';
        }
        e.target.reset();
        showToast('Messaggio inviato con successo! Ti risponderemo a breve.', 'success');
        feather.replace();
    }, 1200);
};

// --- LOGO ARCHIVE MANAGEMENT ---

let archiveLogosList = [
    { name: 'la Repubblica', category: 'nazionale', url: '/logos/repubblica.png' },
    { name: 'Corriere della Sera', category: 'nazionale', url: '/logos/corriere.png' },
    { name: 'Il Sole 24 Ore', category: 'economico', url: '/logos/ilsole24ore.png' },
    { name: 'ANSA', category: 'agenzia', url: '/logos/ansa.png' },
    { name: 'Il Mattino', category: 'locale', url: '/logos/ilmattino.png' },
    { name: 'Il Giornale d\'Italia', category: 'nazionale', url: '/logos/ilgiornaleditalia.png' },
    { name: 'Askanews', category: 'agenzia', url: '/logos/Askanews.png' },
    { name: 'Agenzia Nova', category: 'agenzia', url: '/logos/agenzianova.jpg' },
    { name: 'Agenzia DIRE', category: 'agenzia', url: '/logos/dire.jpg' },
    { name: 'Il Diario del Lavoro', category: 'web', url: '/logos/ildiariodellavoro.png' },
    { name: 'Benevento News 24', category: 'locale', url: '/logos/beneventonews24.png' },
    { name: 'Cronache del Sannio', category: 'locale', url: '/logos/cronachedelsannio.png' },
    { name: 'L\'Eco del Sannio', category: 'locale', url: '/logos/ecodelsannio.png' },
    { name: 'TV Sette Benevento', category: 'broadcast', url: '/logos/tvsette%20benevento.png' }
];

let activeArchiveCategory = 'all';
let activeArchiveSort = 'latest';

window.toggleArchiveSort = function(btn) {
    if (activeArchiveSort === 'latest') {
        activeArchiveSort = 'name';
        if (btn) btn.innerHTML = '<i data-feather="sort-by-alpha" style="width:14px;height:14px;vertical-align:middle;margin-right:4px;"></i> Ordina: A-Z';
        showToast('Ordinamento: Alfabetico (A-Z)', 'info');
    } else {
        activeArchiveSort = 'latest';
        if (btn) btn.innerHTML = '<i data-feather="clock" style="width:14px;height:14px;vertical-align:middle;margin-right:4px;"></i> Ultimi Aggiunti';
        showToast('Ordinamento: Ultimi Aggiunti', 'info');
    }
    feather.replace();
    renderArchiveLogos();
};

function loadCustomArchiveLogos() {
    const saved = localStorage.getItem('rs_custom_archive_logos');
    let customLogos = [];
    if (saved) {
        try {
            customLogos = JSON.parse(saved);
        } catch(e) {}
    }

    // Merge custom logos with the logos loaded from /assets/logos.json (logoArchive)
    // logoArchive is loaded at startup; if not ready yet, use fallback hardcoded list
    const baseLogos = (logoArchive && logoArchive.length > 0)
        ? logoArchive.map(l => ({ name: l.name, url: l.url, category: l.category || 'nazionale', isCustom: false }))
        : [
            { name: 'la Repubblica', category: 'nazionale', url: '/logos/repubblica.png' },
            { name: 'Corriere della Sera', category: 'nazionale', url: '/logos/corriere.png' },
            { name: 'Il Sole 24 Ore', category: 'economico', url: '/logos/ilsole24ore.png' },
            { name: 'ANSA', category: 'agenzia', url: '/logos/ansa.png' },
            { name: 'Il Mattino', category: 'locale', url: '/logos/ilmattino.png' },
            { name: 'Askanews', category: 'agenzia', url: '/logos/Askanews.png' },
            { name: 'Agenzia Nova', category: 'agenzia', url: '/logos/agenzianova.jpg' },
            { name: 'Agenzia DIRE', category: 'agenzia', url: '/logos/dire.jpg' },
            { name: 'TV Sette Benevento', category: 'broadcast', url: '/logos/tvsette%20benevento.png' }
        ];

    archiveLogosList = [...customLogos, ...baseLogos];
}

window.renderArchiveLogos = function() {
    const grid = document.getElementById('archiveLogosGrid');
    if (!grid) return;

    const searchTerm = document.getElementById('archiveSearchInput')?.value.toLowerCase().trim() || '';

    let filtered = archiveLogosList.filter(item => {
        let matchesCategory = false;
        if (activeArchiveCategory === 'all') {
            matchesCategory = true;
        } else if (activeArchiveCategory === 'custom') {
            matchesCategory = item.isCustom || item.category === 'cliente' || item.category === 'custom';
        } else {
            matchesCategory = item.category === activeArchiveCategory;
        }
        const matchesSearch = !searchTerm || item.name.toLowerCase().includes(searchTerm);
        return matchesCategory && matchesSearch;
    });

    if (activeArchiveSort === 'latest') {
        filtered.sort((a, b) => {
            const timeA = a.createdAt || (a.isCustom ? 9999999999999 : 0);
            const timeB = b.createdAt || (b.isCustom ? 9999999999999 : 0);
            return timeB - timeA;
        });
    } else if (activeArchiveSort === 'name') {
        filtered.sort((a, b) => a.name.localeCompare(b.name));
    }

    if (filtered.length === 0) {
        grid.innerHTML = '<div style="grid-column:1/-1; text-align:center; padding:3rem; color:var(--text-muted);">Nessun logo trovato per la categoria o ricerca selezionata.</div>';
        return;
    }

    grid.innerHTML = '';
    filtered.forEach((item) => {
        const card = document.createElement('div');
        card.className = 'glass-card';
        card.style.cssText = 'padding:1.25rem; text-align:center; display:flex; flex-direction:column; justify-content:space-between; align-items:center; min-height:160px;';
        
        const imgContainer = document.createElement('div');
        imgContainer.style.cssText = 'height:70px; width:100%; display:flex; align-items:center; justify-content:center; margin-bottom:0.75rem;';

        const imgSrc = item.url || item.base64;
        if (imgSrc) {
            const img = document.createElement('img');
            img.src = imgSrc;
            img.alt = item.name;
            img.style.cssText = 'max-height:60px; max-width:140px; object-fit:contain; filter:drop-shadow(0 2px 4px rgba(0,0,0,0.15));';
            img.onerror = function() {
                this.style.display = 'none';
            };
            imgContainer.appendChild(img);
        }

        const infoDiv = document.createElement('div');
        const nameDiv = document.createElement('div');
        nameDiv.style.cssText = 'font-weight:700; font-size:0.9rem; margin-bottom:4px;';
        nameDiv.textContent = item.name;

        const catSpan = document.createElement('span');
        catSpan.style.cssText = 'font-size:0.7rem; background:rgba(124,92,255,0.1); color:var(--accent-primary); padding:2px 8px; border-radius:10px; text-transform:uppercase;';
        catSpan.textContent = item.category;

        infoDiv.appendChild(nameDiv);
        infoDiv.appendChild(catSpan);

        card.appendChild(imgContainer);
        card.appendChild(infoDiv);

        // Action buttons row
        const actionsDiv = document.createElement('div');
        actionsDiv.style.cssText = 'margin-top:10px; display:flex; gap:4px; flex-wrap:wrap; justify-content:center;';

        // Copy URL button — always present
        const copyBtn = document.createElement('button');
        copyBtn.className = 'btn btn-outline btn-sm';
        copyBtn.style.cssText = 'font-size:0.7rem; padding:2px 8px;';
        copyBtn.innerHTML = '<i data-feather="copy" style="width:11px;height:11px;vertical-align:middle;margin-right:2px;"></i> Copia URL';
        copyBtn.onclick = (e) => {
            e.stopPropagation();
            const logoUrl = item.url || item.base64 || '';
            navigator.clipboard.writeText(logoUrl).then(() => {
                showToast(`URL logo "${item.name}" copiato!`, 'success');
            }).catch(() => showToast('Errore copia URL', 'error'));
        };
        actionsDiv.appendChild(copyBtn);

        if (item.isCustom) {
            const removeBtn = document.createElement('button');
            removeBtn.className = 'btn btn-outline btn-sm';
            removeBtn.style.cssText = 'font-size:0.7rem; color:#ff4d4d; border-color:rgba(255,77,77,0.3); padding:2px 8px;';
            removeBtn.innerHTML = '<i data-feather="trash-2" style="width:11px;height:11px;vertical-align:middle;margin-right:2px;"></i> Rimuovi';
            removeBtn.onclick = (e) => { e.stopPropagation(); deleteCustomArchiveLogo(item.name); };
            actionsDiv.appendChild(removeBtn);
        }

        card.appendChild(actionsDiv);

        // Click on card: if there's an article being edited, apply the logo; otherwise copy URL
        card.style.cursor = 'pointer';
        card.onclick = () => {
            const logoSrc = item.url || item.base64 || '';
            if (typeof window.currentEditingLogoIdx !== 'undefined' && window.currentEditingLogoIdx !== null) {
                // Apply to article currently being edited
                if (state.articles && state.articles[window.currentEditingLogoIdx]) {
                    state.articles[window.currentEditingLogoIdx].source_logo = logoSrc;
                    showToast(`Logo "${item.name}" applicato all'articolo!`, 'success');
                    renderArticles();
                    window.currentEditingLogoIdx = null;
                }
            } else {
                navigator.clipboard.writeText(logoSrc).then(() => {
                    showToast(`URL logo "${item.name}" copiato negli appunti!`, 'success');
                }).catch(() => showToast('Errore copia', 'error'));
            }
        };

        grid.appendChild(card);
    });
    feather.replace();
};

window.toggleNewLogoForm = function() {
    const panel = document.getElementById('newLogoFormPanel');
    if (panel) {
        panel.classList.toggle('hidden');
    }
};

window.saveNewArchiveLogo = async function() {
    const name = document.getElementById('archiveLogoNameInput')?.value.trim();
    const category = document.getElementById('archiveLogoCategoryInput')?.value;
    const fileInput = document.getElementById('archiveLogoFileInput');

    if (!name || !fileInput?.files[0]) {
        showToast('Inserisci il nome ed imposta l\'immagine del logo', 'error');
        return;
    }

    try {
        const base64 = await fileToBase64(fileInput.files[0]);
        const newLogoObj = {
            name,
            category,
            base64,
            isCustom: true,
            createdAt: Date.now()
        };

        archiveLogosList.unshift(newLogoObj);

        let saved = localStorage.getItem('rs_custom_archive_logos');
        let customList = saved ? JSON.parse(saved) : [];
        customList.unshift(newLogoObj);
        localStorage.setItem('rs_custom_archive_logos', JSON.stringify(customList));

        showToast('Logo aggiunto con successo all\'archivio!', 'success');
        document.getElementById('archiveLogoNameInput').value = '';
        fileInput.value = '';
        toggleNewLogoForm();
        renderArchiveLogos();
    } catch (err) {
        showToast('Errore durante il salvataggio del logo', 'error');
    }
};

window.deleteCustomArchiveLogo = function(name) {
    if (!confirm(`Vuoi rimuovere "${name}" dall'archivio?`)) return;
    const saved = localStorage.getItem('rs_custom_archive_logos');
    if (saved) {
        let customList = JSON.parse(saved);
        customList = customList.filter(l => l.name !== name);
        localStorage.setItem('rs_custom_archive_logos', JSON.stringify(customList));
    }
    archiveLogosList = archiveLogosList.filter(l => l.name !== name);
    renderArchiveLogos();
    showToast('Logo rimosso', 'success');
};

window.filterArchiveLogos = function() {
    renderArchiveLogos();
};

window.filterArchiveCategory = function(cat, btn) {
    activeArchiveCategory = cat;
    document.querySelectorAll('.archive-cat-btn').forEach(b => b.classList.remove('active'));
    if (btn) btn.classList.add('active');
    renderArchiveLogos();
};

document.addEventListener('DOMContentLoaded', () => {
    loadFullProfileData();
    loadPlatformSettings();
    loadCustomArchiveLogos();
    renderArchiveLogos();
    if (window.location.hash === '#media-crm') {
        loadMediaContacts();
    }
});

// ==========================================================================
// --- STRATEGIC PR TOOLS: LIVE KPIS, MORNING DIGEST, WEB SHARING & CRM ---
// ==========================================================================

// --- 1. LIVE KPIS & SENTIMENT IN NUOVA RASSEGNA ---
function updateLiveKpis() {
    const banner = document.getElementById('liveKpiBanner');
    const countEl = document.getElementById('liveKpiCount');
    const reachEl = document.getElementById('liveKpiReach');
    const audienceEl = document.getElementById('liveKpiAudience');
    const readsEl = document.getElementById('liveKpiReads');
    const sentimentEl = document.getElementById('liveKpiSentiment');
    const btnDigest = document.getElementById('btnOpenMorningDigestAction');
    const btnShare = document.getElementById('btnShareReviewAction');
    const btnLiveDigest = document.getElementById('btnLiveMorningDigest');

    if (!banner) return;

    if (!state.articles || state.articles.length === 0) {
        banner.classList.add('hidden');
        if (btnDigest) btnDigest.classList.add('hidden');
        if (btnShare) btnShare.classList.add('hidden');
        return;
    }

    banner.classList.remove('hidden');
    if (btnDigest) btnDigest.classList.remove('hidden');
    if (btnShare) btnShare.classList.remove('hidden');

    if (btnLiveDigest && !btnLiveDigest.dataset.bound) {
        btnLiveDigest.dataset.bound = 'true';
        btnLiveDigest.addEventListener('click', () => openMorningDigestForCurrentArticles());
    }

    const count = state.articles.length;
    if (countEl) countEl.textContent = `${count} ${count === 1 ? 'Articolo' : 'Articoli'}`;

    const seenSources = new Set();
    const sourceArticleCounts = {};
    let totalAudienceOTS = 0;
    let totalEstimatedReads = 0;
    let positiveCount = 0;
    let criticalCount = 0;

    const posWords = ['crescita', 'record', 'successo', 'positivo', 'premi', 'investimento', 'sviluppo', 'leadership', 'innova', 'utile', 'espansione', 'eccellenza', 'trionfo', 'accordo', 'partnership', 'vince'];
    const negWords = ['crisi', 'crollo', 'calo', 'scandalo', 'arrest', 'truffa', 'perdita', 'chiusura', 'polemica', 'difficoltà', 'licenzia', 'denuncia', 'indagine', 'multa', 'fallimento', 'scontro'];

    state.articles.forEach(art => {
        const src = ((art.source_name || '') + ' ' + (art.url || '')).toLowerCase();
        const type = art.source_type || 'Web';
        const text = ((art.title || '') + ' ' + (art.excerpt || '')).toLowerCase();
        const normKey = (art.source_name || 'media').toLowerCase().trim();

        sourceArticleCounts[normKey] = (sourceArticleCounts[normKey] || 0) + 1;

        let dayAudience = 25000;
        let readRate = 0.035;

        if (src.includes('corriere')) { dayAudience = 3500000; readRate = 0.012; }
        else if (src.includes('repubblica')) { dayAudience = 3150000; readRate = 0.012; }
        else if (src.includes('sole')) { dayAudience = 1350000; readRate = 0.018; }
        else if (src.includes('ansa')) { dayAudience = 2600000; readRate = 0.013; }
        else if (src.includes('stampa')) { dayAudience = 1150000; readRate = 0.014; }
        else if (src.includes('messaggero')) { dayAudience = 1450000; readRate = 0.013; }
        else if (src.includes('fanpage')) { dayAudience = 2200000; readRate = 0.014; }
        else if (src.includes('tgcom')) { dayAudience = 1950000; readRate = 0.012; }
        else if (src.includes('sky')) { dayAudience = 1400000; readRate = 0.013; }
        else if (src.includes('fatto')) { dayAudience = 1250000; readRate = 0.014; }
        else if (src.includes('giornale') || src.includes('libero')) { dayAudience = 800000; readRate = 0.014; }
        else if (src.includes('finanza') || src.includes('forbes') || src.includes('italiaoggi')) { dayAudience = 320000; readRate = 0.022; }
        else if (type === 'Quotidiano Nazionale' || type === 'Agenzia di Stampa') { dayAudience = 750000; readRate = 0.015; }
        else if (type === 'Quotidiano Locale' || type === 'Periodico' || src.includes('carlino') || src.includes('nazione') || src.includes('giorno') || src.includes('mattino')) { dayAudience = 220000; readRate = 0.018; }

        // Deduplicated Audience: count outlet only once
        if (!seenSources.has(normKey)) {
            seenSources.add(normKey);
            totalAudienceOTS += dayAudience;
        }

        // Estimated reads for this article
        const occ = sourceArticleCounts[normKey];
        const mult = occ === 1 ? 1.0 : (occ === 2 ? 0.75 : 0.5);
        totalEstimatedReads += Math.max(10, Math.round(dayAudience * readRate * mult));

        let pos = 0;
        let neg = 0;
        posWords.forEach(w => {
            const re = new RegExp(`(\\b(?:non|nessun|nessuna|senza)\\s+(?:\\w+\\s+){0,2})?\\b${w}\\b`, 'i');
            const m = text.match(re);
            if (m) {
                if (m[1]) neg += 0.6;
                else pos += 1;
            }
        });
        negWords.forEach(w => {
            const re = new RegExp(`(\\b(?:non|nessun|nessuna|senza|smentisce|smentita|evita|evitato|superato)\\s+(?:\\w+\\s+){0,2})?\\b${w}\\b`, 'i');
            const m = text.match(re);
            if (m) {
                if (m[1]) pos += 0.6;
                else neg += 1;
            }
        });

        if (pos > neg) positiveCount++;
        else if (neg > pos) criticalCount++;
    });

    function fmt(n) {
        if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
        if (n >= 1000) return Math.round(n / 1000) + 'K';
        return n.toString();
    }

    if (audienceEl) audienceEl.textContent = `~${fmt(totalAudienceOTS)} netta`;
    if (readsEl) readsEl.textContent = `~${fmt(totalEstimatedReads)} visite`;
    if (reachEl) reachEl.textContent = `~${fmt(totalAudienceOTS)}`;

    if (sentimentEl) {
        if (positiveCount > criticalCount) {
            sentimentEl.textContent = 'Positivo';
            sentimentEl.style.color = '#10b981';
            sentimentEl.style.background = 'rgba(16,185,129,0.15)';
            sentimentEl.style.borderColor = 'rgba(16,185,129,0.3)';
        } else if (criticalCount > positiveCount) {
            sentimentEl.textContent = 'Critico';
            sentimentEl.style.color = '#ef4444';
            sentimentEl.style.background = 'rgba(239,68,68,0.15)';
            sentimentEl.style.borderColor = 'rgba(239,68,68,0.3)';
        } else {
            sentimentEl.textContent = 'Neutro';
            sentimentEl.style.color = '#f59e0b';
            sentimentEl.style.background = 'rgba(245,158,11,0.15)';
            sentimentEl.style.borderColor = 'rgba(245,158,11,0.3)';
        }
    }
}
window.updateLiveKpis = updateLiveKpis;

// --- 2. MORNING EXECUTIVE DIGEST ---
let currentDigestData = null;

window.openMorningDigestForCurrentArticles = async function() {
    if (!state.articles || state.articles.length === 0) {
        try {
            const history = await apiCall('GET', '/api/pdf/history');
            if (history && history.length > 0) {
                return openMorningDigestFromHistory(history[0].id);
            }
        } catch(e) {}
        showToast('Aggiungi almeno un articolo in Nuova Rassegna per generare il Briefing Esecutivo.', 'warning');
        return;
    }

    const modal = document.getElementById('morningDigestModal');
    const loading = document.getElementById('digestLoading');
    const content = document.getElementById('digestContentView');
    if (!modal) return;

    modal.classList.remove('hidden');
    modal.style.display = 'flex';
    if (loading) loading.classList.remove('hidden');
    if (content) content.classList.add('hidden');

    try {
        const title = document.getElementById('rassegnaTitle')?.value.trim() || 'Rassegna Stampa';
        const clientName = document.getElementById('clientName')?.value.trim() || '';

        const cleanArticles = state.articles.map(a => ({
            title: a.title,
            source_name: a.source_name,
            source_type: a.source_type,
            published_date: a.published_date,
            url: a.url,
            excerpt: a.excerpt
        }));

        const data = await apiCall('POST', '/api/articles/digest', {
            articles: cleanArticles,
            clientName,
            rassegnaTitle: title
        });

        if (!data || !data.digest) {
            throw new Error('Impossibile elaborare il digest.');
        }

        currentDigestData = {
            ...data.digest,
            whatsappText: data.whatsappText || '',
            emailHtml: data.emailHtml || '',
            emailText: data.emailText || data.whatsappText || ''
        };
        renderDigestModalContent(data.digest);

    } catch (err) {
        showToast('Errore generazione digest: ' + err.message, 'error');
        closeMorningDigestModal();
    }
};

window.openMorningDigestFromHistory = async function(reviewId) {
    const modal = document.getElementById('morningDigestModal');
    const loading = document.getElementById('digestLoading');
    const content = document.getElementById('digestContentView');
    if (!modal) return;

    modal.classList.remove('hidden');
    modal.style.display = 'flex';
    if (loading) loading.classList.remove('hidden');
    if (content) content.classList.add('hidden');

    try {
        const reviewData = await apiCall('GET', `/api/pdf/review/${reviewId}`);
        if (!reviewData.articles || reviewData.articles.length === 0) {
            throw new Error('Nessun articolo trovato in questa rassegna.');
        }

        const cleanArticles = reviewData.articles.map(a => ({
            title: a.title,
            source_name: a.source_name,
            source_type: a.source_type,
            published_date: a.published_date,
            url: a.url,
            excerpt: a.excerpt
        }));

        const data = await apiCall('POST', '/api/articles/digest', {
            articles: cleanArticles,
            clientName: reviewData.clientName,
            rassegnaTitle: reviewData.title
        });

        if (!data || !data.digest) {
            throw new Error('Impossibile elaborare il digest.');
        }

        currentDigestData = {
            ...data.digest,
            whatsappText: data.whatsappText || '',
            emailHtml: data.emailHtml || '',
            emailText: data.emailText || data.whatsappText || ''
        };
        renderDigestModalContent(data.digest);

    } catch (err) {
        showToast('Errore generazione digest: ' + err.message, 'error');
        closeMorningDigestModal();
    }
};

function renderDigestModalContent(digest) {
    const loading = document.getElementById('digestLoading');
    const content = document.getElementById('digestContentView');
    const subjectEl = document.getElementById('digestSubject');
    const previewEl = document.getElementById('digestPreviewHtml');

    if (loading) loading.classList.add('hidden');
    if (content) content.classList.remove('hidden');

    if (subjectEl) subjectEl.textContent = digest.subject || 'Briefing Rassegna Stampa';
    if (previewEl) {
        let clipsHtml = '';
        if (Array.isArray(digest.clips)) {
            clipsHtml = digest.clips.map(c => `
                <div style="margin-bottom:0.9rem; padding-bottom:0.9rem; border-bottom:1px solid rgba(255,255,255,0.06);">
                    <div style="font-size:0.78rem; color:var(--accent-primary); font-weight:700; margin-bottom:2px; text-transform:capitalize;">
                        ${escapeHtml(c.source)} &bull; <span style="font-weight:600; color:${c.sentiment === 'positivo' ? '#10b981' : (c.sentiment === 'critico' ? '#ef4444' : 'var(--text-muted)')};">${escapeHtml(c.sentiment || 'Neutro')}</span>
                    </div>
                    <div style="font-weight:700; font-size:0.96rem; margin:2px 0 4px; line-height:1.35; color:var(--text-primary);">${escapeHtml(c.title)}</div>
                    <div style="font-size:0.84rem; color:var(--text-muted); line-height:1.5;">${escapeHtml(c.one_liner || '')}</div>
                </div>
            `).join('');
        }

        let highlightsHtml = '';
        if (Array.isArray(digest.highlights)) {
            highlightsHtml = `<ul style="margin:0 0 1.25rem 0; padding-left:1.25rem; font-size:0.88rem; line-height:1.65; color:var(--text-primary);">
                ${digest.highlights.map(h => `<li style="margin-bottom:4px;">${escapeHtml(h)}</li>`).join('')}
            </ul>`;
        }

        const mood = digest.mood_sentiment || digest.mood_summary || '';

        previewEl.innerHTML = `
            <div style="font-size:0.72rem; text-transform:uppercase; letter-spacing:0.8px; color:var(--text-muted); font-weight:700; margin-bottom:0.6rem;">SINTESI ESECUTIVA:</div>
            ${highlightsHtml}
            <div style="font-size:0.72rem; text-transform:uppercase; letter-spacing:0.8px; color:var(--text-muted); font-weight:700; margin:1.25rem 0 0.6rem 0;">CLIP STAMPA PRINCIPALI:</div>
            ${clipsHtml}
            ${mood ? `<div style="margin-top:1rem; font-size:0.82rem; background:rgba(255,255,255,0.03); padding:10px 14px; border-radius:6px; border-left:3px solid var(--accent-primary); color:var(--text-muted);"><strong>Clima Media:</strong> ${escapeHtml(mood)}</div>` : ''}
        `;
    }
    if (window.feather) feather.replace();
}

window.closeMorningDigestModal = function() {
    const modal = document.getElementById('morningDigestModal');
    if (modal) {
        modal.classList.add('hidden');
        modal.style.display = 'none';
    }
};

window.copyDigestEmail = async function(btnEl) {
    if (!currentDigestData) return;
    const btn = btnEl || document.getElementById('btnCopyEmail');
    const originalHtml = btn ? btn.innerHTML : null;

    const htmlContent = currentDigestData.emailHtml || '';
    const textContent = currentDigestData.emailText || currentDigestData.whatsappText || '';

    function showSuccessFeedback() {
        if (btn) {
            btn.innerHTML = '<i data-feather="check" style="width:14px;height:14px;vertical-align:middle;margin-right:4px;"></i> Copiato!';
            btn.style.background = '#10b981';
            btn.style.borderColor = '#10b981';
            btn.style.color = '#ffffff';
            if (window.feather) feather.replace();
            setTimeout(() => {
                if (btn) {
                    btn.innerHTML = originalHtml;
                    btn.style.background = '';
                    btn.style.borderColor = '';
                    btn.style.color = '';
                    if (window.feather) feather.replace();
                }
            }, 2200);
        }
        showToast('Briefing formattato copiato! Incollalo nella mail con formattazione originale.', 'success');
    }

    try {
        if (navigator.clipboard && window.ClipboardItem) {
            const item = new ClipboardItem({
                'text/html': new Blob([htmlContent], { type: 'text/html' }),
                'text/plain': new Blob([textContent], { type: 'text/plain' })
            });
            await navigator.clipboard.write([item]);
            showSuccessFeedback();
        } else {
            await navigator.clipboard.writeText(textContent);
            showSuccessFeedback();
        }
    } catch(err) {
        try {
            await navigator.clipboard.writeText(textContent);
            showSuccessFeedback();
        } catch(e) {
            showToast('Errore durante la copia: ' + err.message, 'error');
        }
    }
};

window.copyDigestWhatsApp = async function(btnEl) {
    if (!currentDigestData) return;
    const btn = btnEl || document.getElementById('btnCopyWhatsApp');
    const originalHtml = btn ? btn.innerHTML : null;
    const text = currentDigestData.whatsappText || currentDigestData.emailText || '';

    try {
        await navigator.clipboard.writeText(text);
        if (btn) {
            btn.innerHTML = '<i data-feather="check" style="width:14px;height:14px;vertical-align:middle;margin-right:4px;"></i> Copiato!';
            btn.style.borderColor = '#10b981';
            btn.style.color = '#10b981';
            if (window.feather) feather.replace();
            setTimeout(() => {
                if (btn) {
                    btn.innerHTML = originalHtml;
                    btn.style.borderColor = '';
                    btn.style.color = '';
                    if (window.feather) feather.replace();
                }
            }, 2200);
        }
        showToast('Briefing WhatsApp / Chat copiato negli appunti!', 'success');
    } catch(err) {
        showToast('Errore durante la copia: ' + err.message, 'error');
    }
};

window.openDigestMailto = function() {
    if (!currentDigestData) return;
    const subject = encodeURIComponent(currentDigestData.subject || 'Briefing Esecutivo Stampa');
    const body = encodeURIComponent(currentDigestData.emailText || currentDigestData.whatsappText || '');
    window.location.href = `mailto:?subject=${subject}&body=${body}`;
};

// --- 3. WEB CLIENT PORTAL & SHARING ---
window.openShareModal = async function(reviewId) {
    try {
        showToast('Generazione link condivisibile protetto...', 'info');
        const res = await apiCall('POST', `/api/pdf/share/${reviewId}`);
        if (res && res.shareUrl) {
            const fullUrl = window.location.origin + res.shareUrl;
            const input = document.getElementById('shareReviewUrlInput');
            const portalBtn = document.getElementById('btnOpenSharePortalLink');
            const waBtn = document.getElementById('btnShareWhatsAppLink');

            if (input) input.value = fullUrl;
            if (portalBtn) portalBtn.href = fullUrl;
            if (waBtn) {
                const waText = encodeURIComponent(`Ecco la rassegna stampa aggiornata: ${fullUrl}`);
                waBtn.href = `https://api.whatsapp.com/send?text=${waText}`;
            }

            const modal = document.getElementById('shareReviewModal');
            if (modal) {
                modal.classList.remove('hidden');
                modal.style.display = 'flex';
                feather.replace();
            }
        }
    } catch (err) {
        showToast('Errore durante la condivisione: ' + err.message, 'error');
    }
};

window.openShareModalForCurrentReview = async function() {
    if (!state.articles || state.articles.length === 0) {
        showToast('Aggiungi almeno un articolo alla rassegna per condividerla.', 'warning');
        return;
    }

    if (state.currentReviewId) {
        return openShareModal(state.currentReviewId);
    }

    try {
        showToast('Archiviazione e generazione link condivisibile...', 'info');
        const title = document.getElementById('rassegnaTitle')?.value.trim() || ('Rassegna Stampa del ' + new Date().toLocaleDateString('it-IT'));
        const clientName = document.getElementById('clientName')?.value.trim() || '';

        const saveRes = await apiCall('POST', '/api/pdf/archive', {
            articles: state.articles,
            title,
            clientName,
            clientLogo: state.clientLogoBase64
        });

        if (saveRes && saveRes.id) {
            state.currentReviewId = saveRes.id;
            sessionStorage.setItem('rs_draft_review_id', saveRes.id);
            loadHistory();
            openShareModal(saveRes.id);
        }
    } catch (err) {
        showToast('Errore: ' + err.message, 'error');
    }
};

window.closeShareModal = function() {
    const modal = document.getElementById('shareReviewModal');
    if (modal) {
        modal.classList.add('hidden');
        modal.style.display = 'none';
    }
};

window.copyShareReviewUrl = function() {
    const input = document.getElementById('shareReviewUrlInput');
    if (!input || !input.value) return;
    navigator.clipboard.writeText(input.value).then(() => {
        showToast('Link rassegna cliente copiato negli appunti!', 'success');
    }).catch(() => showToast('Errore durante la copia', 'error'));
};

// --- 4. MEDIA CONTACTS CRM & MAILING LIST CONTROLLER ---
let mediaContactsList = [];
let selectedContactIds = new Set();
let pressReleasesCache = [];

window.loadMediaContacts = async function(beat = '', search = '') {
    const tbody = document.getElementById('crmContactsTableBody');
    if (!tbody) return;

    try {
        let url = '/api/contacts';
        const params = [];
        if (beat && beat !== 'tutti') params.push(`beat=${encodeURIComponent(beat)}`);
        if (search) params.push(`search=${encodeURIComponent(search)}`);
        if (params.length > 0) url += `?${params.join('&')}`;

        const res = await apiCall('GET', url);
        mediaContactsList = res.contacts || [];

        // Update CRM stats
        const totalEl = document.getElementById('crmTotalContacts');
        const outletsEl = document.getElementById('crmTotalOutlets');
        const beatsEl = document.getElementById('crmTotalBeats');

        if (totalEl) totalEl.textContent = res.stats?.total !== undefined ? res.stats.total : mediaContactsList.length;
        if (outletsEl) {
            if (res.stats?.uniqueOutlets !== undefined) {
                outletsEl.textContent = res.stats.uniqueOutlets;
            } else {
                const uniqueOutlets = new Set(mediaContactsList.map(c => (c.outlet || '').trim().toLowerCase()).filter(Boolean));
                outletsEl.textContent = uniqueOutlets.size;
            }
        }
        if (beatsEl) {
            if (res.stats?.beats !== undefined) {
                beatsEl.textContent = res.stats.beats.length;
            } else {
                const uniqueBeats = new Set(mediaContactsList.map(c => (c.beat || '').trim().toLowerCase()).filter(Boolean));
                beatsEl.textContent = uniqueBeats.size;
            }
        }

        if (mediaContactsList.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="7" style="text-align:center; padding:3rem 1rem; color:var(--text-muted);">
                        <i data-feather="users" style="width:36px; height:36px; opacity:0.4; margin-bottom:0.5rem; display:block; margin-left:auto; margin-right:auto;"></i>
                        Nessun contatto trovato. Clicca su "+ Nuovo Contatto" o "Importa CSV" per iniziare la tua rubrica stampa!
                    </td>
                </tr>
            `;
            updateMailingListBar();
            feather.replace();
            return;
        }

        const beatLabels = {
            economia: 'Economia & Finanza',
            tecnologia: 'Tecnologia & AI',
            cronaca: 'Cronaca & Territorio',
            politica: 'Politica & Istituzioni',
            sanita: 'Sanità & Salute',
            lifestyle: 'Lifestyle & Cultura',
            generale: 'Generale'
        };

        tbody.innerHTML = mediaContactsList.map(c => {
            const beatName = beatLabels[c.beat] || c.beat || 'Generale';
            const isChecked = selectedContactIds.has(c.id);
            return `
                <tr style="border-bottom:1px solid rgba(255,255,255,0.05); transition:background 0.15s ease; ${isChecked ? 'background:rgba(124,92,255,0.06);' : ''}" onmouseover="if(!${isChecked}) this.style.background='rgba(255,255,255,0.02)'" onmouseout="if(!${isChecked}) this.style.background='transparent'">
                    <td style="padding:12px 16px; text-align:center;">
                        <input type="checkbox" class="crm-contact-checkbox" data-id="${c.id}" ${isChecked ? 'checked' : ''} onchange="toggleContactSelection(${c.id}, this.checked)" style="cursor:pointer; accent-color:var(--accent-primary); width:16px; height:16px;">
                    </td>
                    <td style="padding:12px 16px;">
                        <strong style="color:var(--text-primary); font-size:0.92rem; display:block;">${escapeHtml(c.name)}</strong>
                    </td>
                    <td style="padding:12px 16px;">
                        <span style="font-weight:600; color:var(--accent-primary);">${escapeHtml(c.outlet)}</span>
                        ${c.role ? `<span style="display:block; font-size:0.75rem; color:var(--text-muted); margin-top:2px;">${escapeHtml(c.role)}</span>` : ''}
                    </td>
                    <td style="padding:12px 16px;">
                        <span class="badge" style="background:rgba(124,92,255,0.12); color:var(--accent-primary); border:1px solid rgba(124,92,255,0.25); font-size:0.72rem; padding:3px 8px; border-radius:12px; font-weight:600;">
                            ${escapeHtml(beatName)}
                        </span>
                    </td>
                    <td style="padding:12px 16px;">
                        <a href="mailto:${encodeURIComponent(c.email)}" style="color:var(--text-primary); text-decoration:none; display:flex; align-items:center; gap:5px; font-size:0.83rem;" title="Invia Email Diretta">
                            <i data-feather="mail" style="width:12px; height:12px; color:var(--text-muted);"></i> ${escapeHtml(c.email)}
                        </a>
                        ${c.phone ? `<a href="tel:${encodeURIComponent(c.phone)}" style="color:var(--text-muted); text-decoration:none; display:flex; align-items:center; gap:5px; font-size:0.78rem; margin-top:3px;" title="Chiama">
                            <i data-feather="phone" style="width:11px; height:11px;"></i> ${escapeHtml(c.phone)}
                        </a>` : ''}
                    </td>
                    <td style="padding:12px 16px; max-width:180px; font-size:0.8rem; color:var(--text-muted); overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="${escapeHtml(c.notes || '')}">
                        ${escapeHtml(c.notes || '-')}
                    </td>
                    <td style="padding:12px 16px; text-align:right; white-space:nowrap;">
                        <button type="button" class="btn btn-outline btn-sm" onclick="editMediaContact(${c.id})" style="padding:4px 8px; margin-right:4px;" title="Modifica">
                            <i data-feather="edit-2" style="width:13px; height:13px;"></i>
                        </button>
                        <button type="button" class="btn btn-outline btn-sm" onclick="deleteMediaContact(${c.id})" style="padding:4px 8px; color:var(--danger); border-color:rgba(239,68,68,0.3);" title="Elimina">
                            <i data-feather="trash-2" style="width:13px; height:13px;"></i>
                        </button>
                    </td>
                </tr>
            `;
        }).join('');

        updateMailingListBar();
        feather.replace();

    } catch (err) {
        console.error('Errore loadMediaContacts:', err);
        tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding:2rem; color:var(--danger);">Errore nel caricamento della rubrica. Riprova più tardi.</td></tr>`;
    }
};

window.filterCrmContacts = function() {
    const beat = document.getElementById('crmBeatFilter')?.value || '';
    const search = document.getElementById('crmSearchInput')?.value || '';
    loadMediaContacts(beat, search);
};

// --- CONTACT SELECTION & MAILING LIST BAR ---
window.toggleContactSelection = function(id, isChecked) {
    const numId = Number(id);
    if (isChecked) {
        selectedContactIds.add(numId);
    } else {
        selectedContactIds.delete(numId);
    }
    updateMailingListBar();
};

window.toggleCrmSelectAll = function(masterCheckbox) {
    const isChecked = masterCheckbox.checked;
    mediaContactsList.forEach(c => {
        if (isChecked) {
            selectedContactIds.add(c.id);
        } else {
            selectedContactIds.delete(c.id);
        }
    });

    document.querySelectorAll('.crm-contact-checkbox').forEach(cb => {
        cb.checked = isChecked;
    });

    updateMailingListBar();
};

window.selectAllVisibleContacts = function() {
    if (mediaContactsList.length === 0) {
        showToast('Nessun contatto visualizzato da selezionare.', 'warning');
        return;
    }
    mediaContactsList.forEach(c => selectedContactIds.add(c.id));
    document.querySelectorAll('.crm-contact-checkbox').forEach(cb => { cb.checked = true; });
    const master = document.getElementById('crmSelectAll');
    if (master) {
        master.checked = true;
        master.indeterminate = false;
    }
    updateMailingListBar();
    showToast(`${mediaContactsList.length} contatti selezionati per la mailing list!`, 'info');
};

window.clearCrmSelection = function() {
    selectedContactIds.clear();
    document.querySelectorAll('.crm-contact-checkbox').forEach(cb => { cb.checked = false; });
    const master = document.getElementById('crmSelectAll');
    if (master) {
        master.checked = false;
        master.indeterminate = false;
    }
    updateMailingListBar();
};

window.updateMailingListBar = function() {
    const count = selectedContactIds.size;
    const bar = document.getElementById('crmMailingListBar');
    const countEl = document.getElementById('crmSelectedCount');
    if (countEl) countEl.textContent = count;
    if (bar) bar.style.display = count > 0 ? 'flex' : 'none';

    // Update master checkbox state
    const master = document.getElementById('crmSelectAll');
    if (master && mediaContactsList.length > 0) {
        const visibleCount = mediaContactsList.length;
        const selectedVisible = mediaContactsList.filter(c => selectedContactIds.has(c.id)).length;
        master.checked = selectedVisible === visibleCount && visibleCount > 0;
        master.indeterminate = selectedVisible > 0 && selectedVisible < visibleCount;
    }
};

window.getSelectedContacts = function() {
    return mediaContactsList.filter(c => selectedContactIds.has(c.id));
};

window.copySelectedEmailsBcc = function() {
    const selected = window.getSelectedContacts();
    if (selected.length === 0) {
        showToast('Seleziona almeno un contatto con la casella di spunta.', 'warning');
        return;
    }
    const emails = selected.map(c => (c.email || '').trim()).filter(Boolean);
    if (emails.length === 0) {
        showToast('Nessuna email valida trovata nei contatti selezionati.', 'error');
        return;
    }

    navigator.clipboard.writeText(emails.join(', ')).then(() => {
        showToast(`${emails.length} indirizzi email copiati negli appunti (pronti per il campo Ccn)!`, 'success');
    }).catch(() => {
        showToast('Errore durante la copia negli appunti.', 'error');
    });
};

window.exportSelectedContactsCsv = function() {
    let contactsToExport = window.getSelectedContacts();
    if (contactsToExport.length === 0) {
        contactsToExport = mediaContactsList;
    }
    if (contactsToExport.length === 0) {
        showToast('Nessun contatto disponibile da esportare.', 'warning');
        return;
    }

    let csvContent = '\uFEFFNome,Testata,Ruolo,Settore,Email,Telefono,Note\n';
    contactsToExport.forEach(c => {
        const row = [
            '"' + (c.name || '').replace(/"/g, '""') + '"',
            '"' + (c.outlet || '').replace(/"/g, '""') + '"',
            '"' + (c.role || '').replace(/"/g, '""') + '"',
            '"' + (c.beat || 'generale').replace(/"/g, '""') + '"',
            '"' + (c.email || '').replace(/"/g, '""') + '"',
            '"' + (c.phone || '').replace(/"/g, '""') + '"',
            '"' + (c.notes || '').replace(/"/g, '""') + '"'
        ].join(',');
        csvContent += row + '\n';
    });

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `rubrica_media_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast(`Esportati ${contactsToExport.length} contatti in CSV con successo!`, 'success');
};

window.quickLaunchMailingList = function() {
    if (selectedContactIds.size === 0 && mediaContactsList.length > 0) {
        window.selectAllVisibleContacts();
    }
    window.openMailingListModal();
};

// --- MAILING LIST LAUNCH MODAL CONTROLLER ---
window.openMailingListModal = async function() {
    let selected = window.getSelectedContacts();
    if (selected.length === 0) {
        if (mediaContactsList.length > 0) {
            window.selectAllVisibleContacts();
            selected = window.getSelectedContacts();
        } else {
            showToast('Aggiungi o importa prima dei contatti nella rubrica per preparare una mailing list.', 'warning');
            return;
        }
    }

    window.renderMailingListRecipients();

    // Populate press releases dropdown
    const select = document.getElementById('mlPressReleaseSelect');
    if (select) {
        select.innerHTML = '<option value="">-- Seleziona un comunicato salvato o scrivi liberamente --</option>';
        try {
            const history = await apiCall('GET', '/api/press/history');
            if (Array.isArray(history) && history.length > 0) {
                pressReleasesCache = history;
                history.forEach(p => {
                    const opt = document.createElement('option');
                    opt.value = p.id;
                    const dateStr = p.created_at ? new Date(p.created_at).toLocaleDateString() : '';
                    opt.textContent = `${p.title || 'Comunicato #' + p.id} ${p.client_name ? '(' + p.client_name + ')' : ''} [${dateStr}]`;
                    select.appendChild(opt);
                });
            }
        } catch(e) {
            console.log('Notice: press releases history not loaded', e);
        }
    }

    const modal = document.getElementById('mailingListLaunchModal');
    if (modal) {
        modal.classList.remove('hidden');
        modal.style.display = 'flex';
        feather.replace();
    }
};

window.closeMailingListModal = function() {
    const modal = document.getElementById('mailingListLaunchModal');
    if (modal) {
        modal.classList.add('hidden');
        modal.style.display = 'none';
    }
};

window.renderMailingListRecipients = function() {
    const container = document.getElementById('mlRecipientsContainer');
    const countEl = document.getElementById('mlModalRecipientCount');
    const selected = window.getSelectedContacts();

    if (countEl) countEl.textContent = selected.length;
    if (!container) return;

    if (selected.length === 0) {
        container.innerHTML = '<span style="color:var(--danger); font-size:0.8rem;">Nessun destinatario selezionato. Chiudi e seleziona i giornalisti dalla lista.</span>';
        return;
    }

    container.innerHTML = selected.map(c => `
        <span style="background:rgba(124,92,255,0.15); border:1px solid rgba(124,92,255,0.3); border-radius:14px; padding:3px 10px; font-size:0.75rem; color:var(--text-primary); display:inline-flex; align-items:center; gap:6px;">
            <strong>${escapeHtml(c.name)}</strong>
            <span style="color:var(--text-muted); font-size:0.72rem;">(${escapeHtml(c.outlet || 'Media')})</span>
            <span style="color:var(--accent-primary); font-size:0.72rem;">&lt;${escapeHtml(c.email)}&gt;</span>
            <i data-feather="x" style="width:11px; height:11px; cursor:pointer; opacity:0.7;" onclick="removeRecipientFromMailing(${c.id})" title="Rimuovi"></i>
        </span>
    `).join('');

    feather.replace();
};

window.removeRecipientFromMailing = function(id) {
    selectedContactIds.delete(Number(id));
    updateMailingListBar();
    window.renderMailingListRecipients();

    const cb = document.querySelector(`.crm-contact-checkbox[data-id="${id}"]`);
    if (cb) cb.checked = false;
};

window.onSelectPressReleaseForMailing = async function(pressId) {
    if (!pressId) return;
    try {
        const press = await apiCall('GET', `/api/press/${pressId}`);
        if (!press) return;

        const subjectInput = document.getElementById('mlEmailSubject');
        const bodyTextarea = document.getElementById('mlEmailBody');

        if (subjectInput) {
            subjectInput.value = `COMUNICATO STAMPA: ${press.title || ''}`;
        }
        if (bodyTextarea) {
            // Strip HTML tags for clean plain text in email client
            let plainContent = (press.content || press.raw_content || '').replace(/<[^>]+>/g, '').trim();
            const header = `Gentile Redazione / Gentile Collega,\n\ninviamo per la vostra cortese attenzione il seguente comunicato stampa:\n\n=== ${((press.title || '')).toUpperCase()} ===\n\n`;
            const footer = `\n\n--\nUfficio Stampa & Comunicazione\nEmail: press@${(press.client_name || 'azienda').toLowerCase().replace(/[^a-z0-9]/g, '')}.it`;
            bodyTextarea.value = header + plainContent + footer;
        }
        showToast('Titolo e testo del comunicato stampa caricati!', 'info');
    } catch(err) {
        console.error('Errore recupero comunicato stampa:', err);
    }
};

window.triggerMailingListMailto = function() {
    const selected = window.getSelectedContacts();
    const emails = selected.map(c => (c.email || '').trim()).filter(Boolean);

    if (emails.length === 0) {
        showToast('Seleziona almeno un contatto con email valida.', 'warning');
        return;
    }

    const subject = (document.getElementById('mlEmailSubject')?.value || '').trim();
    const body = (document.getElementById('mlEmailBody')?.value || '').trim();

    if (!subject) {
        showToast("Inserisci l'oggetto dell'email prima di inviare.", 'warning');
        return;
    }
    if (!body) {
        showToast('Inserisci il messaggio o comunicato stampa da inviare.', 'warning');
        return;
    }

    const bccParam = emails.join(',');
    const mailtoUrl = `mailto:?bcc=${encodeURIComponent(bccParam)}&subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;

    // If mailto URL exceeds browser/OS length limit (~2000 chars), handle gracefully
    if (mailtoUrl.length > 1950) {
        navigator.clipboard.writeText(emails.join(', '));
        showToast(`I ${emails.length} indirizzi superano la capienza massima del link rapido. Sono stati copiati automaticamente negli appunti! Incollali nel campo Ccn della tua email.`, 'info', 7000);
        window.location.href = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
        return;
    }

    // Copy BCC to clipboard as safety backup
    navigator.clipboard.writeText(emails.join(', ')).catch(() => {});
    showToast(`Apertura client email con ${emails.length} destinatari in Ccn...`, 'success');
    window.location.href = mailtoUrl;
};

window.copyMailingListTextAndBcc = function() {
    const selected = window.getSelectedContacts();
    const emails = selected.map(c => (c.email || '').trim()).filter(Boolean);
    const subject = (document.getElementById('mlEmailSubject')?.value || '').trim();
    const body = (document.getElementById('mlEmailBody')?.value || '').trim();

    const fullText = `DESTINATARI IN CCN (${emails.length}):\n${emails.join(', ')}\n\nOGGETTO:\n${subject}\n\nTESTO:\n${body}`;
    navigator.clipboard.writeText(fullText).then(() => {
        showToast(`Tutto copiato negli appunti: Destinatari Ccn (${emails.length}), Oggetto e Testo del Comunicato!`, 'success');
    }).catch(() => {
        showToast('Errore durante la copia negli appunti.', 'error');
    });
};

// --- ADD / EDIT CONTACT MODAL ---
window.openAddContactModal = function() {
    document.getElementById('contactEditId').value = '';
    document.getElementById('contactModalTitle').innerHTML = '<i data-feather="user-plus" style="color:var(--accent-primary); width:18px; height:18px;"></i> <span>Nuovo Contatto Giornalista</span>';
    document.getElementById('contactModalName').value = '';
    document.getElementById('contactModalOutlet').value = '';
    document.getElementById('contactModalRole').value = '';
    document.getElementById('contactModalBeat').value = 'economia';
    document.getElementById('contactModalEmail').value = '';
    document.getElementById('contactModalPhone').value = '';
    document.getElementById('contactModalNotes').value = '';

    const modal = document.getElementById('addContactModal');
    if (modal) {
        modal.classList.remove('hidden');
        modal.style.display = 'flex';
        feather.replace();
    }
};

window.editMediaContact = function(id) {
    const contact = mediaContactsList.find(c => c.id === id);
    if (!contact) return;

    document.getElementById('contactEditId').value = contact.id;
    document.getElementById('contactModalTitle').innerHTML = '<i data-feather="edit-2" style="color:var(--accent-primary); width:18px; height:18px;"></i> <span>Modifica Contatto</span>';
    document.getElementById('contactModalName').value = contact.name || '';
    document.getElementById('contactModalOutlet').value = contact.outlet || '';
    document.getElementById('contactModalRole').value = contact.role || '';
    document.getElementById('contactModalBeat').value = contact.beat || 'generale';
    document.getElementById('contactModalEmail').value = contact.email || '';
    document.getElementById('contactModalPhone').value = contact.phone || '';
    document.getElementById('contactModalNotes').value = contact.notes || '';

    const modal = document.getElementById('addContactModal');
    if (modal) {
        modal.classList.remove('hidden');
        modal.style.display = 'flex';
        feather.replace();
    }
};

window.closeContactModal = function() {
    const modal = document.getElementById('addContactModal');
    if (modal) {
        modal.classList.add('hidden');
        modal.style.display = 'none';
    }
};

window.saveMediaContact = async function(e) {
    if (e) e.preventDefault();
    const id = document.getElementById('contactEditId').value;
    const name = document.getElementById('contactModalName').value.trim();
    const outlet = document.getElementById('contactModalOutlet').value.trim();
    const role = document.getElementById('contactModalRole').value.trim();
    const beat = document.getElementById('contactModalBeat').value;
    const email = document.getElementById('contactModalEmail').value.trim();
    const phone = document.getElementById('contactModalPhone').value.trim();
    const notes = document.getElementById('contactModalNotes').value.trim();

    if (!name || !outlet || !email) {
        showToast('Nome, Testata ed Email sono campi obbligatori.', 'error');
        return;
    }

    try {
        if (id) {
            await apiCall('PUT', `/api/contacts/${id}`, { name, outlet, role, beat, email, phone, notes });
            showToast('Contatto aggiornato con successo!', 'success');
        } else {
            await apiCall('POST', '/api/contacts', { name, outlet, role, beat, email, phone, notes });
            showToast('Nuovo contatto aggiunto alla rubrica!', 'success');
        }
        closeContactModal();
        loadMediaContacts();
    } catch (err) {
        showToast('Errore: ' + (err.message || 'Impossibile salvare il contatto.'), 'error');
    }
};

window.deleteMediaContact = async function(id) {
    if (!confirm('Sei sicuro di voler rimuovere questo contatto dalla rubrica?')) return;
    try {
        await apiCall('DELETE', `/api/contacts/${id}`);
        selectedContactIds.delete(Number(id));
        showToast('Contatto rimosso dalla rubrica.', 'success');
        loadMediaContacts();
    } catch (err) {
        showToast('Errore: ' + (err.message || 'Impossibile eliminare il contatto.'), 'error');
    }
};

// --- IMPORT CONTACTS CSV / TEXT MODAL ---
window.openImportContactsModal = function() {
    const modal = document.getElementById('importContactsModal');
    const textarea = document.getElementById('importContactsTextarea');
    const countEl = document.getElementById('importContactsCount');
    if (textarea) {
        textarea.value = '';
        if (!textarea.dataset.countListener) {
            textarea.dataset.countListener = 'true';
            textarea.addEventListener('input', () => {
                const lines = textarea.value.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
                if (countEl) countEl.textContent = `${lines.length} contatti rilevati`;
            });
        }
    }
    if (countEl) countEl.textContent = '0 contatti rilevati';
    if (modal) {
        modal.classList.remove('hidden');
        modal.style.display = 'flex';
        feather.replace();
    }
};

window.closeImportContactsModal = function() {
    const modal = document.getElementById('importContactsModal');
    if (modal) {
        modal.classList.add('hidden');
        modal.style.display = 'none';
    }
};

window.executeImportContacts = async function() {
    const textarea = document.getElementById('importContactsTextarea');
    const text = textarea ? textarea.value.trim() : '';
    if (!text) {
        showToast('Incolla almeno una riga di testo o CSV per importare.', 'warning');
        return;
    }

    try {
        const res = await apiCall('POST', '/api/contacts/import', { text });
        const count = res.count !== undefined ? res.count : (res.imported || 0);
        showToast(`Importazione completata: ${count} contatti aggiunti alla rubrica!`, 'success');
        closeImportContactsModal();
        loadMediaContacts();
    } catch (err) {
        showToast('Errore importazione: ' + (err.message || 'Errore sconosciuto'), 'error');
    }
};

// Hook into showDashboardPage to load Media CRM, History or Briefing
(function() {
    const origShow = window.showDashboardPage;
    window.showDashboardPage = function(page, updateHash) {
        if (typeof origShow === 'function') {
            origShow(page, updateHash);
        }
        if (page === 'media-crm') {
            loadMediaContacts();
        } else if (page === 'storico') {
            loadHistory();
        } else if (page === 'briefing') {
            initBriefingPage();
        }
    };
})();

// ==========================================================================
// --- DEDICATED EXECUTIVE BRIEFING PAGE (#page-briefing) ---
// ==========================================================================
let currentPageDigestData = null;

window.initBriefingPage = async function() {
    const selectBriefing = document.getElementById('selectBriefingSource');
    const selectKpi = document.getElementById('selectKpiSource');
    if (!selectBriefing && !selectKpi) return;

    // Restore state.articles if empty from localStorage or sessionStorage
    if (!state.articles || state.articles.length === 0) {
        try {
            const editorState = JSON.parse(localStorage.getItem('rs_editor_state') || '{}');
            if (editorState && Array.isArray(editorState.articles) && editorState.articles.length > 0) {
                state.articles = editorState.articles;
            } else {
                const draft = JSON.parse(sessionStorage.getItem('rs_draft_articles') || '[]');
                if (Array.isArray(draft) && draft.length > 0) {
                    state.articles = draft;
                }
            }
        } catch(e) {}
    }

    const prevBriefingVal = selectBriefing ? selectBriefing.value : null;
    const prevKpiVal = selectKpi ? selectKpi.value : null;

    if (selectBriefing) selectBriefing.innerHTML = '';
    if (selectKpi) selectKpi.innerHTML = '';

    // 1. Active working review
    const activeCount = (state.articles && state.articles.length) ? state.articles.length : 0;
    const activeLabel = activeCount > 0 
        ? `Rassegna attuale in lavorazione (${activeCount} ${activeCount === 1 ? 'articolo' : 'articoli'})`
        : `Rassegna attuale in lavorazione (Nessun articolo attivo)`;

    if (selectBriefing) {
        const activeOpt = document.createElement('option');
        activeOpt.value = 'active';
        activeOpt.textContent = activeLabel;
        selectBriefing.appendChild(activeOpt);
    }
    if (selectKpi) {
        const activeOpt = document.createElement('option');
        activeOpt.value = 'active';
        activeOpt.textContent = activeLabel;
        selectKpi.appendChild(activeOpt);
    }

    // 2. Historic reviews
    let historyCount = 0;
    try {
        const history = await apiCall('GET', '/api/pdf/history');
        if (Array.isArray(history) && history.length > 0) {
            historyCount = history.length;
            const optGroupBriefing = document.createElement('optgroup');
            optGroupBriefing.label = 'Storico Rassegne Salvate';
            const optGroupKpi = document.createElement('optgroup');
            optGroupKpi.label = 'Storico Rassegne Salvate';

            history.forEach(item => {
                const clientPart = item.client_name ? `${item.client_name} • ` : '';
                const countPart = `${item.article_count || 0} articoli`;
                const datePart = item.created_at ? ` • ${new Date(item.created_at).toLocaleDateString('it-IT')}` : '';
                const text = `${item.title || 'Rassegna'} (${clientPart}${countPart}${datePart})`;

                if (selectBriefing) {
                    const opt = document.createElement('option');
                    opt.value = String(item.id);
                    opt.textContent = text;
                    optGroupBriefing.appendChild(opt);
                }
                if (selectKpi) {
                    const opt = document.createElement('option');
                    opt.value = String(item.id);
                    opt.textContent = text;
                    optGroupKpi.appendChild(opt);
                }
            });

            if (selectBriefing) selectBriefing.appendChild(optGroupBriefing);
            if (selectKpi) selectKpi.appendChild(optGroupKpi);
        }
    } catch (err) {
        console.warn('Errore caricamento storico per il briefing:', err);
    }

    // Restore selection or pick best default
    if (selectBriefing) {
        if (prevBriefingVal && Array.from(selectBriefing.options).some(o => o.value === prevBriefingVal)) {
            selectBriefing.value = prevBriefingVal;
        } else if (activeCount > 0) {
            selectBriefing.value = 'active';
        } else if (selectBriefing.options.length > 1) {
            selectBriefing.selectedIndex = 1;
        }
    }

    if (selectKpi) {
        if (prevKpiVal && Array.from(selectKpi.options).some(o => o.value === prevKpiVal)) {
            selectKpi.value = prevKpiVal;
        } else if (activeCount > 0) {
            selectKpi.value = 'active';
        } else if (selectKpi.options.length > 1) {
            selectKpi.selectedIndex = 1;
        }
        // Automatically render KPI A4 preview immediately
        onKpiSourceChange();
    }

    // Synchronize selectBriefing and selectKpi
    if (selectBriefing && selectKpi) {
        if (!selectBriefing.dataset.syncBound) {
            selectBriefing.dataset.syncBound = 'true';
            selectBriefing.addEventListener('change', () => {
                if (selectKpi.value !== selectBriefing.value) {
                    selectKpi.value = selectBriefing.value;
                    if (typeof onKpiSourceChange === 'function') onKpiSourceChange();
                }
            });
        }
        if (!selectKpi.dataset.syncBound) {
            selectKpi.dataset.syncBound = 'true';
            selectKpi.addEventListener('change', () => {
                if (selectBriefing.value !== selectKpi.value) {
                    selectBriefing.value = selectKpi.value;
                }
            });
        }
    }

    if (window.feather) feather.replace();
};

window.generateBriefingFromPageSelector = async function() {
    const select = document.getElementById('selectBriefingSource');
    const loading = document.getElementById('pageBriefingLoading');
    const result = document.getElementById('pageBriefingResult');
    const btn = document.getElementById('btnGenerateBriefingPage');
    if (!select) return;

    const sourceVal = select.value;
    let articles = [];
    let title = 'Rassegna Stampa';
    let clientName = '';

    if (sourceVal === 'active') {
        if (!state.articles || state.articles.length === 0) {
            showToast('Nessun articolo nella rassegna attuale. Seleziona una rassegna dallo storico o aggiungi link in Nuova Rassegna.', 'warning');
            return;
        }
        articles = state.articles.map(a => ({
            title: a.title,
            source_name: a.source_name,
            source_type: a.source_type,
            published_date: a.published_date,
            url: a.url,
            excerpt: a.excerpt
        }));
        title = document.getElementById('rassegnaTitle')?.value.trim() || 'Rassegna Stampa';
        clientName = document.getElementById('clientName')?.value.trim() || '';
    } else {
        try {
            if (btn) btn.disabled = true;
            if (loading) loading.classList.remove('hidden');
            if (result) result.classList.add('hidden');

            const reviewData = await apiCall('GET', `/api/pdf/review/${sourceVal}`);
            if (!reviewData.articles || reviewData.articles.length === 0) {
                throw new Error('Nessun articolo trovato in questa rassegna.');
            }
            articles = reviewData.articles.map(a => ({
                title: a.title,
                source_name: a.source_name,
                source_type: a.source_type,
                published_date: a.published_date,
                url: a.url,
                excerpt: a.excerpt
            }));
            title = reviewData.title || 'Rassegna Stampa';
            clientName = reviewData.clientName || '';
        } catch (err) {
            if (btn) btn.disabled = false;
            if (loading) loading.classList.add('hidden');
            showToast('Errore nel caricamento della rassegna dallo storico: ' + err.message, 'error');
            return;
        }
    }

    try {
        if (btn) btn.disabled = true;
        if (loading) loading.classList.remove('hidden');
        if (result) result.classList.add('hidden');

        const data = await apiCall('POST', '/api/articles/digest', {
            articles,
            clientName,
            rassegnaTitle: title
        });

        if (!data || !data.digest) {
            throw new Error('Impossibile elaborare il Briefing Esecutivo.');
        }

        currentPageDigestData = {
            ...data.digest,
            whatsappText: data.whatsappText || '',
            emailHtml: data.emailHtml || '',
            emailText: data.emailText || data.whatsappText || ''
        };

        // Render Subject
        const subjectEl = document.getElementById('pageBriefingSubject');
        if (subjectEl) {
            subjectEl.textContent = data.digest.subject || 'Briefing Rassegna Stampa';
        }

        // Render Formatted HTML Preview
        const previewEl = document.getElementById('pageBriefingContentHtml');
        if (previewEl) {
            let clipsHtml = '';
            if (Array.isArray(data.digest.clips)) {
                clipsHtml = data.digest.clips.map(c => `
                    <div style="margin-bottom:1.1rem; padding-bottom:1.1rem; border-bottom:1px solid rgba(255,255,255,0.08);">
                        <div style="font-size:0.8rem; color:var(--accent-primary); font-weight:700; margin-bottom:4px; text-transform:uppercase; letter-spacing:0.5px;">
                            ${escapeHtml(c.source)} &bull; <span style="font-weight:600; color:${c.sentiment === 'positivo' ? '#10b981' : (c.sentiment === 'critico' ? '#ef4444' : 'var(--text-muted)')};">${escapeHtml(c.sentiment || 'Neutro')}</span>
                        </div>
                        <div style="font-weight:700; font-size:1.02rem; margin:2px 0 6px; line-height:1.4; color:var(--text-primary);">${escapeHtml(c.title)}</div>
                        <div style="font-size:0.88rem; color:var(--text-muted); line-height:1.55;">${escapeHtml(c.one_liner || '')}</div>
                    </div>
                `).join('');
            }

            let highlightsHtml = '';
            if (Array.isArray(data.digest.highlights)) {
                highlightsHtml = `<ul style="margin:0 0 1.5rem 0; padding-left:1.3rem; font-size:0.92rem; line-height:1.7; color:var(--text-primary);">
                    ${data.digest.highlights.map(h => `<li style="margin-bottom:6px;">${escapeHtml(h)}</li>`).join('')}
                </ul>`;
            }

            const mood = data.digest.mood_sentiment || data.digest.mood_summary || '';

            previewEl.innerHTML = `
                <div style="font-size:0.75rem; text-transform:uppercase; letter-spacing:0.8px; color:var(--accent-primary); font-weight:800; margin-bottom:0.75rem;">
                    ✦ Punti Salienti della Rassegna:
                </div>
                ${highlightsHtml}
                <div style="font-size:0.75rem; text-transform:uppercase; letter-spacing:0.8px; color:var(--accent-primary); font-weight:800; margin:1.5rem 0 0.75rem 0;">
                    ✦ Rilevanza &amp; Articoli Chiave:
                </div>
                ${clipsHtml}
                ${mood ? `
                <div style="margin-top:1.25rem; font-size:0.88rem; background:rgba(255,255,255,0.03); padding:12px 16px; border-radius:8px; border-left:3px solid var(--accent-primary); color:var(--text-muted);">
                    <strong style="color:var(--text-primary);">Clima Media Complessivo:</strong> ${escapeHtml(mood)}
                </div>` : ''}
            `;
        }

        if (loading) loading.classList.add('hidden');
        if (result) result.classList.remove('hidden');
        showToast('Briefing Esecutivo elaborato con successo!', 'success');

        result.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

    } catch (err) {
        if (loading) loading.classList.add('hidden');
        showToast('Errore durante la generazione del Briefing: ' + err.message, 'error');
    } finally {
        if (btn) btn.disabled = false;
        if (window.feather) feather.replace();
    }
};

window.copyBriefingSubject = async function(btnEl) {
    if (!currentPageDigestData || !currentPageDigestData.subject) return;
    const btn = btnEl || document.getElementById('btnCopyPageSubject');
    const originalHtml = btn ? btn.innerHTML : null;
    const text = currentPageDigestData.subject;

    try {
        await navigator.clipboard.writeText(text);
        if (btn) {
            btn.innerHTML = '<i data-feather="check" style="width:13px;height:13px;vertical-align:middle;margin-right:4px;"></i> Copiato!';
            btn.style.background = '#10b981';
            btn.style.borderColor = '#10b981';
            btn.style.color = '#ffffff';
            if (window.feather) feather.replace();
            setTimeout(() => {
                if (btn) {
                    btn.innerHTML = originalHtml;
                    btn.style.background = '';
                    btn.style.borderColor = '';
                    btn.style.color = '';
                    if (window.feather) feather.replace();
                }
            }, 2200);
        }
        showToast('Oggetto email copiato negli appunti!', 'success');
    } catch (err) {
        showToast('Errore durante la copia: ' + err.message, 'error');
    }
};

window.copyPageBriefingEmail = async function(btnEl) {
    if (!currentPageDigestData) return;
    const btn = btnEl || document.getElementById('btnPageCopyEmail');
    const originalHtml = btn ? btn.innerHTML : null;

    const htmlContent = currentPageDigestData.emailHtml || '';
    const textContent = currentPageDigestData.emailText || currentPageDigestData.whatsappText || '';

    function showSuccessFeedback() {
        if (btn) {
            btn.innerHTML = '<i data-feather="check" style="width:14px;height:14px;vertical-align:middle;margin-right:4px;"></i> Copiato!';
            btn.style.background = '#10b981';
            btn.style.borderColor = '#10b981';
            btn.style.color = '#ffffff';
            if (window.feather) feather.replace();
            setTimeout(() => {
                if (btn) {
                    btn.innerHTML = originalHtml;
                    btn.style.background = '';
                    btn.style.borderColor = '';
                    btn.style.color = '';
                    if (window.feather) feather.replace();
                }
            }, 2200);
        }
        showToast('Briefing HTML copiato! Incollalo nella tua email su Outlook o Gmail.', 'success');
    }

    try {
        if (navigator.clipboard && window.ClipboardItem) {
            const item = new ClipboardItem({
                'text/html': new Blob([htmlContent], { type: 'text/html' }),
                'text/plain': new Blob([textContent], { type: 'text/plain' })
            });
            await navigator.clipboard.write([item]);
            showSuccessFeedback();
        } else {
            await navigator.clipboard.writeText(textContent);
            showSuccessFeedback();
        }
    } catch (err) {
        try {
            await navigator.clipboard.writeText(textContent);
            showSuccessFeedback();
        } catch (e) {
            showToast('Errore durante la copia: ' + err.message, 'error');
        }
    }
};

window.copyPageBriefingWhatsApp = async function(btnEl) {
    if (!currentPageDigestData) return;
    const btn = btnEl || document.getElementById('btnPageCopyWhatsApp');
    const originalHtml = btn ? btn.innerHTML : null;
    const text = currentPageDigestData.whatsappText || currentPageDigestData.emailText || '';

    try {
        await navigator.clipboard.writeText(text);
        if (btn) {
            btn.innerHTML = '<i data-feather="check" style="width:14px;height:14px;vertical-align:middle;margin-right:4px;"></i> Copiato!';
            btn.style.borderColor = '#10b981';
            btn.style.color = '#10b981';
            if (window.feather) feather.replace();
            setTimeout(() => {
                if (btn) {
                    btn.innerHTML = originalHtml;
                    btn.style.borderColor = '';
                    btn.style.color = '';
                    if (window.feather) feather.replace();
                }
            }, 2200);
        }
        showToast('Briefing WhatsApp / Chat copiato negli appunti!', 'success');
    } catch (err) {
        showToast('Errore durante la copia: ' + err.message, 'error');
    }
};

window.openPageBriefingMailto = function() {
    if (!currentPageDigestData) return;
    const subject = encodeURIComponent(currentPageDigestData.subject || 'Briefing Esecutivo Stampa');
    const body = encodeURIComponent(currentPageDigestData.emailText || currentPageDigestData.whatsappText || '');
    window.location.href = `mailto:?subject=${subject}&body=${body}`;
};

// ==========================================================================
// --- STANDALONE 1-PAGE EXECUTIVE KPI REPORT PREVIEW & DOWNLOAD ---
// ==========================================================================
window.currentKpiData = null;

function computeBriefingKpiMetrics(articlesList) {
    const arts = Array.isArray(articlesList) ? articlesList : [];
    const count = arts.length;
    const seenSources = new Set();
    const sourceCounts = {};
    let totalAudience = 0;
    let totalReads = 0;
    let posCount = 0;
    let criCount = 0;
    let neuCount = 0;
    let tier1 = 0, tier2 = 0, tier3 = 0;

    const posWords = ['crescita', 'record', 'successo', 'positivo', 'premi', 'investimento', 'sviluppo', 'leadership', 'innova', 'utile', 'espansione', 'eccellenza', 'trionfo', 'accordo', 'partnership', 'vince'];
    const negWords = ['crisi', 'crollo', 'calo', 'scandalo', 'arrest', 'truffa', 'perdita', 'chiusura', 'polemica', 'difficoltà', 'licenzia', 'denuncia', 'indagine', 'multa', 'fallimento', 'scontro'];

    arts.forEach(art => {
        const src = ((art.source_name || '') + ' ' + (art.url || '')).toLowerCase();
        const normKey = (art.source_name || 'Media Web').trim();
        const type = art.source_type || 'Web';
        const text = ((art.title || '') + ' ' + (art.excerpt || '')).toLowerCase();

        sourceCounts[normKey] = (sourceCounts[normKey] || 0) + 1;

        let dayAudience = 25000;
        let readRate = 0.035;
        let tier = 3;

        if (src.includes('corriere')) { dayAudience = 3500000; readRate = 0.012; tier = 1; }
        else if (src.includes('repubblica')) { dayAudience = 3150000; readRate = 0.012; tier = 1; }
        else if (src.includes('sole')) { dayAudience = 1350000; readRate = 0.018; tier = 1; }
        else if (src.includes('ansa')) { dayAudience = 2600000; readRate = 0.013; tier = 1; }
        else if (src.includes('stampa')) { dayAudience = 1150000; readRate = 0.014; tier = 1; }
        else if (src.includes('messaggero')) { dayAudience = 1450000; readRate = 0.013; tier = 1; }
        else if (src.includes('fanpage')) { dayAudience = 2200000; readRate = 0.014; tier = 1; }
        else if (src.includes('tgcom')) { dayAudience = 1950000; readRate = 0.012; tier = 1; }
        else if (src.includes('sky')) { dayAudience = 1400000; readRate = 0.013; tier = 1; }
        else if (src.includes('fatto')) { dayAudience = 1250000; readRate = 0.014; tier = 1; }
        else if (src.includes('giornale') || src.includes('libero')) { dayAudience = 800000; readRate = 0.014; tier = 2; }
        else if (src.includes('finanza') || src.includes('forbes') || src.includes('italiaoggi')) { dayAudience = 320000; readRate = 0.022; tier = 2; }
        else if (type === 'Quotidiano Nazionale' || type === 'Agenzia di Stampa') { dayAudience = 750000; readRate = 0.015; tier = 1; }
        else if (type === 'Quotidiano Locale' || type === 'Periodico' || src.includes('carlino') || src.includes('nazione') || src.includes('giorno') || src.includes('mattino')) { dayAudience = 220000; readRate = 0.018; tier = 2; }

        if (tier === 1) tier1++;
        else if (tier === 2) tier2++;
        else tier3++;

        const normKeyLower = normKey.toLowerCase();
        if (!seenSources.has(normKeyLower)) {
            seenSources.add(normKeyLower);
            totalAudience += dayAudience;
        }

        const occ = sourceCounts[normKey];
        const mult = occ === 1 ? 1.0 : (occ === 2 ? 0.75 : 0.5);
        totalReads += Math.max(10, Math.round(dayAudience * readRate * mult));

        let p = 0, n = 0;
        posWords.forEach(w => {
            const re = new RegExp(`(\\b(?:non|nessun|nessuna|senza)\\s+(?:\\w+\\s+){0,2})?\\b${w}\\b`, 'i');
            const m = text.match(re);
            if (m) {
                if (m[1]) n += 0.6;
                else p += 1;
            }
        });
        negWords.forEach(w => {
            const re = new RegExp(`(\\b(?:non|nessun|nessuna|senza|smentisce|smentita|evita|evitato|superato)\\s+(?:\\w+\\s+){0,2})?\\b${w}\\b`, 'i');
            const m = text.match(re);
            if (m) {
                if (m[1]) p += 0.6;
                else n += 1;
            }
        });
        if (p > n) posCount++;
        else if (n > p) criCount++;
        else neuCount++;
    });

    function fmt(n) {
        if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
        if (n >= 1000) return Math.round(n / 1000) + 'K';
        return n.toString();
    }

    const posPct = count > 0 ? Math.round((posCount / count) * 100) : 0;
    const criPct = count > 0 ? Math.round((criCount / count) * 100) : 0;
    const neuPct = count > 0 ? Math.max(0, 100 - posPct - criPct) : 100;

    let sentimentLabel = 'Neutro';
    let sentimentColor = '#d97706';
    if (posCount > criCount) {
        sentimentLabel = 'Positivo';
        sentimentColor = '#059669';
    } else if (criCount > posCount) {
        sentimentLabel = 'Critico';
        sentimentColor = '#dc2626';
    }

    const topOutlets = Object.keys(sourceCounts)
        .map(k => ({ name: k, count: sourceCounts[k] }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 5);

    return {
        totalArticles: count,
        uniqueOutlets: seenSources.size,
        formattedAudience: fmt(totalAudience),
        formattedReads: fmt(totalReads),
        overallSentiment: sentimentLabel,
        sentimentColor,
        posPct, neuPct, criPct,
        tier1, tier2, tier3,
        topOutlets
    };
}

function renderKpiA4PreviewHtml(articles, options = {}) {
    const kpi = computeBriefingKpiMetrics(articles);
    const title = options.title || 'Rassegna Stampa';
    const clientName = options.clientName || '';
    const clientLogo = options.clientLogo || null;
    const todayStr = new Date().toLocaleDateString('it-IT', { day: '2-digit', month: 'long', year: 'numeric' });

    return `
    <div class="kpi-a4-sheet" style="background: #ffffff; color: #1e293b; padding: 2.5rem; border-radius: 8px; box-shadow: 0 10px 30px rgba(0,0,0,0.3); font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; box-sizing: border-box; width: 100%;">
        <!-- Header -->
        <div style="border-bottom: 2px solid #1a1a2e; padding-bottom: 12px; margin-bottom: 18px; display: flex; justify-content: space-between; align-items: flex-end; flex-wrap: wrap; gap: 12px;">
            <div>
                <div style="font-size: 0.75rem; font-weight: 800; text-transform: uppercase; letter-spacing: 1.5px; color: #7c5cff; margin-bottom: 4px;">
                    Executive Overview &amp; PR Intelligence
                </div>
                <div style="font-size: 1.45rem; font-weight: 800; color: #1a1a2e; line-height: 1.2;">
                    Rapporto di Impatto e Visibilità Media
                </div>
                <div style="font-size: 0.85rem; color: #64748b; margin-top: 4px;">
                    Rassegna: <strong style="color: #334155;">${escapeHtml(title)}</strong>
                </div>
            </div>
            <div style="text-align: right; font-size: 0.82rem; color: #64748b;">
                ${clientLogo ? `<img src="${clientLogo}" alt="Logo" style="max-height: 28px; max-width: 140px; object-fit: contain; margin-bottom: 6px; display: block; margin-left: auto;">` : ''}
                ${clientName ? `<div>Cliente: <strong style="color: #1e293b;">${escapeHtml(clientName)}</strong></div>` : ''}
                <div>Data: <strong>${todayStr}</strong></div>
                <div>Uscite analizzate: <strong style="color: #7c5cff;">${kpi.totalArticles}</strong></div>
            </div>
        </div>

        <!-- 5 KPI Cards -->
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); gap: 10px; margin-bottom: 18px;">
            <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px 8px; text-align: center;">
                <div style="font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.6px; color: #64748b; font-weight: 700; margin-bottom: 4px;">Uscite Totali</div>
                <div style="font-size: 1.5rem; font-weight: 800; color: #1a1a2e; line-height: 1.1;">${kpi.totalArticles}</div>
                <div style="font-size: 0.7rem; color: #94a3b8; margin-top: 4px;">ritagli stampa</div>
            </div>
            <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px 8px; text-align: center;">
                <div style="font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.6px; color: #64748b; font-weight: 700; margin-bottom: 4px;">Testate Coinvolte</div>
                <div style="font-size: 1.5rem; font-weight: 800; color: #1a1a2e; line-height: 1.1;">${kpi.uniqueOutlets}</div>
                <div style="font-size: 0.7rem; color: #94a3b8; margin-top: 4px;">fonti uniche</div>
            </div>
            <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px 8px; text-align: center;">
                <div style="font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.6px; color: #64748b; font-weight: 700; margin-bottom: 4px;">Audience Testate</div>
                <div style="font-size: 1.5rem; font-weight: 800; color: #7c5cff; line-height: 1.1;">~${kpi.formattedAudience}</div>
                <div style="font-size: 0.7rem; color: #94a3b8; margin-top: 4px;">bacino netto OTS</div>
            </div>
            <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px 8px; text-align: center;">
                <div style="font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.6px; color: #64748b; font-weight: 700; margin-bottom: 4px;">Letture Stimate</div>
                <div style="font-size: 1.5rem; font-weight: 800; color: #0284c7; line-height: 1.1;">~${kpi.formattedReads}</div>
                <div style="font-size: 0.7rem; color: #94a3b8; margin-top: 4px;">standard AMEC</div>
            </div>
            <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px 8px; text-align: center;">
                <div style="font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.6px; color: #64748b; font-weight: 700; margin-bottom: 4px;">Sentiment</div>
                <div style="font-size: 1.25rem; font-weight: 800; color: ${kpi.sentimentColor}; line-height: 1.1; padding-top: 3px;">${kpi.overallSentiment}</div>
                <div style="font-size: 0.7rem; color: #94a3b8; margin-top: 4px;">tono prevalente</div>
            </div>
        </div>

        <!-- Sentiment Distribution -->
        <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 14px 16px; margin-bottom: 18px;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; flex-wrap: wrap; gap: 6px;">
                <div style="font-size: 0.78rem; font-weight: 800; text-transform: uppercase; letter-spacing: 0.5px; color: #334155;">
                    Distribuzione Sentiment Copertura
                </div>
                <div style="font-size: 0.78rem; color: #64748b;">
                    <span style="color: #059669; font-weight: 700;">● Positivo: ${kpi.posPct}%</span> &nbsp;|&nbsp; 
                    <span style="color: #64748b; font-weight: 700;">● Neutro: ${kpi.neuPct}%</span> &nbsp;|&nbsp; 
                    <span style="color: #dc2626; font-weight: 700;">● Critico: ${kpi.criPct}%</span>
                </div>
            </div>
            <div style="display: flex; height: 18px; border-radius: 6px; overflow: hidden; background: #e2e8f0;">
                ${kpi.posPct > 0 ? `<div style="width: ${kpi.posPct}%; background: #10b981; display: flex; align-items: center; justify-content: center; color: white; font-size: 0.72rem; font-weight: 800;">${kpi.posPct > 8 ? kpi.posPct + '%' : ''}</div>` : ''}
                ${kpi.neuPct > 0 ? `<div style="width: ${kpi.neuPct}%; background: #94a3b8; display: flex; align-items: center; justify-content: center; color: white; font-size: 0.72rem; font-weight: 800;">${kpi.neuPct > 8 ? kpi.neuPct + '%' : ''}</div>` : ''}
                ${kpi.criPct > 0 ? `<div style="width: ${kpi.criPct}%; background: #ef4444; display: flex; align-items: center; justify-content: center; color: white; font-size: 0.72rem; font-weight: 800;">${kpi.criPct > 8 ? kpi.criPct + '%' : ''}</div>` : ''}
            </div>
        </div>

        <!-- 2 Column Breakdown: Tiers & Top Outlets -->
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 14px; margin-bottom: 18px;">
            <!-- Media Tiers -->
            <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 14px 16px;">
                <div style="font-size: 0.78rem; font-weight: 800; text-transform: uppercase; letter-spacing: 0.5px; color: #334155; margin-bottom: 10px; border-bottom: 1px solid #cbd5e1; padding-bottom: 6px;">
                    Ripartizione Autorevolezza Testate
                </div>
                <div style="font-size: 0.82rem; line-height: 2;">
                    <div style="display: flex; justify-content: space-between; border-bottom: 1px dashed #e2e8f0; padding: 3px 0;">
                        <span><strong style="color: #1e293b;">Tier 1</strong> &mdash; Grandi Quotidiani Nazionali &amp; Agenzie:</span>
                        <strong style="color: #7c5cff;">${kpi.tier1} articoli</strong>
                    </div>
                    <div style="display: flex; justify-content: space-between; border-bottom: 1px dashed #e2e8f0; padding: 3px 0;">
                        <span><strong style="color: #1e293b;">Tier 2</strong> &mdash; Testate Regionali &amp; Settoriali:</span>
                        <strong style="color: #3b82f6;">${kpi.tier2} articoli</strong>
                    </div>
                    <div style="display: flex; justify-content: space-between; padding: 3px 0;">
                        <span><strong style="color: #1e293b;">Tier 3</strong> &mdash; Portali Web &amp; Media Digitali:</span>
                        <strong style="color: #64748b;">${kpi.tier3} articoli</strong>
                    </div>
                </div>
            </div>

            <!-- Top Outlets -->
            <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 14px 16px;">
                <div style="font-size: 0.78rem; font-weight: 800; text-transform: uppercase; letter-spacing: 0.5px; color: #334155; margin-bottom: 10px; border-bottom: 1px solid #cbd5e1; padding-bottom: 6px;">
                    Principali Testate Rilevate
                </div>
                <table style="width: 100%; border-collapse: collapse; font-size: 0.82rem;">
                    ${kpi.topOutlets.length > 0 ? kpi.topOutlets.map((out, idx) => `
                        <tr style="border-bottom: 1px solid #e2e8f0;">
                            <td style="padding: 5px 0; color: #475569;">
                                <span style="display: inline-block; width: 18px; font-weight: 700; color: #94a3b8;">${idx + 1}.</span>
                                <strong style="color: #1e293b;">${escapeHtml(out.name)}</strong>
                            </td>
                            <td style="padding: 5px 0; text-align: right; font-weight: 700; color: #7c5cff;">
                                ${out.count} ${out.count === 1 ? 'articolo' : 'articoli'}
                            </td>
                        </tr>
                    `).join('') : '<tr><td style="padding: 6px 0; color: #94a3b8;">Nessuna testata rilevata</td></tr>'}
                </table>
            </div>
        </div>

        <!-- Footer -->
        <div style="border-top: 1px solid #e2e8f0; padding-top: 10px; display: flex; justify-content: space-between; align-items: center; font-size: 0.72rem; color: #94a3b8;">
            <div>Metodologia conforme alle linee guida internazionali <strong>AMEC</strong> per la misurazione della comunicazione</div>
            <div>Pagina 1 di 1 &bull; Documento ad uso interno / direzionale</div>
        </div>
    </div>
    `;
}

const SAMPLE_KPI_ARTICLES = [
    {
        title: "Innovazione e Sostenibilità Digitale: il nuovo piano industriale",
        source_name: "Corriere della Sera",
        source_type: "Quotidiano Nazionale",
        published_date: new Date().toISOString().split('T')[0],
        sentiment: "Positivo",
        sentiment_score: 0.85,
        url: "https://www.corriere.it/economia/innovazione-sostenibilita.shtml",
        excerpt: "Presentato il nuovo piano strategico di crescita con focus su transizione ecologica e digitalizzazione dei processi produttivi."
    },
    {
        title: "Transizione tecnologica e investimenti industriali: scenari di crescita",
        source_name: "Il Sole 24 Ore",
        source_type: "Stampa Economica",
        published_date: new Date().toISOString().split('T')[0],
        sentiment: "Positivo",
        sentiment_score: 0.90,
        url: "https://www.ilsole24ore.com/art/transizione-tecnologica-investimenti",
        excerpt: "I dati evidenziano un incremento significativo degli investimenti in innovazione e intelligenza artificiale applicata."
    },
    {
        title: "Sviluppo dei servizi cloud e infrastrutture avanzate nel mercato italiano",
        source_name: "La Repubblica",
        source_type: "Quotidiano Nazionale",
        published_date: new Date().toISOString().split('T')[0],
        sentiment: "Neutro",
        sentiment_score: 0.50,
        url: "https://www.repubblica.it/economia/servizi-cloud-infrastrutture",
        excerpt: "Analisi di settore sui trend tecnologici emergenti e sulle prospettive di modernizzazione dei servizi alle imprese."
    },
    {
        title: "Accordo strategico per la modernizzazione digitale delle filiere",
        source_name: "ANSA",
        source_type: "Agenzia di Stampa",
        published_date: new Date().toISOString().split('T')[0],
        sentiment: "Positivo",
        sentiment_score: 0.80,
        url: "https://www.ansa.it/canale_economia/notizie/accordo-strategico-filiere.html",
        excerpt: "Siglata una nuova intesa per accelerare la transizione delle imprese verso processi integrati e sostenibili."
    },
    {
        title: "Competitività e scenari normativi: il bilancio dei leader di mercato",
        source_name: "Milano Finanza",
        source_type: "Stampa Economica",
        published_date: new Date().toISOString().split('T')[0],
        sentiment: "Neutro",
        sentiment_score: 0.45,
        url: "https://www.milanofinanza.it/news/competitivita-scenari-normativi",
        excerpt: "Dalla tavola rotonda emergono indicazioni chiare sulla gestione dell'impatto economico e dell'evoluzione regolatoria."
    }
];

window.loadAndRenderKpiPreview = async function(sourceVal) {
    const previewContainer = document.getElementById('kpiA4PreviewContainer');
    const metaBadge = document.getElementById('kpiPreviewMetaBadge');
    if (!previewContainer) return;

    previewContainer.innerHTML = `
        <div style="padding: 3.5rem 2rem; text-align: center; color: #64748b; background: rgba(255,255,255,0.03); border-radius: 8px;">
            <div class="spinner" style="width: 34px; height: 34px; margin: 0 auto 1rem auto; border-color: #7c5cff; border-top-color: transparent;"></div>
            <div style="font-weight: 600; font-size: 0.95rem; color: var(--text-primary);">Caricamento anteprima Report KPI...</div>
            <div style="font-size: 0.8rem; color: var(--text-muted); margin-top: 4px;">Elaborazione indicatori di audience e metriche certificate</div>
        </div>
    `;

    let articles = [];
    let title = 'Rassegna Stampa';
    let clientName = '';
    let clientLogo = null;
    let reviewId = null;
    let isDemo = false;

    if (!sourceVal || sourceVal === 'active') {
        if (state.articles && state.articles.length > 0) {
            articles = state.articles;
        } else {
            // Check fallback in editor state or session draft
            try {
                const editorState = JSON.parse(localStorage.getItem('rs_editor_state') || '{}');
                if (editorState && Array.isArray(editorState.articles) && editorState.articles.length > 0) {
                    articles = editorState.articles;
                    if (editorState.options?.title) title = editorState.options.title;
                    if (editorState.options?.clientName) clientName = editorState.options.clientName;
                } else {
                    const draftArticles = JSON.parse(sessionStorage.getItem('rs_draft_articles') || '[]');
                    if (Array.isArray(draftArticles) && draftArticles.length > 0) {
                        articles = draftArticles;
                    }
                }
            } catch(e) {}
        }
        title = document.getElementById('rassegnaTitle')?.value.trim() || title || 'Rassegna Stampa';
        clientName = document.getElementById('clientName')?.value.trim() || clientName || '';
        clientLogo = state.clientLogoBase64 || null;

        if (!articles || articles.length === 0) {
            isDemo = true;
            articles = SAMPLE_KPI_ARTICLES;
            title = 'Report di Impatto e Visibilità Media';
            clientName = clientName || 'Azienda Demo';
        }
    } else {
        reviewId = sourceVal;
        try {
            const data = await apiCall('GET', `/api/pdf/review/${sourceVal}`);
            if (data && Array.isArray(data.articles) && data.articles.length > 0) {
                articles = data.articles;
                title = data.title || 'Rassegna Stampa';
                clientName = data.clientName || '';
                clientLogo = data.clientLogo || null;
            } else {
                isDemo = true;
                articles = SAMPLE_KPI_ARTICLES;
                title = data?.title || 'Rassegna Stampa (Dati Simulati)';
            }
        } catch (err) {
            console.warn('Errore caricamento rassegna per preview KPI:', err);
            isDemo = true;
            articles = SAMPLE_KPI_ARTICLES;
        }
    }

    window.currentKpiData = {
        articles,
        title,
        clientName,
        clientLogo,
        reviewId,
        isDemo
    };

    if (isDemo) {
        if (metaBadge) {
            metaBadge.innerHTML = '<span style="color:#fbbf24; font-weight:700;">● Simulazione Demo (Dati di Esempio)</span>';
        }
        const demoBanner = `
            <div style="background: rgba(124, 92, 255, 0.12); border: 1px solid rgba(124, 92, 255, 0.35); border-radius: 8px; padding: 12px 16px; margin-bottom: 14px; display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap;">
                <div style="display: flex; align-items: center; gap: 8px; font-size: 0.85rem; color: #c4b5fd;">
                    <i data-feather="info" style="width: 18px; height: 18px; flex-shrink: 0; color: #a78bfa;"></i>
                    <span><strong>Anteprima Dimostrativa:</strong> Non ci sono ancora articoli nella rassegna attuale. Di seguito visualizzi la simulazione grafica reale del report A4 scaricabile. Puoi testare il download premendo il tasto in alto.</span>
                </div>
                <button type="button" class="btn btn-outline btn-sm" onclick="showDashboardPage('rassegna', true)" style="padding: 4px 12px; font-size: 0.78rem; display: flex; align-items: center; gap: 5px; white-space: nowrap;">
                    <i data-feather="plus" style="width:12px;height:12px;"></i> Nuova Rassegna
                </button>
            </div>
        `;
        previewContainer.innerHTML = demoBanner + renderKpiA4PreviewHtml(articles, { title, clientName, clientLogo });
    } else {
        if (metaBadge) {
            metaBadge.textContent = `${articles.length} articol${articles.length === 1 ? 'o' : 'i'} • Anteprima pronta`;
        }
        previewContainer.innerHTML = renderKpiA4PreviewHtml(articles, { title, clientName, clientLogo });
    }

    if (window.feather) feather.replace();
};

window.onKpiSourceChange = function() {
    const select = document.getElementById('selectKpiSource');
    const val = select ? select.value : 'active';
    window.loadAndRenderKpiPreview(val);
};

window.downloadStandaloneKpiPdf = async function(btnEl) {
    const btn = btnEl || document.getElementById('btnDownloadKpi') || document.getElementById('btnDownloadKpiTop') || document.getElementById('btnDownloadKpiBottom');
    const originalHtml = btn ? btn.innerHTML : null;

    try {
        if (btn) {
            btn.disabled = true;
            btn.innerHTML = '<span class="spinner" style="width:14px;height:14px;display:inline-block;vertical-align:middle;margin-right:6px;border-color:#ffffff;border-top-color:transparent;"></span> Preparazione...';
        }

        let data = window.currentKpiData;
        const select = document.getElementById('selectKpiSource');
        const selectedSource = select ? select.value : 'active';

        // If not loaded or empty, resolve dynamically
        if (!data || !data.articles || data.articles.length === 0) {
            if (selectedSource && selectedSource !== 'active') {
                try {
                    const revData = await apiCall('GET', `/api/pdf/review/${selectedSource}`);
                    if (revData && Array.isArray(revData.articles) && revData.articles.length > 0) {
                        data = {
                            articles: revData.articles,
                            title: revData.title || 'Rassegna Stampa',
                            clientName: revData.clientName || '',
                            clientLogo: revData.clientLogo || null,
                            reviewId: selectedSource
                        };
                        window.currentKpiData = data;
                    }
                } catch (e) {
                    console.warn('Errore fetch rassegna al download:', e);
                }
            } else {
                if (state.articles && state.articles.length > 0) {
                    data = {
                        articles: state.articles,
                        title: document.getElementById('rassegnaTitle')?.value.trim() || 'Rassegna Stampa',
                        clientName: document.getElementById('clientName')?.value.trim() || '',
                        clientLogo: state.clientLogoBase64 || null,
                        reviewId: undefined
                    };
                    window.currentKpiData = data;
                }
            }
        }

        if (!data || !data.articles || data.articles.length === 0) {
            data = {
                articles: SAMPLE_KPI_ARTICLES,
                title: 'Report KPI Dimostrativo',
                clientName: 'Azienda Esempio',
                clientLogo: null,
                isDemo: true
            };
        }

        if (btn) {
            btn.innerHTML = '<span class="spinner" style="width:14px;height:14px;display:inline-block;vertical-align:middle;margin-right:6px;border-color:#ffffff;border-top-color:transparent;"></span> Generazione PDF A4...';
        }
        showToast('Generazione Report KPI singolo in formato A4 in corso...', 'info');

        const cleanArticles = data.articles.map(a => ({
            title: a.title,
            source_name: a.source_name,
            source_type: a.source_type,
            published_date: a.published_date,
            url: a.url,
            excerpt: a.excerpt
        }));

        const payload = {
            articles: cleanArticles,
            title: data.title || 'Rassegna Stampa',
            clientName: data.clientName || '',
            clientLogo: data.clientLogo || null,
            reviewId: data.reviewId || undefined
        };

        const res = await apiCall('POST', '/api/pdf/generate-kpi', payload);

        if (!res || !res.downloadUrl) {
            throw new Error('Risposta non valida dal server.');
        }

        await triggerDownload(res.downloadUrl, res.filename || 'Report_KPI.pdf');
        showToast('Report KPI singolo scaricato con successo!', 'success');

    } catch (err) {
        console.error('Errore durante download KPI:', err);
        showToast('Errore durante il download del Report KPI: ' + (err.message || 'Errore imprevisto'), 'error');
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = originalHtml;
            if (window.feather) feather.replace();
        }
    }
};

// Aliases for backward compatibility
window.downloadBriefingKpiPdf = window.downloadStandaloneKpiPdf;

window.downloadCurrentDigestKpiPdf = async function(btnEl) {
    const btn = btnEl || document.getElementById('btnDigestDownloadKpiPdf');
    const originalHtml = btn ? btn.innerHTML : null;

    if (!state.articles || state.articles.length === 0) {
        showToast('Nessun articolo trovato per generare il Report KPI.', 'warning');
        return;
    }

    try {
        if (btn) {
            btn.disabled = true;
            btn.innerHTML = '<span class="spinner" style="width:14px;height:14px;display:inline-block;vertical-align:middle;margin-right:6px;border-color:#ffffff;border-top-color:transparent;"></span> Elaborazione...';
        }
        showToast('Generazione Report KPI singolo in formato A4 in corso...', 'info');

        const cleanArticles = state.articles.map(a => ({
            title: a.title,
            source_name: a.source_name,
            source_type: a.source_type,
            published_date: a.published_date,
            url: a.url,
            excerpt: a.excerpt
        }));
        const title = document.getElementById('rassegnaTitle')?.value.trim() || 'Rassegna Stampa';
        const clientName = document.getElementById('clientName')?.value.trim() || '';

        const res = await apiCall('POST', '/api/pdf/generate-kpi', {
            articles: cleanArticles,
            title,
            clientName,
            clientLogo: state.clientLogoBase64 || null
        });

        if (!res || !res.downloadUrl) throw new Error('Download non disponibile');
        await triggerDownload(res.downloadUrl, res.filename || 'Report_KPI.pdf');
        showToast('Report KPI singolo scaricato con successo!', 'success');

    } catch (err) {
        showToast('Errore: ' + err.message, 'error');
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = originalHtml;
            if (window.feather) feather.replace();
        }
    }
};

// Auto-init pages if currently on #briefing, #media-crm, or #storico
setTimeout(() => {
    const hash = window.location.hash ? window.location.hash.replace('#', '') : '';
    const saved = sessionStorage.getItem('rs_current_page') || localStorage.getItem('rs_current_page');
    const targetPage = hash || saved || '';

    if (targetPage === 'briefing' || targetPage === 'page-briefing') {
        if (typeof window.initBriefingPage === 'function') window.initBriefingPage();
    } else if (targetPage === 'media-crm') {
        if (typeof window.loadMediaContacts === 'function') window.loadMediaContacts();
    } else if (targetPage === 'storico') {
        if (typeof window.loadHistory === 'function') window.loadHistory();
    } else if (targetPage === 'team') {
        if (typeof window.loadTeamPage === 'function') window.loadTeamPage();
    }
}, 100);


// ══════════════════════════════════════════════════════════════════════════════
//  SEZIONE TEAM
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Carica e renderizza la pagina team.
 * Eseguita ogni volta che l'utente clicca "Il Tuo Team" nella sidebar.
 */
async function loadTeamPage() {
    const container = document.getElementById('teamPageContent');
    if (!container) return;

    const token = state.token || localStorage.getItem('rs_token');
    if (!token) {
        container.innerHTML = `<div style="text-align:center; padding: 2rem 0; color: var(--text-muted); font-size: 0.875rem;">Sessione non attiva. Effettua l'accesso per visualizzare il team.</div>`;
        return;
    }

    container.innerHTML = `<div style="text-align:center; padding: 2rem 0; color: var(--text-muted); font-size: 0.875rem;">Caricamento...</div>`;

    try {
        const res  = await fetch('/api/teams/mine', { headers: { Authorization: `Bearer ${token}` } });
        const data = await res.json();

        if (!res.ok) {
            container.innerHTML = `<div style="text-align:center; padding: 2rem 0; color: var(--text-muted); font-size: 0.875rem;">
                <p style="color:var(--danger-color, #dc2626); margin-bottom:12px;">${data.error || 'Impossibile recuperare i dati del team.'}</p>
                <button class="btn btn-outline btn-sm" onclick="loadTeamPage()">Riprova</button>
            </div>`;
            return;
        }

        if (data.team) {
            renderTeamPanel(container, data.team);
        } else {
            renderTeamCreation(container);
        }
        if (window.feather) feather.replace();
        if (typeof syncHomeTeamBanner === 'function') syncHomeTeamBanner();
    } catch (e) {
        container.innerHTML = `<div style="text-align:center; padding: 2rem 0; color: var(--danger-color, #dc2626); font-size: 0.875rem;">
            Errore di connessione durante il recupero del team.
            <div style="margin-top:12px;"><button class="btn btn-outline btn-sm" onclick="loadTeamPage()">Riprova</button></div>
        </div>`;
    }
}
window.loadTeamPage = loadTeamPage;

/** Renderizza il pannello del team (l'utente è già membro) */
function renderTeamPanel(container, team) {
    const isOwner = team.myRole === 'owner';

    const membersHtml = team.members.map(m => {
        const initials = (m.company_name || m.email || '?').slice(0, 2).toUpperCase();
        const isMe = m.user_id === state.user?.id;
        const removeBtn = (isOwner && !isMe)
            ? `<button class="btn btn-sm btn-danger-outline" onclick="teamRemoveMember(${m.user_id})" title="Rimuovi dal team" style="padding:4px 10px; font-size:0.75rem; border-radius:6px; border: 1px solid var(--danger-color); background:transparent; color:var(--danger-color); cursor:pointer;">Rimuovi</button>`
            : (isMe ? `<span style="font-size:0.75rem; color:var(--text-muted);">(tu)</span>` : '');

        return `
        <div class="team-member-row" style="display:flex; align-items:center; gap:12px; padding:10px 0; border-bottom: 1px solid var(--border-color);">
            <div style="width:36px; height:36px; border-radius:50%; background: var(--accent-primary); color:#fff; font-size:0.75rem; font-weight:700; display:flex; align-items:center; justify-content:center; flex-shrink:0;">${initials}</div>
            <div style="flex:1; min-width:0;">
                <div style="font-weight:600; font-size:0.875rem; color:var(--text-primary); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${m.company_name || m.email}</div>
                <div style="font-size:0.75rem; color:var(--text-muted);">${m.email} &bull; ${m.role === 'owner' ? 'Proprietario' : 'Membro'}</div>
            </div>
            ${removeBtn}
        </div>`;
    }).join('');

    const pendingInvites = team.pendingInvites || [];
    const pendingHtml = isOwner
        ? `<div id="teamPendingInvitesContainer" style="${pendingInvites.length > 0 ? 'margin-top:1.5rem;' : 'display:none; margin-top:1.5rem;'}">
            <div style="font-size:0.75rem; font-weight:700; text-transform:uppercase; letter-spacing:.8px; color:var(--text-muted); margin-bottom:0.75rem;">Inviti in attesa</div>
            <div id="teamPendingInvitesList">
                ${pendingInvites.map(inv => `
                    <div style="display:flex; align-items:center; justify-content:space-between; padding:8px 0; border-bottom:1px solid var(--border-color); font-size:0.85rem;">
                        <span style="color:var(--text-primary);">${inv.invited_email}</span>
                        <span style="font-size:0.75rem; color:var(--text-muted);">In attesa</span>
                    </div>`).join('')}
            </div>
           </div>`
        : '';

    const dangerZoneHtml = isOwner
        ? `<button class="btn btn-sm btn-outline" onclick="teamDissolve()" style="padding:7px 14px; font-size:0.78rem; border-radius:6px; color:var(--text-muted); border:1px solid var(--border-color); cursor:pointer; background:transparent;">Sciogli il Team</button>`
        : `<button class="btn btn-sm btn-outline" onclick="teamLeave()" style="padding:7px 14px; font-size:0.78rem; border-radius:6px; color:var(--text-muted); border:1px solid var(--border-color); cursor:pointer; background:transparent;">Abbandona il Team</button>`;

    container.innerHTML = `
        <!-- Info team -->
        <div class="card" style="padding:1.25rem 1.5rem; border-radius:12px; border:1px solid var(--border-color); background:var(--bg-secondary); margin-bottom:1.5rem;">
            <div style="font-size:0.75rem; font-weight:700; text-transform:uppercase; letter-spacing:.8px; color:var(--text-muted); margin-bottom:4px;">Team</div>
            <div style="font-size:1.25rem; font-weight:800; color:var(--text-primary);">${team.name}</div>
            <div style="font-size:0.8rem; color:var(--text-muted); margin-top:4px;">${team.members.length} membro${team.members.length !== 1 ? 'i' : ''}</div>
        </div>

        <!-- Membri -->
        <div style="margin-bottom:1.5rem;">
            <div style="font-size:0.75rem; font-weight:700; text-transform:uppercase; letter-spacing:.8px; color:var(--text-muted); margin-bottom:0.75rem;">Membri</div>
            ${membersHtml}
        </div>

        ${pendingHtml}

        <!-- Invita un collega (solo owner) -->
        ${isOwner ? `
        <div style="margin-top:1.75rem; padding:1.25rem 1.5rem; border-radius:12px; border:1px solid var(--border-color); background:var(--bg-secondary);">
            <div style="font-size:0.875rem; font-weight:700; color:var(--text-primary); margin-bottom:0.35rem;">Invita un Collega</div>
            <p style="font-size:0.8rem; color:var(--text-muted); margin-bottom:0.75rem;">Inserisci l'email del collega per inviargli l'accesso al team.</p>
            <div style="display:flex; gap:8px;">
                <input type="email" id="teamInviteEmail" placeholder="email@collega.com"
                    onkeydown="if(event.key === 'Enter'){ event.preventDefault(); teamSendInvite(); }"
                    style="flex:1; padding:9px 12px; border-radius:8px; border:1px solid var(--border-color); background:var(--bg-primary); color:var(--text-primary); font-size:0.875rem;">
                <button class="btn btn-gradient btn-sm" id="btnTeamSendInvite" onclick="teamSendInvite()" style="padding:9px 18px; font-size:0.875rem; white-space:nowrap;">Invia Invito</button>
            </div>
            <div id="teamInviteResult" style="margin-top:10px; font-size:0.82rem; display:none; line-height:1.5;"></div>
        </div>` : ''}

        <!-- Gestione Team (uscita/scioglimento) senza scritte allarmistiche -->
        <div style="margin-top:2.5rem; padding-top:1.25rem; border-top:1px solid var(--border-color); display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px;">
            <div>
                <div style="font-size:0.82rem; font-weight:600; color:var(--text-secondary);">${isOwner ? 'Eliminazione Team' : 'Abbandono Team'}</div>
                <div style="font-size:0.75rem; color:var(--text-muted);">${isOwner ? 'I tuoi clienti e rassegne rimarranno al sicuro nel tuo account.' : 'Non avrai più accesso ai documenti condivisi da questo team.'}</div>
            </div>
            <div>
                ${dangerZoneHtml}
            </div>
        </div>
    `;
}

/** Renderizza la schermata di creazione team (l'utente non è in nessun team) */
function renderTeamCreation(container) {
    container.innerHTML = `
        <div style="text-align:center; padding: 2.5rem 1rem;">
            <div style="width:64px; height:64px; border-radius:50%; background:rgba(124,92,255,.1); display:flex; align-items:center; justify-content:center; margin: 0 auto 1rem;">
                <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#7c5cff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
            </div>
            <h3 style="font-size:1.1rem; font-weight:700; color:var(--text-primary); margin-bottom:0.5rem;">Nessun team attivo</h3>
            <p style="font-size:0.875rem; color:var(--text-muted); max-width:380px; margin: 0 auto 1.75rem; line-height:1.6;">Crea un team per collaborare con i tuoi colleghi sulle stesse rassegne stampa, clienti e comunicati.</p>

            <div style="max-width:380px; margin:0 auto;">
                <input type="text" id="teamNameInput" placeholder="Nome del team (es. Studio PR, Agenzia Comms...)"
                    onkeydown="if(event.key === 'Enter'){ event.preventDefault(); teamCreate(); }"
                    style="width:100%; padding:10px 14px; border-radius:8px; border:1px solid var(--border-color); background:var(--bg-primary); color:var(--text-primary); font-size:0.875rem; margin-bottom:12px;">
                <button class="btn btn-gradient" id="btnTeamCreate" onclick="teamCreate()" style="width:100%; padding:11px; font-size:0.875rem; font-weight:600; border-radius:8px;">Crea il Team</button>
                <div id="teamCreateError" style="margin-top:8px; font-size:0.8rem; color:var(--danger-color, #dc2626); display:none;"></div>
            </div>

            <p style="font-size:0.78rem; color:var(--text-muted); margin-top:1.25rem; line-height:1.6;">
                Hai ricevuto un invito via email?<br>
                Clicca il link nell'email per accedere al team del tuo collega.
            </p>
        </div>
    `;
}

/** Crea un nuovo team */
async function teamCreate() {
    const input = document.getElementById('teamNameInput');
    const errEl = document.getElementById('teamCreateError');
    const btn   = document.getElementById('btnTeamCreate');
    if (!input) return;

    const name = input.value.trim();
    if (!name) {
        if (errEl) {
            errEl.textContent = 'Inserisci un nome per il team.';
            errEl.style.display = 'block';
        }
        return;
    }
    if (errEl) errEl.style.display = 'none';

    if (btn) {
        btn.disabled = true;
        btn.textContent = 'Creazione in corso...';
    }

    const token = state.token || localStorage.getItem('rs_token');

    try {
        const res  = await fetch('/api/teams', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify({ name })
        });
        const data = await res.json();

        if (res.ok && data.success) {
            await loadTeamPage();
        } else {
            if (errEl) {
                errEl.textContent = data.error || 'Impossibile creare il team.';
                errEl.style.display = 'block';
            }
        }
    } catch (e) {
        if (errEl) {
            errEl.textContent = 'Errore di connessione. Riprova.';
            errEl.style.display = 'block';
        }
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.textContent = 'Crea il Team';
        }
    }
}
window.teamCreate = teamCreate;

/** Invia un invito email a un collega */
async function teamSendInvite() {
    const emailInput = document.getElementById('teamInviteEmail');
    const resultEl   = document.getElementById('teamInviteResult');
    const btn        = document.getElementById('btnTeamSendInvite');
    if (!emailInput) return;

    const email = emailInput.value.trim();
    if (!email) {
        if (resultEl) {
            resultEl.style.display = 'block';
            resultEl.style.color = 'var(--danger-color, #dc2626)';
            resultEl.textContent = 'Inserisci un indirizzo email prima di inviare.';
        }
        return;
    }

    if (btn) {
        btn.disabled = true;
        btn.textContent = 'Invio in corso...';
    }
    if (resultEl) {
        resultEl.style.display = 'block';
        resultEl.style.color = 'var(--text-muted)';
        resultEl.textContent = 'Invio dell\'invito in corso...';
    }

    const token = state.token || localStorage.getItem('rs_token');

    try {
        const res  = await fetch('/api/teams/invite', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify({ email })
        });
        const data = await res.json();

        if (resultEl) resultEl.style.display = 'block';

        if (res.ok && data.success) {
            emailInput.value = '';
            if (data.emailSent) {
                resultEl.style.color = 'var(--success-color, #16a34a)';
                resultEl.innerHTML = `Invito inviato con successo via email a <strong>${email}</strong>! Controlla anche la cartella Spam/Posta indesiderata.`;
            } else {
                resultEl.style.color = 'var(--text-primary)';
                const reason = data.emailError ? `<div style="font-size:0.78rem; color:var(--danger-color, #dc2626); margin-bottom:6px;">Nota sull'invio email: ${data.emailError}</div>` : '';
                resultEl.innerHTML = `${reason}<div style="font-size:0.8rem; color:var(--text-muted); margin-bottom:4px;">L'invito è comunque valido. Puoi copiare e inviare direttamente questo link al tuo collega:</div>
                    <div style="display:flex; align-items:center; gap:8px; margin-top:8px;">
                        <input type="text" id="copyInviteLinkInput" value="${data.inviteLink}" readonly
                            style="flex:1; padding:8px 10px; border-radius:6px; border:1px solid var(--border-color); background:var(--bg-primary); color:var(--text-primary); font-size:0.8rem;"
                            onclick="this.select()">
                        <button onclick="navigator.clipboard.writeText('${data.inviteLink}').then(() => { this.textContent='Copiato!'; setTimeout(() => this.textContent='Copia Link', 2000); })"
                            class="btn btn-sm btn-outline"
                            style="padding:7px 14px; font-size:0.8rem; cursor:pointer; white-space:nowrap;">
                            Copia Link
                        </button>
                    </div>`;
            }
            // Aggiorna dinamicamente la lista degli inviti in attesa senza ricaricare la pagina
            const pendingBox  = document.getElementById('teamPendingInvitesContainer');
            const pendingList = document.getElementById('teamPendingInvitesList');
            if (pendingBox && pendingList) {
                pendingBox.style.display = 'block';
                const row = document.createElement('div');
                row.style.cssText = 'display:flex; align-items:center; justify-content:space-between; padding:8px 0; border-bottom:1px solid var(--border-color); font-size:0.85rem;';
                row.innerHTML = `<span style="color:var(--text-primary);">${email}</span><span style="font-size:0.75rem; color:var(--text-muted);">In attesa</span>`;
                pendingList.prepend(row);
            }
        } else {
            resultEl.style.color = 'var(--danger-color, #dc2626)';
            resultEl.textContent = data.error || 'Impossibile inviare l\'invito. Verifica l\'email inserita.';
        }
    } catch (e) {
        if (resultEl) {
            resultEl.style.display = 'block';
            resultEl.style.color   = 'var(--danger-color, #dc2626)';
            resultEl.textContent   = 'Errore di connessione. Riprova.';
        }
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.textContent = 'Invia Invito';
        }
    }
}
window.teamSendInvite = teamSendInvite;

/** Rimuove un membro dal team (solo owner) */
async function teamRemoveMember(userId) {
    if (!confirm('Rimuovere questo membro dal team?')) return;

    try {
        const res  = await fetch(`/api/teams/members/${userId}`, {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${state.token}` }
        });
        const data = await res.json();

        if (res.ok) {
            await loadTeamPage();
        } else {
            alert(data.error || 'Impossibile rimuovere il membro.');
        }
    } catch (e) {
        alert('Errore di connessione. Riprova.');
    }
}
window.teamRemoveMember = teamRemoveMember;

/** Il membro abbandona il team */
async function teamLeave() {
    if (!confirm('Vuoi davvero abbandonare il team? Non vedrai più le rassegne condivise.')) return;

    try {
        const res  = await fetch('/api/teams/leave', {
            method: 'POST',
            headers: { Authorization: `Bearer ${state.token}` }
        });
        const data = await res.json();

        if (res.ok) {
            await loadTeamPage();
        } else {
            alert(data.error || 'Impossibile abbandonare il team.');
        }
    } catch (e) {
        alert('Errore di connessione. Riprova.');
    }
}
window.teamLeave = teamLeave;

/** L'owner scioglie il team */
async function teamDissolve() {
    if (!confirm('Sciogliere il team? Tutti i membri perderanno l\'accesso condiviso. I tuoi dati personali resteranno intatti.')) return;

    try {
        const res  = await fetch('/api/teams', {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${state.token}` }
        });
        const data = await res.json();

        if (res.ok) {
            await loadTeamPage();
        } else {
            alert(data.error || 'Impossibile sciogliere il team.');
        }
    } catch (e) {
        alert('Errore di connessione. Riprova.');
    }
}
window.teamDissolve = teamDissolve;

/**
 * Sincronizza il banner Team nella Home e il contatore nella Navbar
 */
async function syncHomeTeamBanner() {
    const token = (typeof state !== 'undefined' && state.token) || localStorage.getItem('rs_token');
    if (!token) return;

    try {
        const res = await fetch('/api/teams/mine', {
            headers: { Authorization: `Bearer ${token}` }
        });
        if (!res.ok) return;
        const data = await res.json();

        const navCount = document.getElementById('navTeamCount');
        const teamBadge = document.getElementById('teamBadge');
        const nameDisplay = document.getElementById('homeTeamNameDisplay');
        const countDisplay = document.getElementById('homeMemberCountText');
        const avatarStack = document.getElementById('homeTeamAvatarStack');
        const descDisplay = document.getElementById('homeTeamDescription');

        if (data.team) {
            const team = data.team;
            const members = Array.isArray(team.members) ? team.members : [];
            const count = members.length;

            if (navCount) navCount.textContent = count;
            if (teamBadge) {
                teamBadge.textContent = count;
                teamBadge.style.display = 'inline-flex';
            }
            if (nameDisplay) nameDisplay.textContent = team.name || 'Team Workspace';
            if (countDisplay) {
                countDisplay.textContent = `${count} membr${count === 1 ? 'o' : 'i'} attiv${count === 1 ? 'o' : 'i'}`;
            }
            if (descDisplay) {
                if (count > 1) {
                    descDisplay.textContent = `Spazio collaborativo attivo con ${count} membri. Clienti, comunicati e rassegne sono sincronizzati.`;
                } else {
                    descDisplay.textContent = `Workspace "${team.name}" pronto. Invita colleghi o redattori per lavorare insieme a quattro mani.`;
                }
            }
            if (avatarStack) {
                const maxShow = 4;
                const slice = members.slice(0, maxShow);
                let stackHtml = slice.map(m => {
                    const initials = (m.company_name || m.email || 'TU').slice(0, 2).toUpperCase();
                    return `<div class="team-avatar" title="${escapeHtml(m.company_name || m.email)}">${initials}</div>`;
                }).join('');
                if (members.length > maxShow) {
                    stackHtml += `<div class="team-avatar avatar-more">+${members.length - maxShow}</div>`;
                }
                avatarStack.innerHTML = stackHtml;
            }
        } else {
            // Nessun team attivo
            if (navCount) navCount.textContent = '0';
            if (teamBadge) teamBadge.style.display = 'none';
            if (nameDisplay) nameDisplay.textContent = 'Modalità Team Collaborativo';
            if (countDisplay) countDisplay.textContent = '0 membri';
            if (descDisplay) {
                descDisplay.textContent = 'Crea il tuo Team o invita colleghi per lavorare insieme sulle stesse rassegne stampa, contatti media e comunicati.';
            }
            if (avatarStack) {
                avatarStack.innerHTML = `<div class="team-avatar" style="background:#4a5568;" title="Nessun team attivo">+</div>`;
            }
        }
        if (window.feather) feather.replace();
    } catch (e) {
        console.warn('syncHomeTeamBanner error:', e);
    }
}
window.syncHomeTeamBanner = syncHomeTeamBanner;

/** Helper rapido per aprire la sezione Team e mettere a fuoco l'invito */
window.openTeamInviteQuick = function() {
    if (typeof window.showDashboardPage === 'function') {
        window.showDashboardPage('team', true);
    } else {
        const teamLink = document.querySelector('.sidebar-item[data-page="team"]');
        if (teamLink) teamLink.click();
    }
    setTimeout(() => {
        const inviteInput = document.getElementById('teamInviteEmail') || document.getElementById('teamNameInput');
        if (inviteInput) {
            inviteInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
            inviteInput.focus();
        }
    }, 280);
};

// ══════════════════════════════════════════════════════════════════════════════
//  COLLABORAZIONE PROGETTO IN TEAM (LAVORO A QUATTRO MANI SULLA STESSA RASSEGNA)
// ══════════════════════════════════════════════════════════════════════════════

let currentProjectModalReviewId = null;

/**
 * Apre il modal per collaborare e invitare colleghi su uno specifico progetto / rassegna
 */
async function openProjectTeamModal(reviewId) {
    currentProjectModalReviewId = reviewId || state.currentReviewId;
    const modal = document.getElementById('projectTeamModal');
    if (!modal) return;

    // Reset campi e messaggi
    const emailInput = document.getElementById('projectInviteEmailInput');
    const msgEl = document.getElementById('projectInviteResultMsg');
    const linkBox = document.getElementById('projectInviteLinkBox');
    if (emailInput) emailInput.value = '';
    if (msgEl) { msgEl.style.display = 'none'; msgEl.textContent = ''; }
    if (linkBox) linkBox.style.display = 'none';

    modal.classList.remove('hidden');
    modal.style.display = 'flex';

    await refreshProjectModalData(currentProjectModalReviewId);
    if (window.feather) feather.replace();
}
window.openProjectTeamModal = openProjectTeamModal;

/**
 * Apre il modal di collaborazione per la rassegna attualmente aperta in editor
 */
async function openCurrentProjectTeamModal() {
    if (!state.currentReviewId) {
        // Se ci sono articoli o un titolo, salviamo la bozza per ottenere un reviewId univoco
        showToast('Inizializzazione spazio collaborativo per questa rassegna...', 'info');
        const title = document.getElementById('rassegnaTitle')?.value.trim() || ('Rassegna Stampa del ' + new Date().toLocaleDateString('it-IT'));
        const clientName = document.getElementById('clientName')?.value.trim() || '';

        try {
            const saveRes = await apiCall('POST', '/api/pdf/archive', {
                articles: state.articles || [],
                title,
                clientName,
                clientLogo: state.clientLogoBase64
            });
            if (saveRes && saveRes.id) {
                state.currentReviewId = saveRes.id;
                sessionStorage.setItem('rs_draft_review_id', saveRes.id);
                loadHistory();
            }
        } catch (e) {
            console.warn('Errore salvataggio preliminare bozza:', e);
        }
    }

    await openProjectTeamModal(state.currentReviewId);
}
window.openCurrentProjectTeamModal = openCurrentProjectTeamModal;

/**
 * Ricarica i dati del progetto e la lista dei collaboratori nel modal
 */
async function refreshProjectModalData(reviewId) {
    const titleEl = document.getElementById('projectModalTitle');
    const clientBadgeEl = document.getElementById('projectModalClientName');
    const statusEl = document.getElementById('projectModalSharingStatus');
    const countEl = document.getElementById('projectModalMemberCount');
    const listEl = document.getElementById('projectModalCollaboratorsList');

    if (!reviewId) {
        if (titleEl) titleEl.textContent = document.getElementById('rassegnaTitle')?.value.trim() || 'Nuova Rassegna Stampa';
        if (clientBadgeEl) clientBadgeEl.textContent = document.getElementById('clientName')?.value.trim() || 'Nessun Cliente';
        if (statusEl) statusEl.innerHTML = '<span style="color:var(--text-muted);">Bozza locale &bull; Invita colleghi per iniziare a collaborare</span>';
        if (countEl) countEl.textContent = '1 persona';
        if (listEl) {
            listEl.innerHTML = `
                <div style="display:flex; align-items:center; justify-content:space-between; padding:6px 0;">
                    <div style="display:flex; align-items:center; gap:8px;">
                        <div style="width:28px;height:28px;border-radius:50%;background:var(--accent-primary);color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:0.75rem;">TU</div>
                        <span style="font-size:0.85rem; font-weight:600; color:var(--text-primary);">Tu (Autore)</span>
                    </div>
                    <span style="font-size:0.72rem; color:var(--accent-primary); font-weight:700; background:rgba(124,92,255,0.1); padding:2px 8px; border-radius:4px;">Proprietario</span>
                </div>`;
        }
        return;
    }

    try {
        const token = state.token || localStorage.getItem('rs_token');
        const res = await fetch(`/api/teams/project/${reviewId}/collaborators`, {
            headers: { Authorization: `Bearer ${token}` }
        });
        if (!res.ok) return;
        const data = await res.json();

        if (titleEl) titleEl.textContent = data.project.title || 'Rassegna Stampa';
        if (clientBadgeEl) clientBadgeEl.textContent = data.project.clientName || 'Nessun Cliente';

        if (statusEl) {
            if (data.project.isShared) {
                statusEl.innerHTML = `<span style="color:#00c853; font-weight:700;">Condiviso nel ${escapeHtml(data.project.teamName || 'Team')} &bull; Accesso Collaborativo</span>`;
            } else {
                statusEl.innerHTML = `<span style="color:var(--text-muted);">Progetto Personale &bull; Non ancora condiviso</span>`;
            }
        }

        const collabs = data.collaborators || [];
        if (countEl) countEl.textContent = `${collabs.length} collaborator${collabs.length === 1 ? 'e' : 'i'}`;

        if (listEl) {
            listEl.innerHTML = collabs.map(c => {
                const initials = (c.company_name || c.email || 'TU').slice(0, 2).toUpperCase();
                const isMe = c.user_id === (state.user?.id || (jwt_decode_id()));
                const roleBadge = c.role === 'owner' ? 'Proprietario' : 'Collaboratore';
                return `
                <div style="display:flex; align-items:center; justify-content:space-between; padding:6px 0; border-bottom:1px solid rgba(255,255,255,0.04); font-size:0.85rem;">
                    <div style="display:flex; align-items:center; gap:8px;">
                        <div style="width:28px;height:28px;border-radius:50%;background:var(--accent-primary);color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:0.75rem;">${initials}</div>
                        <div>
                            <div style="font-weight:600; color:var(--text-primary); font-size:0.85rem;">${escapeHtml(c.company_name || c.email)} ${isMe ? '<span style="font-size:0.72rem; color:var(--text-muted);">(tu)</span>' : ''}</div>
                            <div style="font-size:0.72rem; color:var(--text-muted);">${escapeHtml(c.email)}</div>
                        </div>
                    </div>
                    <span style="font-size:0.72rem; color:var(--accent-primary); font-weight:700; background:rgba(124,92,255,0.1); padding:2px 8px; border-radius:4px;">${roleBadge}</span>
                </div>`;
            }).join('');
        }

        updateProjectCollabStrip(data.project, collabs);

    } catch (e) {
        console.warn('Errore refreshProjectModalData:', e);
    }
}
window.refreshProjectModalData = refreshProjectModalData;

/** Helper per estrarre user_id da token JWT se state.user è null */
function jwt_decode_id() {
    try {
        const token = state.token || localStorage.getItem('rs_token');
        if (!token) return null;
        const base64 = token.split('.')[1];
        const payload = JSON.parse(atob(base64));
        return payload.userId || null;
    } catch(e) { return null; }
}

/**
 * Invia l'invito a un nuovo collega per collaborare a questo progetto
 */
async function sendProjectTeamInvite() {
    const input = document.getElementById('projectInviteEmailInput');
    const msgEl = document.getElementById('projectInviteResultMsg');
    const btn = document.getElementById('btnSendProjectInvite');
    const linkBox = document.getElementById('projectInviteLinkBox');
    const linkInput = document.getElementById('projectDirectInviteLinkInput');

    if (!input) return;
    const email = input.value.trim();
    if (!email || !email.includes('@')) {
        if (msgEl) {
            msgEl.style.display = 'block';
            msgEl.style.color = 'var(--danger-color, #dc2626)';
            msgEl.textContent = 'Inserisci un indirizzo email valido.';
        }
        return;
    }

    if (btn) {
        btn.disabled = true;
        btn.textContent = 'Invio invito...';
    }
    if (msgEl) {
        msgEl.style.display = 'block';
        msgEl.style.color = 'var(--text-muted)';
        msgEl.textContent = 'Generazione invito al progetto in corso...';
    }

    const token = state.token || localStorage.getItem('rs_token');
    const projectName = document.getElementById('projectModalTitle')?.textContent || document.getElementById('rassegnaTitle')?.value.trim() || 'Rassegna Stampa';

    try {
        const res = await fetch('/api/teams/invite', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify({
                email,
                projectId: currentProjectModalReviewId || state.currentReviewId,
                projectName
            })
        });
        const data = await res.json();

        if (res.ok && data.success) {
            input.value = '';
            msgEl.style.display = 'block';
            msgEl.style.color = 'var(--success-color, #16a34a)';
            msgEl.innerHTML = `Invito inviato con successo! Il tuo collega potrà registrarsi o accedere e troverà subito questo progetto condiviso.`;

            if (data.inviteLink && linkBox && linkInput) {
                linkInput.value = data.inviteLink;
                linkBox.style.display = 'block';
            }

            // Ricarica la lista collaboratori e la home team banner
            await refreshProjectModalData(currentProjectModalReviewId || state.currentReviewId);
            if (typeof syncHomeTeamBanner === 'function') syncHomeTeamBanner();
            if (typeof loadHistory === 'function') loadHistory();
        } else {
            msgEl.style.display = 'block';
            msgEl.style.color = 'var(--danger-color, #dc2626)';
            msgEl.textContent = data.error || 'Impossibile inviare l\'invito.';
        }
    } catch (e) {
        if (msgEl) {
            msgEl.style.display = 'block';
            msgEl.style.color = 'var(--danger-color, #dc2626)';
            msgEl.textContent = 'Errore di connessione durante l\'invio dell\'invito.';
        }
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = '<i data-feather="mail" style="width:14px;height:14px;"></i> Invia Invito';
            if (window.feather) feather.replace();
        }
    }
}
window.sendProjectTeamInvite = sendProjectTeamInvite;

/** Copia il link diretto di invito al progetto negli appunti */
window.copyProjectInviteLink = function() {
    const input = document.getElementById('projectDirectInviteLinkInput');
    const btn = document.getElementById('btnCopyProjectInviteLink');
    if (!input || !input.value) return;
    navigator.clipboard.writeText(input.value).then(() => {
        if (btn) {
            const original = btn.textContent;
            btn.textContent = 'Copiato!';
            setTimeout(() => { btn.textContent = original; }, 2000);
        }
        showToast('Link di invito al progetto copiato negli appunti!', 'success');
    }).catch(() => showToast('Errore durante la copia del link', 'error'));
};

/** Chiude il modal di collaborazione progetto */
window.closeProjectTeamModal = function() {
    const modal = document.getElementById('projectTeamModal');
    if (!modal) return;
    modal.classList.add('hidden');
    modal.style.display = 'none';
};

/**
 * Aggiorna la barra orizzontale di stato team presente sopra la rassegna in corso
 */
function updateProjectCollabStrip(project, collaborators = []) {
    const strip = document.getElementById('projectCollabStrip');
    if (!strip) return;

    const badgeText = document.getElementById('projectCollabStatusText');
    const desc = document.getElementById('projectCollabDesc');
    const avatarStack = document.getElementById('projectCollabAvatarStack');

    if (project && project.isShared) {
        if (badgeText) badgeText.textContent = project.teamName ? `Progetto ${project.teamName}` : 'Progetto di Team';
        if (desc) desc.textContent = 'Spazio collaborativo: qualsiasi modifica apportata da te o dai tuoi colleghi è sincronizzata.';
    } else {
        if (badgeText) badgeText.textContent = 'Progetto Personale';
        if (desc) desc.textContent = 'Clicca "Invita sul Progetto" per iniziare a lavorare a quattro mani con un collega.';
    }

    if (avatarStack && collaborators.length > 0) {
        const slice = collaborators.slice(0, 4);
        let stackHtml = slice.map(c => {
            const inits = (c.company_name || c.email || 'TU').slice(0, 2).toUpperCase();
            return `<div class="team-avatar" title="${escapeHtml(c.company_name || c.email)}">${inits}</div>`;
        }).join('');
        if (collaborators.length > 4) {
            stackHtml += `<div class="team-avatar avatar-more">+${collaborators.length - 4}</div>`;
        }
        avatarStack.innerHTML = stackHtml;
    }
}
window.updateProjectCollabStrip = updateProjectCollabStrip;

// ==========================================================================
// --- MODULO REPORT PERIODICI & COVERAGE BOOK ---
// ==========================================================================

let rawReportsList = [];
let currentReportDraft = null;

async function loadReportsPage() {
    const container = document.getElementById('reportsListContainer');
    if (!container) return;

    try {
        const reports = await apiCall('GET', '/api/reports');
        if (Array.isArray(reports)) {
            rawReportsList = reports;
            renderReportsList(reports);
        }
    } catch (err) {
        console.error('Error loading reports:', err);
        container.innerHTML = `
            <div class="empty-state" style="text-align:center; padding:3rem 1.5rem;">
                <p style="color:var(--danger, #ef4444); margin-bottom:12px;">Impossibile caricare i report: ${escapeHtml(err.message)}</p>
                <button class="btn btn-outline btn-sm" onclick="loadReportsPage()">Riprova</button>
            </div>
        `;
    }
}
window.loadReportsPage = loadReportsPage;

function renderReportsList(reports) {
    const container = document.getElementById('reportsListContainer');
    if (!container) return;

    if (!reports || reports.length === 0) {
        container.innerHTML = `
            <div class="glass-card" style="text-align:center; padding:4rem 2rem; border-radius:14px; max-width:680px; margin:2rem auto;">
                <div style="width:64px; height:64px; border-radius:50%; background:rgba(124,92,255,0.1); display:flex; align-items:center; justify-content:center; margin:0 auto 1.25rem;">
                    <i data-feather="pie-chart" style="width:32px; height:32px; color:var(--accent-primary);"></i>
                </div>
                <h3 style="font-size:1.3rem; font-weight:700; color:var(--text-primary); margin-bottom:0.5rem;">Nessun Report Periodico Creato</h3>
                <p style="color:var(--text-muted); font-size:0.92rem; line-height:1.6; margin-bottom:1.5rem;">
                    I report servono per inviare al cliente il resoconto complessivo delle attività svolte (es. mensile, trimestrale o annuale) aggregando tutti i lanci, le uscite e le metriche Audience &amp; Letture stimate.
                </p>
                <button class="btn btn-gradient" onclick="openCreateReportModal()" style="padding:0.75rem 1.5rem;">
                    <i data-feather="plus-circle" style="width:16px;height:16px;margin-right:6px;"></i> Crea il tuo primo Report
                </button>
            </div>
        `;
        if (window.feather) feather.replace();
        return;
    }

    let cardsHtml = `<div style="display:grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap:1.25rem;">`;

    reports.forEach(r => {
        const kpis = r.summaryKPIs || {};
        const launchesCount = kpis.total_launches || 0;
        const pickupsCount = kpis.total_pickups || 0;
        const audienceOTS = kpis.formatted_audience_ots || 'N/D';
        const reads = kpis.formatted_estimated_reads || 'N/D';
        const dateCreated = new Date(r.created_at).toLocaleDateString('it-IT');

        cardsHtml += `
            <div class="glass-card" style="border-radius:14px; padding:1.25rem; display:flex; flex-direction:column; justify-content:space-between; border:1px solid var(--border-color); background:var(--bg-card);">
                <div>
                    <!-- Header card: Client & Period -->
                    <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:0.75rem; gap:8px;">
                        <div>
                            <span style="font-size:0.75rem; font-weight:700; text-transform:uppercase; letter-spacing:0.5px; color:var(--accent-primary); background:rgba(124,92,255,0.12); padding:2px 8px; border-radius:6px;">
                                ${escapeHtml(r.client_name)}
                            </span>
                            <h3 style="font-size:1.05rem; font-weight:700; color:var(--text-primary); margin-top:6px; line-height:1.3;">
                                ${escapeHtml(r.title)}
                            </h3>
                        </div>
                        ${r.client_logo ? `<img src="${r.client_logo}" alt="Logo" style="max-height:28px; max-width:80px; object-fit:contain;">` : ''}
                    </div>

                    <div style="font-size:0.8rem; color:var(--text-muted); margin-bottom:1rem; display:flex; align-items:center; gap:6px;">
                        <i data-feather="calendar" style="width:13px;height:13px;"></i>
                        <span>${escapeHtml(r.period_label || 'Periodo')}</span>
                        <span>&bull;</span>
                        <span>Creata il ${dateCreated}</span>
                    </div>

                    <!-- Mini KPI row -->
                    <div style="display:grid; grid-template-columns: repeat(4, 1fr); gap:6px; background:rgba(255,255,255,0.02); border:1px solid rgba(255,255,255,0.05); border-radius:8px; padding:8px; text-align:center; margin-bottom:1.25rem;">
                        <div>
                            <div style="font-size:1rem; font-weight:800; color:var(--accent-primary);">${launchesCount}</div>
                            <div style="font-size:0.65rem; color:var(--text-muted); text-transform:uppercase;">Lanci</div>
                        </div>
                        <div>
                            <div style="font-size:1rem; font-weight:800; color:#ffffff;">${pickupsCount}</div>
                            <div style="font-size:0.65rem; color:var(--text-muted); text-transform:uppercase;">Uscite</div>
                        </div>
                        <div>
                            <div style="font-size:1rem; font-weight:800; color:#ffffff;">${audienceOTS}</div>
                            <div style="font-size:0.65rem; color:var(--text-muted); text-transform:uppercase;">OTS</div>
                        </div>
                        <div>
                            <div style="font-size:1rem; font-weight:800; color:#38bdf8;">${reads}</div>
                            <div style="font-size:0.65rem; color:var(--text-muted); text-transform:uppercase;">Letture</div>
                        </div>
                    </div>
                </div>

                <!-- Action buttons -->
                <div style="display:flex; gap:6px; flex-wrap:wrap; border-top:1px solid rgba(255,255,255,0.05); padding-top:0.75rem; justify-content:space-between; align-items:center;">
                    <div style="display:flex; gap:6px;">
                        <button class="btn btn-outline btn-sm" onclick="openReportEmailModal(${r.id})" title="Copia Testo per Email">
                            <i data-feather="mail" style="width:13px;height:13px;"></i> Email
                        </button>
                        <a href="/report/${r.share_token}" target="_blank" class="btn btn-outline btn-sm" title="Apri Portale Web Permanente">
                            <i data-feather="external-link" style="width:13px;height:13px;"></i> Portale
                        </a>
                        <button class="btn btn-outline btn-sm" onclick="downloadSingleReportPdf(${r.id})" title="Scarica PDF Esecutivo">
                            <i data-feather="download" style="width:13px;height:13px;"></i> PDF
                        </button>
                    </div>
                    <div style="display:flex; gap:6px;">
                        <button class="btn btn-outline btn-sm" onclick="openEditReportModal(${r.id})" title="Modifica Report">
                            <i data-feather="edit-2" style="width:13px;height:13px;"></i>
                        </button>
                        <button class="btn btn-danger btn-sm" onclick="deleteReportItem(${r.id})" title="Elimina Report">
                            <i data-feather="trash-2" style="width:13px;height:13px;"></i>
                        </button>
                    </div>
                </div>
            </div>
        `;
    });

    cardsHtml += `</div>`;
    container.innerHTML = cardsHtml;
    if (window.feather) feather.replace();
}

async function populateReportClientsDropdown(selectedClientName = '') {
    const select = document.getElementById('reportClientSelect');
    if (!select) return;

    select.innerHTML = '<option value="">-- Seleziona Cliente --</option>';

    const clientNamesSet = new Set();

    try {
        const clients = await apiCall('GET', '/api/clients');
        if (Array.isArray(clients)) {
            clients.forEach(c => {
                if (c.name && c.name.trim()) clientNamesSet.add(c.name.trim());
            });
        }
    } catch(e) {}

    if (Array.isArray(rawHistoryItems)) {
        rawHistoryItems.forEach(it => {
            if (it.client_name && it.client_name.trim()) {
                clientNamesSet.add(it.client_name.trim());
            }
        });
    }

    const sortedNames = Array.from(clientNamesSet).sort((a, b) => a.localeCompare(b, 'it'));
    sortedNames.forEach(name => {
        const opt = document.createElement('option');
        opt.value = name;
        opt.textContent = name;
        if (selectedClientName && name.toLowerCase() === selectedClientName.toLowerCase()) {
            opt.selected = true;
        }
        select.appendChild(opt);
    });
}

function openCreateReportModal() {
    const modal = document.getElementById('reportModal');
    const form = document.getElementById('reportForm');
    if (!modal || !form) return;

    form.reset();
    document.getElementById('reportEditId').value = '';
    document.getElementById('reportModalTitle').textContent = 'Nuovo Report Periodico Media Relations';
    document.getElementById('reportKpiBanner').style.display = 'none';
    document.getElementById('reportLaunchesTbody').innerHTML = `
        <tr>
            <td colspan="5" style="text-align:center; padding:1.5rem; color:var(--text-muted);">
                Seleziona un cliente e clicca su "Aggrega Dati dal Database" per compilare i lanci.
            </td>
        </tr>
    `;

    populateReportClientsDropdown();

    onReportPeriodPresetChange('this_month');
    switchReportDeliveryTab('email');

    currentReportDraft = {
        summaryKPIs: {},
        launches: [],
        topMedia: []
    };

    modal.classList.remove('hidden');
    if (window.feather) feather.replace();
}
window.openCreateReportModal = openCreateReportModal;

function closeReportModal() {
    const modal = document.getElementById('reportModal');
    if (modal) modal.classList.add('hidden');
}
window.closeReportModal = closeReportModal;

function onReportClientSelected() {
    const clientSelect = document.getElementById('reportClientSelect');
    const labelInput = document.getElementById('reportPeriodLabel');
    if (!clientSelect || !labelInput) return;

    const cName = clientSelect.value;
    if (cName && !labelInput.value) {
        labelInput.value = `Resoconto Media Relations ${cName}`;
    }
}
window.onReportClientSelected = onReportClientSelected;

function onReportPeriodPresetChange(preset) {
    const inputStart = document.getElementById('reportPeriodStart');
    const inputEnd   = document.getElementById('reportPeriodEnd');
    const inputLabel = document.getElementById('reportPeriodLabel');
    if (!inputStart || !inputEnd) return;

    const now = new Date();
    const todayStr = toYYYYMMDD(now);

    let startStr = '';
    let endStr   = todayStr;
    let labelStr = '';

    const ITALIAN_MONTHS_NAMES = [
        'Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno',
        'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre'
    ];

    if (preset === 'this_month') {
        startStr = toYYYYMMDD(new Date(now.getFullYear(), now.getMonth(), 1));
        endStr = todayStr;
        labelStr = `Mese di ${ITALIAN_MONTHS_NAMES[now.getMonth()]} ${now.getFullYear()}`;
    } else if (preset === 'last_month') {
        const lastM = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        startStr = toYYYYMMDD(lastM);
        endStr = toYYYYMMDD(new Date(now.getFullYear(), now.getMonth(), 0));
        labelStr = `Mese di ${ITALIAN_MONTHS_NAMES[lastM.getMonth()]} ${lastM.getFullYear()}`;
    } else if (preset === 'last_quarter') {
        const d90 = new Date();
        d90.setDate(d90.getDate() - 90);
        startStr = toYYYYMMDD(d90);
        endStr = todayStr;
        labelStr = `Ultimo Trimestre ${now.getFullYear()}`;
    } else if (preset === 'last_semester') {
        const d180 = new Date();
        d180.setDate(d180.getDate() - 180);
        startStr = toYYYYMMDD(d180);
        endStr = todayStr;
        labelStr = `Semestre ${now.getFullYear()}`;
    } else if (preset === 'year_to_date') {
        startStr = `${now.getFullYear()}-01-01`;
        endStr = todayStr;
        labelStr = `Anno ${now.getFullYear()}`;
    } else if (preset === 'dekra_demo') {
        startStr = '2025-01-01';
        endStr = '2025-07-31';
        labelStr = 'Gennaio – Luglio 2025';
    }

    if (startStr) inputStart.value = startStr;
    if (endStr) inputEnd.value = endStr;
    if (labelStr && inputLabel && !inputLabel.value) {
        inputLabel.value = labelStr;
    } else if (labelStr && inputLabel && (inputLabel.value.startsWith('Mese') || inputLabel.value.startsWith('Semestre') || inputLabel.value.startsWith('Gennaio'))) {
        inputLabel.value = labelStr;
    }
}
window.onReportPeriodPresetChange = onReportPeriodPresetChange;

async function runReportAggregation() {
    const clientSelect = document.getElementById('reportClientSelect');
    const inputStart   = document.getElementById('reportPeriodStart');
    const inputEnd     = document.getElementById('reportPeriodEnd');
    const inputLabel   = document.getElementById('reportPeriodLabel');
    const btnTrigger   = document.getElementById('btnTriggerAggregation');

    const clientName = clientSelect ? clientSelect.value.trim() : '';
    if (!clientName) {
        showToast('Seleziona prima un cliente.', 'warning');
        return;
    }

    const periodStart = inputStart ? inputStart.value : '';
    const periodEnd   = inputEnd ? inputEnd.value : '';
    const periodLabel = inputLabel ? inputLabel.value.trim() : '';

    if (btnTrigger) {
        btnTrigger.disabled = true;
        btnTrigger.innerHTML = '<i data-feather="loader" class="spin"></i> Aggregazione in corso...';
    }

    try {
        const res = await apiCall('POST', '/api/reports/aggregate', {
            clientName,
            periodStart,
            periodEnd,
            periodLabel
        });

        currentReportDraft = res;

        // Visualizza Banner KPI
        const kpis = res.summaryKPIs || {};
        document.getElementById('reportAggLaunches').textContent = kpis.total_launches || res.launchesCount || 0;
        document.getElementById('reportAggPickups').textContent = kpis.total_pickups || res.totalPickups || 0;
        document.getElementById('reportAggAudience').textContent = kpis.formatted_audience_ots || 'N/D';
        document.getElementById('reportAggReads').textContent = kpis.formatted_estimated_reads || 'N/D';
        document.getElementById('reportAggSentiment').textContent = kpis.overall_sentiment || 'Positivo';
        document.getElementById('reportKpiBanner').style.display = 'block';

        // Precompila campi se vuoti
        const salutationInput = document.getElementById('reportRecipientSalutation');
        if (salutationInput && !salutationInput.value) {
            salutationInput.value = 'Caro Presidente, Caro Toni,';
        }

        const titleInput = document.getElementById('reportRecipientTitle');
        if (titleInput && !titleInput.value) {
            titleInput.value = `Presidente di ${clientName}`;
        }

        const topMediaInput = document.getElementById('reportTopMediaText');
        if (topMediaInput && res.topMedia && res.topMedia.length > 0) {
            topMediaInput.value = res.topMedia.join(', ');
        }

        const senderInput = document.getElementById('reportSenderSignature');
        if (senderInput && !senderInput.value) {
            senderInput.value = 'Attilio';
        }

        // Render tabella lanci
        renderReportLaunchesTable(res.launches);

        // Aggiorna anteprima email
        updateReportEmailPreviewText();

        showToast(`Aggregati con successo ${res.launchesCount} lanci per ${res.totalPickups} uscite totali!`, 'success');

    } catch (err) {
        console.error('Aggregation error:', err);
        showToast('Errore durante l\'aggregazione: ' + err.message, 'error');
    } finally {
        if (btnTrigger) {
            btnTrigger.disabled = false;
            btnTrigger.innerHTML = '<i data-feather="zap" style="width:16px;height:16px;"></i> Aggrega Dati dal Database';
            if (window.feather) feather.replace();
        }
    }
}
window.runReportAggregation = runReportAggregation;

function renderReportLaunchesTable(launches) {
    const tbody = document.getElementById('reportLaunchesTbody');
    if (!tbody) return;

    if (!launches || launches.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="5" style="text-align:center; padding:1.5rem; color:var(--text-muted);">
                    Nessuna rassegna trovata per questo cliente nel periodo selezionato. Puoi aggiungere lanci manualmente con il pulsante in alto.
                </td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = launches.map((l, idx) => `
        <tr data-index="${idx}" style="border-bottom:1px solid rgba(255,255,255,0.05);">
            <td style="padding:6px 10px; text-align:center;">
                <input type="checkbox" class="history-checkbox launch-include-chk" ${l.included !== false ? 'checked' : ''} onchange="onLaunchIncludeChange(${idx}, this.checked)">
            </td>
            <td style="padding:6px 10px;">
                <input type="text" class="launch-date-input" value="${escapeHtml(l.date || '')}" oninput="onLaunchFieldChange(${idx}, 'date', this.value)"
                    style="width:100%; padding:3px 6px; font-size:0.75rem; border-radius:4px; border:1px solid var(--border-color); background:transparent; color:var(--text-primary);">
            </td>
            <td style="padding:6px 10px;">
                <input type="text" class="launch-title-input" value="${escapeHtml(l.title || '')}" oninput="onLaunchFieldChange(${idx}, 'title', this.value)"
                    style="width:100%; padding:3px 6px; font-size:0.8rem; font-weight:600; border-radius:4px; border:1px solid var(--border-color); background:transparent; color:var(--text-primary);">
            </td>
            <td style="padding:6px 10px; text-align:right;">
                <input type="number" class="launch-pickups-input" value="${l.pickups || 0}" min="0" oninput="onLaunchFieldChange(${idx}, 'pickups', parseInt(this.value) || 0)"
                    style="width:65px; padding:3px 6px; font-size:0.8rem; font-weight:700; text-align:right; border-radius:4px; border:1px solid var(--border-color); background:transparent; color:var(--accent-primary);">
            </td>
            <td style="padding:6px 10px; text-align:center;">
                <button type="button" class="btn-icon btn-sm" onclick="removeManualLaunchRow(${idx})" title="Rimuovi lancio" style="color:var(--text-muted);">
                    <i data-feather="x" style="width:13px;height:13px;"></i>
                </button>
            </td>
        </tr>
    `).join('');

    if (window.feather) feather.replace();
}

function onLaunchIncludeChange(idx, checked) {
    if (currentReportDraft && currentReportDraft.launches && currentReportDraft.launches[idx]) {
        currentReportDraft.launches[idx].included = checked;
        updateReportEmailPreviewText();
    }
}
window.onLaunchIncludeChange = onLaunchIncludeChange;

function onLaunchFieldChange(idx, field, val) {
    if (currentReportDraft && currentReportDraft.launches && currentReportDraft.launches[idx]) {
        currentReportDraft.launches[idx][field] = val;
        updateReportEmailPreviewText();
    }
}
window.onLaunchFieldChange = onLaunchFieldChange;

function addNewManualLaunchRow() {
    if (!currentReportDraft) {
        currentReportDraft = { launches: [] };
    }
    if (!currentReportDraft.launches) currentReportDraft.launches = [];

    const today = new Date();
    const dateFormatted = today.toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: '2-digit' }).replace(/\//g, '.');

    currentReportDraft.launches.push({
        date: dateFormatted,
        title: 'Nuovo Comunicato Stampa',
        pickups: 10,
        included: true
    });

    renderReportLaunchesTable(currentReportDraft.launches);
    updateReportEmailPreviewText();
}
window.addNewManualLaunchRow = addNewManualLaunchRow;

function removeManualLaunchRow(idx) {
    if (currentReportDraft && currentReportDraft.launches) {
        currentReportDraft.launches.splice(idx, 1);
        renderReportLaunchesTable(currentReportDraft.launches);
        updateReportEmailPreviewText();
    }
}
window.removeManualLaunchRow = removeManualLaunchRow;

function updateReportEmailPreviewText() {
    const textarea = document.getElementById('reportGeneratedEmailText');
    if (!textarea) return;

    const clientSelect = document.getElementById('reportClientSelect');
    const clientName = clientSelect ? clientSelect.value.trim() : 'Cliente';
    const periodLabel = (document.getElementById('reportPeriodLabel')?.value || 'Periodo').trim();
    const salutation = (document.getElementById('reportRecipientSalutation')?.value || 'Caro Presidente,').trim();
    const recipientTitle = (document.getElementById('reportRecipientTitle')?.value || '').trim();
    const eventsText = (document.getElementById('reportEventsSupported')?.value || '').trim();
    const topMedia = (document.getElementById('reportTopMediaText')?.value || '').trim();
    const signature = (document.getElementById('reportSenderSignature')?.value || 'Attilio').trim();

    const launches = (currentReportDraft?.launches || []).filter(l => l.included !== false);
    const totalPickups = launches.reduce((acc, l) => acc + (l.pickups || 0), 0);

    let eventsSection = '';
    if (eventsText) {
        const eventsLines = eventsText.split('\n').filter(l => l.trim().length > 0);
        eventsSection = "Tra le attività svolte dall'ufficio stampa, segnaliamo il supporto per i seguenti eventi a cui ha partecipato " + clientName + ":\n" +
            eventsLines.map(e => `- ${e.replace(/^[-•*]\s*/, '').trim()};`).join('\n') + "\n\n";
    }

    let topMediaSection = '';
    if (topMedia) {
        topMediaSection = `Tra le uscite più significative segnaliamo: ${topMedia}.\n\n`;
    }

    const shareUrl = document.getElementById('reportShareUrlDisplay')?.value || '[LINK_PORTALE_PERMANENTE]';
    const launchesDetails = launches.map(l => `${l.date} - ${l.title} – ${l.pickups || 0} uscite`).join('\n');

    const emailText = `${salutation}
con la presente Vi inviamo il Report Media relations e Press office${recipientTitle ? ' per ' + recipientTitle : ''}, relativo ai mesi di ${periodLabel}, con ${launches.length} lanci di comunicati stampa e dichiarazioni per un totale di ${totalPickups} pubblicazioni.

${eventsSection}${topMediaSection}Nel seguente link permanente è possibile trovare il report completo e accedere a tutti i singoli lanci e rassegne PDF:
${shareUrl}

Inviamo, di seguito, il dettaglio dei lanci effettuati.
Ringraziando per l’attenzione, restiamo a disposizione.
Un caro saluto,
${signature}

REPORT ${clientName.toUpperCase()} ${periodLabel.toUpperCase()}
${launches.length} LANCI PER ${totalPickups} USCITE
${launchesDetails}`;

    textarea.value = emailText;
}

function copyReportEmailText() {
    const textarea = document.getElementById('reportGeneratedEmailText');
    if (!textarea || !textarea.value) {
        showToast('Nessun testo generato da copiare.', 'warning');
        return;
    }
    navigator.clipboard.writeText(textarea.value).then(() => {
        showToast('Testo email esecutiva copiato negli appunti!', 'success');
    }).catch(() => {
        textarea.select();
        document.execCommand('copy');
        showToast('Testo email esecutiva copiato negli appunti!', 'success');
    });
}
window.copyReportEmailText = copyReportEmailText;

function switchReportDeliveryTab(tabName) {
    const tabs = ['email', 'portal', 'pdf'];
    tabs.forEach(t => {
        const btn = document.getElementById('tabBtn' + t.charAt(0).toUpperCase() + t.slice(1));
        const content = document.getElementById('tabContent' + t.charAt(0).toUpperCase() + t.slice(1));
        if (btn) btn.classList.toggle('active', t === tabName);
        if (content) content.style.display = (t === tabName) ? 'block' : 'none';
    });
}
window.switchReportDeliveryTab = switchReportDeliveryTab;

async function saveReportForm(event) {
    if (event) event.preventDefault();

    const clientSelect = document.getElementById('reportClientSelect');
    const clientName = clientSelect ? clientSelect.value.trim() : '';
    if (!clientName) {
        showToast('Seleziona un cliente valido.', 'warning');
        return;
    }

    const editId = document.getElementById('reportEditId')?.value || null;
    const periodStart = document.getElementById('reportPeriodStart')?.value || '';
    const periodEnd = document.getElementById('reportPeriodEnd')?.value || '';
    const periodLabel = (document.getElementById('reportPeriodLabel')?.value || '').trim();
    const recipientSalutation = (document.getElementById('reportRecipientSalutation')?.value || '').trim();
    const recipientTitle = (document.getElementById('reportRecipientTitle')?.value || '').trim();
    const eventsText = (document.getElementById('reportEventsSupported')?.value || '').trim();
    const topMediaText = (document.getElementById('reportTopMediaText')?.value || '').trim();
    const executiveNotes = (document.getElementById('reportExecutiveNotes')?.value || '').trim();
    const senderSignature = (document.getElementById('reportSenderSignature')?.value || '').trim();

    const eventsSupported = eventsText ? eventsText.split('\n').map(e => e.trim()).filter(Boolean) : [];
    const topMedia = topMediaText ? topMediaText.split(',').map(m => m.trim()).filter(Boolean) : [];

    const launches = (currentReportDraft?.launches || []).filter(l => l.included !== false);
    const summaryKPIs = currentReportDraft?.summaryKPIs || {};
    summaryKPIs.total_launches = launches.length;
    summaryKPIs.total_pickups = launches.reduce((acc, l) => acc + (l.pickups || 0), 0);

    const payload = {
        id: editId ? parseInt(editId) : undefined,
        clientName,
        clientLogo: currentReportDraft?.clientLogo || '',
        title: `Report Media Relations ${clientName} - ${periodLabel}`,
        periodStart,
        periodEnd,
        periodLabel,
        recipientSalutation,
        recipientTitle,
        eventsSupported,
        executiveNotes,
        senderSignature,
        summaryKPIs,
        launches,
        topMedia
    };

    try {
        const res = await apiCall('POST', '/api/reports/save', payload);
        showToast('Report salvato con successo!', 'success');

        if (res.id) {
            document.getElementById('reportEditId').value = res.id;
        }

        const origin = window.location.origin;
        const fullShareUrl = `${origin}${res.shareUrl}`;
        const shareDisplay = document.getElementById('reportShareUrlDisplay');
        if (shareDisplay) {
            shareDisplay.value = fullShareUrl;
        }
        const openBtn = document.getElementById('btnOpenPortalLive');
        if (openBtn) {
            openBtn.style.display = 'inline-flex';
            openBtn.dataset.url = fullShareUrl;
        }

        updateReportEmailPreviewText();
        loadReportsPage();

    } catch (err) {
        console.error('Save report error:', err);
        showToast('Errore nel salvataggio del report: ' + err.message, 'error');
    }
}
window.saveReportForm = saveReportForm;

function copyReportShareUrl() {
    const input = document.getElementById('reportShareUrlDisplay');
    if (!input || !input.value) {
        showToast('Salva prima il report per generare il link.', 'warning');
        return;
    }
    navigator.clipboard.writeText(input.value).then(() => {
        showToast('Link permanente copiato negli appunti!', 'success');
    });
}
window.copyReportShareUrl = copyReportShareUrl;

function openReportShareUrl() {
    const input = document.getElementById('reportShareUrlDisplay');
    if (input && input.value) {
        window.open(input.value, '_blank');
    }
}
window.openReportShareUrl = openReportShareUrl;

async function generateAndDownloadReportPdf() {
    const editId = document.getElementById('reportEditId')?.value;
    if (!editId) {
        showToast('Salva prima il report per generare il PDF.', 'warning');
        return;
    }

    const btn = document.getElementById('btnDownloadReportPdfAction');
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<i data-feather="loader" class="spin"></i> Generazione PDF A4 in corso...';
    }

    try {
        const res = await apiCall('POST', `/api/reports/${editId}/pdf`);
        triggerDownload(res.downloadUrl, res.filename);
        showToast('PDF Esecutivo generato e scaricato con successo!', 'success');
    } catch (err) {
        console.error('PDF generation error:', err);
        showToast('Errore durante la generazione del PDF: ' + err.message, 'error');
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = '<i data-feather="download" style="width:15px;height:15px;"></i> Genera e Scarica PDF Esecutivo';
            if (window.feather) feather.replace();
        }
    }
}
window.generateAndDownloadReportPdf = generateAndDownloadReportPdf;

async function openEditReportModal(reportId) {
    try {
        const report = await apiCall('GET', `/api/reports/${reportId}`);
        const modal = document.getElementById('reportModal');
        const form = document.getElementById('reportForm');
        if (!modal || !form) return;

        form.reset();
        document.getElementById('reportEditId').value = report.id;
        document.getElementById('reportModalTitle').textContent = `Modifica: ${report.title}`;

        await populateReportClientsDropdown(report.client_name);

        document.getElementById('reportPeriodStart').value = report.period_start || '';
        document.getElementById('reportPeriodEnd').value = report.period_end || '';
        document.getElementById('reportPeriodLabel').value = report.period_label || '';
        document.getElementById('reportRecipientSalutation').value = report.recipient_salutation || '';
        document.getElementById('reportRecipientTitle').value = report.recipient_title || '';
        document.getElementById('reportEventsSupported').value = (report.eventsSupported || []).join('\n');
        document.getElementById('reportTopMediaText').value = (report.topMedia || []).join(', ');
        document.getElementById('reportExecutiveNotes').value = report.executive_notes || '';
        document.getElementById('reportSenderSignature').value = report.sender_signature || '';

        const origin = window.location.origin;
        const fullShareUrl = `${origin}${report.shareUrl}`;
        const shareDisplay = document.getElementById('reportShareUrlDisplay');
        if (shareDisplay) shareDisplay.value = fullShareUrl;
        const openBtn = document.getElementById('btnOpenPortalLive');
        if (openBtn) {
            openBtn.style.display = 'inline-flex';
            openBtn.dataset.url = fullShareUrl;
        }

        currentReportDraft = {
            summaryKPIs: report.summaryKPIs || {},
            launches: report.launches || [],
            topMedia: report.topMedia || [],
            clientLogo: report.client_logo || ''
        };

        const kpis = report.summaryKPIs || {};
        document.getElementById('reportAggLaunches').textContent = kpis.total_launches || (report.launches ? report.launches.length : 0);
        document.getElementById('reportAggPickups').textContent = kpis.total_pickups || 0;
        document.getElementById('reportAggAudience').textContent = kpis.formatted_audience_ots || 'N/D';
        document.getElementById('reportAggReads').textContent = kpis.formatted_estimated_reads || 'N/D';
        document.getElementById('reportAggSentiment').textContent = kpis.overall_sentiment || 'Positivo';
        document.getElementById('reportKpiBanner').style.display = 'block';

        renderReportLaunchesTable(report.launches);
        updateReportEmailPreviewText();

        modal.classList.remove('hidden');
        if (window.feather) feather.replace();

    } catch (err) {
        showToast('Errore nel caricamento del report: ' + err.message, 'error');
    }
}
window.openEditReportModal = openEditReportModal;

async function openReportEmailModal(reportId) {
    await openEditReportModal(reportId);
    switchReportDeliveryTab('email');
}
window.openReportEmailModal = openReportEmailModal;

async function downloadSingleReportPdf(reportId) {
    showToast('Generazione PDF in corso...', 'info');
    try {
        const res = await apiCall('POST', `/api/reports/${reportId}/pdf`);
        triggerDownload(res.downloadUrl, res.filename);
        showToast('PDF scaricato con successo!', 'success');
    } catch (err) {
        showToast('Errore nel download del PDF: ' + err.message, 'error');
    }
}
window.downloadSingleReportPdf = downloadSingleReportPdf;

async function deleteReportItem(reportId) {
    if (!confirm('Sei sicuro di voler eliminare questo report?')) return;
    try {
        await apiCall('DELETE', `/api/reports/${reportId}`);
        showToast('Report eliminato con successo.', 'success');
        loadReportsPage();
    } catch (err) {
        showToast('Errore durante l\'eliminazione: ' + err.message, 'error');
    }
}
window.deleteReportItem = deleteReportItem;

