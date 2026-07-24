const express = require('express');
const { authMiddleware } = require('../middleware/auth');
const { getDb } = require('../database/db');

const router = express.Router();

// All client routes require authentication
router.use(authMiddleware);

// GET /api/clients - Get all clients for the logged-in user
router.get('/', (req, res) => {
    try {
        const db = getDb();
        const clients = db.prepare(`
            SELECT * FROM clients 
            WHERE user_id = ? 
            ORDER BY name ASC
        `).all(req.userId);
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
        const client = db.prepare(`
            SELECT * FROM clients 
            WHERE id = ? AND user_id = ?
        `).get(req.params.id, req.userId);
        
        if (!client) {
            return res.status(404).json({ error: 'Cliente non trovato.' });
        }
        res.json({ client });
    } catch (error) {
        console.error('Errore recupero cliente:', error);
        res.status(500).json({ error: 'Impossibile recuperare il cliente.' });
    }
});

// POST /api/clients - Create new client
router.post('/', (req, res) => {
    try {
        const { name, logo_base64, keywords, tone_of_voice, notes } = req.body;
        
        if (!name || !name.trim()) {
            return res.status(400).json({ error: 'Il nome del cliente è obbligatorio.' });
        }

        const db = getDb();
        const stmt = db.prepare(`
            INSERT INTO clients (user_id, name, logo_base64, keywords, tone_of_voice, notes)
            VALUES (?, ?, ?, ?, ?, ?)
        `);

        const result = stmt.run(
            req.userId,
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
        const result = db.prepare('DELETE FROM clients WHERE id = ? AND user_id = ?').run(req.params.id, req.user.id);
        
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
