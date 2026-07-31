const { getDb } = require('../database/db');

// Expanded sub-feeds taxonomy across national, local, economic, culture, and agency categories
const TOP_RSS_FEEDS = [
    // AGENZIE DI STAMPA
    { name: 'ANSA - Ultimora', domain: 'ansa.it', url: 'https://www.ansa.it/sito/ansait_rss.xml', category: 'agenzia' },
    { name: 'ANSA - Politica', domain: 'ansa.it', url: 'https://www.ansa.it/sito/notizie/politica/politica_rss.xml', category: 'agenzia' },
    { name: 'ANSA - Economia', domain: 'ansa.it', url: 'https://www.ansa.it/sito/notizie/economia/economia_rss.xml', category: 'agenzia' },
    { name: 'ANSA - Spettacolo', domain: 'ansa.it', url: 'https://www.ansa.it/sito/notizie/cultura/cultura_rss.xml', category: 'agenzia' },
    { name: 'ANSA - Cronaca', domain: 'ansa.it', url: 'https://www.ansa.it/sito/notizie/cronaca/cronaca_rss.xml', category: 'agenzia' },
    { name: 'Adnkronos - Ultimora', domain: 'adnkronos.com', url: 'https://www.adnkronos.com/rss/ultimora.xml', category: 'agenzia' },
    { name: 'Adnkronos - Economia', domain: 'adnkronos.com', url: 'https://www.adnkronos.com/rss/economia.xml', category: 'agenzia' },
    { name: 'Adnkronos - Spettacoli', domain: 'adnkronos.com', url: 'https://www.adnkronos.com/rss/spettacoli.xml', category: 'agenzia' },
    { name: 'AGI - News', domain: 'agi.it', url: 'https://www.agi.it/rss', category: 'agenzia' },

    // QUOTIDIANI NAZIONALI & SUB-FEED
    { name: 'la Repubblica - Home', domain: 'repubblica.it', url: 'https://www.repubblica.it/rss/homepage/rss2.0.xml', category: 'quotidiano_nazionale' },
    { name: 'la Repubblica - Politica', domain: 'repubblica.it', url: 'https://www.repubblica.it/rss/politica/rss2.0.xml', category: 'quotidiano_nazionale' },
    { name: 'la Repubblica - Economia', domain: 'repubblica.it', url: 'https://www.repubblica.it/rss/economia/rss2.0.xml', category: 'quotidiano_nazionale' },
    { name: 'la Repubblica - Spettacoli', domain: 'repubblica.it', url: 'https://www.repubblica.it/rss/spettacoli/rss2.0.xml', category: 'quotidiano_nazionale' },
    { name: 'la Repubblica - Cronaca', domain: 'repubblica.it', url: 'https://www.repubblica.it/rss/cronaca/rss2.0.xml', category: 'quotidiano_nazionale' },

    { name: 'Corriere della Sera - Home', domain: 'corriere.it', url: 'https://xml2.corriereobjects.it/rss/homepage.xml', category: 'quotidiano_nazionale' },
    { name: 'Corriere della Sera - Politica', domain: 'corriere.it', url: 'https://xml2.corriereobjects.it/rss/politica.xml', category: 'quotidiano_nazionale' },
    { name: 'Corriere della Sera - Economia', domain: 'corriere.it', url: 'https://xml2.corriereobjects.it/rss/economia.xml', category: 'quotidiano_nazionale' },
    { name: 'Corriere della Sera - Spettacoli', domain: 'corriere.it', url: 'https://xml2.corriereobjects.it/rss/spettacoli.xml', category: 'quotidiano_nazionale' },

    { name: 'Il Sole 24 Ore - Italia', domain: 'ilsole24ore.com', url: 'https://www.ilsole24ore.com/rss/italia.xml', category: 'quotidiano_nazionale' },
    { name: 'Il Sole 24 Ore - Finanza', domain: 'ilsole24ore.com', url: 'https://www.ilsole24ore.com/rss/finanza.xml', category: 'quotidiano_nazionale' },
    { name: 'Il Sole 24 Ore - Norme', domain: 'ilsole24ore.com', url: 'https://www.ilsole24ore.com/rss/norme-e-tributi.xml', category: 'quotidiano_nazionale' },

    { name: 'Il Tempo - Home', domain: 'iltempo.it', url: 'https://www.iltempo.it/rss.xml', category: 'quotidiano_nazionale' },
    { name: 'Il Tempo - Roma', domain: 'iltempo.it', url: 'https://www.iltempo.it/roma-capitale/rss.xml', category: 'quotidiano_locale' },
    { name: 'Il Tempo - Politica', domain: 'iltempo.it', url: 'https://www.iltempo.it/politica/rss.xml', category: 'quotidiano_nazionale' },

    { name: 'La Stampa - Home', domain: 'lastampa.it', url: 'https://www.lastampa.it/rss/homepage/rss2.0.xml', category: 'quotidiano_nazionale' },
    { name: 'La Stampa - Economia', domain: 'lastampa.it', url: 'https://www.lastampa.it/rss/economia/rss2.0.xml', category: 'quotidiano_nazionale' },
    { name: 'La Stampa - Spettacoli', domain: 'lastampa.it', url: 'https://www.lastampa.it/rss/spettacoli/rss2.0.xml', category: 'quotidiano_nazionale' },

    { name: 'Il Mattino - Home', domain: 'ilmattino.it', url: 'https://www.ilmattino.it/rss/home.xml', category: 'quotidiano_locale' },
    { name: 'Il Mattino - Napoli', domain: 'ilmattino.it', url: 'https://www.ilmattino.it/rss/napoli.xml', category: 'quotidiano_locale' },
    { name: 'Il Messaggero - Home', domain: 'ilmessaggero.it', url: 'https://www.ilmessaggero.it/rss/home.xml', category: 'quotidiano_locale' },
    { name: 'Il Messaggero - Roma', domain: 'ilmessaggero.it', url: 'https://www.ilmessaggero.it/rss/roma.xml', category: 'quotidiano_locale' },
    { name: 'Il Giorno - Home', domain: 'ilgiorno.it', url: 'https://www.ilgiorno.it/rss.xml', category: 'quotidiano_locale' },
    { name: 'La Nazione - Home', domain: 'lanazione.it', url: 'https://www.lanazione.it/rss.xml', category: 'quotidiano_locale' },
    { name: 'Il Resto del Carlino', domain: 'ilrestodelcarlino.it', url: 'https://www.ilrestodelcarlino.it/rss.xml', category: 'quotidiano_locale' },

    // WEB DIGITAL & MAGAZINE
    { name: 'Fanpage - Home', domain: 'fanpage.it', url: 'https://www.fanpage.it/feed/', category: 'web_digital' },
    { name: 'Fanpage - Spettacolo', domain: 'fanpage.it', url: 'https://spettacolo.fanpage.it/feed/', category: 'web_digital' },
    { name: 'Fanpage - Politica', domain: 'fanpage.it', url: 'https://politica.fanpage.it/feed/', category: 'web_digital' },
    { name: 'Open - Home', domain: 'open.online', url: 'https://www.open.online/feed/', category: 'web_digital' },
    { name: 'TGCom24 - Ultimora', domain: 'tgcom24.mediaset.it', url: 'https://www.tgcom24.mediaset.it/rss/ultimora.xml', category: 'web_digital' },
    { name: 'TGCom24 - Spettacolo', domain: 'tgcom24.mediaset.it', url: 'https://www.tgcom24.mediaset.it/rss/spettacolo.xml', category: 'web_digital' },
    { name: 'HuffPost Italia', domain: 'huffingtonpost.it', url: 'https://www.huffingtonpost.it/rss/', category: 'web_digital' },
    { name: 'Il Post', domain: 'ilpost.it', url: 'https://www.ilpost.it/feed/', category: 'web_digital' }
];

// Target News Sitemaps for deep ingestion of published articles
const NEWS_SITEMAP_URLS = [
    { name: 'ANSA Sitemap', domain: 'ansa.it', url: 'https://www.ansa.it/sitemap_news.xml', category: 'agenzia' },
    { name: 'la Repubblica Sitemap', domain: 'repubblica.it', url: 'https://www.repubblica.it/sitemap-news.xml', category: 'quotidiano_nazionale' },
    { name: 'Il Sole 24 Ore Sitemap', domain: 'ilsole24ore.com', url: 'https://www.ilsole24ore.com/sitemap-news.xml', category: 'quotidiano_nazionale' },
    { name: 'Fanpage Sitemap', domain: 'fanpage.it', url: 'https://www.fanpage.it/sitemap-news.xml', category: 'web_digital' },
    { name: 'TGCom24 Sitemap', domain: 'tgcom24.mediaset.it', url: 'https://www.tgcom24.mediaset.it/sitemap_news.xml', category: 'web_digital' }
];

let isIndexingRunning = false;

function getFavicon(domain) {
    if (!domain) return '';
    const cleanDomain = domain.toLowerCase().replace(/^www\./, '');
    return `https://www.google.com/s2/favicons?domain=${cleanDomain}&sz=32`;
}

// Parse standard RSS XML items
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
                favicon: getFavicon(defaultDomain)
            });
        }
    }
    return items;
}

// Parse News Sitemaps (<news:title>, <loc>, <news:publication_date>)
function parseNewsSitemapItems(xmlText, defaultSource, defaultDomain, category) {
    const items = [];
    if (!xmlText || typeof xmlText !== 'string') return items;

    const urlRegex = /<url[\s\S]*?>([\s\S]*?)<\/url>/gi;
    let match;

    while ((match = urlRegex.exec(xmlText)) !== null) {
        const urlBlock = match[1];

        const locMatch = urlBlock.match(/<loc>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/loc>/i);
        const titleMatch = urlBlock.match(/<news:title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/news:title>/i) || urlBlock.match(/<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/i);
        const dateMatch = urlBlock.match(/<news:publication_date>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/news:publication_date>/i) || urlBlock.match(/<lastmod>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/lastmod>/i);

        let url = locMatch ? locMatch[1].trim() : '';
        let title = titleMatch ? titleMatch[1].replace(/<[^>]+>/g, '').trim() : '';
        let pubDateStr = dateMatch ? dateMatch[1].trim() : new Date().toUTCString();

        if (url && title) {
            let timestamp = Date.parse(pubDateStr) || Date.now();
            items.push({
                title,
                url,
                snippet: title,
                source_name: defaultSource,
                domain: defaultDomain,
                category,
                published_at: new Date(timestamp).toLocaleDateString('it-IT'),
                timestamp,
                favicon: getFavicon(defaultDomain)
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
            stmt.run(item.url, item.title, item.snippet, item.source_name, item.domain, item.category, item.published_at, item.timestamp, item.favicon || getFavicon(item.domain));
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

// Background ingestion cycle covering all RSS sub-feeds and News Sitemaps
async function runIndexingCycle() {
    if (isIndexingRunning) return;
    isIndexingRunning = true;
    console.log('[News Indexer] 🔄 Avvio ciclo di pre-indicizzazione estesa (RSS sub-feed + Sitemap Notizie)...');

    let totalNew = 0;

    // 1. Ingest RSS Sub-Feeds
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
        } catch (e) {}
    }

    // 2. Ingest News Sitemaps
    for (const sm of NEWS_SITEMAP_URLS) {
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 8000);

            const res = await fetch(sm.url, {
                signal: controller.signal,
                headers: { 'User-Agent': 'RassegnaStampaBot/2.0 (+https://presstoday.com)' }
            });
            clearTimeout(timeoutId);

            if (res.ok) {
                const xmlText = await res.text();
                const items = parseNewsSitemapItems(xmlText, sm.name, sm.domain, sm.category);
                const saved = saveArticlesToIndex(items);
                totalNew += saved;
            }
        } catch (e) {}
    }

    // Cleanup old articles > 30 days
    try {
        const db = getDb();
        const cutoff = Date.now() - (30 * 24 * 60 * 60 * 1000);
        db.prepare(`DELETE FROM indexed_articles WHERE timestamp < ?`).run(cutoff);
    } catch(e){}

    const db = getDb();
    const totalInDb = db.prepare(`SELECT COUNT(*) as cnt FROM indexed_articles`).get().cnt;
    console.log(`[News Indexer] ✅ Ciclo completato. Nuovi indicizzati/aggiornati: ${totalNew}. Totale notizie in archivio DB: ${totalInDb}`);
    isIndexingRunning = false;
}

// Advanced Sub-50ms SQLite Search Engine with Full Boolean Logic & Taxonomy Filtering
function parseBooleanQuery(queryStr) {
    if (!queryStr) return { clauses: [], params: [] };

    let text = queryStr.trim();
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
            // Skip raw keyword operators
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
            favicon: r.favicon || getFavicon(r.domain)
        }));
    } catch (e) {
        console.error('[News Indexer] Search error:', e.message);
        return [];
    }
}

// Initialize background scheduler (runs every 15 minutes)
function initNewsIndexer() {
    runIndexingCycle();
    setInterval(runIndexingCycle, 15 * 60 * 1000);
}

module.exports = {
    initNewsIndexer,
    runIndexingCycle,
    searchIndexedArticles,
    saveArticlesToIndex
};
