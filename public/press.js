document.addEventListener('DOMContentLoaded', () => {
    const token = localStorage.getItem('token');
    if (!token) {
        window.location.href = 'index.html';
        return;
    }

    // DOM Elements
    const historyList = document.getElementById('historyList');
    const clientList = document.getElementById('clientList');
    
    // Form Elements
    const clientNameInput = document.getElementById('clientName');
    const prTitleInput = document.getElementById('prTitle');
    const prLengthSelect = document.getElementById('prLength');
    const prInstructionsInput = document.getElementById('prInstructions');
    const prManualExamplesInput = document.getElementById('prManualExamples');
    
    // Editor Elements
    const prContentTextarea = document.getElementById('prContent');
    
    // Buttons
    const btnGenerate = document.getElementById('btnGenerate');
    const generateLoader = document.getElementById('generateLoader');
    const generateText = document.getElementById('generateText');
    const btnNew = document.getElementById('btnNew');
    const btnSave = document.getElementById('btnSave');
    const btnDelete = document.getElementById('btnDelete');
    const btnCopy = document.getElementById('btnCopy');
    const errorMsg = document.getElementById('errorMsg');

    let currentPrId = null;

    // Load Initial Data
    loadHistory();
    loadClients();

    // Event Listeners
    btnGenerate.addEventListener('click', generatePressRelease);
    btnNew.addEventListener('click', resetForm);
    btnSave.addEventListener('click', savePressRelease);
    btnDelete.addEventListener('click', deletePressRelease);
    btnCopy.addEventListener('click', () => {
        navigator.clipboard.writeText(prContentTextarea.value);
        const originalText = btnCopy.textContent;
        btnCopy.textContent = 'Copiato!';
        setTimeout(() => btnCopy.textContent = originalText, 2000);
    });

    // --- API Calls ---

    async function fetchAPI(url, options = {}) {
        options.headers = {
            ...options.headers,
            'Authorization': `Bearer ${token}`
        };
        const res = await fetch(url, options);
        if (res.status === 401) {
            localStorage.removeItem('token');
            window.location.href = 'index.html';
            throw new Error('Non autorizzato');
        }
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Errore server');
        return data;
    }

    async function loadHistory() {
        try {
            const history = await fetchAPI('/api/press/history');
            historyList.innerHTML = '';
            
            if (history.length === 0) {
                historyList.innerHTML = '<div style="color:var(--text-muted); font-size:0.85rem; padding:1rem; text-align:center;">Nessun comunicato in archivio</div>';
                return;
            }

            history.forEach(item => {
                const div = document.createElement('div');
                div.className = `history-item ${item.id === currentPrId ? 'active' : ''}`;
                div.onclick = () => loadPressRelease(item.id);

                const dateStr = new Date(item.created_at).toLocaleDateString('it-IT', { day:'2-digit', month:'short', year:'numeric' });
                
                div.innerHTML = `
                    <div class="h-title">${item.title}</div>
                    <div class="h-client">${item.client_name || 'Nessun cliente'} 
                        ${item.is_reference ? '<span class="h-badge">Esempio</span>' : ''}
                    </div>
                    <div class="h-date">${dateStr}</div>
                `;
                historyList.appendChild(div);
            });
        } catch (error) {
            console.error('Failed to load history', error);
        }
    }

    async function loadClients() {
        try {
            const clients = await fetchAPI('/api/press/clients');
            clientList.innerHTML = '';
            clients.forEach(c => {
                const option = document.createElement('option');
                option.value = c;
                clientList.appendChild(option);
            });
        } catch (error) {
            console.error('Failed to load clients', error);
        }
    }

    async function loadPressRelease(id) {
        try {
            const pr = await fetchAPI(`/api/press/${id}`);
            
            currentPrId = pr.id;
            clientNameInput.value = pr.client_name || '';
            prTitleInput.value = pr.title || '';
            prContentTextarea.value = pr.content || '';
            
            // UI Updates
            btnSave.style.display = 'block';
            btnDelete.style.display = 'block';
            btnCopy.style.display = 'block';
            errorMsg.style.display = 'none';
            
            // Highlight history
            document.querySelectorAll('.history-item').forEach(el => el.classList.remove('active'));
            const activeEl = Array.from(historyList.children).find(el => el.onclick.toString().includes(id));
            if (activeEl) activeEl.classList.add('active');

        } catch (error) {
            showError(error.message);
        }
    }

    async function generatePressRelease() {
        if (!prTitleInput.value.trim()) {
            showError('Inserisci un titolo o l\'argomento del comunicato');
            return;
        }

        const payload = {
            title: prTitleInput.value,
            client_name: clientNameInput.value,
            length: prLengthSelect.value,
            extra_instructions: prInstructionsInput.value,
            manual_examples: prManualExamplesInput.value
        };

        setLoading(true);
        errorMsg.style.display = 'none';

        try {
            const res = await fetchAPI('/api/press/generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            prContentTextarea.value = res.content;
            
            // Mostra tasto salva
            btnSave.style.display = 'block';
            btnCopy.style.display = 'block';
            
            // Ricarica clienti in caso ne abbiamo inserito uno nuovo o salvato un ref
            if (payload.manual_examples) {
                loadHistory(); // Ricarica history per mostrare il reference salvato
            }
            loadClients();

        } catch (error) {
            showError(error.message);
        } finally {
            setLoading(false);
        }
    }

    async function savePressRelease() {
        if (!prTitleInput.value.trim() || !prContentTextarea.value.trim()) {
            showError('Titolo e contenuto sono obbligatori per salvare.');
            return;
        }

        const payload = {
            title: prTitleInput.value,
            client_name: clientNameInput.value,
            content: prContentTextarea.value
        };

        const originalText = btnSave.textContent;
        btnSave.textContent = 'Salvataggio...';

        try {
            const res = await fetchAPI('/api/press/save', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            
            currentPrId = res.id;
            loadHistory();
            btnSave.textContent = 'Salvato!';
            setTimeout(() => btnSave.textContent = originalText, 2000);
            
        } catch (error) {
            showError(error.message);
            btnSave.textContent = originalText;
        }
    }

    async function deletePressRelease() {
        if (!currentPrId) return;
        if (!confirm('Sei sicuro di voler eliminare questo comunicato? Verrà rimosso anche dalla memoria del "Tone of Voice" per questo cliente.')) return;

        try {
            await fetchAPI(`/api/press/${currentPrId}`, { method: 'DELETE' });
            resetForm();
            loadHistory();
        } catch (error) {
            showError(error.message);
        }
    }

    function resetForm() {
        currentPrId = null;
        clientNameInput.value = '';
        prTitleInput.value = '';
        prLengthSelect.value = 'medio';
        prInstructionsInput.value = '';
        prManualExamplesInput.value = '';
        prContentTextarea.value = '';
        
        btnSave.style.display = 'none';
        btnDelete.style.display = 'none';
        btnCopy.style.display = 'none';
        errorMsg.style.display = 'none';

        document.querySelectorAll('.history-item').forEach(el => el.classList.remove('active'));
    }

    function showError(msg) {
        errorMsg.textContent = msg;
        errorMsg.style.display = 'block';
    }

    function setLoading(isLoading) {
        btnGenerate.disabled = isLoading;
        generateLoader.style.display = isLoading ? 'block' : 'none';
        generateText.style.display = isLoading ? 'none' : 'block';
    }
});
