// State Management
const state = {
    token: localStorage.getItem('rs_token'),
    user: null,
    articles: [],
    isExtracting: false,
    isGenerating: false,
    clientLogoBase64: null
};

// --- UTILS ---

function showToast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    if (!container) return;
    
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `
        <span style="font-size: 1.2rem">${type === 'success' ? '✅' : type === 'error' ? '❌' : 'ℹ️'}</span>
        <div>${message}</div>
    `;
    
    container.appendChild(toast);
    
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
    
    if (!list) return;

    // Clear existing cards
    Array.from(list.children).forEach(child => {
        if (child.id !== 'emptyArticles') child.remove();
    });

    if (state.articles.length === 0) {
        empty.classList.remove('hidden');
        btnGenerate.classList.add('hidden');
        return;
    }

    empty.classList.add('hidden');
    btnGenerate.classList.remove('hidden');

    state.articles.forEach((article, idx) => {
        const card = document.createElement('div');
        card.className = 'article-card';
        card.style.animationDelay = `${idx * 0.1}s`;
        
        const imgSrc = article.screenshotBase64 || article.imageBase64 || 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxMDAlIiBoZWlnaHQ9IjEwMCUiIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgc3Ryb2tlPSIjNjZhNjgyIiBzdHJva2Utd2lkdGg9IjIiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIgc3Ryb2tlLWxpbmVqb2luPSJyb3VuZCI+PHJlY3QgeD0iMyIgeT0iMyIgd2lkdGg9IjE4IiBoZWlnaHQ9IjE4IiByeD0iMiIgcnk9IjIiPjwvcmVjdD48Y2lyY2xlIGN4PSI4LjUiIGN5PSI4LjUiIHI9IjEuNSI+PC9jaXJjbGU+PHBvbHlsaW5lIHBvaW50cz0iMjEgMTUgMTYgMTAgNSAyMSI+PC9wb2x5bGluZT48L3N2Zz4=';
        
        card.innerHTML = `
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
                <div style="margin-top: 10px;">
                    <label style="font-size: 0.85rem; cursor: pointer; color: #00d4aa; font-weight: 500;">
                        ✏️ Cambia logo testata
                        <input type="file" accept="image/*" style="display: none;" onchange="changeArticleLogo(event, ${idx})">
                    </label>
                </div>
            </div>
            <button class="btn-icon" onclick="removeArticle(${idx})" title="Rimuovi">✖</button>
        `;
        list.appendChild(card);
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
        
        // Trigger download automatically
        triggerDownload(response.downloadUrl, response.filename);
        
        // Reset state & reload history
        state.articles = [];
        state.clientLogoBase64 = null;
        document.getElementById('rassegnaTitle').value = '';
        const clientInput = document.getElementById('clientName');
        if (clientInput) clientInput.value = '';
        if(document.getElementById('clientLogoInput')) document.getElementById('clientLogoInput').value = '';
        if(document.getElementById('clientLogoPreviewContainer')) document.getElementById('clientLogoPreviewContainer').style.display = 'none';
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
                <div class="history-actions">
                    <button class="btn btn-primary btn-sm" onclick="triggerDownload('${item.downloadUrl}', '${item.filename}')">Scarica</button>
                    <button class="btn btn-danger btn-sm" onclick="deleteHistory(${item.id})">Elimina</button>
                </div>
            `;
            list.appendChild(div);
        });
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

// --- INITIALIZATION & EVENT LISTENERS ---

document.addEventListener('DOMContentLoaded', () => {
    // Auth page specific
    const loginForm = document.getElementById('loginForm');
    const registerForm = document.getElementById('registerForm');
    
    if (loginForm) loginForm.addEventListener('submit', handleLogin);
    if (registerForm) registerForm.addEventListener('submit', handleRegister);
    
    // Dashboard specific
    if (window.location.pathname.includes('dashboard')) {
        loadProfile();
        
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
        
        // Generate PDF
        document.getElementById('btnGeneratePDF')?.addEventListener('click', generatePDF);
    }
});
