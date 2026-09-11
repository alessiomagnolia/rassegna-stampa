const express = require('express');
const { authMiddleware } = require('../middleware/auth');
const { getDb } = require('../database/db');

const router = express.Router();

// All contacts routes require authentication
router.use(authMiddleware);

/**
 * GET /api/contacts
 * Returns contacts with optional filtering by beat (settore) or search keyword
 */
router.get('/', (req, res) => {
    try {
        const db = getDb();
        const { beat, search } = req.query;

        let query = 'SELECT * FROM media_contacts WHERE user_id = ?';
        const params = [req.userId];

        if (beat && beat !== 'tutti' && beat !== 'all') {
            query += ' AND beat = ?';
            params.push(beat);
        }

        if (search && search.trim()) {
            query += ' AND (name LIKE ? OR outlet LIKE ? OR email LIKE ? OR role LIKE ?)';
            const term = `%${search.trim()}%`;
            params.push(term, term, term, term);
        }

        query += ' ORDER BY name ASC';
        const contacts = db.prepare(query).all(...params);

        // Calculate CRM stats
        const total = db.prepare('SELECT COUNT(*) as count FROM media_contacts WHERE user_id = ?').get(req.userId).count;
        const outlets = db.prepare('SELECT COUNT(DISTINCT outlet) as count FROM media_contacts WHERE user_id = ? AND outlet != ""').get(req.userId).count;
        const beats = db.prepare('SELECT beat, COUNT(*) as count FROM media_contacts WHERE user_id = ? GROUP BY beat').all(req.userId);

        res.json({
            contacts,
            stats: {
                total,
                uniqueOutlets: outlets,
                beats
            }
        });
    } catch (error) {
        console.error('Errore recupero contatti:', error);
        res.status(500).json({ error: 'Impossibile recuperare i contatti della rubrica.' });
    }
});

/**
 * POST /api/contacts
 * Creates a new journalist / media contact
 */
router.post('/', (req, res) => {
    try {
        const { name, outlet, role, beat, email, phone, notes, client_id } = req.body;

        if (!name || !name.trim()) {
            return res.status(400).json({ error: 'Il nome del contatto è obbligatorio.' });
        }
        if (!email || !email.trim()) {
            return res.status(400).json({ error: 'L\'email del contatto è obbligatoria.' });
        }

        const db = getDb();
        const stmt = db.prepare(`
            INSERT INTO media_contacts (user_id, client_id, name, outlet, role, beat, email, phone, notes)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        const result = stmt.run(
            req.userId,
            client_id || null,
            name.trim(),
            (outlet || '').trim(),
            (role || '').trim(),
            (beat || 'generale').toLowerCase().trim(),
            email.trim(),
            (phone || '').trim(),
            (notes || '').trim()
        );

        const newContact = db.prepare('SELECT * FROM media_contacts WHERE id = ?').get(result.lastInsertRowid);
        res.status(201).json({ success: true, contact: newContact });
    } catch (error) {
        console.error('Errore creazione contatto:', error);
        res.status(500).json({ error: 'Impossibile salvare il contatto.' });
    }
});

/**
 * PUT /api/contacts/:id
 * Updates an existing contact
 */
router.put('/:id', (req, res) => {
    try {
        const { name, outlet, role, beat, email, phone, notes, client_id } = req.body;

        if (!name || !name.trim() || !email || !email.trim()) {
            return res.status(400).json({ error: 'Nome ed email sono obbligatori.' });
        }

        const db = getDb();
        const existing = db.prepare('SELECT id FROM media_contacts WHERE id = ? AND user_id = ?').get(req.params.id, req.userId);
        if (!existing) {
            return res.status(404).json({ error: 'Contatto non trovato.' });
        }

        db.prepare(`
            UPDATE media_contacts
            SET name = ?, outlet = ?, role = ?, beat = ?, email = ?, phone = ?, notes = ?, client_id = ?
            WHERE id = ? AND user_id = ?
        `).run(
            name.trim(),
            (outlet || '').trim(),
            (role || '').trim(),
            (beat || 'generale').toLowerCase().trim(),
            email.trim(),
            (phone || '').trim(),
            (notes || '').trim(),
            client_id || null,
            req.params.id,
            req.userId
        );

        const updated = db.prepare('SELECT * FROM media_contacts WHERE id = ?').get(req.params.id);
        res.json({ success: true, contact: updated });
    } catch (error) {
        console.error('Errore aggiornamento contatto:', error);
        res.status(500).json({ error: 'Impossibile aggiornare il contatto.' });
    }
});

/**
 * DELETE /api/contacts/:id
 * Deletes a contact
 */
router.delete('/:id', (req, res) => {
    try {
        const db = getDb();
        const result = db.prepare('DELETE FROM media_contacts WHERE id = ? AND user_id = ?').run(req.params.id, req.userId);
        if (result.changes === 0) {
            return res.status(404).json({ error: 'Contatto non trovato.' });
        }
        res.json({ success: true, message: 'Contatto eliminato con successo.' });
    } catch (error) {
        console.error('Errore eliminazione contatto:', error);
        res.status(500).json({ error: 'Impossibile eliminare il contatto.' });
    }
});

/**
 * POST /api/contacts/import
 * Bulk import contacts from a list (e.g. CSV parse on client)
 */
router.post('/import', (req, res) => {
    try {
        const { contacts } = req.body;
        if (!contacts || !Array.isArray(contacts) || contacts.length === 0) {
            return res.status(400).json({ error: 'Fornisci una lista valida di contatti da importare.' });
        }

        const db = getDb();
        const insertStmt = db.prepare(`
            INSERT INTO media_contacts (user_id, name, outlet, role, beat, email, phone, notes)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `);

        let inserted = 0;
        const insertMany = db.transaction((list) => {
            for (const c of list) {
                if (c.name && c.email) {
                    insertStmt.run(
                        req.userId,
                        c.name.trim(),
                        (c.outlet || '').trim(),
                        (c.role || '').trim(),
                        (c.beat || 'generale').toLowerCase().trim(),
                        c.email.trim(),
                        (c.phone || '').trim(),
                        (c.notes || '').trim()
                    );
                    inserted++;
                }
            }
        });

        insertMany(contacts);

        res.json({
            success: true,
            imported: inserted,
            message: `${inserted} contatti importati con successo nella rubrica.`
        });
    } catch (error) {
        console.error('Errore importazione contatti:', error);
        res.status(500).json({ error: 'Errore durante l\'importazione dei contatti.' });
    }
});

module.exports = router;
