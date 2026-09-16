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
    
    if (state.token) {
        headers['Authorization'] = `Bearer ${state.token}`;
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

// --- HISTORY ---

async function loadHistory() {
    const list = document.getElementById('historyList');
    if (!list) return;

    try {
        const history = await apiCall('GET', '/api/pdf/history');
        
        list.innerHTML = '';
        
        if (history.length === 0) {
            list.innerHTML = '<div class="empty-state">Nessuna rassegna generata finora.</div>';
            return;
        }

        history.forEach(item => {
            const date = new Date(item.created_at).toLocaleDateString('it-IT');
            const div = document.createElement('div');
            div.className = 'history-item';
            div.innerHTML = `
                <div class="history-info">
                    <strong style="font-size:1.05rem;">${item.title}</strong>
                    <span class="history-meta" style="margin-top:4px; display:block; color:var(--text-muted); font-size:0.85rem;">
                        ${date} &bull; ${item.article_count} articol${item.article_count === 1 ? 'o' : 'i'} ${item.client_name ? `&bull; Cliente: ${item.client_name}` : ''}
                    </span>
                </div>
                <div style="display:flex; gap:0.5rem; margin-top:1rem; flex-wrap:wrap; align-items:center;">
                    <button class="btn btn-primary btn-sm" onclick="triggerDownload('${item.downloadUrl}', '${item.filename}')"><i data-feather="download" style="width:14px;height:14px;vertical-align:middle;margin-right:4px;"></i> Scarica PDF</button>
                    <button class="btn btn-secondary btn-sm" onclick="reopenFromHistory(${item.id})"><i data-feather="edit-2" style="width:14px;height:14px;vertical-align:middle;margin-right:4px;"></i> Modifica</button>
                    <button class="btn btn-outline btn-sm" onclick="openShareModal(${item.id})" style="border-color:rgba(255,255,255,0.25);"><i data-feather="share-2" style="width:14px;height:14px;vertical-align:middle;margin-right:4px;"></i> Condividi</button>
                    <button class="btn btn-outline btn-sm" onclick="openMorningDigestFromHistory(${item.id})" style="border-color:var(--accent-primary); color:var(--accent-primary);" title="Genera Briefing Esecutivo per questa rassegna"><i data-feather="file-text" style="width:14px;height:14px;vertical-align:middle;margin-right:4px;"></i> Briefing AI</button>
                    <button class="btn btn-danger btn-sm" onclick="deleteHistory(${item.id})" style="margin-left:auto;"><i data-feather="trash-2" style="width:14px;height:14px;vertical-align:middle;"></i></button>
                </div>
            `;
            list.appendChild(div);
        });
        feather.replace();
    } catch (error) {
        list.innerHTML = '<div class="empty-state">Errore nel caricamento dello storico.</div>';
    }
}

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

window.saveClientFromForm = async function() {
    const id = document.getElementById('clientId').value;
    const name = document.getElementById('clientNameInput').value.trim();
    const keywords = document.getElementById('clientKeywordsInput').value.trim();
    const tone_of_voice = document.getElementById('clientToneInput').value.trim();
    const notes = document.getElementById('clientNotesInput').value.trim();

    if (!name) return showToast('Inserisci il nome del cliente', 'warning');

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

// --- 4. MEDIA CONTACTS CRM CONTROLLER ---
let mediaContactsList = [];

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

        const totalEl = document.getElementById('crmTotalContacts');
        const outletsEl = document.getElementById('crmTotalOutlets');
        const beatsEl = document.getElementById('crmTotalBeats');

        if (totalEl) totalEl.textContent = mediaContactsList.length;
        if (outletsEl) {
            const uniqueOutlets = new Set(mediaContactsList.map(c => (c.outlet || '').trim().toLowerCase()).filter(Boolean));
            outletsEl.textContent = uniqueOutlets.size;
        }
        if (beatsEl) {
            const uniqueBeats = new Set(mediaContactsList.map(c => (c.beat || '').trim().toLowerCase()).filter(Boolean));
            beatsEl.textContent = uniqueBeats.size;
        }

        if (mediaContactsList.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="6" style="text-align:center; padding:3rem 1rem; color:var(--text-muted);">
                        <i data-feather="users" style="width:36px; height:36px; opacity:0.4; margin-bottom:0.5rem; display:block; margin-left:auto; margin-right:auto;"></i>
                        Nessun contatto trovato. Clicca su "+ Nuovo Contatto" o "Importa CSV" per iniziare la tua rubrica stampa!
                    </td>
                </tr>
            `;
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
            return `
                <tr style="border-bottom:1px solid rgba(255,255,255,0.05); transition:background 0.15s ease;" onmouseover="this.style.background='rgba(255,255,255,0.02)'" onmouseout="this.style.background='transparent'">
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
                        <a href="mailto:${encodeURIComponent(c.email)}" style="color:var(--text-primary); text-decoration:none; display:flex; align-items:center; gap:5px; font-size:0.83rem;" title="Invia Email">
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

        feather.replace();

    } catch (err) {
        console.error('Errore loadMediaContacts:', err);
        tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding:2rem; color:var(--danger);">Errore nel caricamento della rubrica.</td></tr>`;
    }
};

window.filterCrmContacts = function() {
    const beat = document.getElementById('crmBeatFilter')?.value || '';
    const search = document.getElementById('crmSearchInput')?.value || '';
    loadMediaContacts(beat, search);
};

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
        showToast('Errore: ' + err.message, 'error');
    }
};

window.deleteMediaContact = async function(id) {
    if (!confirm('Sei sicuro di voler rimuovere questo contatto dalla rubrica?')) return;
    try {
        await apiCall('DELETE', `/api/contacts/${id}`);
        showToast('Contatto rimosso', 'success');
        loadMediaContacts();
    } catch (err) {
        showToast('Errore: ' + err.message, 'error');
    }
};

window.openImportContactsModal = function() {
    const modal = document.getElementById('importContactsModal');
    const textarea = document.getElementById('importContactsTextarea');
    const countEl = document.getElementById('importContactsCount');
    if (textarea) textarea.value = '';
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
        showToast('Incolla almeno una riga di testo per importare.', 'warning');
        return;
    }

    try {
        const res = await apiCall('POST', '/api/contacts/import', { text });
        showToast(`Importazione completata: ${res.count} contatti aggiunti!`, 'success');
        closeImportContactsModal();
        loadMediaContacts();
    } catch (err) {
        showToast('Errore importazione: ' + err.message, 'error');
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

