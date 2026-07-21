const express = require('express');
const path = require('path');
const fs = require('fs');
const https = require('https');
const http = require('http');
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../database/db');
const { authMiddleware } = require('../middleware/auth');
const { generatePDF } = require('../services/pdfGenerator');

const router = express.Router();

// Helper: fetch a remote image URL and convert to base64 data URI (server-side, no CORS)
function fetchImageAsBase64(url) {
    return new Promise((resolve) => {
        if (!url) return resolve(null);
        // If it's already a data URI, return as-is
        if (url.startsWith('data:')) return resolve(url);

        const protocol = url.startsWith('https') ? https : http;
        protocol.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (response) => {
            if (response.statusCode !== 200) return resolve(null);
            const chunks = [];
            response.on('data', chunk => chunks.push(chunk));
            response.on('end', () => {
                const buffer = Buffer.concat(chunks);
                const contentType = response.headers['content-type'] || 'image/png';
                resolve(`data:${contentType};base64,${buffer.toString('base64')}`);
            });
        }).on('error', () => resolve(null));
    });
}

router.post('/generate', authMiddleware, async (req, res) => {
    try {
        const { articles, title, clientName, clientLogo } = req.body;

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

        // Resolve all article logos: if a logo is a remote URL, fetch it as base64 server-side
        const resolvedArticles = await Promise.all(articles.map(async (article) => {
            if (article.logoBase64 && !article.logoBase64.startsWith('data:')) {
                const resolved = await fetchImageAsBase64(article.logoBase64);
                return { ...article, logoBase64: resolved };
            }
            return article;
        }));

        const options = {
            title: reviewTitle,
            userName: user?.company_name || 'Utente',
            clientName: clientName || null,
            clientLogo: clientLogo || null,
            userLogo: userLogoBase64
        };

        console.log(`[PDF] Generazione in corso per ${resolvedArticles.length} articoli...`);
        const date = new Date().toISOString().split('T')[0];
        let baseFilename = 'Rassegna_Stampa';
        if (title && title.trim().length > 0) {
            baseFilename = title.trim().replace(/[^a-z0-9]/gi, '_');
        }
        const filename = `${baseFilename}_${date}.pdf`;
        const outputPath = path.join(__dirname, '..', 'output', filename);

        console.log(`[PDF] Generazione PDF in: ${outputPath}`);
        const pdfBuffer = await generatePDF(resolvedArticles, options);
        
        fs.writeFileSync(outputPath, pdfBuffer);

        // Save to history (including full articles JSON for editor reopening)
        const articlesJsonStr = JSON.stringify(articles); // original articles (with base64 images)
        const info = db.prepare(`
            INSERT INTO press_reviews (user_id, title, pdf_filename, article_count, articles_json, client_name, client_logo)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(req.userId, reviewTitle, filename, articles.length, articlesJsonStr, clientName || '', clientLogo || '');

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
            SELECT id, title, pdf_filename as filename, article_count, created_at, client_name,
                   '/api/pdf/download/' || pdf_filename as downloadUrl,
                   CASE WHEN articles_json IS NOT NULL THEN 1 ELSE 0 END as is_editable
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

// GET /review/:id — returns full review data including articles_json (for editor reopen)
router.get('/review/:id', authMiddleware, (req, res) => {
    try {
        const { id } = req.params;
        const db = getDb();
        const review = db.prepare(
            'SELECT * FROM press_reviews WHERE id = ? AND user_id = ?'
        ).get(id, req.userId);

        if (!review) {
            return res.status(404).json({ error: 'Rassegna non trovata.' });
        }

        let articles = [];
        try { articles = review.articles_json ? JSON.parse(review.articles_json) : []; } catch {}

        res.json({
            id: review.id,
            title: review.title,
            clientName: review.client_name || '',
            clientLogo: review.client_logo || '',
            articles
        });
    } catch (error) {
        console.error('Get review error:', error);
        res.status(500).json({ error: 'Errore nel recupero della rassegna.' });
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
