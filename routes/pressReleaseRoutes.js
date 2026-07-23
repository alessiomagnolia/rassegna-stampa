const express = require('express');
const { authMiddleware } = require('../middleware/auth');
const { getDb } = require('../database/db');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const router = express.Router();

// Funzione di utilità per inizializzare il client Gemini
function getGeminiClient() {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        throw new Error('Chiave API di Gemini non configurata nel server (.env)');
    }
    return new GoogleGenerativeAI(apiKey);
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
 * Genera un nuovo comunicato stampa usando Gemini
 */
router.post('/generate', authMiddleware, async (req, res) => {
    const { title, client_name, length, extra_instructions, manual_examples } = req.body;
    
    if (!title || !title.trim()) {
        return res.status(400).json({ error: 'Titolo/Argomento del comunicato obbligatorio' });
    }

    try {
        const db = getDb();
        const ai = getGeminiClient();
        
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
        if (pastExamples.length > 0 || (manual_examples && manual_examples.trim())) {
            contextText += "ESEMPI PRECEDENTI DEL CLIENTE (Usa questi testi per imparare il Tone of Voice esatto, lo stile, l'impaginazione e il lessico aziendale):\n\n";
            
            pastExamples.forEach((ex, idx) => {
                contextText += `--- ESEMPIO ${idx + 1}: ${ex.title} ---\n${ex.content}\n\n`;
            });

            if (manual_examples && manual_examples.trim()) {
                contextText += `--- ESEMPIO MANUALE INSERITO DALL'UTENTE ---\n${manual_examples}\n\n`;
                
                // Salviamo l'esempio manuale nel DB come "Reference" in modo che se lo ricordi in futuro
                if (client_name && client_name.trim()) {
                    db.prepare(`
                        INSERT INTO press_releases (user_id, client_name, title, content, is_reference)
                        VALUES (?, ?, ?, ?, 1)
                    `).run(req.userId, client_name.trim(), "Esempio caricato manualmente", manual_examples);
                }
            }
        }

        // Mappatura Lunghezza
        let lengthInstruction = "di media lunghezza (circa 30-40 righe testuali, escludendo l'intestazione)";
        if (length === 'corto') lengthInstruction = "breve e conciso (circa 15-20 righe testuali)";
        if (length === 'lungo') lengthInstruction = "lungo e dettagliato (circa 50-60 righe testuali)";
        if (length === 'moltolungo') lengthInstruction = "molto lungo e di grande approfondimento (oltre 80 righe testuali)";

        // Prompt di Ingegneria
        const systemPrompt = `Sei un Senior PR Manager ed esperto di Comunicazione Istituzionale. Il tuo compito è scrivere un Comunicato Stampa professionale e impeccabile.
Se ti vengono forniti degli 'ESEMPI PRECEDENTI DEL CLIENTE', devi analizzarli attentamente e replicare ESATTAMENTE il loro Tone of Voice (formale/informale, caldo/istituzionale), le formule di apertura/chiusura e il lessico specifico utilizzato.
Non aggiungere commenti tuoi. Restituisci SOLO ed ESCLUSIVAMENTE il testo del comunicato stampa in formato markdown. Inizia direttamente col testo.`;

        const userPrompt = `
${contextText}
Richiesta per il nuovo Comunicato Stampa:
Titolo / Argomento: ${title}
Cliente / Azienda: ${client_name || 'Generico'}
Lunghezza richiesta: ${lengthInstruction}
${extra_instructions ? `Istruzioni aggiuntive: ${extra_instructions}` : ''}

Scrivi ora il comunicato stampa.`;

        const model = ai.getGenerativeModel({ model: 'gemini-2.0-flash' });
        const response = await model.generateContent(systemPrompt + '\n\n' + userPrompt);

        const generatedText = response.response.text();

        res.json({ content: generatedText });

    } catch (error) {
        console.error('[Press Generation] Error:', error);
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
