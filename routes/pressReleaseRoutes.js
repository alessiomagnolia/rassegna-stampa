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

        // Mappatura Lunghezza con conteggio parole/righe per la generazione nativa di Claude
        let lengthInstruction = "MEDIO (circa 10-15 righe di testo in totale, tra 150 e 220 parole complessive)";

        if (length === '5-10 righe' || length === 'corto') {
            lengthInstruction = "BREVE (massimo 5-10 righe di testo in totale, circa 80-120 parole complessive). Scrivi un comunicato sintetico ed essenziale che NON superi in alcun modo le 10 righe!";
        } else if (length === '10-15 righe' || length === 'medio') {
            lengthInstruction = "MEDIO (circa 10-15 righe di testo in totale, tra 150 e 220 parole complessive).";
        } else if (length === '15-30 righe' || length === 'lungo') {
            lengthInstruction = "LUNGO (tra 15 e 30 righe di testo in totale, circa 300-450 parole complessive).";
        } else if (length === 'oltre 30 righe' || length === 'moltolungo') {
            lengthInstruction = "MOLTO LUNGO (oltre 30 righe di testo in totale, oltre 500 parole complessive).";
        }

        // Prompt di Ingegneria per Claude
        const systemPrompt = `Sei un Senior PR Manager ed esperto di Comunicazione Istituzionale. Il tuo compito è scrivere un Comunicato Stampa professionale e completo.

DIVIETO ABSOLUTO DI CHAT / INTRODUZIONI / SPALLETTE / DISCLAIMER:
- NON scrivere MAI frasi di dialogo, preamboli, scuse, suggerimenti o proposte di revisione (es. "Mi dispiace ma...", "Posso proporti una versione...", "Ecco il comunicato:", "Se vuoi posso adattare...").
- NON inserire divisori "---" prima o dopo il testo.
- La tua risposta DEVE INIZIARE DIRETTAMENTE ed ESCLUSIVAMENTE con il titolo in grassetto o intestazione del comunicato stampa (es. "**Nome Cliente: Titolo...**").
- La tua risposta DEVE FINIRE DIRETTAMENTE con l'ultima riga del comunicato. Nessuna frase finale da assistente AI!

REGOLE ESSENZIALI:
1. LUNGHEZZA OBBLIGATORIA: Rispetta accuratamente il vincolo di lunghezza richiesto: ${lengthInstruction}. Scrivi un testo autoconclusivo e completo che rientri esattamente nella lunghezza richiesta senza essere troncato.
2. TONE OF VOICE: Se sono presenti degli 'ESEMPI PRECEDENTI DEL CLIENTE', analizzali e replica fedelmente il loro stile e lessico.
3. FORMATO TITOLO: Inserisci SEMPRE prima il soggetto (Cliente/Azienda) seguito da due punti o da un trattino, e poi l'argomento.`;

        const userPrompt = `${contextText}
Crea un Comunicato Stampa completo con le seguenti specifiche:

- TITOLO / ARGOMENTO: ${title}
- CLIENTE / AZIENDA: ${client_name || 'Generico'}
- VINCOLO LUNGHEZZA: ${lengthInstruction}
${extra_instructions ? `- ISTRUZIONI AGGIUNTIVE: ${extra_instructions}\n` : ''}

IMPORTANTE: Restituisci SOLTANTO il testo pulito del comunicato stampa a partire dal titolo. Nessun saluto, nessun commento prima o dopo.`;

        const response = await anthropic.messages.create({
            model: "claude-sonnet-5",
            max_tokens: 4000,
            system: systemPrompt,
            messages: [
                { role: "user", content: userPrompt }
            ]
        });

        let generatedText = '';
        if (response.content && Array.isArray(response.content)) {
            const textBlocks = response.content.filter(b => b.type === 'text' && b.text);
            if (textBlocks.length > 0) {
                generatedText = textBlocks.map(b => b.text).join('\n\n');
            } else {
                const textBlock = response.content.find(b => b.text);
                if (textBlock) generatedText = textBlock.text;
            }
        } else if (response.content && typeof response.content === 'string') {
            generatedText = response.content;
        } else if (response.text) {
            generatedText = response.text;
        } else if (response.completion) {
            generatedText = response.completion;
        } else {
            generatedText = JSON.stringify(response, null, 2);
        }

        // Additional safeguard for raw JSON string
        if (typeof generatedText === 'string' && generatedText.trim().startsWith('{') && generatedText.includes('"content"')) {
            try {
                const parsed = JSON.parse(generatedText);
                if (parsed && parsed.content && Array.isArray(parsed.content)) {
                    const textObj = parsed.content.find(c => c.type === 'text' && c.text);
                    if (textObj) generatedText = textObj.text;
                }
            } catch(e){}
        }

        // Smart Post-Processing: Strip any leftover conversational preambles/disclaimers or postscripts
        if (typeof generatedText === 'string' && generatedText.trim().length > 0) {
            let cleaned = generatedText.trim();

            // 1. Remove leading disclaimers / chat preamble if title appears later
            const titleMatch = cleaned.match(/(?:#|\*\*|Headline:)?\s*([A-Z0-9À-Ü].*?:.*?)(?:\n|\r)/i) ||
                               cleaned.match(/(\*\*[^*]+\*\*|#[^#\n]+)/);
            if (titleMatch && titleMatch.index > 0) {
                cleaned = cleaned.substring(titleMatch.index).trim();
            }

            // 2. Strip horizontal divider lines (---) at top or bottom
            cleaned = cleaned.replace(/^[\s\-*_]{3,}\n+/g, '').replace(/\n+[\s\-*_]{3,}$/g, '');

            // 3. Strip trailing chat offers ("Se vuoi, posso...", "Fammi sapere se...")
            cleaned = cleaned.replace(/\n\n(?:Se vuoi|Posso|Fammi sapere|Dimmi se|Nota:).*$/is, '');

            generatedText = cleaned.trim();
        }

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
