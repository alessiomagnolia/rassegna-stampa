// State Management
const state = {
    token: localStorage.getItem('rs_token'),
    user: null,
    articles: [],
    history: [],
    isExtracting: false,
    isGenerating: false,
    clientLogoBase64: null
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
    document.getElementById('navCompany').innerText = user.company_name || user.email;
    
    // Sidebar footer
    const sidebarCompany = document.getElementById('sidebarCompany');
    if (sidebarCompany) sidebarCompany.textContent = user.company_name || user.email;

    if (user.logo_path) {
        const navLogo = document.getElementById('navLogo');
        navLogo.src = user.logo_path;
        navLogo.classList.remove('hidden');
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
        document.getElementById('navLogo').classList.add('hidden');
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
        
        const article = await apiCall('POST', '/api/articles/extract', { url });
        
        state.articles.push(article);
        urlInput.value = '';
        renderArticles();
        showToast('Articolo aggiunto', 'success');
    } catch (error) {
        showToast(error.message, 'error');
    } finally {
        btn.disabled = false;
        urlInput.disabled = false;
        loading.classList.add('hidden');
        urlInput.focus();
    }
}

async function fileToBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
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
    
    if (!list) return;

    // Clear existing cards
    Array.from(list.children).forEach(child => {
        if (child.id !== 'emptyArticles') child.remove();
    });

    if (state.articles.length === 0) {
        empty.classList.remove('hidden');
        if (btnGenerate)  btnGenerate.classList.add('hidden');
        if (btnEditor)    btnEditor.classList.add('hidden');
        if (btnArchive)   btnArchive.classList.add('hidden');
        if (btnCopyLinks) btnCopyLinks.classList.add('hidden');
        return;
    }

    empty.classList.add('hidden');
    if (btnGenerate)  btnGenerate.classList.remove('hidden');
    if (btnEditor)    btnEditor.classList.remove('hidden');
    if (btnArchive)   btnArchive.classList.remove('hidden');
    if (btnCopyLinks) btnCopyLinks.classList.remove('hidden');

    state.articles.forEach((article, idx) => {
        const card = document.createElement('div');
        card.className = 'article-card';
        card.dataset.idx = idx;
        card.style.animationDelay = `${idx * 0.1}s`;
        
        const imgSrc = article.screenshotBase64 || article.imageBase64 || 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxMDAlIiBoZWlnaHQ9IjEwMCUiIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgc3Ryb2tlPSIjNjZhNjgyIiBzdHJva2Utd2lkdGg9IjIiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIgc3Ryb2tlLWxpbmVqb2luPSJyb3VuZCI+PHJlY3QgeD0iMyIgeT0iMyIgd2lkdGg9IjE4IiBoZWlnaHQ9IjE4IiByeD0iMiIgcnk9IjIiPjwvcmVjdD48Y2lyY2xlIGN4PSI4LjUiIGN5PSI4LjUiIHI9IjEuNSI+PC9jaXJjbGU+PHBvbHlsaW5lIHBvaW50cz0iMjEgMTUgMTYgMTAgNSAyMSI+PC9wb2x5bGluZT48L3N2Zz4=';
        
        card.innerHTML = `
            <span class="drag-handle" title="Trascina per riordinare"><i data-feather="move"></i></span>
            <img src="${imgSrc}" class="article-thumb" alt="Thumb">
            <div class="article-content">
                <div class="article-meta" style="align-items: center;">
                    ${article.logoBase64 ? `<img src="${article.logoBase64}" class="article-source-logo" style="max-height: 24px; margin-right: 8px;">` : ''}
                    <span>${article.source_name} &bull; ${article.published_date}</span>
                </div>
                <div style="margin-top: 5px; margin-bottom: 5px;">
                    <select onchange="changeArticleType(event, ${idx})" style="padding: 2px 5px; font-size: 0.8rem; border-radius: 4px; background: rgba(0,0,0,0.3); border: 1px solid var(--border-color); color: var(--text-primary);">
                        <option value="Web" ${article.source_type === 'Web' ? 'selected' : ''}>Web</option>
                        <option value="Quotidiano Nazionale" ${article.source_type === 'Quotidiano Nazionale' ? 'selected' : ''}>Quotidiano Nazionale</option>
                        <option value="Quotidiano Locale" ${article.source_type === 'Quotidiano Locale' ? 'selected' : ''}>Quotidiano Locale</option>
                        <option value="Agenzia di Stampa" ${article.source_type === 'Agenzia di Stampa' ? 'selected' : ''}>Agenzia di Stampa</option>
                        <option value="Periodico" ${article.source_type === 'Periodico' ? 'selected' : ''}>Periodico</option>
                        <option value="Radio/TV" ${article.source_type === 'Radio/TV' ? 'selected' : ''}>Radio/TV</option>
                    </select>
                </div>
                <div class="article-title">${article.title}</div>
                <div class="article-excerpt">${article.excerpt}</div>
                <div style="margin-top: 10px; display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 8px;">
                    <div style="display:flex; align-items:center; gap:8px;">
                        <label for="uploadLogo_${idx}" class="btn btn-outline btn-sm" style="cursor:pointer; font-size:0.75rem; padding:4px 8px;">
                            <i data-feather="image" style="width:12px;height:12px;vertical-align:middle;margin-right:2px;"></i> Cambia logo
                        </label>
                        <input type="file" id="uploadLogo_${idx}" style="display:none;" accept="image/*" onchange="handleLogoUpload(event, ${idx})">
                        <button type="button" class="btn btn-outline btn-sm" onclick="copyArticleLink(${idx})" style="font-size:0.75rem; padding:4px 8px; border-color:rgba(255,255,255,0.2);" title="Copia link originale">
                            <i data-feather="copy" style="width:12px;height:12px;vertical-align:middle;margin-right:2px;"></i> Copia link
                        </button>
                    </div>
                    ${article.logoBase64 ? `<div style="background: white; padding: 2px 8px; border-radius: 4px; display: flex; align-items: center;"><img src="${article.logoBase64}" style="max-height: 20px; object-fit: contain;"></div>` : ''}
                </div>
            </div>
            <button class="btn-icon" onclick="removeArticle(${idx})" title="Rimuovi"><i data-feather="trash-2" style="width:18px;height:18px;color:var(--danger);"></i></button>
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
    if (!list || list._sortable) return; // avoid double init
    list._sortable = Sortable.create(list, {
        handle: '.drag-handle',
        animation: 200,
        ghostClass: 'article-card--ghost',
        chosenClass: 'article-card--chosen',
        filter: '#emptyArticles',
        onEnd(evt) {
            const oldIdx = evt.oldIndex;
            const newIdx = evt.newIndex;
            if (oldIdx === newIdx) return;
            const [moved] = state.articles.splice(oldIdx, 1);
            state.articles.splice(newIdx, 0, moved);
            renderArticles(); // re-render to fix indices in onclick handlers
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

        await apiCall('POST', '/api/pdf/archive', {
            articles: state.articles,
            title,
            clientName,
            clientLogo: state.clientLogoBase64
        });

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
    const editorState = {
        articles: state.articles,
        options: { title, clientName, clientLogo: state.clientLogoBase64 || null, templateId: selectedTemplateId }
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
        
        const response = await apiCall('POST', '/api/pdf/generate', { 
            articles: state.articles,
            title,
            clientName,
            clientLogo: state.clientLogoBase64,
            templateId: selectedTemplateId
        });
        
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
        const token = state.token;
        const res = await fetch(url, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!res.ok) throw new Error('Errore download');
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
        showToast('Errore durante il download del PDF.', 'error');
    }
}

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
                <div style="display:flex; gap:0.5rem; margin-top:1rem; flex-wrap:wrap;">
                    <button class="btn btn-primary btn-sm" onclick="triggerDownload('${item.downloadUrl}', '${item.filename}')"><i data-feather="download" style="width:14px;height:14px;vertical-align:middle;margin-right:4px;"></i> Scarica PDF</button>
                    ${item.is_editable ? `<button class="btn btn-secondary btn-sm" onclick="reopenFromHistory(${item.id})"><i data-feather="edit-2" style="width:14px;height:14px;vertical-align:middle;margin-right:4px;"></i> Riapri ed Edita</button>` : ''}
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
        showToast('Caricamento rassegna per modifica...', 'info');
        const data = await apiCall('GET', `/api/pdf/review/${reviewId}`);
        if (data.articles && data.articles.length > 0) {
            state.articles = data.articles;
            if (data.title) {
                const titleEl = document.getElementById('rassegnaTitle');
                if (titleEl) titleEl.value = data.title;
            }
            if (data.clientName) {
                const clientEl = document.getElementById('clientName');
                if (clientEl) clientEl.value = data.clientName;
            }
            if (data.clientLogo) {
                state.clientLogoBase64 = data.clientLogo;
                const logoPrev = document.getElementById('clientLogoPreview');
                const logoPrevCont = document.getElementById('clientLogoPreviewContainer');
                if (logoPrev && logoPrevCont) {
                    logoPrev.src = data.clientLogo;
                    logoPrevCont.style.display = 'flex';
                }
            }

            renderArticles();
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
        document.getElementById('btnResetSearchNews')?.addEventListener('click', () => {
            document.getElementById('newsKeyword').value = '';
            document.getElementById('newsDateFrom').value = '';
            document.getElementById('newsDateTo').value = '';
            currentNewsResults = [];
            selectedNewsIndices.clear();
            document.getElementById('newsEmptyState').classList.remove('hidden');
            document.getElementById('newsResultsGrid').classList.add('hidden');
            document.getElementById('newsResultsToolbar').classList.add('hidden');
            updateNewsSelectionUI();
        });
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
            const article = await apiCall('POST', '/api/articles/extract', { url });
            state.articles.push(article);
            succeeded++;
            mlLog(`<i data-feather="check" style="color:var(--success);width:14px;height:14px;vertical-align:middle;"></i> ${article.source_name} — ${article.title.slice(0, 60)}${article.title.length > 60 ? '...' : ''}`, 'success');
        } catch (err) {
            failed++;
            const shortUrl = url.length > 55 ? url.slice(0, 55) + '...' : url;
            mlLog(`<i data-feather="x" style="color:var(--danger);width:14px;height:14px;vertical-align:middle;"></i> Errore: ${shortUrl}`, 'error');
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
    renderLogoArchive(logoArchive);
}

function closeLogoArchive() {
    document.getElementById('logoArchiveModal').classList.add('hidden');
    currentEditingArticleIndex = -1;
    document.getElementById('manualLogoUpload').value = '';
}

function renderLogoArchive(logos) {
    const grid = document.getElementById('logoGrid');
    grid.innerHTML = '';
    if (logos.length === 0) {
        grid.innerHTML = '<p style="color: var(--text-muted); grid-column: 1 / -1; text-align: center;">Nessun logo trovato.</p>';
        return;
    }
    
    logos.forEach(logo => {
        const div = document.createElement('div');
        div.style.cssText = 'background: rgba(255,255,255,0.05); border: 1px solid var(--border-color); border-radius: var(--radius-sm); padding: 1rem; text-align: center; cursor: pointer; transition: var(--transition); display: flex; flex-direction: column; justify-content: center; align-items: center; min-height: 100px;';
        div.onmouseover = () => div.style.borderColor = 'var(--accent-primary)';
        div.onmouseout = () => div.style.borderColor = 'var(--border-color)';
        div.onclick = () => selectLogoFromArchive(logo.url);
        
        // Use proxy to load external logo images without CORS issues
        const proxiedSrc = `/api/proxy-image?url=${encodeURIComponent(logo.url)}`;
        div.innerHTML = `
            <img src="${proxiedSrc}" alt="${logo.name}" style="max-width: 100%; max-height: 40px; object-fit: contain; margin-bottom: 10px;" onerror="this.style.display='none'">
            <span style="font-size: 0.8rem; color: var(--text-secondary);">${logo.name}</span>
        `;
        grid.appendChild(div);
    });
}

async function selectLogoFromArchive(url) {
    if (currentEditingArticleIndex === -1) return;
    try {
        state.articles[currentEditingArticleIndex].logoBase64 = url;
        renderArticles();
        closeLogoArchive();
        showToast('Logo testata aggiornato', 'success');
    } catch (err) {
        console.error(err);
        showToast("Errore durante l'aggiornamento del logo", 'error');
    }
}

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

async function searchNews() {
    const q = document.getElementById('newsKeyword').value.trim();
    const from = document.getElementById('newsDateFrom').value;
    const to = document.getElementById('newsDateTo').value;

    if (!q) return showToast('Inserisci una parola chiave per la ricerca', 'warning');

    const btn = document.getElementById('btnSearchNews');
    const originalText = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<div class="spinner" style="width:14px;height:14px;margin-right:4px;"></div> Ricerca...';

    document.getElementById('newsEmptyState').classList.add('hidden');
    document.getElementById('newsResultsGrid').classList.add('hidden');
    document.getElementById('newsResultsToolbar').classList.add('hidden');
    document.getElementById('newsLoadingState').classList.remove('hidden');

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
        
        document.getElementById('newsLoadingState').classList.add('hidden');
        
        if (currentNewsResults.length === 0) {
            document.getElementById('newsEmptyState').classList.remove('hidden');
            document.getElementById('newsEmptyState').innerHTML = '<div style="margin-bottom:1rem;"><i data-feather="search" style="width:48px;height:48px;color:var(--text-muted);"></i></div><p style="font-size:1.1rem; font-weight:600;">Nessun risultato trovato.</p><p style="font-size:0.9rem;">Prova con un\'altra parola chiave o allarga le date.</p>';
            feather.replace();
            return;
        } else {
            document.getElementById('newsResultCount').textContent = `${currentNewsResults.length} risultati trovati`;
            document.getElementById('newsResultsToolbar').classList.remove('hidden');
            renderNewsResults();
            updateNewsSelectionUI();
        }
    } catch (err) {
        document.getElementById('newsLoadingState').classList.add('hidden');
        document.getElementById('newsEmptyState').classList.remove('hidden');
        showToast(err.message, 'error');
    } finally {
        btn.disabled = false;
        btn.innerHTML = originalText;
        feather.replace();
    }
}

function renderNewsResults() {
    const grid = document.getElementById('newsResultsGrid');
    if (!grid) return;
    grid.innerHTML = '';
    grid.classList.remove('hidden');

    const filtered = currentNewsResults.filter((news) => {
        if (activeNewsSourceFilter === 'all') return true;
        const src = (news.source || '').toLowerCase();
        if (activeNewsSourceFilter === 'nazionale') return src.includes('repubblica') || src.includes('corriere') || src.includes('stampa') || src.includes('giornale') || src.includes('libero') || src.includes('sole') || src.includes('avvenire') || src.includes('fatto');
        if (activeNewsSourceFilter === 'locale') return src.includes('lecco') || src.includes('sannio') || src.includes('benevento') || src.includes('mattino') || src.includes('messaggero') || src.includes('gazzetta') || src.includes('resto') || src.includes('secolo');
        if (activeNewsSourceFilter === 'web') return src.includes('web') || src.includes('fanpage') || src.includes('open') || src.includes('diario') || src.includes('post') || src.includes('today') || src.includes('tpi');
        if (activeNewsSourceFilter === 'agenzia') return src.includes('ansa') || src.includes('adnkronos') || src.includes('agi') || src.includes('askanews') || src.includes('dire') || src.includes('lapresse');
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
        if (compEl) compEl.textContent = companyName;
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
    if (themeToggleSettings) {
        themeToggleSettings.addEventListener('click', () => {
            const currentTheme = document.body.getAttribute('data-theme') || 'light';
            const nextTheme = currentTheme === 'dark' ? 'light' : 'dark';
            document.body.setAttribute('data-theme', nextTheme);
            localStorage.setItem('rs_theme', nextTheme);
            showToast(`Tema impostato: ${nextTheme === 'dark' ? 'Scuro' : 'Chiaro'}`, 'info');
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
    if (saved) {
        try {
            const custom = JSON.parse(saved);
            archiveLogosList = [...custom, ...archiveLogosList];
        } catch(e){}
    }
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

        if (item.isCustom) {
            const removeBtn = document.createElement('button');
            removeBtn.className = 'btn btn-outline btn-sm';
            removeBtn.style.cssText = 'margin-top:10px; font-size:0.7rem; color:#ff4d4d; border-color:rgba(255,77,77,0.3); padding:2px 8px;';
            removeBtn.innerHTML = '<i data-feather="trash-2" style="width:12px;height:12px;vertical-align:middle;margin-right:2px;"></i> Rimuovi';
            removeBtn.onclick = () => deleteCustomArchiveLogo(item.name);
            card.appendChild(removeBtn);
        }

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
    loadProfile();
    loadClients();
    loadCustomArchiveLogos();
    renderArchiveLogos();
});




