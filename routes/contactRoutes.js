const express = require('express');
const { authMiddleware } = require('../middleware/auth');
const { getDb } = require('../database/db');

const router = express.Router();

// All contacts routes require authentication
router.use(authMiddleware);

/**
 * Helper to build ownership SQL clause
 */
function getOwnerClause(req) {
    if (req.teamId) {
        return {
            clause: '(user_id = ? OR team_id = ?)',
            params: [req.userId, req.teamId]
        };
    }
    return {
        clause: 'user_id = ?',
        params: [req.userId]
    };
}

/**
 * GET /api/contacts
 * Returns contacts with optional filtering by beat (settore) or search keyword
 */
router.get('/', (req, res) => {
    try {
        const db = getDb();
        const { beat, search } = req.query;
        const owner = getOwnerClause(req);

        let query = `SELECT * FROM media_contacts WHERE ${owner.clause}`;
        const params = [...owner.params];

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

        // Calculate CRM stats safely
        const totalRow = db.prepare(`SELECT COUNT(*) as count FROM media_contacts WHERE ${owner.clause}`).get(...owner.params);
        const total = totalRow ? (totalRow.count || 0) : 0;

        const outletsRow = db.prepare(`SELECT COUNT(DISTINCT outlet) as count FROM media_contacts WHERE ${owner.clause} AND outlet != ''`).get(...owner.params);
        const outlets = outletsRow ? (outletsRow.count || 0) : 0;

        const beats = db.prepare(`SELECT beat, COUNT(*) as count FROM media_contacts WHERE ${owner.clause} GROUP BY beat`).all(...owner.params) || [];

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
            INSERT INTO media_contacts (user_id, team_id, client_id, name, outlet, role, beat, email, phone, notes)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        const result = stmt.run(
            req.userId,
            req.teamId || null,
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
        const owner = getOwnerClause(req);
        const existing = db.prepare(`SELECT id FROM media_contacts WHERE id = ? AND ${owner.clause}`).get(req.params.id, ...owner.params);
        if (!existing) {
            return res.status(404).json({ error: 'Contatto non trovato o non modificabile.' });
        }

        db.prepare(`
            UPDATE media_contacts
            SET name = ?, outlet = ?, role = ?, beat = ?, email = ?, phone = ?, notes = ?, client_id = ?
            WHERE id = ? AND ${owner.clause}
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
            ...owner.params
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
        const owner = getOwnerClause(req);
        const result = db.prepare(`DELETE FROM media_contacts WHERE id = ? AND ${owner.clause}`).run(req.params.id, ...owner.params);
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
 * Parse a raw CSV or TSV line into a contact object
 */
function parseRawLineToContact(line) {
    if (!line || !line.trim()) return null;

    // Detect delimiter: tab, semicolon or comma
    let delimiter = ',';
    if (line.includes('\t')) delimiter = '\t';
    else if (line.includes(';')) delimiter = ';';

    const parts = line.split(delimiter).map(p => p.trim().replace(/^["']|["']$/g, ''));
    if (parts.length === 0) return null;

    // Find the part that looks like an email
    const emailIndex = parts.findIndex(p => /\S+@\S+\.\S+/.test(p));
    if (emailIndex === -1 && parts.length < 2) return null;

    let name = '';
    let outlet = '';
    let role = '';
    let beat = 'generale';
    let email = '';
    let phone = '';
    let notes = '';

    if (emailIndex !== -1) {
        email = parts[emailIndex];
        // If standard order: Name, Outlet, Role, Beat, Email, Phone, Notes
        if (emailIndex === 4 && parts.length >= 5) {
            name = parts[0] || '';
            outlet = parts[1] || '';
            role = parts[2] || '';
            beat = parts[3] || 'generale';
            phone = parts[5] || '';
            notes = parts.slice(6).join(' ') || '';
        } else if (emailIndex === 1 && parts.length >= 2) {
            // Format: Name, Email, Outlet, Role...
            name = parts[0] || '';
            outlet = parts[2] || '';
            role = parts[3] || '';
            beat = parts[4] || 'generale';
            phone = parts[5] || '';
        } else {
            // General fallback
            name = parts[0] || '';
            outlet = (parts[1] && parts[1] !== email) ? parts[1] : '';
            if (parts.length > 2 && parts[2] !== email) role = parts[2];
        }
    } else {
        // No email regex match: fallback positional
        name = parts[0] || '';
        outlet = parts[1] || '';
        role = parts[2] || '';
        beat = parts[3] || 'generale';
        email = parts[4] || '';
        phone = parts[5] || '';
    }

    if (!name && !email) return null;
    if (!email) email = `${name.toLowerCase().replace(/[^a-z0-9]/g, '.')}@media.it`;
    if (!name) name = email.split('@')[0];

    return { name, outlet, role, beat, email, phone, notes };
}

/**
 * POST /api/contacts/import
 * Bulk import contacts from an array OR raw text (CSV / Excel copy-paste)
 */
router.post('/import', (req, res) => {
    try {
        let contactList = [];

        if (Array.isArray(req.body.contacts) && req.body.contacts.length > 0) {
            contactList = req.body.contacts;
        } else if (typeof req.body.text === 'string' && req.body.text.trim()) {
            const lines = req.body.text.split(/\r?\n/);
            for (const line of lines) {
                const parsed = parseRawLineToContact(line);
                if (parsed) contactList.push(parsed);
            }
        }

        if (contactList.length === 0) {
            return res.status(400).json({ error: 'Nessun contatto valido trovato nel testo o nella lista fornita.' });
        }

        const db = getDb();
        const insertStmt = db.prepare(`
            INSERT INTO media_contacts (user_id, team_id, name, outlet, role, beat, email, phone, notes)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        let inserted = 0;
        const insertMany = db.transaction((list) => {
            for (const c of list) {
                if (c && c.name && c.email) {
                    insertStmt.run(
                        req.userId,
                        req.teamId || null,
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

        insertMany(contactList);

        res.json({
            success: true,
            count: inserted,
            imported: inserted,
            message: `${inserted} contatti importati con successo nella rubrica.`
        });
    } catch (error) {
        console.error('Errore importazione contatti:', error);
        res.status(500).json({ error: 'Errore durante l\'importazione dei contatti.' });
    }
});

module.exports = router;
