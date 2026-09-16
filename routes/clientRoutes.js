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
        const { name, logo_base64, keywords, tone_of_voice, notes } = req.body;

        if (!name || !name.trim()) {
            return res.status(400).json({ error: 'Il nome del cliente è obbligatorio.' });
        }

        const db = getDb();
        const stmt = db.prepare(`
            INSERT INTO clients (user_id, team_id, name, logo_base64, keywords, tone_of_voice, notes)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `);

        const result = stmt.run(
            req.userId,
            req.teamId || null,
            name.trim(),
            logo_base64 || '',
            keywords ? keywords.trim() : '',
            tone_of_voice ? tone_of_voice.trim() : '',
            notes ? notes.trim() : ''
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
        const { name, logo_base64, keywords, tone_of_voice, notes } = req.body;
        
        if (!name || !name.trim()) {
            return res.status(400).json({ error: 'Il nome del cliente è obbligatorio.' });
        }

        const db = getDb();
        const existing = db.prepare('SELECT id FROM clients WHERE id = ? AND user_id = ?').get(req.params.id, req.userId);
        if (!existing) {
            return res.status(404).json({ error: 'Cliente non trovato.' });
        }

        db.prepare(`
            UPDATE clients 
            SET name = ?, logo_base64 = ?, keywords = ?, tone_of_voice = ?, notes = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = ? AND user_id = ?
        `).run(
            name.trim(),
            logo_base64 !== undefined ? logo_base64 : '',
            keywords ? keywords.trim() : '',
            tone_of_voice ? tone_of_voice.trim() : '',
            notes ? notes.trim() : '',
            req.params.id,
            req.userId
        );

        const updatedClient = db.prepare('SELECT * FROM clients WHERE id = ?').get(req.params.id);
        res.json({ message: 'Cliente aggiornato con successo', client: updatedClient });
    } catch (error) {
        console.error('Errore aggiornamento cliente:', error);
        res.status(500).json({ error: 'Impossibile aggiornare il cliente.' });
    }
});

// DELETE /api/clients/:id - Delete client
router.delete('/:id', (req, res) => {
    try {
        const db = getDb();
        const result = db.prepare('DELETE FROM clients WHERE id = ? AND user_id = ?').run(req.params.id, req.userId);
        
        if (result.changes === 0) {
            return res.status(404).json({ error: 'Cliente non trovato.' });
        }

        res.json({ message: 'Cliente eliminato con successo' });
    } catch (error) {
        console.error('Errore eliminazione cliente:', error);
        res.status(500).json({ error: 'Impossibile eliminare il cliente.' });
    }
});

module.exports = router;
