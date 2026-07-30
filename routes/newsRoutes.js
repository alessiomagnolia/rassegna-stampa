const express = require('express');
const https = require('https');
const http = require('http');
const { authMiddleware } = require('../middleware/auth');
const { getDb } = require('../database/db');
const { GoogleDecoder } = require('google-news-url-decoder');
const cheerio = require('cheerio');
const decoder = new GoogleDecoder();
const { buildSiteQuery, PRIORITY_SOURCES, getAllDomains, getAllRssFeeds } = require('../config/prioritySources');

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
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
                'Accept-Language': 'it-IT,it;q=0.9,en-US;q=0.8,en;q=0.7'
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
        let sourceName = clean(tag(item, 'source')) || sourceNameDefault;
        const sourceUrl = attr(item, 'source', 'url');

        if (!title || !url) continue;

        // If sourceName is missing, extract publisher from title suffix (e.g. "Title - Fanpage")
        if ((!sourceName || sourceName === 'Web') && title.includes(' - ')) {
            const parts = title.split(' - ');
            if (parts.length > 1) {
                sourceName = parts[parts.length - 1].trim();
            }
        }

        // Try to derive domain from sourceUrl or url for favicon
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
            source: sourceName || domain || 'Fonte Web',
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
        const { q, from, to, includeSocial } = req.query;
        if (!q || !q.trim()) return res.status(400).json({ error: 'Parola chiave obbligatoria.' });

        const shouldExcludeSocial = includeSocial !== 'true';

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

        const socialDomains = [
            'facebook.com', 'fb.com', 'm.facebook.com',
            'twitter.com', 'x.com', 'mobile.twitter.com',
            'instagram.com', 'instagr.am',
            'linkedin.com',
            'tiktok.com',
            'youtube.com', 'youtu.be',
            'reddit.com',
            'pinterest.com', 'pinterest.it',
            'threads.net',
            't.me', 'telegram.org'
        ];

        // Flexible relevance & quality filter
        const isRelevantArticle = (art) => {
            if (!art || !art.title || !art.url) return false;
            const titleLower = (art.title || '').toLowerCase();
            const snippetLower = (art.snippet || '').toLowerCase();
            const urlLower = (art.url || '').toLowerCase();
            const domainLower = (art.domain || '').toLowerCase();
            const fullText = titleLower + ' ' + snippetLower + ' ' + urlLower;

            // 1. Reject non-latin foreign scripts (Cyrillic, CJK, etc.)
            if (hasForeignScript(fullText)) return false;

            // 2. Query word check: at least ONE main word from query must be in title, snippet, or URL
            const words = queryLower.split(/\s+/).filter(w => w.length > 1);
            if (words.length > 0) {
                const matchesQuery = words.some(w => fullText.includes(w));
                if (!matchesQuery) return false;
            }

            // 3. Exclude Social Networks by default if active
            if (shouldExcludeSocial) {
                if (socialDomains.some(sd => domainLower.includes(sd) || urlLower.includes(sd))) return false;
            }

            // 4. Reject spam / ad domains
            if (spamDomains.some(sd => domainLower.includes(sd))) return false;

            // 5. Reject spam / ad keywords in title
            if (spamKeywords.some(sk => titleLower.includes(sk))) return false;

            // 6. Reject non-Italian TLDs commonly associated with spam
            if (domainLower.endsWith('.ru') || domainLower.endsWith('.cn') || domainLower.endsWith('.jp') || domainLower.endsWith('.su') || domainLower.endsWith('.xyz') || domainLower.endsWith('.top')) {
                return false;
            }

            return true;
        };

        // --- SOLUTION 1: FAST, RELIABLE NEWS ENGINE WITH PRIORITY SOURCE HIGHLIGHTING ---
        console.log(`[Priority News Engine] Searching for: "${queryClean}" (excludeSocial: ${shouldExcludeSocial})...`);

        const qTerm = queryClean.replace(/["']/g, '').trim();
        const allPriorityDomains = getAllDomains();
        const domainToSourceMap = new Map();
        PRIORITY_SOURCES.forEach(s => {
            if (s.domain) {
                const cleanD = s.domain.toLowerCase().replace(/^www\./, '');
                domainToSourceMap.set(cleanD, s.name);
            }
        });

        // 6 fast, reliable parallel queries (combining Google News RSS + Bing News RSS)
        const searchUrls = [
            `https://news.google.com/rss/search?q=${encodeURIComponent(qTerm + dateFilters)}&hl=it&gl=IT&ceid=IT:it`,
            `https://news.google.com/rss/search?q=${encodeURIComponent(qTerm + ' notizie' + dateFilters)}&hl=it&gl=IT&ceid=IT:it`,
            `https://news.google.com/rss/search?q=${encodeURIComponent(qTerm + ' accordo' + dateFilters)}&hl=it&gl=IT&ceid=IT:it`,
            `https://news.google.com/rss/search?q=${encodeURIComponent(qTerm + ' comunicato' + dateFilters)}&hl=it&gl=IT&ceid=IT:it`,
            `https://www.bing.com/news/search?q=${encodeURIComponent(qTerm)}&format=rss&cc=IT`,
            `https://www.bing.com/news/search?q=${encodeURIComponent(qTerm + ' notizie')}&format=rss&cc=IT`
        ];

        const fetchWithTimeout = (url) => Promise.race([
            fetchText(url),
            new Promise((_, r) => setTimeout(() => r(new Error('Timeout 6s')), 6000))
        ]);

        const responses = await Promise.allSettled(searchUrls.map(u => fetchWithTimeout(u)));

        try {
            let rawResults = [];

            responses.forEach(res => {
                if (res.status === 'fulfilled' && res.value) {
                    const parsed = parseRSS(res.value);
                    rawResults.push(...parsed);
                }
            });

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

            rawResults = rawResults.filter(item => {
                if (!item.timestamp) return true;
                return item.timestamp >= fromTime && item.timestamp <= toTime;
            });

            // --- STEP 1: MANDATORY RESOLUTION OF DIRECT PUBLISHER URLS ---
            await Promise.all(rawResults.map(async (item) => {
                if (item.url && item.url.includes('news.google.com/rss/articles/')) {
                    try {
                        item.url = await Promise.race([
                            resolveGoogleNewsUrl(item.url),
                            new Promise(r => setTimeout(() => r(item.url), 4000))
                        ]);
                    } catch(e){}
                }
            }));

            // --- STEP 2: METADATA CLEANUP & PRIORITY DATABASE MATCHING ---
            let processedResults = [];

            for (const item of rawResults) {
                if (!item.url) continue;

                let realDomain = '';
                try {
                    realDomain = new URL(item.url).hostname.toLowerCase().replace(/^www\./, '');
                } catch(e) {}

                // Reject URLs that remain on Google/Bing or non-news domains
                if (!realDomain || realDomain.includes('google.') || realDomain.includes('bing.') || realDomain.includes('youtube.')) {
                    continue;
                }

                // Match against priority database sources (191 sources)
                let matchedSourceName = domainToSourceMap.get(realDomain);
                if (!matchedSourceName) {
                    for (const source of PRIORITY_SOURCES) {
                        const sDomain = (source.domain || '').toLowerCase().replace(/^www\./, '');
                        if (sDomain && (realDomain.endsWith(sDomain) || sDomain.endsWith(realDomain))) {
                            matchedSourceName = source.name;
                            break;
                        }
                    }
                }

                item.domain = realDomain;
                item.source = matchedSourceName || realDomain; // Priority name (e.g. "la Repubblica", "Il Tempo", "Il Sole 24 ORE") or domain name
                item.favicon = `https://www.google.com/s2/favicons?domain=${realDomain}&sz=32`; // Real newspaper logo!
                item._isPriority = !!matchedSourceName;

                processedResults.push(item);
            }


            // --- STEP 3: DEDUPLICATE BY REAL PUBLISHER DOMAIN + TITLE ---
            // (Allows identical press releases published across DIFFERENT outlets to ALL be kept!)
            const seenUrls = new Set();
            const seenDomainTitle = new Set();
            let uniqueResults = [];

            for (const item of processedResults) {
                const normUrl = (item.url || '').toLowerCase().trim();
                const domain = (item.domain || '').toLowerCase().trim();
                const normTitle = (item.title || '').toLowerCase().replace(/[^a-z0-9]/g, '').substring(0, 45);
                const domainTitleKey = `${domain}::${normTitle}`;

                if (normUrl && seenUrls.has(normUrl)) continue;
                if (domainTitleKey && seenDomainTitle.has(domainTitleKey)) continue;

                if (normUrl) seenUrls.add(normUrl);
                if (domainTitleKey) seenDomainTitle.add(domainTitleKey);

                uniqueResults.push(item);
            }

            // --- STEP 4: SORT BY PRIORITY SOURCE FIRST, THEN BY DATE ---
            uniqueResults.sort((a, b) => {
                if (a._isPriority && !b._isPriority) return -1;
                if (!a._isPriority && b._isPriority) return 1;
                return (b.timestamp || 0) - (a.timestamp || 0);
            });

            // Allow up to 300 results
            uniqueResults = uniqueResults.slice(0, 300);

            // --- STEP 5: APPLY RELEVANCE & SOCIAL FILTERS ---
            uniqueResults = uniqueResults.filter(isRelevantArticle).map(r => {
                const isPriority = r._isPriority || false;
                delete r.timestamp;
                delete r._isPriority;
                r.isPrioritySource = isPriority;
                return r;
            });

            if (uniqueResults.length > 0) {
                const priorityCount = uniqueResults.filter(r => r.isPrioritySource).length;
                console.log(`[Fast Multi-Engine Search] Query: "${queryClean}" → Restituiti ${uniqueResults.length} risultati (${priorityCount} da fonti prioritarie).`);
                return res.json({ results: uniqueResults, total: uniqueResults.length, query: queryClean, apiSource: 'multi-engine-rss' });
            }
        } catch(rssErr) {
            console.log(`[Fast Multi-Engine Search Notice]: ${rssErr.message}. Trying API fallbacks...`);
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
