const express = require('express');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../database/db');
const { authMiddleware } = require('../middleware/auth');
const { generatePDF } = require('../services/pdfGenerator');

const router = express.Router();

router.post('/generate', authMiddleware, async (req, res) => {
    try {
        const { articles, title } = req.body;

        if (!articles || !Array.isArray(articles) || articles.length === 0) {
            return res.status(400).json({ error: 'Fornisci almeno un articolo per generare il PDF.' });
        }

        const reviewTitle = title || 'Rassegna Stampa';
        const db = getDb();
        const user = db.prepare('SELECT company_name, logo_path FROM users WHERE id = ?').get(req.userId);
        
        let userLogoBase64 = null;
        if (user && user.logo_path) {
            const logoFilePath = path.join(__dirname, '..', user.logo_path);
            if (fs.existsSync(logoFilePath)) {
                const ext = path.extname(logoFilePath).substring(1);
                const format = ext === 'svg' ? 'svg+xml' : ext === 'jpg' ? 'jpeg' : ext;
                const fileData = fs.readFileSync(logoFilePath, { encoding: 'base64' });
                userLogoBase64 = `data:image/${format};base64,${fileData}`;
            }
        }

        const options = {
            title: reviewTitle,
            userName: user?.company_name || 'Utente',
            userLogo: userLogoBase64
        };

        console.log(`[PDF] Generazione in corso per ${articles.length} articoli...`);
        const pdfBuffer = await generatePDF(articles, options);
        
        const filename = `${uuidv4()}.pdf`;
        const outputPath = path.join(__dirname, '..', 'output', filename);
        
        fs.writeFileSync(outputPath, pdfBuffer);

        // Save to history
        const info = db.prepare(`
            INSERT INTO press_reviews (user_id, title, pdf_filename, article_count)
            VALUES (?, ?, ?, ?)
        `).run(req.userId, reviewTitle, filename, articles.length);

        res.json({
            id: info.lastInsertRowid,
            filename,
            downloadUrl: `/api/pdf/download/${filename}`
        });

    } catch (error) {
        console.error('PDF generation route error:', error);
        res.status(500).json({ error: 'Errore durante la generazione del PDF.' });
    }
});

router.get('/download/:filename', authMiddleware, (req, res) => {
    try {
        const { filename } = req.params;
        const db = getDb();
        
        // Verify ownership
        const review = db.prepare('SELECT * FROM press_reviews WHERE pdf_filename = ? AND user_id = ?').get(filename, req.userId);
        
        if (!review) {
            return res.status(404).json({ error: 'PDF non trovato o non autorizzato.' });
        }

        const filePath = path.join(__dirname, '..', 'output', filename);
        if (!fs.existsSync(filePath)) {
            return res.status(404).json({ error: 'Il file PDF non è più disponibile sul server.' });
        }

        res.download(filePath, `Rassegna_Stampa_${review.title.replace(/[^a-z0-9]/gi, '_')}.pdf`);
    } catch (error) {
        console.error('Download PDF error:', error);
        res.status(500).json({ error: 'Errore durante il download del PDF.' });
    }
});

router.get('/history', authMiddleware, (req, res) => {
    try {
        const db = getDb();
        const history = db.prepare(`
            SELECT id, title, pdf_filename as filename, article_count, created_at,
                   '/api/pdf/download/' || pdf_filename as downloadUrl
            FROM press_reviews 
            WHERE user_id = ? 
            ORDER BY created_at DESC
        `).all(req.userId);
        
        res.json(history);
    } catch (error) {
        console.error('Get history error:', error);
        res.status(500).json({ error: 'Errore nel recupero dello storico.' });
    }
});

router.delete('/:id', authMiddleware, (req, res) => {
    try {
        const { id } = req.params;
        const db = getDb();
        
        const review = db.prepare('SELECT pdf_filename FROM press_reviews WHERE id = ? AND user_id = ?').get(id, req.userId);
        
        if (!review) {
            return res.status(404).json({ error: 'Rassegna non trovata.' });
        }

        const filePath = path.join(__dirname, '..', 'output', review.pdf_filename);
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
        }

        db.prepare('DELETE FROM press_reviews WHERE id = ?').run(id);
        
        res.json({ success: true, message: 'Rassegna eliminata con successo.' });
    } catch (error) {
        console.error('Delete review error:', error);
        res.status(500).json({ error: 'Errore durante l\'eliminazione della rassegna.' });
    }
});

module.exports = router;
