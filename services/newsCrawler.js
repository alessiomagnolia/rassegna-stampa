const https = require('https');
const http = require('http');
const { getDb } = require('../database/db');
const { getAllRssFeeds, PRIORITY_SOURCES } = require('../config/prioritySources');

// ---------------------------------------------------------------------------
// HTTP helper — follows redirects, returns text with timeout
// ---------------------------------------------------------------------------
function fetchText(url, timeoutMs = 8000, maxRedirects = 3) {
    return new Promise((resolve, reject) => {
        if (maxRedirects <= 0) return reject(new Error('Troppi redirect'));
        if (!url || !url.startsWith('http')) return reject(new Error('URL invalido'));

        const lib = url.startsWith('https') ? https : http;
        const req = lib.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
                'Accept': 'application/xml, text/xml, application/rss+xml, */*'
            }
        }, (res) => {
            if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
                try {
                    const next = new URL(res.headers.location, url).href;
                    fetchText(next, timeoutMs, maxRedirects - 1).then(resolve).catch(reject);
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

        req.setTimeout(timeoutMs, () => { req.destroy(); reject(new Error('Timeout')); });
        req.on('error', reject);
    });
}

// ---------------------------------------------------------------------------
// RSS XML Parser
// ---------------------------------------------------------------------------
function parseRSSFeed(xmlText, sourceMeta) {
    const results = [];
    if (!xmlText) return results;

    const clean = str => (str || '').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/gi, '$1').replace(/<[^>]+>/g, '').trim();
    const tag = (block, tagName) => {
        const m = new RegExp(`<${tagName}[^>]*>([\\s\\S]*?)<\\/${tagName}>`, 'i').exec(block);
        return m ? m[1] : '';
    };

    const itemRegex = /<item>([\s\S]*?)<\/item>/gi;
    let match;

    while ((match = itemRegex.exec(xmlText)) !== null) {
        const item = match[1];

        let url = clean(tag(item, 'link')) || clean(tag(item, 'guid'));
        url = url.replace(/\s+/g, '');
        if (!url || !url.startsWith('http')) continue;

        const title = clean(tag(item, 'title'));
        if (!title || title.length < 5) continue;

        const pubDate = tag(item, 'pubDate').trim();
        const description = clean(tag(item, 'description'));

        let timestamp = Date.now();
        let dateStr = '';
        if (pubDate) {
            const d = new Date(pubDate);
            if (!isNaN(d.getTime())) {
                timestamp = d.getTime();
                dateStr = `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`;
            }
        }
        if (!dateStr) {
            const d = new Date();
            dateStr = `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`;
        }

        const domain = (sourceMeta.domain || '').toLowerCase().replace(/^www\./, '');

        results.push({
            url,
            title,
            snippet: description.slice(0, 260),
            source_name: sourceMeta.name,
            domain,
            category: sourceMeta.category || 'web_digital',
            published_at: dateStr,
            timestamp,
            favicon: `https://www.google.com/s2/favicons?domain=${domain}&sz=32`
        });
    }

    return results;
}

// ---------------------------------------------------------------------------
// Run single crawler batch across all 191 priority RSS feeds
// ---------------------------------------------------------------------------
async function runCrawlerBatch() {
    console.log('[News Crawler] Starting background RSS crawling batch...');
    const feeds = getAllRssFeeds();
    if (!feeds || feeds.length === 0) return;

    const db = getDb();
    const insertStmt = db.prepare(`
        INSERT OR IGNORE INTO indexed_articles 
        (url, title, snippet, source_name, domain, category, published_at, timestamp, favicon)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    let totalNewCount = 0;
    const batchSize = 10; // Process 10 RSS feeds in parallel per chunk

    for (let i = 0; i < feeds.length; i += batchSize) {
        const chunk = feeds.slice(i, i + batchSize);
        const results = await Promise.allSettled(chunk.map(f => fetchText(f.rss, 8000)));

        results.forEach((res, idx) => {
            if (res.status === 'fulfilled' && res.value) {
                const meta = chunk[idx];
                const items = parseRSSFeed(res.value, meta);

                db.transaction(() => {
                    items.forEach(item => {
                        const info = insertStmt.run(
                            item.url,
                            item.title,
                            item.snippet,
                            item.source_name,
                            item.domain,
                            item.category,
                            item.published_at,
                            item.timestamp,
                            item.favicon
                        );
                        if (info.changes > 0) totalNewCount++;
                    });
                })();
            }
        });
    }

    // Clean up articles older than 60 days to keep database size optimal
    try {
        const sixtyDaysAgo = Date.now() - (60 * 24 * 60 * 60 * 1000);
        db.prepare(`DELETE FROM indexed_articles WHERE timestamp > 0 AND timestamp < ?`).run(sixtyDaysAgo);
    } catch (e) {}

    const totalInDb = db.prepare(`SELECT COUNT(*) as cnt FROM indexed_articles`).get().cnt;
    console.log(`[News Crawler Batch Finished] Inseriti ${totalNewCount} nuovi articoli. Totale articoli indicizzati nel DB: ${totalInDb}`);
}

// ---------------------------------------------------------------------------
// Start Background Crawler Scheduler
// ---------------------------------------------------------------------------
function startCrawlerScheduler(intervalMinutes = 10) {
    // Run initial crawler batch 5 seconds after server start
    setTimeout(() => {
        runCrawlerBatch().catch(err => console.error('[News Crawler Error]:', err.message));
    }, 5000);

    // Schedule periodic execution
    const intervalMs = Math.max(intervalMinutes, 3) * 60 * 1000;
    setInterval(() => {
        runCrawlerBatch().catch(err => console.error('[News Crawler Error]:', err.message));
    }, intervalMs);

    console.log(`[News Crawler Scheduler] Programmazione attiva ogni ${intervalMinutes} minuti.`);
}

module.exports = {
    runCrawlerBatch,
    startCrawlerScheduler
};
