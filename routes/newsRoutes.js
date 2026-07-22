const express = require('express');
const https = require('https');
const http = require('http');
const { authMiddleware } = require('../middleware/auth');
const { getDb } = require('../database/db');

const router = express.Router();

// ---------------------------------------------------------------------------
// HTTP helper — follows redirects, returns text
// ---------------------------------------------------------------------------
function fetchText(url, maxRedirects = 5) {
    return new Promise((resolve, reject) => {
        if (maxRedirects <= 0) return reject(new Error('Troppi redirect'));
        const lib = url.startsWith('https') ? https : http;
        const req = lib.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (compatible; Feedfetcher-Google; +http://www.google.com/feedfetcher.html)',
                'Accept': 'application/rss+xml, application/xml, text/xml, */*',
            }
        }, (res) => {
            if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
                try {
                    const next = new URL(res.headers.location, url).href;
                    fetchText(next, maxRedirects - 1).then(resolve).catch(reject);
                } catch { reject(new Error('Redirect URL invalido')); }
                return;
            }
            if (res.statusCode >= 400) {
                reject(new Error(`HTTP ${res.statusCode}`));
                return;
            }
            const chunks = [];
            res.on('data', c => chunks.push(c));
            res.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
            res.on('error', reject);
        });
        req.setTimeout(15000, () => { req.destroy(); reject(new Error('Timeout')); });
        req.on('error', reject);
    });
}

// ---------------------------------------------------------------------------
// Simple RSS/XML parser (no deps needed — cheerio/xml2js could work too)
// ---------------------------------------------------------------------------
function clean(str) {
    if (!str) return '';
    return str
        .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
        .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
        .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
        .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n)))
        .replace(/<[^>]*>/g, '')
        .trim();
}

function tag(xml, name) {
    const m = xml.match(new RegExp(`<${name}(?:[^>]*)>([\\s\\S]*?)<\\/${name}>`, 'i'));
    return m ? m[1] : '';
}

function attr(xml, tagName, attrName) {
    const m = xml.match(new RegExp(`<${tagName}[^>]*\\s${attrName}="([^"]*)"`, 'i'));
    return m ? m[1] : '';
}

function parseRSS(xmlText) {
    const results = [];
    const itemRegex = /<item>([\s\S]*?)<\/item>/gi;
    let match;

    while ((match = itemRegex.exec(xmlText)) !== null) {
        const item = match[1];

        // Google News link is inside <link> but may also be in <guid>
        let url = clean(tag(item, 'link')) || clean(tag(item, 'guid'));
        // Google News sometimes wraps URL in a redirect, keep as-is (still openable)
        url = url.replace(/\s+/g, '');

        const title = clean(tag(item, 'title'));
        const pubDate = tag(item, 'pubDate').trim();
        const description = clean(tag(item, 'description'));
        const sourceName = clean(tag(item, 'source'));
        const sourceUrl = attr(item, 'source', 'url');

        if (!title || !url) continue;

        // Try to derive domain from sourceUrl for favicon
        let domain = '';
        try { domain = new URL(sourceUrl || url).hostname.replace(/^www\./, ''); } catch {}

        // Parse date to DD/MM/YYYY
        let dateStr = '';
        try {
            const d = new Date(pubDate);
            if (!isNaN(d)) {
                dateStr = `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`;
            }
        } catch {}

        results.push({
            title,
            url,
            source: sourceName || domain || 'Fonte sconosciuta',
            domain,
            date: dateStr,
            snippet: description.slice(0, 220),
            favicon: domain ? `https://www.google.com/s2/favicons?domain=${domain}&sz=32` : '',
        });
    }

    return results;
}

// ---------------------------------------------------------------------------
// ROUTES
// ---------------------------------------------------------------------------

/**
 * GET /api/news/search?q=...&from=DD%2FMM%2FYYYY&to=DD%2FMM%2FYYYY
 */
router.get('/search', authMiddleware, async (req, res) => {
    try {
        const { q, from, to } = req.query;
        if (!q || !q.trim()) return res.status(400).json({ error: 'Parola chiave obbligatoria.' });

        // Build query string with optional date range (Google syntax: after/before)
        let query = q.trim();

        if (from) {
            // input: DD/MM/YYYY → Google: YYYY-MM-DD
            const parts = from.split('/');
            if (parts.length === 3) query += ` after:${parts[2]}-${parts[1]}-${parts[0]}`;
        }
        if (to) {
            const parts = to.split('/');
            if (parts.length === 3) query += ` before:${parts[2]}-${parts[1]}-${parts[0]}`;
        }

        const encoded = encodeURIComponent(query);
        const rssUrl = `https://news.google.com/rss/search?q=${encoded}&hl=it&gl=IT&ceid=IT:it`;

        console.log(`[News Search] Query: "${query}" → ${rssUrl}`);
        const xmlText = await fetchText(rssUrl);
        const results = parseRSS(xmlText);

        console.log(`[News Search] Trovati ${results.length} risultati`);
        res.json({ results, total: results.length, query: q });

    } catch (err) {
        console.error('[News Search] Errore:', err.message);
        res.status(500).json({ error: 'Errore durante la ricerca. Riprova.' });
    }
});

/**
 * GET /api/news/collections — list user's saved collections
 */
router.get('/collections', authMiddleware, (req, res) => {
    try {
        const db = getDb();
        const rows = db.prepare(
            `SELECT id, name, keyword, created_at,
             (SELECT COUNT(*) FROM json_each(links_json)) as link_count
             FROM link_collections WHERE user_id = ? ORDER BY created_at DESC`
        ).all(req.userId);
        res.json(rows);
    } catch (err) {
        console.error('[Collections] list error:', err);
        res.status(500).json({ error: 'Errore nel recupero delle raccolte.' });
    }
});

/**
 * POST /api/news/collections — save a new collection
 * Body: { name, keyword, links: [{title, url, source, date, snippet}] }
 */
router.post('/collections', authMiddleware, (req, res) => {
    try {
        const { name, keyword, links } = req.body;
        if (!name || !links || !Array.isArray(links) || links.length === 0) {
            return res.status(400).json({ error: 'Nome e almeno un link sono obbligatori.' });
        }
        const db = getDb();
        const result = db.prepare(
            `INSERT INTO link_collections (user_id, name, keyword, links_json) VALUES (?, ?, ?, ?)`
        ).run(req.userId, name.trim(), (keyword || '').trim(), JSON.stringify(links));

        res.json({ id: result.lastInsertRowid, name, count: links.length });
    } catch (err) {
        console.error('[Collections] save error:', err);
        res.status(500).json({ error: 'Errore nel salvataggio.' });
    }
});

/**
 * GET /api/news/collections/:id — get single collection with links
 */
router.get('/collections/:id', authMiddleware, (req, res) => {
    try {
        const db = getDb();
        const row = db.prepare(
            `SELECT * FROM link_collections WHERE id = ? AND user_id = ?`
        ).get(req.params.id, req.userId);
        if (!row) return res.status(404).json({ error: 'Raccolta non trovata.' });

        let links = [];
        try { links = JSON.parse(row.links_json); } catch {}
        res.json({ id: row.id, name: row.name, keyword: row.keyword, links, created_at: row.created_at });
    } catch (err) {
        res.status(500).json({ error: 'Errore nel recupero.' });
    }
});

/**
 * DELETE /api/news/collections/:id
 */
router.delete('/collections/:id', authMiddleware, (req, res) => {
    try {
        const db = getDb();
        db.prepare(`DELETE FROM link_collections WHERE id = ? AND user_id = ?`)
          .run(req.params.id, req.userId);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: "Errore nell'eliminazione." });
    }
});

module.exports = router;
