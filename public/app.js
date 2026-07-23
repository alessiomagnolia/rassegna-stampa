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

// Init fetch
fetch('/assets/logos.json')
    .then(res => res.json())
    .then(data => { logoArchive = data; })
    .catch(err => console.log('Logos non caricati', err));


// --- UTILS ---

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
    
    if (!list) return;

    // Clear existing cards
    Array.from(list.children).forEach(child => {
        if (child.id !== 'emptyArticles') child.remove();
    });

    if (state.articles.length === 0) {
        empty.classList.remove('hidden');
        if (btnGenerate) btnGenerate.classList.add('hidden');
        if (btnEditor)   btnEditor.classList.add('hidden');
        return;
    }

    empty.classList.add('hidden');
    if (btnGenerate) btnGenerate.classList.remove('hidden');
    if (btnEditor)   btnEditor.classList.remove('hidden');

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
                <div style="margin-top: 10px; display: flex; align-items: center; gap: 10px;">
                <div style="display:flex; justify-content:space-between; margin-top:0.75rem;">
                    <label for="uploadLogo_${idx}" class="btn btn-outline btn-sm" style="cursor:pointer;">
                        <i data-feather="image" style="width:14px;height:14px;vertical-align:middle;margin-right:4px;"></i> Cambia logo testata
                    </label>
                    <input type="file" id="uploadLogo_${idx}" style="display:none;" accept="image/*" onchange="handleLogoUpload(event, ${idx})">
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

// --- PDF GENERATION ---

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
        options: { title, clientName, clientLogo: state.clientLogoBase64 || null }
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
            clientLogo: state.clientLogoBase64
        });
        
        showToast('PDF generato! Download in corso...', 'success');
        triggerDownload(response.downloadUrl, response.filename);
        
        // Reset state & reload history
        state.articles = [];
        state.clientLogoBase64 = null;
        document.getElementById('rassegnaTitle').value = '';
        const clientInput = document.getElementById('clientName');
        if (clientInput) clientInput.value = '';
        if(document.getElementById('clientLogoInput')) document.getElementById('clientLogoInput').value = '';
        if(document.getElementById('clientLogoPreviewContainer')) document.getElementById('clientLogoPreviewContainer').style.display = 'none';
        localStorage.removeItem('rs_editor_state'); // clear saved state after successful generation
        renderArticles();
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
        const blob = await apiCall('GET', url);
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
                    <strong>${item.title}</strong>
                    <span class="history-meta">${date} &bull; ${item.article_count} articoli</span>
                </div>
                <div style="display:flex; justify-content:space-between; margin-top:1rem;">
                    <button class="btn btn-primary btn-sm" onclick="triggerDownload('${item.downloadUrl}', '${item.filename}')"><i data-feather="download" style="width:14px;height:14px;vertical-align:middle;margin-right:4px;"></i> Scarica</button>
                    ${item.is_editable ? `<button class="btn btn-secondary btn-sm" onclick="reopenFromHistory(${item.id})"><i data-feather="edit-2" style="width:14px;height:14px;vertical-align:middle;margin-right:4px;"></i> Riapri ed Edita</button>` : ''}
                    <button class="btn btn-danger btn-sm" onclick="deleteHistory(${item.id})"><i data-feather="trash-2" style="width:14px;height:14px;vertical-align:middle;"></i></button>
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
    if (!confirm('Sei sicuro di voler eliminare questa rassegna? Il PDF non sarà più recuperabile.')) return;
    
    try {
        await apiCall('DELETE', `/api/pdf/${id}`);
        showToast('Rassegna eliminata', 'success');
        loadHistory();
    } catch (error) {
        showToast(error.message, 'error');
    }
}

async function reopenFromHistory(reviewId) {
    try {
        showToast('Caricamento rassegna in corso...', 'info');
        const data = await apiCall('GET', `/api/pdf/review/${reviewId}`);
        const editorState = {
            articles: data.articles,
            options: {
                title: data.title || '',
                clientName: data.clientName || '',
                clientLogo: data.clientLogo || null
            }
        };
        localStorage.setItem('rs_editor_state', JSON.stringify(editorState));
        window.location.href = 'editor.html';
    } catch (err) {
        showToast('Errore nel caricamento della rassegna.', 'error');
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
        
        // Generate PDF / Open Editor
        document.getElementById('btnGeneratePDF')?.addEventListener('click', generatePDF);
        document.getElementById('btnOpenEditor')?.addEventListener('click', openEditor);
        
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
    grid.innerHTML = '';
    grid.classList.remove('hidden');

    currentNewsResults.forEach((news, idx) => {
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
            <div style="display:flex; justify-content:space-between; align-items:center; margin-top:1rem;">
                <a href="${news.url}" target="_blank" onclick="event.stopPropagation()" style="color:var(--accent-secondary); font-size:0.8rem; text-decoration:none;"><i data-feather="external-link" style="width:12px;height:12px;vertical-align:middle;margin-right:2px;"></i> Apri link</a>
                <div class="news-card-checkbox ${isSelected ? 'checked' : ''}"></div>
            </div>
        `;
        grid.appendChild(card);
    });
    feather.replace();
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
        
        // Use these links
        document.querySelector('[data-page=rassegna]').click();
        const urls = coll.links.map(l => l.url).join('\n');
        
        // Open multi-link modal and set text
        openMultiLinkModal();
        document.getElementById('multiLinkTextarea').value = urls;
        updateMultiLinkCount();
        
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
    
    // Switch to rassegna page
    document.querySelector('[data-page=rassegna]').click();
    
    // Open multi link modal
    openMultiLinkModal();
    document.getElementById('multiLinkTextarea').value = selectedLinks.join('\n');
    updateMultiLinkCount();
}
