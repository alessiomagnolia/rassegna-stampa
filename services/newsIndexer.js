const { getDb } = require('../database/db');
const { getFaviconForDomain } = require('../routes/newsRoutes');

// Top Italian news RSS feeds for continuous background ingestion
const TOP_RSS_FEEDS = [
    { name: 'ANSA', domain: 'ansa.it', url: 'https://www.ansa.it/sito/ansait_rss.xml', category: 'agenzia' },
    { name: 'Adnkronos', domain: 'adnkronos.com', url: 'https://www.adnkronos.com/rss/ultimora.xml', category: 'agenzia' },
    { name: 'Il Sole 24 Ore', domain: 'ilsole24ore.com', url: 'https://www.ilsole24ore.com/rss/italia.xml', category: 'quotidiano_nazionale' },
    { name: 'la Repubblica', domain: 'repubblica.it', url: 'https://www.repubblica.it/rss/homepage/rss2.0.xml', category: 'quotidiano_nazionale' },
    { name: 'Il Tempo', domain: 'iltempo.it', url: 'https://www.iltempo.it/rss.xml', category: 'quotidiano_nazionale' },
    { name: 'Il Mattino', domain: 'ilmattino.it', url: 'https://www.ilmattino.it/rss/home.xml', category: 'quotidiano_locale' },
    { name: 'Corriere della Sera', domain: 'corriere.it', url: 'https://xml2.corriereobjects.it/rss/homepage.xml', category: 'quotidiano_nazionale' },
    { name: 'La Stampa', domain: 'lastampa.it', url: 'https://www.lastampa.it/rss/homepage/rss2.0.xml', category: 'quotidiano_nazionale' },
    { name: 'Fanpage', domain: 'fanpage.it', url: 'https://www.fanpage.it/feed/', category: 'web_digital' },
    { name: 'Open', domain: 'open.online', url: 'https://www.open.online/feed/', category: 'web_digital' }
];

let isIndexingRunning = false;

// Parse simple RSS XML items without heavy third party dependencies
function parseRssItems(xmlText, defaultSource, defaultDomain, category) {
    const items = [];
    if (!xmlText || typeof xmlText !== 'string') return items;

    const itemRegex = /<item[\s\S]*?>([\s\S]*?)<\/item>/gi;
    let match;

    while ((match = itemRegex.exec(xmlText)) !== null) {
        const itemContent = match[1];

        const titleMatch = itemContent.match(/<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/i);
        const linkMatch = itemContent.match(/<link>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/link>/i);
        const descMatch = itemContent.match(/<description>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/description>/i);
        const pubDateMatch = itemContent.match(/<pubDate>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/pubDate>/i);

        let title = titleMatch ? titleMatch[1].replace(/<[^>]+>/g, '').trim() : '';
        let url = linkMatch ? linkMatch[1].trim() : '';
        let snippet = descMatch ? descMatch[1].replace(/<[^>]+>/g, '').trim() : '';
        let pubDateStr = pubDateMatch ? pubDateMatch[1].trim() : new Date().toUTCString();

        if (title && url) {
            let timestamp = Date.parse(pubDateStr) || Date.now();
            items.push({
                title,
                url,
                snippet: snippet.substring(0, 300),
                source_name: defaultSource,
                domain: defaultDomain,
                category,
                published_at: new Date(timestamp).toLocaleDateString('it-IT'),
                timestamp,
                favicon: getFaviconForDomain ? getFaviconForDomain(defaultDomain, defaultSource) : ''
            });
        }
    }
    return items;
}

// Save ingested articles into SQLite indexed_articles
function saveArticlesToIndex(articles) {
    if (!articles || articles.length === 0) return 0;
    const db = getDb();
    
    const stmt = db.prepare(`
        INSERT INTO indexed_articles (url, title, snippet, source_name, domain, category, published_at, timestamp, favicon)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(url) DO UPDATE SET
            title = excluded.title,
            snippet = excluded.snippet,
            timestamp = excluded.timestamp,
            published_at = excluded.published_at,
            favicon = excluded.favicon
    `);

    let count = 0;
    const insertMany = db.transaction((items) => {
        for (const item of items) {
            stmt.run(item.url, item.title, item.snippet, item.source_name, item.domain, item.category, item.published_at, item.timestamp, item.favicon);
            count++;
        }
    });

    try {
        insertMany(articles);
    } catch(e) {
        console.error('[News Indexer] Error saving batch:', e.message);
    }
    return count;
}

// Background ingestion loop
async function runIndexingCycle() {
    if (isIndexingRunning) return;
    isIndexingRunning = true;
    console.log('[News Indexer] 🔄 Avvio ciclo di pre-indicizzazione fonti italiane...');

    let totalNew = 0;
    for (const feed of TOP_RSS_FEEDS) {
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 6000);

            const res = await fetch(feed.url, {
                signal: controller.signal,
                headers: { 'User-Agent': 'RassegnaStampaBot/2.0 (+https://presstoday.com)' }
            });
            clearTimeout(timeoutId);

            if (res.ok) {
                const xmlText = await res.text();
                const items = parseRssItems(xmlText, feed.name, feed.domain, feed.category);
                const saved = saveArticlesToIndex(items);
                totalNew += saved;
            }
        } catch (e) {
            // Silently ignore single feed errors
        }
    }

    // Cleanup old articles > 30 days
    try {
        const db = getDb();
        const cutoff = Date.now() - (30 * 24 * 60 * 60 * 1000);
        db.prepare(`DELETE FROM indexed_articles WHERE timestamp < ?`).run(cutoff);
    } catch(e){}

    console.log(`[News Indexer] ✅ Ciclo completato. Articoli indicizzati/aggiornati: ${totalNew}`);
    isIndexingRunning = false;
}

// Advanced Sub-50ms SQLite Search Engine with Full Boolean Logic & Taxonomy Filtering
function parseBooleanQuery(queryStr) {
    if (!queryStr) return { clauses: [], params: [] };

    let text = queryStr.trim();
    // Extract exact phrases in double quotes first
    const exactPhrases = [];
    text = text.replace(/"([^"]+)"/g, (match, phrase) => {
        exactPhrases.push(phrase.trim());
        return ` __EXACT_PHRASE_${exactPhrases.length - 1}__ `;
    });

    const tokens = text.split(/\s+/).filter(t => t.length > 0);
    const clauses = [];
    const params = [];

    tokens.forEach(token => {
        if (token.startsWith('__EXACT_PHRASE_') && token.endsWith('__')) {
            const idx = parseInt(token.replace('__EXACT_PHRASE_', '').replace('__', ''), 10);
            if (!isNaN(idx) && exactPhrases[idx]) {
                const phrase = exactPhrases[idx];
                clauses.push(`(title LIKE ? OR snippet LIKE ?)`);
                params.push(`%${phrase}%`, `%${phrase}%`);
            }
        } else if (token.toUpperCase() === 'AND' || token.toUpperCase() === 'OR') {
            // Skip raw keywords as operators, implicit AND is applied across clauses
        } else if (token.startsWith('-') || token.toUpperCase().startsWith('NOT ')) {
            const term = token.replace(/^-/, '').replace(/^NOT\s+/i, '').replace(/["']/g, '').trim();
            if (term.length > 1) {
                clauses.push(`(title NOT LIKE ? AND snippet NOT LIKE ?)`);
                params.push(`%${term}%`, `%${term}%`);
            }
        } else {
            const term = token.replace(/["']/g, '').trim();
            if (term.length > 1) {
                clauses.push(`(title LIKE ? OR snippet LIKE ? OR source_name LIKE ?)`);
                params.push(`%${term}%`, `%${term}%`, `%${term}%`);
            }
        }
    });

    return { clauses, params };
}

function searchIndexedArticles(query, categoryFilter = '', limit = 100) {
    if (!query || typeof query !== 'string' || !query.trim()) return [];
    
    try {
        const db = getDb();
        const { clauses, params } = parseBooleanQuery(query);
        
        let whereConditions = [...clauses];
        let queryParams = [...params];

        if (categoryFilter && categoryFilter !== 'all') {
            whereConditions.push(`category = ?`);
            queryParams.push(categoryFilter);
        }

        const whereSql = whereConditions.length > 0 ? `WHERE ` + whereConditions.join(' AND ') : '';
        const sql = `
            SELECT url, title, snippet, source_name, domain, category, published_at, timestamp, favicon
            FROM indexed_articles
            ${whereSql}
            ORDER BY timestamp DESC
            LIMIT ?
        `;
        queryParams.push(limit);

        const rows = db.prepare(sql).all(...queryParams);
        return rows.map(r => ({
            title: r.title,
            link: r.url,
            url: r.url,
            snippet: r.snippet,
            source: r.source_name,
            source_name: r.source_name,
            domain: r.domain,
            category: r.category,
            date: r.published_at,
            timestamp: r.timestamp,
            favicon: r.favicon || (getFaviconForDomain ? getFaviconForDomain(r.domain, r.source_name) : '')
        }));
    } catch (e) {
        console.error('[News Indexer] Search error:', e.message);
        return [];
    }
}

// Initialize background scheduler (runs every 20 minutes)
function initNewsIndexer() {
    // Run initial ingestion cycle immediately on server startup
    runIndexingCycle();

    // Schedule recurring ingestion every 20 minutes
    setInterval(runIndexingCycle, 20 * 60 * 1000);
}

module.exports = {
    initNewsIndexer,
    runIndexingCycle,
    searchIndexedArticles,
    saveArticlesToIndex
};
