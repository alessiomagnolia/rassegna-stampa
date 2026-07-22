const express = require('express');
const https = require('https');
const http = require('http');
const { authMiddleware } = require('../middleware/auth');
const { getDb } = require('../database/db');
const { GoogleDecoder } = require('google-news-url-decoder');
const decoder = new GoogleDecoder();

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

function getFinalUrl(url, maxRedirects = 5) {
    return new Promise((resolve) => {
        if (maxRedirects <= 0) return resolve(url);
        const lib = url.startsWith('https') ? https : http;
        const req = lib.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
        }, (res) => {
            if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
                try {
                    const next = new URL(res.headers.location, url).href;
                    getFinalUrl(next, maxRedirects - 1).then(resolve);
                } catch { resolve(url); }
                return;
            }
            // For Google News, sometimes it returns 200 OK with an intermediate consent/redirect page.
            // If it's 200, we can quickly check the first chunks of HTML for a meta refresh or specific redirect tag.
            // But to avoid the bug where we download the entire publisher page and extract random links,
            // we will only parse it if the domain is still google.com.
            if (res.statusCode === 200 && url.includes('google.com')) {
                let html = '';
                res.on('data', chunk => {
                    html += chunk.toString('utf8');
                    // Stop reading after 15KB, Google's redirect is always at the top
                    if (html.length > 15000) req.destroy();
                });
                res.on('end', () => {
                    let m = html.match(/content="[^"]*url=([^"]+)"/i);
                    if (m && !m[1].includes('google.com')) return resolve(m[1].replace(/&amp;/g, '&'));
                    
                    m = html.match(/data-n-v-u="([^"]+)"/i);
                    if (m && !m[1].includes('google.com')) return resolve(m[1].replace(/&amp;/g, '&'));
                    
                    m = html.match(/data-url="([^"]+)"/i);
                    if (m && !m[1].includes('google.com')) return resolve(m[1].replace(/&amp;/g, '&'));
                    
                    // New Google News format (2024): Just find the first external link
                    let aTags = html.match(/<a[^>]+href="(https?:\/\/[^"]+)"/gi);
                    if (aTags) {
                        for (let aTag of aTags) {
                            let match = aTag.match(/href="(https?:\/\/[^"]+)"/i);
                            if (match) {
                                let matchUrl = match[1].replace(/&amp;/g, '&');
                                if (!matchUrl.includes('google.com') && 
                                    !matchUrl.includes('googleusercontent.com') && 
                                    !matchUrl.includes('gstatic.com') && 
                                    !matchUrl.includes('schema.org')) {
                                    return resolve(matchUrl);
                                }
                            }
                        }
                    }
                    resolve(url);
                });
                return;
            }
            req.destroy();
            resolve(url);
        });
        req.setTimeout(5000, () => { req.destroy(); resolve(url); });
        req.on('error', () => resolve(url));
    });
}

async function resolveGoogleNewsUrl(url) {
    if (!url.includes('news.google.com/rss/articles/')) return url;
    
    // First try the Base64 decode trick for speed
    try {
        const parts = url.split('/articles/');
        let b64 = parts[1].split('?')[0];
        b64 = b64.replace(/-/g, '+').replace(/_/g, '/');
        while (b64.length % 4) b64 += '=';
        const decoded = Buffer.from(b64, 'base64').toString('latin1');
        const match = decoded.match(/(https?:\/\/[^\s"'\>\x00-\x1F\x7F]+)/);
        if (match && !match[1].includes('google.com')) {
            return match[1];
        }
    } catch(e){}

    // Use the official decoder
    try {
        const result = await decoder.decode(url);
        if (result && result.status && result.decoded_url) {
            return result.decoded_url;
        }
    } catch(e) {}

    // Fallback to HTTP redirect follower
    try {
        const finalUrl = await getFinalUrl(url, 3);
        if (finalUrl && finalUrl !== url) return finalUrl;
    } catch(e) {}
    
    return url;
}

function parseRSS(xmlText, sourceNameDefault = '') {
    const results = [];
    const itemRegex = /<item>([\s\S]*?)<\/item>/gi;
    let match;

    while ((match = itemRegex.exec(xmlText)) !== null) {
        const item = match[1];

        // Google News link is inside <link> but may also be in <guid>
        let url = clean(tag(item, 'link')) || clean(tag(item, 'guid'));
        url = url.replace(/\s+/g, '');

        const title = clean(tag(item, 'title'));
        const pubDate = tag(item, 'pubDate').trim();
        const description = clean(tag(item, 'description'));
        const sourceName = clean(tag(item, 'source')) || sourceNameDefault;
        const sourceUrl = attr(item, 'source', 'url');

        if (!title || !url) continue;

        // Try to derive domain from sourceUrl for favicon
        let domain = '';
        try { domain = new URL(sourceUrl || url).hostname.replace(/^www\./, ''); } catch {}

        // Parse date to DD/MM/YYYY
        let dateStr = '';
        let timestamp = 0;
        try {
            const d = new Date(pubDate);
            if (!isNaN(d)) {
                timestamp = d.getTime();
                dateStr = `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`;
            }
        } catch {}

        results.push({
            title,
            url,
            source: sourceName || domain || 'Fonte sconosciuta',
            domain,
            date: dateStr,
            timestamp,
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

        let fetchPromises = [];

        // Google News Queries
        if (from || to) {
            let googleQuery = query;
            if (from) {
                const parts = from.split('/');
                if (parts.length === 3) googleQuery += ` after:${parts[2]}-${parts[1]}-${parts[0]}`;
            }
            if (to) {
                const parts = to.split('/');
                if (parts.length === 3) googleQuery += ` before:${parts[2]}-${parts[1]}-${parts[0]}`;
            }
            
            const encoded = encodeURIComponent(googleQuery);
            fetchPromises.push(fetchText(`https://news.google.com/rss/search?q=${encoded}&hl=it&gl=IT&ceid=IT:it`).then(xml => parseRSS(xml)));
        } else {
            const encodedStandard = encodeURIComponent(query);
            const encodedRecent = encodeURIComponent(query + ' when:1d');
            fetchPromises.push(fetchText(`https://news.google.com/rss/search?q=${encodedStandard}&hl=it&gl=IT&ceid=IT:it`).then(xml => parseRSS(xml)));
            fetchPromises.push(fetchText(`https://news.google.com/rss/search?q=${encodedRecent}&hl=it&gl=IT&ceid=IT:it`).then(xml => parseRSS(xml)));
        }
        
        // Bing Web Query (copre blog e siti web generici non registrati come news)
        const bingEncoded = encodeURIComponent(query);
        const bingPages = [1, 11, 21, 31]; // 4 pages = ~40 results
        for (const first of bingPages) {
            fetchPromises.push(
                fetchText(`https://www.bing.com/search?q=${bingEncoded}&format=rss&first=${first}`)
                    .then(xml => parseRSS(xml, 'Web'))
                    .catch(err => {
                        console.error("Bing Web Error:", err.message);
                        return []; // Don't crash if Bing fails
                    })
            );
        }

        const resultArrays = await Promise.all(fetchPromises);
        let allResults = [];
        for (const arr of resultArrays) {
            allResults = allResults.concat(arr);
        }

        // Post-filtro per data (utile perché Bing Web Search RSS potrebbe ignorare il range se non specificato bene)
        let fromTime = 0;
        let toTime = Infinity;
        if (from) {
            const parts = from.split('/');
            if (parts.length === 3) fromTime = new Date(`${parts[2]}-${parts[1]}-${parts[0]}T00:00:00Z`).getTime();
        }
        if (to) {
            const parts = to.split('/');
            if (parts.length === 3) toTime = new Date(`${parts[2]}-${parts[1]}-${parts[0]}T23:59:59Z`).getTime();
        }
        
        allResults = allResults.filter(item => {
            if (!item.timestamp) return true; // Keep if we can't parse date
            return item.timestamp >= fromTime && item.timestamp <= toTime;
        });

        // Deduplicate by title (since URLs might be Google News links before resolution)
        const seenTitles = new Set();
        let uniqueResults = [];
        for (const item of allResults) {
            const normalizedTitle = item.title.toLowerCase().substring(0, 50); // first 50 chars for fuzzy dedupe
            if (!seenTitles.has(normalizedTitle)) {
                seenTitles.add(normalizedTitle);
                uniqueResults.push(item);
            }
        }
        
        // Resolve Google News and Bing URLs in parallel
        console.log(`[News Search] Resolving URLs for ${uniqueResults.length} articles...`);
        await Promise.all(uniqueResults.map(async (item) => {
            // Bing Tracking Links
            if (item.url.includes('bing.com/news/apiclick.aspx')) {
                try {
                    const u = new URL(item.url);
                    if (u.searchParams.has('url')) {
                        item.url = decodeURIComponent(u.searchParams.get('url'));
                    }
                } catch(e){}
            }
            
            // Google News RSS Links
            if (item.url.includes('news.google.com/rss/articles/')) {
                item.url = await resolveGoogleNewsUrl(item.url);
            }

            // Update domain and favicon based on resolved URL
            try {
                const domain = new URL(item.url).hostname.replace(/^www\./, '');
                item.domain = domain;
                item.favicon = `https://www.google.com/s2/favicons?domain=${domain}&sz=32`;
                if (item.source === 'Web' || !item.source) {
                    item.source = domain;
                }
            } catch(e){}
        }));

        // Sort by timestamp descending (newest first)
        uniqueResults.sort((a, b) => b.timestamp - a.timestamp);

        // Remove the internal timestamp before sending to client
        uniqueResults = uniqueResults.map(r => {
            delete r.timestamp;
            return r;
        });

        console.log(`[News Search] Query: "${query}" → Trovati ${uniqueResults.length} risultati unici`);
        res.json({ results: uniqueResults, total: uniqueResults.length, query: q });

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
