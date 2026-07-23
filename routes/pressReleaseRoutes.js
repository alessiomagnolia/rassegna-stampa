const express = require('express');
const { authMiddleware } = require('../middleware/auth');
const { getDb } = require('../database/db');
const Anthropic = require('@anthropic-ai/sdk');

const router = express.Router();

function getAnthropicClient() {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
        throw new Error('Chiave API di Anthropic non configurata nel server (.env)');
    }
    return new Anthropic({
        apiKey: apiKey,
    });
}

/**
 * GET /api/press/history
 * Recupera la cronologia dei comunicati stampa per l'utente, ordinata per i più recenti
 */
router.get('/history', authMiddleware, (req, res) => {
    try {
        const db = getDb();
        const rows = db.prepare(`
            SELECT id, client_name, title, is_reference, created_at 
            FROM press_releases 
            WHERE user_id = ? 
            ORDER BY created_at DESC
        `).all(req.userId);
        res.json(rows);
    } catch (error) {
        console.error('[Press] Error fetching history:', error);
        res.status(500).json({ error: 'Errore nel recupero della cronologia' });
    }
});

/**
 * GET /api/press/clients
 * Recupera l'elenco dei nomi dei clienti usati in passato dall'utente (per autocomplete)
 */
router.get('/clients', authMiddleware, (req, res) => {
    try {
        const db = getDb();
        const rows = db.prepare(`
            SELECT DISTINCT client_name 
            FROM press_releases 
            WHERE user_id = ? AND client_name != ''
            ORDER BY client_name ASC
        `).all(req.userId);
        res.json(rows.map(r => r.client_name));
    } catch (error) {
        console.error('[Press] Error fetching clients:', error);
        res.status(500).json({ error: 'Errore nel recupero clienti' });
    }
});

/**
 * GET /api/press/:id
 * Recupera un comunicato specifico
 */
router.get('/:id', authMiddleware, (req, res) => {
    try {
        const db = getDb();
        const row = db.prepare(`
            SELECT * FROM press_releases 
            WHERE id = ? AND user_id = ?
        `).get(req.params.id, req.userId);
        
        if (!row) return res.status(404).json({ error: 'Comunicato non trovato' });
        res.json(row);
    } catch (error) {
        console.error('[Press] Error fetching PR:', error);
        res.status(500).json({ error: 'Errore nel recupero del comunicato' });
    }
});

/**
 * POST /api/press/generate
 * Genera un nuovo comunicato stampa usando Anthropic
 */
router.post('/generate', authMiddleware, async (req, res) => {
    const { title, client_name, length, extra_instructions, manual_examples } = req.body;
    
    if (!title || !title.trim()) {
        return res.status(400).json({ error: 'Titolo/Argomento del comunicato obbligatorio' });
    }

    try {
        const anthropic = getAnthropicClient();
        const db = getDb();

        // 1. Estrazione Esempi Manuali dalla richiesta e dal database
        let contextText = '';
        let pastExamples = [];

        // Se è specificato un cliente, recuperiamo i suoi comunicati passati dal DB
        if (client_name && client_name.trim()) {
            pastExamples = db.prepare(`
                SELECT title, content 
                FROM press_releases 
                WHERE user_id = ? AND client_name = ?
                ORDER BY created_at DESC 
                LIMIT 5
            `).all(req.userId, client_name.trim());
        }

        // Costruiamo il contesto degli esempi (Tone of Voice)
        if (pastExamples.length > 0 || (manual_examples && manual_examples.trim().length > 0)) {
            contextText += "ESEMPI PRECEDENTI DEL CLIENTE (Usa questi testi per imparare il Tone of Voice esatto, lo stile, l'impaginazione e il lessico aziendale):\n\n";
            
            pastExamples.forEach((ex, idx) => {
                contextText += `--- ESEMPIO ${idx + 1}: ${ex.title} ---\n${ex.content}\n\n`;
            });
            
            if (manual_examples && manual_examples.trim().length > 0) {
                contextText += `--- ESEMPIO MANUALE INSERITO DALL'UTENTE ---\n${manual_examples}\n\n`;
                
                // Salviamo questo esempio come 'reference' nel DB se è stato fornito un cliente
                if (client_name && client_name.trim() !== '') {
                    // Controlliamo se esiste già un reference identico
                    const existingRef = db.prepare('SELECT id FROM press_releases WHERE client_name = ? AND is_reference = 1 AND content = ?').get(client_name.trim(), manual_examples);
                    if (!existingRef) {
                        db.prepare(`
                            INSERT INTO press_releases (user_id, client_name, title, content, is_reference)
                            VALUES (?, ?, ?, ?, 1)
                        `).run(req.userId, client_name.trim(), "Esempio caricato manualmente", manual_examples);
                    }
                }
            }
        }

        // Mappatura Lunghezza
        let lengthInstruction = "di media lunghezza (circa 30-40 righe testuali, escludendo l'intestazione)";
        if (length === 'corto') lengthInstruction = "breve e conciso (circa 15-20 righe testuali)";
        if (length === 'lungo') lengthInstruction = "lungo e dettagliato (circa 50-60 righe testuali)";
        if (length === 'moltolungo') lengthInstruction = "molto lungo e di grande approfondimento (oltre 80 righe testuali)";

        // Prompt di Ingegneria per Claude
        const systemPrompt = `Sei un Senior PR Manager ed esperto di Comunicazione Istituzionale. Il tuo compito è scrivere un Comunicato Stampa professionale e impeccabile.
Se ti vengono forniti degli 'ESEMPI PRECEDENTI DEL CLIENTE', devi analizzarli attentamente e replicare ESATTAMENTE il loro Tone of Voice (formale/informale, caldo/istituzionale), le formule di apertura/chiusura e il lessico specifico utilizzato.
Non aggiungere commenti tuoi o preamboli ("Ecco il comunicato"). Restituisci SOLO ed ESCLUSIVAMENTE il testo del comunicato stampa in formato markdown. Inizia direttamente col testo del titolo.`;

        const userPrompt = `
${contextText}
Richiesta per il nuovo Comunicato Stampa:
Titolo / Argomento: ${title}
Cliente / Azienda: ${client_name || 'Generico'}
Lunghezza richiesta: ${lengthInstruction}
${extra_instructions ? `Istruzioni aggiuntive: ${extra_instructions}` : ''}

Scrivi ora il comunicato stampa.`;

        const response = await anthropic.messages.create({
            model: "claude-sonnet-5",
            max_tokens: 2000,
            system: systemPrompt,
            messages: [
                { role: "user", content: userPrompt }
            ]
        });

        const generatedText = response.content[0].text;

        res.json({ content: generatedText });

    } catch (error) {
        console.error('[Press Generation] Error:', error);
        
        if (error.status === 404 || (error.message && error.message.includes('not_found_error'))) {
            try {
                const response = await fetch('https://api.anthropic.com/v1/models', {
                    headers: {
                        'x-api-key': process.env.ANTHROPIC_API_KEY,
                        'anthropic-version': '2023-06-01'
                    }
                });
                const data = await response.json();
                const available = data.data ? data.data.map(m => m.id).filter(id => id.includes('claude')).join(', ') : 'Nessuno';
                return res.status(500).json({ error: `Modello non trovato. I modelli attualmente sbloccati per la tua API Key Anthropic sono: ${available}` });
            } catch (e) {
                console.error('Errore nel recupero dei modelli Anthropic:', e);
            }
        }

        if (error.status === 401 || error.message.includes('authentication')) {
            return res.status(500).json({ error: 'Errore di configurazione: API Key Anthropic mancante o non valida.' });
        }
        if (error.status === 429 || error.message.includes('credit')) {
            return res.status(500).json({ error: 'Fondi insufficienti su Anthropic o limite di richieste raggiunto. Ricarica il saldo su console.anthropic.com' });
        }

        res.status(500).json({ error: 'Errore server: ' + (error.message || 'Sconosciuto') });
    }
});

/**
 * POST /api/press/save
 * Salva un comunicato appena generato o modificato
 */
router.post('/save', authMiddleware, (req, res) => {
    const { title, client_name, content } = req.body;

    if (!title || !content) {
        return res.status(400).json({ error: 'Titolo e contenuto sono obbligatori' });
    }

    try {
        const db = getDb();
        const result = db.prepare(`
            INSERT INTO press_releases (user_id, client_name, title, content, is_reference)
            VALUES (?, ?, ?, ?, 0)
        `).run(req.userId, (client_name || '').trim(), title.trim(), content);

        res.json({ success: true, id: result.lastInsertRowid });
    } catch (error) {
        console.error('[Press Save] Error:', error);
        res.status(500).json({ error: 'Errore durante il salvataggio del comunicato' });
    }
});

/**
 * DELETE /api/press/:id
 * Elimina un comunicato dalla cronologia
 */
router.delete('/:id', authMiddleware, (req, res) => {
    try {
        const db = getDb();
        db.prepare(`DELETE FROM press_releases WHERE id = ? AND user_id = ?`).run(req.params.id, req.userId);
        res.json({ success: true });
    } catch (error) {
        console.error('[Press Delete] Error:', error);
        res.status(500).json({ error: 'Errore durante l\'eliminazione' });
    }
});

module.exports = router;
