const { getDb } = require('../database/db');

function getCachedUrl(shortUrl) {
    if (!shortUrl) return null;
    try {
        const db = getDb();
        const row = db.prepare(`SELECT * FROM url_cache WHERE short_url = ?`).get(shortUrl);
        return row || null;
    } catch (e) {
        console.error('[URL Cache] Read error:', e.message);
        return null;
    }
}

function setCachedUrl(shortUrl, finalUrl, domain, sourceName, favicon = '') {
    if (!shortUrl || !finalUrl) return;
    try {
        const db = getDb();
        db.prepare(`
            INSERT INTO url_cache (short_url, final_url, domain, source_name, favicon)
            VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(short_url) DO UPDATE SET
                final_url = excluded.final_url,
                domain = excluded.domain,
                source_name = excluded.source_name,
                favicon = excluded.favicon
        `).run(shortUrl, finalUrl, domain || '', sourceName || '', favicon || '');
    } catch (e) {
        console.error('[URL Cache] Write error:', e.message);
    }
}

module.exports = {
    getCachedUrl,
    setCachedUrl
};
