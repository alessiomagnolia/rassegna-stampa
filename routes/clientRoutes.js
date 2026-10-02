const express = require('express');
const { authMiddleware } = require('../middleware/auth');
const { getDb } = require('../database/db');

const router = express.Router();

// All client routes require authentication
router.use(authMiddleware);

// GET /api/clients - Ottieni tutti i clienti (personali + del team se presente)
router.get('/', (req, res) => {
    try {
        const db = getDb();
        let clients;
        if (req.teamId) {
            // Membro di un team: vede i clienti del team + i propri personali
            clients = db.prepare(`
                SELECT * FROM clients
                WHERE user_id = ? OR team_id = ?
                ORDER BY name ASC
            `).all(req.userId, req.teamId);
        } else {
            // Account personale
            clients = db.prepare(`
                SELECT * FROM clients
                WHERE user_id = ? AND (team_id IS NULL OR team_id = 0)
                ORDER BY name ASC
            `).all(req.userId);
        }
        res.json({ clients });
    } catch (error) {
        console.error('Errore recupero clienti:', error);
        res.status(500).json({ error: 'Impossibile recuperare i clienti.' });
    }
});

// GET /api/clients/:id - Get single client
router.get('/:id', (req, res) => {
    try {
        const db = getDb();
        let client;
        if (req.teamId) {
            client = db.prepare(`
                SELECT * FROM clients
                WHERE id = ? AND (user_id = ? OR team_id = ?)
            `).get(req.params.id, req.userId, req.teamId);
        } else {
            client = db.prepare(`
                SELECT * FROM clients
                WHERE id = ? AND user_id = ?
            `).get(req.params.id, req.userId);
        }

        if (!client) {
            return res.status(404).json({ error: 'Cliente non trovato.' });
        }
        res.json({ client });
    } catch (error) {
        console.error('Errore recupero cliente:', error);
        res.status(500).json({ error: 'Impossibile recuperare il cliente.' });
    }
});

// POST /api/clients - Crea nuovo cliente
router.post('/', (req, res) => {
    try {
        const { name, logo_base64, keywords, tone_of_voice, notes, training_text } = req.body;

        if (!name || !name.trim()) {
            return res.status(400).json({ error: 'Il nome del cliente è obbligatorio.' });
        }

        const db = getDb();
        const stmt = db.prepare(`
            INSERT INTO clients (user_id, team_id, name, logo_base64, keywords, tone_of_voice, notes, training_text)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `);

        const result = stmt.run(
            req.userId,
            req.teamId || null,
            name.trim(),
            logo_base64 || '',
            keywords ? keywords.trim() : '',
            tone_of_voice ? tone_of_voice.trim() : '',
            notes ? notes.trim() : '',
            training_text ? training_text.trim() : ''
        );

        const newClient = db.prepare('SELECT * FROM clients WHERE id = ?').get(result.lastInsertRowid);
        res.status(201).json({ message: 'Cliente creato con successo', client: newClient });
    } catch (error) {
        console.error('Errore creazione cliente:', error);
        res.status(500).json({ error: 'Impossibile creare il cliente.' });
    }
});

// PUT /api/clients/:id - Update client
router.put('/:id', (req, res) => {
    try {
        const { name, logo_base64, keywords, tone_of_voice, notes, training_text } = req.body;
        
        if (!name || !name.trim()) {
            return res.status(400).json({ error: 'Il nome del cliente è obbligatorio.' });
        }

        const db = getDb();
        let existing;
        if (req.teamId) {
            existing = db.prepare('SELECT id FROM clients WHERE id = ? AND (user_id = ? OR team_id = ?)').get(req.params.id, req.userId, req.teamId);
        } else {
            existing = db.prepare('SELECT id FROM clients WHERE id = ? AND user_id = ?').get(req.params.id, req.userId);
        }
        if (!existing) {
            return res.status(404).json({ error: 'Cliente non trovato.' });
        }

        db.prepare(`
            UPDATE clients 
            SET name = ?, logo_base64 = ?, keywords = ?, tone_of_voice = ?, notes = ?, training_text = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        `).run(
            name.trim(),
            logo_base64 !== undefined ? logo_base64 : '',
            keywords ? keywords.trim() : '',
            tone_of_voice ? tone_of_voice.trim() : '',
            notes ? notes.trim() : '',
            training_text !== undefined ? training_text.trim() : '',
            req.params.id
        );

        const updatedClient = db.prepare('SELECT * FROM clients WHERE id = ?').get(req.params.id);
        res.json({ message: 'Cliente aggiornato con successo', client: updatedClient });
    } catch (error) {
        console.error('Errore aggiornamento cliente:', error);
        res.status(500).json({ error: 'Impossibile aggiornare il cliente.' });
    }
});

// POST /api/clients/analyze-tone - Analizza testi d'esempio ed estrae Tone of Voice e Keyword
router.post('/analyze-tone', async (req, res) => {
    try {
        const { text, clientName } = req.body;
        if (!text || text.trim().length < 30) {
            return res.status(400).json({ error: 'Inserisci almeno 30 caratteri di testo d\'esempio per l\'analisi.' });
        }

        let toneOfVoice = '';
        let suggestedKeywords = '';
        let styleSummary = '';

        try {
            const { getAnthropicClient, callAnthropicMessages } = require('../services/aiHelper');
            const anthropic = getAnthropicClient();

            const prompt = `Sei un esperto di comunicazione, media relations e analisi linguistica per uffici stampa.
Analizza il seguente campione di testo appartenente al cliente/brand "${clientName || 'Cliente'}" (es. comunicati stampa, dichiarazioni ufficiali, interviste o discorsi).

TESTO CAMPIONE:
"""
${text.slice(0, 4500)}
"""

Restituisci unicamente un oggetto JSON valido (senza testo introduttivo o markdown) con la seguente struttura:
{
  "tone_of_voice": "Descrizione concisa e operativa del tone of voice (es. Istituzionale, assertivo, orientato ai dati, linguaggio chiaro e pragmatico)",
  "suggested_keywords": "Parola1, Parola2, Parola3, Parola4, Parola5",
  "style_summary": "1-2 frasi di sintesi sui tratti salienti della voce comunicativa del brand/cliente"
}`;

            const aiResp = await callAnthropicMessages(anthropic, {
                max_tokens: 800,
                messages: [{ role: 'user', content: prompt }]
            }, { type: 'fast' });

            let rawJson = '';
            if (aiResp.content && Array.isArray(aiResp.content)) {
                rawJson = aiResp.content.map(b => b.text || '').join('');
            } else if (aiResp.text) {
                rawJson = aiResp.text;
            }

            const cleanJson = rawJson.replace(/```json/gi, '').replace(/```/g, '').trim();
            const parsed = JSON.parse(cleanJson);
            toneOfVoice = parsed.tone_of_voice || '';
            suggestedKeywords = parsed.suggested_keywords || '';
            styleSummary = parsed.style_summary || '';
        } catch (aiErr) {
            console.warn('[Clients] AI Analysis fallback:', aiErr.message);
            // Intelligent heuristic fallback
            const words = text.split(/\s+/).filter(w => w.length > 5);
            const freq = {};
            words.forEach(w => {
                const clean = w.toLowerCase().replace(/[^a-zàèéìòù]/gi, '');
                if (clean.length > 4 && !['questo', 'quello', 'perché', 'quando', 'hanno', 'stato', 'prima', 'dopo'].includes(clean)) {
                    freq[clean] = (freq[clean] || 0) + 1;
                }
            });
            const topWords = Object.keys(freq).sort((a,b) => freq[b] - freq[a]).slice(0, 6).map(w => w.charAt(0).toUpperCase() + w.slice(1));
            suggestedKeywords = topWords.join(', ');
            
            const isFormal = text.includes('dichiara') || text.includes('sottolinea') || text.includes('comunicato') || text.includes('istituzionale');
            toneOfVoice = isFormal 
                ? 'Istituzionale, autorevole, chiaro e orientato alla chiarezza dei fatti'
                : 'Professionale, dinamico, orientato all\'impatto e alla concretezza';
            styleSummary = 'Stile professionale basato sull\'analisi del lessico e della sintassi del testo inserito.';
        }

        res.json({
            tone_of_voice: toneOfVoice,
            suggested_keywords: suggestedKeywords,
            style_summary: styleSummary
        });
    } catch (err) {
        console.error('Errore analisi tone of voice:', err);
        res.status(500).json({ error: 'Impossibile analizzare il tone of voice.' });
    }
});

// DELETE /api/clients/:id - Delete client
router.delete('/:id', (req, res) => {
    try {
        const db = getDb();
        let result;
        if (req.teamId) {
            result = db.prepare('DELETE FROM clients WHERE id = ? AND (user_id = ? OR team_id = ?)').run(req.params.id, req.userId, req.teamId);
        } else {
            result = db.prepare('DELETE FROM clients WHERE id = ? AND user_id = ?').run(req.params.id, req.userId);
        }

        res.json({ message: 'Cliente eliminato con successo', deleted: result ? result.changes > 0 : false });
    } catch (error) {
        console.error('Errore eliminazione cliente:', error);
        res.status(500).json({ error: 'Impossibile eliminare il cliente.' });
    }
});

module.exports = router;
