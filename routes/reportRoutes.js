const express = require('express');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../database/db');
const { authMiddleware } = require('../middleware/auth');
const { calculatePRAnalytics, formatMetricNumber } = require('../services/analyticsService');
const { launchBrowser } = require('../services/screenshotService');
const { buildReportPDFHTML } = require('../templates/reportPdfTemplate');

const router = express.Router();

function getItemDateKey(dateStr) {
    if (!dateStr) return '0000-00-00';
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) {
        const match = String(dateStr).match(/^(\d{4})-(\d{2})-(\d{2})/);
        return match ? `${match[1]}-${match[2]}-${match[3]}` : '0000-00-00';
    }
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

/**
 * POST /api/reports/aggregate
 * Scans press reviews for a specific client and date range.
 * Aggregates all launches, clippings, OTS audience, and top media outlets.
 */
router.post('/aggregate', authMiddleware, (req, res) => {
    try {
        const { clientName, periodStart, periodEnd, periodLabel } = req.body;
        if (!clientName || !clientName.trim()) {
            return res.status(400).json({ error: 'Specifica il nome del cliente.' });
        }

        const db = getDb();
        const cleanClient = clientName.trim().toLowerCase();

        // 1. Fetch reviews for user or team
        let allReviews = [];
        if (req.teamId) {
            allReviews = db.prepare(`
                SELECT id, title, pdf_filename, article_count, articles_json, client_name, client_logo, created_at, share_token
                FROM press_reviews
                WHERE (user_id = ? OR team_id = ?)
                ORDER BY created_at ASC
            `).all(req.userId, req.teamId);
        } else {
            allReviews = db.prepare(`
                SELECT id, title, pdf_filename, article_count, articles_json, client_name, client_logo, created_at, share_token
                FROM press_reviews
                WHERE user_id = ? AND (team_id IS NULL OR team_id = 0)
                ORDER BY created_at ASC
            `).all(req.userId);
        }

        // 2. Filter by client and date range
        const matchingReviews = allReviews.filter(rev => {
            const rClient = (rev.client_name || '').trim().toLowerCase();
            if (rClient !== cleanClient) return false;

            const dateKey = getItemDateKey(rev.created_at);
            if (periodStart && dateKey < periodStart) return false;
            if (periodEnd && dateKey > periodEnd) return false;

            return true;
        });

        // Client details from clients table if available
        let clientLogo = '';
        const clientRecord = db.prepare(`
            SELECT logo_base64 FROM clients WHERE LOWER(TRIM(name)) = LOWER(TRIM(?)) LIMIT 1
        `).get(clientName.trim());
        if (clientRecord && clientRecord.logo_base64) {
            clientLogo = clientRecord.logo_base64;
        } else if (matchingReviews.length > 0 && matchingReviews[0].client_logo) {
            clientLogo = matchingReviews[0].client_logo;
        }

        // 3. Extract launches & all articles
        const launches = [];
        const allArticles = [];
        const mediaSourceCounts = {};

        matchingReviews.forEach(rev => {
            let articles = [];
            try {
                if (rev.articles_json) {
                    articles = JSON.parse(rev.articles_json);
                }
            } catch (e) {}

            const articleCount = articles.length || rev.article_count || 0;
            const revDate = new Date(rev.created_at);
            const dateFormatted = !isNaN(revDate.getTime())
                ? revDate.toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: '2-digit' }).replace(/\//g, '.')
                : '';

            articles.forEach(art => {
                allArticles.push(art);
                const sName = (art.source_name || art.source || '').trim();
                if (sName) {
                    mediaSourceCounts[sName] = (mediaSourceCounts[sName] || 0) + 1;
                }
            });

            launches.push({
                id: rev.id,
                date: dateFormatted,
                rawDate: rev.created_at,
                title: rev.title,
                pickups: articleCount,
                downloadUrl: `/api/pdf/download/${rev.pdf_filename}`,
                shareToken: rev.share_token || null
            });
        });

        // 4. Compute Media Analytics (Audience OTS, reads, sentiment)
        const analytics = calculatePRAnalytics(allArticles);

        // 5. Compute Top Media List sorted by frequency
        const sortedTopMedia = Object.keys(mediaSourceCounts)
            .sort((a, b) => mediaSourceCounts[b] - mediaSourceCounts[a])
            .slice(0, 45); // Top 45 testate più significative

        const computedPeriodLabel = periodLabel || `Periodo ${periodStart || ''} - ${periodEnd || ''}`.trim();
        const totalPickups = allArticles.length || launches.reduce((a, b) => a + b.pickups, 0);

        // Pre-build suggested executive email text (following the exact format used by the agency)
        const topMediaStr = sortedTopMedia.join(', ');
        const suggestedEmailText = `Caro Presidente,
con la presente Vi inviamo il Report Media relations e Press office per ${clientName}, relativo al periodo ${computedPeriodLabel}, con ${launches.length} lanci di comunicati stampa e dichiarazioni per un totale di ${totalPickups} pubblicazioni.

Tra le uscite più significative segnaliamo: ${topMediaStr || 'varie testate nazionali e di settore'}.

Nel seguente link permanente è possibile consultare l'indice completo e accedere a tutti i singoli lanci:
[LINK_PORTALE_REPORT]

Inviamo, di seguito, il dettaglio dei lanci effettuati.
Ringraziando per l’attenzione, restiamo a disposizione.
Un caro saluto,

REPORT ${clientName.toUpperCase()} ${computedPeriodLabel.toUpperCase()}
${launches.length} LANCI PER ${totalPickups} USCITE
` + launches.map(l => `${l.date} - ${l.title} – ${l.pickups} uscite`).join('\n');

        res.json({
            success: true,
            clientName: clientName.trim(),
            clientLogo,
            periodStart: periodStart || '',
            periodEnd: periodEnd || '',
            periodLabel: computedPeriodLabel,
            launchesCount: launches.length,
            totalPickups,
            summaryKPIs: {
                total_launches: launches.length,
                total_pickups: totalPickups,
                unique_outlets: analytics.uniqueOutlets || Object.keys(mediaSourceCounts).length,
                total_audience_ots: analytics.totalAudienceOTS || 0,
                formatted_audience_ots: analytics.formattedAudienceOTS || '0',
                total_estimated_reads: analytics.totalEstimatedReads || 0,
                formatted_estimated_reads: analytics.formattedEstimatedReads || '0',
                overall_sentiment: analytics.overallSentiment || 'Positivo'
            },
            launches,
            topMedia: sortedTopMedia,
            suggestedEmailText
        });

    } catch (error) {
        console.error('Report aggregation error:', error);
        res.status(500).json({ error: 'Errore durante l\'aggregazione dei dati del report: ' + error.message });
    }
});

/**
 * GET /api/reports
 * Lists all reports for the authenticated user/team
 */
router.get('/', authMiddleware, (req, res) => {
    try {
        const db = getDb();
        let reports = [];
        if (req.teamId) {
            reports = db.prepare(`
                SELECT id, client_name, client_logo, title, period_label, period_start, period_end,
                       share_token, pdf_filename, summary_kpis, created_at, updated_at, team_id
                FROM coverage_reports
                WHERE user_id = ? OR team_id = ?
                ORDER BY created_at DESC
            `).all(req.userId, req.teamId);
        } else {
            reports = db.prepare(`
                SELECT id, client_name, client_logo, title, period_label, period_start, period_end,
                       share_token, pdf_filename, summary_kpis, created_at, updated_at, team_id
                FROM coverage_reports
                WHERE user_id = ? AND (team_id IS NULL OR team_id = 0)
                ORDER BY created_at DESC
            `).all(req.userId);
        }

        const formatted = reports.map(r => {
            let kpis = {};
            try { kpis = JSON.parse(r.summary_kpis || '{}'); } catch(e) {}
            return {
                ...r,
                summaryKPIs: kpis,
                shareUrl: `/report/${r.share_token}`,
                pdfUrl: r.pdf_filename ? `/api/pdf/download/${r.pdf_filename}` : null
            };
        });

        res.json(formatted);
    } catch (error) {
        console.error('Get reports error:', error);
        res.status(500).json({ error: 'Errore nel recupero dei report.' });
    }
});

/**
 * GET /api/reports/:id
 * Fetches single report full data
 */
router.get('/:id', authMiddleware, (req, res) => {
    try {
        const db = getDb();
        let report;
        if (req.teamId) {
            report = db.prepare(`
                SELECT * FROM coverage_reports WHERE id = ? AND (user_id = ? OR team_id = ?)
            `).get(req.params.id, req.userId, req.teamId);
        } else {
            report = db.prepare(`
                SELECT * FROM coverage_reports WHERE id = ? AND user_id = ?
            `).get(req.params.id, req.userId);
        }

        if (!report) {
            return res.status(404).json({ error: 'Report non trovato.' });
        }

        let summaryKPIs = {};
        let launches = [];
        let topMedia = [];
        let eventsSupported = [];

        try { summaryKPIs = JSON.parse(report.summary_kpis || '{}'); } catch(e) {}
        try { launches = JSON.parse(report.launches_json || '[]'); } catch(e) {}
        try { topMedia = JSON.parse(report.top_media_json || '[]'); } catch(e) {}
        try { eventsSupported = JSON.parse(report.events_supported || '[]'); } catch(e) {}

        res.json({
            ...report,
            summaryKPIs,
            launches,
            topMedia,
            eventsSupported,
            shareUrl: `/report/${report.share_token}`,
            pdfUrl: report.pdf_filename ? `/api/pdf/download/${report.pdf_filename}` : null
        });
    } catch (error) {
        console.error('Get report by ID error:', error);
        res.status(500).json({ error: 'Errore nel recupero del report.' });
    }
});

/**
 * POST /api/reports/save
 * Creates or updates a coverage report
 */
router.post('/save', authMiddleware, (req, res) => {
    try {
        const {
            id,
            clientId,
            clientName,
            clientLogo,
            title,
            periodStart,
            periodEnd,
            periodLabel,
            recipientSalutation,
            recipientTitle,
            eventsSupported,
            executiveNotes,
            senderSignature,
            summaryKPIs,
            launches,
            topMedia
        } = req.body;

        if (!clientName || !clientName.trim()) {
            return res.status(400).json({ error: 'Il nome del cliente è obbligatorio.' });
        }

        const reportTitle = title || `Report Media Relations ${clientName} - ${periodLabel || ''}`.trim();
        const db = getDb();

        const eventsJsonStr = JSON.stringify(eventsSupported || []);
        const kpisJsonStr = JSON.stringify(summaryKPIs || {});
        const launchesJsonStr = JSON.stringify(launches || []);
        const topMediaJsonStr = JSON.stringify(topMedia || []);

        if (id) {
            // Update existing report
            const existing = db.prepare('SELECT id, share_token, pdf_filename FROM coverage_reports WHERE id = ? AND (user_id = ? OR team_id = ?)').get(id, req.userId, req.teamId || 0);
            if (existing) {
                const token = existing.share_token || uuidv4().replace(/-/g, '').slice(0, 16);
                db.prepare(`
                    UPDATE coverage_reports
                    SET client_id = ?, client_name = ?, client_logo = ?, title = ?,
                        period_start = ?, period_end = ?, period_label = ?,
                        recipient_salutation = ?, recipient_title = ?, events_supported = ?,
                        executive_notes = ?, sender_signature = ?, summary_kpis = ?,
                        launches_json = ?, top_media_json = ?, share_token = ?, updated_at = CURRENT_TIMESTAMP
                    WHERE id = ?
                `).run(
                    clientId || null, clientName.trim(), clientLogo || '', reportTitle,
                    periodStart || '', periodEnd || '', periodLabel || '',
                    recipientSalutation || '', recipientTitle || '', eventsJsonStr,
                    executiveNotes || '', senderSignature || '', kpisJsonStr,
                    launchesJsonStr, topMediaJsonStr, token, id
                );

                return res.json({
                    success: true,
                    id: existing.id,
                    shareToken: token,
                    shareUrl: `/report/${token}`,
                    message: 'Report aggiornato con successo.'
                });
            }
        }

        // Insert new report
        const shareToken = uuidv4().replace(/-/g, '').slice(0, 16);
        const info = db.prepare(`
            INSERT INTO coverage_reports (
                user_id, team_id, client_id, client_name, client_logo, title,
                period_start, period_end, period_label, recipient_salutation, recipient_title,
                events_supported, executive_notes, sender_signature, summary_kpis,
                launches_json, top_media_json, share_token
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
            req.userId, req.teamId || null, clientId || null, clientName.trim(), clientLogo || '', reportTitle,
            periodStart || '', periodEnd || '', periodLabel || '', recipientSalutation || '', recipientTitle || '',
            eventsJsonStr, executiveNotes || '', senderSignature || '', kpisJsonStr,
            launchesJsonStr, topMediaJsonStr, shareToken
        );

        res.json({
            success: true,
            id: info.lastInsertRowid,
            shareToken,
            shareUrl: `/report/${shareToken}`,
            message: 'Report creato con successo.'
        });

    } catch (error) {
        console.error('Save report error:', error);
        res.status(500).json({ error: 'Errore nel salvataggio del report: ' + error.message });
    }
});

/**
 * DELETE /api/reports/:id
 * Deletes report and its PDF file
 */
router.delete('/:id', authMiddleware, (req, res) => {
    try {
        const db = getDb();
        const report = db.prepare('SELECT id, pdf_filename FROM coverage_reports WHERE id = ? AND (user_id = ? OR team_id = ?)').get(req.params.id, req.userId, req.teamId || 0);
        if (!report) {
            return res.status(404).json({ error: 'Report non trovato.' });
        }

        if (report.pdf_filename) {
            const filePath = path.join(__dirname, '..', 'output', report.pdf_filename);
            if (fs.existsSync(filePath)) {
                try { fs.unlinkSync(filePath); } catch(e) {}
            }
        }

        db.prepare('DELETE FROM coverage_reports WHERE id = ?').run(req.params.id);
        res.json({ success: true, message: 'Report eliminato con successo.' });
    } catch (error) {
        console.error('Delete report error:', error);
        res.status(500).json({ error: 'Errore durante l\'eliminazione del report.' });
    }
});

/**
 * POST /api/reports/:id/pdf
 * Generates an executive A4 presentation PDF using Puppeteer
 */
router.post('/:id/pdf', authMiddleware, async (req, res) => {
    try {
        const db = getDb();
        const report = db.prepare('SELECT * FROM coverage_reports WHERE id = ? AND (user_id = ? OR team_id = ?)').get(req.params.id, req.userId, req.teamId || 0);
        if (!report) {
            return res.status(404).json({ error: 'Report non trovato.' });
        }

        let summaryKPIs = {};
        let launches = [];
        let topMedia = [];
        let eventsSupported = [];

        try { summaryKPIs = JSON.parse(report.summary_kpis || '{}'); } catch(e) {}
        try { launches = JSON.parse(report.launches_json || '[]'); } catch(e) {}
        try { topMedia = JSON.parse(report.top_media_json || '[]'); } catch(e) {}
        try { eventsSupported = JSON.parse(report.events_supported || '[]'); } catch(e) {}

        const origin = req.protocol + '://' + req.get('host');
        const shareUrl = `${origin}/report/${report.share_token}`;

        const html = buildReportPDFHTML({
            title: report.title,
            clientName: report.client_name,
            clientLogo: report.client_logo,
            periodLabel: report.period_label,
            recipientSalutation: report.recipient_salutation,
            recipientTitle: report.recipient_title,
            eventsSupported,
            executiveNotes: report.executive_notes,
            senderSignature: report.sender_signature,
            summaryKPIs,
            launches,
            topMedia,
            shareUrl
        });

        // Launch browser & render PDF
        const browser = await launchBrowser();
        const page = await browser.newPage();
        await page.setContent(html, { waitUntil: 'load', timeout: 60000 });

        const filename = `Report_${report.client_name.replace(/[^a-zA-Z0-9]/g, '_')}_${Date.now()}.pdf`;
        const outputDir = path.join(__dirname, '..', 'output');
        if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true });
        }
        const filePath = path.join(outputDir, filename);

        await page.pdf({
            path: filePath,
            format: 'A4',
            printBackground: true,
            margin: { top: '12mm', bottom: '14mm', left: '12mm', right: '12mm' }
        });

        await browser.close();

        // Update pdf_filename in db
        db.prepare('UPDATE coverage_reports SET pdf_filename = ? WHERE id = ?').run(filename, report.id);

        res.json({
            success: true,
            filename,
            downloadUrl: `/api/pdf/download/${filename}`
        });

    } catch (error) {
        console.error('Generate report PDF error:', error);
        res.status(500).json({ error: 'Errore nella generazione del PDF: ' + error.message });
    }
});

/**
 * GET /api/reports/share-data/:token
 * Public endpoint to fetch report details for the client reader
 */
router.get('/share-data/:token', (req, res) => {
    try {
        const { token } = req.params;
        const db = getDb();
        const report = db.prepare('SELECT * FROM coverage_reports WHERE share_token = ?').get(token);

        if (!report) {
            return res.status(404).json({ error: 'Report non trovato o link scaduto.' });
        }

        let summaryKPIs = {};
        let launches = [];
        let topMedia = [];
        let eventsSupported = [];

        try { summaryKPIs = JSON.parse(report.summary_kpis || '{}'); } catch(e) {}
        try { launches = JSON.parse(report.launches_json || '[]'); } catch(e) {}
        try { topMedia = JSON.parse(report.top_media_json || '[]'); } catch(e) {}
        try { eventsSupported = JSON.parse(report.events_supported || '[]'); } catch(e) {}

        res.json({
            id: report.id,
            title: report.title,
            clientName: report.client_name,
            clientLogo: report.client_logo,
            periodLabel: report.period_label,
            recipientSalutation: report.recipient_salutation,
            recipientTitle: report.recipient_title,
            eventsSupported,
            executiveNotes: report.executive_notes,
            senderSignature: report.sender_signature,
            summaryKPIs,
            launches,
            topMedia,
            pdfFilename: report.pdf_filename,
            pdfUrl: report.pdf_filename ? `/api/pdf/download/${report.pdf_filename}` : null,
            createdAt: report.created_at
        });

    } catch (error) {
        console.error('Public share data error:', error);
        res.status(500).json({ error: 'Errore nel recupero del report pubblico.' });
    }
});

module.exports = router;
