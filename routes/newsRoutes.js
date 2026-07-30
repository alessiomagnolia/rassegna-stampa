const express = require('express');
const https = require('https');
const http = require('http');
const { authMiddleware } = require('../middleware/auth');
const { getDb } = require('../database/db');
const { GoogleDecoder } = require('google-news-url-decoder');
const cheerio = require('cheerio');
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

function fetchJson(url) {
    return new Promise((resolve, reject) => {
        const lib = url.startsWith('https') ? https : http;
        const req = lib.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'application/json, */*'
            }
        }, (res) => {
            if (res.statusCode >= 400) {
                return reject(new Error(`HTTP ${res.statusCode}`));
            }
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    resolve(JSON.parse(data));
                } catch (e) {
                    reject(new Error('Invalid JSON response'));
                }
            });
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

        // Clean user input: strip any user-entered quotes automatically
        const queryClean = q.replace(/^"+|"+$/g, '').trim();
        const queryLower = queryClean.toLowerCase();

        // Non-latin foreign script detection (Russian, Chinese, Japanese, Korean, Arabic)
        const hasForeignScript = (str) => /[\u0400-\u04FF\u4E00-\u9FFF\u3040-\u30FF\u0600-\u06FF\u1100-\u11FF]/.test(str);

        const spamKeywords = [
            'sponsoriz', 'pubblicit', 'promo', 'offerta', 'sconto', 'coupon',
            'casino', 'poker', 'scommess', 'slot', 'affiliat', 'compra ', 'acquista '
        ];

        const spamDomains = [
            'amazon.', 'ebay.', 'aliexpress.', 'temu.', 'shein.', 'booking.', 'tripadvisor.', 'pinterest.'
        ];

        // Strict filter function to ensure ironclad relevance & quality
        const isRelevantArticle = (art) => {
            if (!art || !art.title || !art.url) return false;
            const titleLower = (art.title || '').toLowerCase();
            const snippetLower = (art.snippet || '').toLowerCase();
            const fullText = titleLower + ' ' + snippetLower;
            const domainLower = (art.domain || '').toLowerCase();

            // 1. Reject non-latin foreign scripts (Cyrillic, CJK, etc.)
            if (hasForeignScript(fullText)) return false;

            // 2. FERROUS RELEVANCE RULE: ALL words in user query MUST be present in title or snippet!
            const words = queryLower.split(/\s+/).filter(w => w.length > 1);
            if (words.length > 0) {
                const allWordsPresent = words.every(w => fullText.includes(w));
                if (!allWordsPresent) return false;
            }

            // 3. Reject spam / ad domains
            if (spamDomains.some(sd => domainLower.includes(sd))) return false;

            // 4. Reject spam / ad keywords in title
            if (spamKeywords.some(sk => titleLower.includes(sk))) return false;

            // 5. Reject non-Italian TLDs commonly associated with spam
            if (domainLower.endsWith('.ru') || domainLower.endsWith('.cn') || domainLower.endsWith('.jp') || domainLower.endsWith('.su') || domainLower.endsWith('.xyz') || domainLower.endsWith('.top')) {
                return false;
            }

            return true;
        };

        // --- PRIMARY SEARCH: Google News RSS (Official Italian Feed) ---
        console.log(`[Google News RSS Search] Querying official feed for: "${queryClean}"...`);
        const exactQuery = '"' + queryClean + '"';
        let googleQuery = exactQuery + ' -site:wikipedia.org -site:it.wikipedia.org';
        if (from) {
            const parts = from.split('/');
            if (parts.length === 3) googleQuery += ` after:${parts[2]}-${parts[1]}-${parts[0]}`;
        }
        if (to) {
            const parts = to.split('/');
            if (parts.length === 3) googleQuery += ` before:${parts[2]}-${parts[1]}-${parts[0]}`;
        }

        try {
            const encodedQuery = encodeURIComponent(googleQuery);
            const rssXml = await fetchText(`https://news.google.com/rss/search?q=${encodedQuery}&hl=it&gl=IT&ceid=IT:it`);
            let allResults = parseRSS(rssXml);

            // Filter by date range if provided
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
                if (!item.timestamp) return true;
                return item.timestamp >= fromTime && item.timestamp <= toTime;
            });

            // Deduplicate by title
            const seenTitles = new Set();
            let uniqueResults = [];
            for (const item of allResults) {
                const normalizedTitle = item.title.toLowerCase().substring(0, 50);
                if (!seenTitles.has(normalizedTitle)) {
                    seenTitles.add(normalizedTitle);
                    uniqueResults.push(item);
                }
            }

            uniqueResults.sort((a, b) => b.timestamp - a.timestamp);
            uniqueResults = uniqueResults.slice(0, 50);

            // Resolve Google News RSS links
            await Promise.all(uniqueResults.map(async (item) => {
                if (item.url && item.url.includes('news.google.com/rss/articles/')) {
                    item.url = await resolveGoogleNewsUrl(item.url);
                }
                if (!item.url) return;
                try {
                    const domain = new URL(item.url).hostname.replace(/^www\./, '');
                    item.domain = domain;
                    item.favicon = `https://www.google.com/s2/favicons?domain=${domain}&sz=32`;
                    if (!item.source || item.source === 'Web') {
                        item.source = domain;
                    }
                } catch(e){}
            }));

            // Apply strict relevance filter to RSS results
            uniqueResults = uniqueResults.filter(isRelevantArticle).map(r => {
                delete r.timestamp;
                return r;
            });

            if (uniqueResults.length > 0) {
                console.log(`[Google News RSS Search] Query: "${queryClean}" → Trovati ${uniqueResults.length} risultati puliti e pertinenti.`);
                return res.json({ results: uniqueResults, total: uniqueResults.length, query: queryClean, apiSource: 'google-rss' });
            }
        } catch(rssErr) {
            console.log(`[Google News RSS Notice]: ${rssErr.message}. Trying API fallbacks...`);
        }

        // --- SECONDARY FALLBACK: GNews API & NewsAPI.org ---
        const apiKey = process.env.GNEWS_API_KEY || 
                       process.env.NEWSAPI_KEY || 
                       process.env.NEWS_API_KEY || 
                       process.env.NEWS_KEY || 
                       process.env.API_KEY_NEWS || 
                       process.env.API_KEY;

        if (apiKey) {
            console.log(`[News API Fallback] Searching with API Key for: "${queryClean}"...`);

            // 1. Try GNews API
            try {
                let gnewsUrl = `https://gnews.io/api/v4/search?q=${encodeURIComponent('"' + queryClean + '"')}&lang=it&country=it&in=title,description&max=30&apikey=${apiKey}`;
                if (from) {
                    const parts = from.split('/');
                    if (parts.length === 3) gnewsUrl += `&from=${parts[2]}-${parts[1]}-${parts[0]}T00:00:00Z`;
                }
                if (to) {
                    const parts = to.split('/');
                    if (parts.length === 3) gnewsUrl += `&to=${parts[2]}-${parts[1]}-${parts[0]}T23:59:59Z`;
                }

                const data = await fetchJson(gnewsUrl);
                if (data && data.articles && data.articles.length > 0) {
                    let results = data.articles.map(art => {
                        const pubDate = new Date(art.publishedAt);
                        const dateStr = !isNaN(pubDate)
                            ? `${String(pubDate.getDate()).padStart(2,'0')}/${String(pubDate.getMonth()+1).padStart(2,'0')}/${pubDate.getFullYear()}`
                            : '';
                        let domain = '';
                        try { domain = new URL(art.url).hostname.replace(/^www\./i, ''); } catch(e){}

                        return {
                            title: art.title,
                            url: art.url,
                            source: art.source?.name || domain || 'Fonte Web',
                            domain,
                            date: dateStr,
                            snippet: (art.description || art.content || '').slice(0, 220),
                            image: art.image || null,
                            favicon: domain ? `https://www.google.com/s2/favicons?domain=${domain}&sz=32` : ''
                        };
                    }).filter(isRelevantArticle);

                    if (results.length > 0) {
                        return res.json({ results, total: results.length, query: queryClean, apiSource: 'gnews' });
                    }
                }
            } catch (err) {
                console.log(`[GNews API Notice]: ${err.message}`);
            }

            // 2. Try NewsAPI.org
            try {
                let newsApiUrl = `https://newsapi.org/v2/everything?q=${encodeURIComponent('"' + queryClean + '"')}&language=it&sortBy=publishedAt&pageSize=30&apiKey=${apiKey}`;
                if (from) {
                    const parts = from.split('/');
                    if (parts.length === 3) newsApiUrl += `&from=${parts[2]}-${parts[1]}-${parts[0]}`;
                }
                if (to) {
                    const parts = to.split('/');
                    if (parts.length === 3) newsApiUrl += `&to=${parts[2]}-${parts[1]}-${parts[0]}`;
                }

                const data = await fetchJson(newsApiUrl);
                if (data && data.status === 'ok' && data.articles && data.articles.length > 0) {
                    let results = data.articles.map(art => {
                        const pubDate = new Date(art.publishedAt);
                        const dateStr = !isNaN(pubDate)
                            ? `${String(pubDate.getDate()).padStart(2,'0')}/${String(pubDate.getMonth()+1).padStart(2,'0')}/${pubDate.getFullYear()}`
                            : '';
                        let domain = '';
                        try { domain = new URL(art.url).hostname.replace(/^www\./i, ''); } catch(e){}

                        return {
                            title: art.title,
                            url: art.url,
                            source: art.source?.name || domain || 'Fonte Web',
                            domain,
                            date: dateStr,
                            snippet: (art.description || art.content || '').slice(0, 220),
                            image: art.urlToImage || null,
                            favicon: domain ? `https://www.google.com/s2/favicons?domain=${domain}&sz=32` : ''
                        };
                    }).filter(isRelevantArticle);

                    if (results.length > 0) {
                        return res.json({ results, total: results.length, query: queryClean, apiSource: 'newsapi' });
                    }
                }
            } catch (err) {
                console.log(`[NewsAPI Notice]: ${err.message}`);
            }
        }

        res.json({ results: [], total: 0, query: queryClean });

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
