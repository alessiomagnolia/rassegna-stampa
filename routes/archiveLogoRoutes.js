const express = require('express');
const { getDb } = require('../database/db');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();

const ALLOWED_CATEGORIES = ['nazionale', 'locale', 'web', 'agenzia', 'economico', 'sportivo', 'broadcast', 'cliente'];
const MAX_LOGO_BYTES = 3 * 1024 * 1024; // ~3 MB di immagine in base64

/**
 * GET /api/archive-logos — loghi personali dell'utente e quelli condivisi dal suo team
 */
router.get('/', authMiddleware, (req, res) => {
    try {
        const db = getDb();
        const rows = db.prepare(`
            SELECT id, name, category, logo_data, created_at FROM archive_logos
            WHERE user_id = ? OR (team_id IS NOT NULL AND team_id = ?)
            ORDER BY created_at DESC
        `).all(req.userId, req.teamId || -1);
        res.json(rows);
    } catch (err) {
        console.error('[ArchiveLogos] Errore lettura:', err.message);
        res.status(500).json({ error: 'Errore nel caricamento dei loghi.' });
    }
});

/**
 * POST /api/archive-logos — salva un logo { name, category, logo_data (data:image/...) }
 */
router.post('/', authMiddleware, (req, res) => {
    try {
        const name = String(req.body.name || '').trim().slice(0, 120);
        const category = ALLOWED_CATEGORIES.includes(req.body.category) ? req.body.category : 'nazionale';
        const logoData = String(req.body.logo_data || '');

        if (!name) return res.status(400).json({ error: 'Il nome della testata è obbligatorio.' });
        if (!/^data:image\/(png|jpe?g|svg\+xml|webp|gif);base64,/i.test(logoData)) {
            return res.status(400).json({ error: 'Formato immagine non supportato.' });
        }
        if (logoData.length > MAX_LOGO_BYTES * 1.37) {
            return res.status(413).json({ error: 'Immagine troppo grande (max 3 MB).' });
        }

        const db = getDb();
        const info = db.prepare(`
            INSERT INTO archive_logos (user_id, team_id, name, category, logo_data) VALUES (?, ?, ?, ?, ?)
        `).run(req.userId, req.teamId || null, name, category, logoData);

        res.status(201).json({ id: info.lastInsertRowid, name, category, logo_data: logoData });
    } catch (err) {
        console.error('[ArchiveLogos] Errore salvataggio:', err.message);
        res.status(500).json({ error: 'Errore durante il salvataggio del logo.' });
    }
});

/**
 * DELETE /api/archive-logos/:id — rimuove un logo personale o del proprio team
 */
router.delete('/:id', authMiddleware, (req, res) => {
    try {
        const db = getDb();
        const result = db.prepare(`
            DELETE FROM archive_logos WHERE id = ? AND (user_id = ? OR (team_id IS NOT NULL AND team_id = ?))
        `).run(parseInt(req.params.id, 10), req.userId, req.teamId || -1);
        if (result.changes === 0) return res.status(404).json({ error: 'Logo non trovato.' });
        res.json({ success: true });
    } catch (err) {
        console.error('[ArchiveLogos] Errore eliminazione:', err.message);
        res.status(500).json({ error: 'Errore durante la rimozione del logo.' });
    }
});

module.exports = router;
