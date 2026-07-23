const { takeScreenshot } = require('./screenshotService');
const { extractLogo, downloadImageAsBase64 } = require('./logoExtractor');
const https = require('https');
const http = require('http');

let extractorModule = null;
let cheerio = null;

async function getExtractor() {
    if (!extractorModule) {
        extractorModule = await import('@extractus/article-extractor');
    }
    return extractorModule.extract;
}

async function getCheerio() {
    if (!cheerio) {
        try { cheerio = require('cheerio'); } catch { cheerio = null; }
    }
    return cheerio;
}

// ---------------------------------------------------------------
// Fallback: fetch HTML manually and parse with cheerio
// ---------------------------------------------------------------
function fetchHtml(url) {
    return new Promise((resolve, reject) => {
        const lib = url.startsWith('https') ? https : http;
        const options = {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Accept-Language': 'it-IT,it;q=0.9,en-US;q=0.8',
                'Accept-Encoding': 'identity',
                'Cache-Control': 'no-cache',
            }
        };
        const req = lib.get(url, options, (res) => {
            // Follow redirects (max 5)
            if ([301,302,303,307,308].includes(res.statusCode) && res.headers.location) {
                try {
                    const redirectUrl = new URL(res.headers.location, url).href;
                    fetchHtml(redirectUrl).then(resolve).catch(reject);
                } catch { reject(new Error('Redirect non valido')); }
                return;
            }
            if (res.statusCode < 200 || res.statusCode >= 400) {
                reject(new Error(`HTTP ${res.statusCode}`));
                return;
            }
            const chunks = [];
            res.on('data', c => chunks.push(c));
            res.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
            res.on('error', reject);
        });
        req.setTimeout(20000, () => { req.destroy(); reject(new Error('Timeout fetch')); });
        req.on('error', reject);
    });
}

async function fallbackExtract(url) {
    const $ = await getCheerio();
    if (!$) throw new Error('Cheerio non disponibile');

    const html = await fetchHtml(url);
    const ch = $.load(html);

    // Title: try og:title, twitter:title, <title>, h1
    const title =
        ch('meta[property="og:title"]').attr('content') ||
        ch('meta[name="twitter:title"]').attr('content') ||
        ch('title').text() ||
        ch('h1').first().text() ||
        'Titolo non disponibile';

    // Image: og:image, twitter:image
    const imageUrl =
        ch('meta[property="og:image"]').attr('content') ||
        ch('meta[name="twitter:image"]').attr('content') ||
        null;

    // Date: article:published_time, datePublished json-ld, time[datetime]
    let dateStr =
        ch('meta[property="article:published_time"]').attr('content') ||
        ch('time[datetime]').attr('datetime') ||
        null;
    if (!dateStr) {
        // Try JSON-LD
        ch('script[type="application/ld+json"]').each((_, el) => {
            if (dateStr) return;
            try {
                const json = JSON.parse(ch(el).html());
                dateStr = json.datePublished || json.dateCreated || null;
            } catch {}
        });
    }

    // Content: article tag, .entry-content, .post-content, .article-body, .content, main p
    const contentSelectors = [
        'article',
        '[class*="article-body"]',
        '[class*="entry-content"]',
        '[class*="post-content"]',
        '[class*="article-content"]',
        '[class*="news-content"]',
        'main',
        '.content',
        '#content'
    ];
    let contentHtml = '';
    for (const sel of contentSelectors) {
        const found = ch(sel).first();
        if (found.length && found.text().trim().length > 100) {
            contentHtml = found.html();
            break;
        }
    }
    // Fallback: all p tags
    if (!contentHtml) {
        contentHtml = ch('p').map((_, el) => ch(el).text()).get().join(' ');
    }

    return {
        title: title.trim(),
        content: contentHtml,
        published: dateStr || null,
        image: imageUrl
    };
}

// ---------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------
function cleanText(html, wordLimit = 500) {
    if (!html) return '';
    
    // Strip all tags EXCEPT <b> and <strong>
    let text = html.replace(/<\/?(?!(?:b|strong)\b)[a-z0-9]+(?:[^>]+)?>/gmi, ' ');
    
    const junkPatterns = [
        /00:00\s*00:00/g,
        /Segui\s+.*?\s+su\s+Google\s+Discover/gi,
        /Scegli\s+.*?\s+come\s+fonte\s+preferita/gi,
        /Leggi\s+anche:/gi,
        /Iscriviti\s+alla\s+newsletter/gi,
        /Riproduzione\s+riservata/gi,
        /Tutti\s+i\s+diritti\s+riservati/gi
    ];
    for (const pattern of junkPatterns) {
        text = text.replace(pattern, ' ');
    }
    text = text.replace(/\s+/g, ' ').trim();
    
    const words = text.split(' ');
    if (words.length > wordLimit) {
        text = words.slice(0, wordLimit).join(' ') + '...';
        // Fix unclosed tags
        if ((text.match(/<b>/gi) || []).length > (text.match(/<\/b>/gi) || []).length) text += '</b>';
        if ((text.match(/<strong>/gi) || []).length > (text.match(/<\/strong>/gi) || []).length) text += '</strong>';
        return text;
    }
    return text;
}

function extractSourceName(urlStr) {
    try {
        const hostname = new URL(urlStr).hostname;
        const parts = hostname.replace(/^www\./, '').split('.');
        if (parts.length > 0) {
            return parts[0].charAt(0).toUpperCase() + parts[0].slice(1);
        }
        return hostname;
    } catch (e) {
        return 'Fonte sconosciuta';
    }
}

const mediaTypesDB = {
    'repubblica.it': 'Quotidiano Nazionale',
    'corriere.it': 'Quotidiano Nazionale',
    'ilsole24ore.com': 'Quotidiano Nazionale',
    'lastampa.it': 'Quotidiano Nazionale',
    'ilgiornale.it': 'Quotidiano Nazionale',
    'liberoquotidiano.it': 'Quotidiano Nazionale',
    'ilfattoquotidiano.it': 'Quotidiano Nazionale',
    'ilgiorno.it': 'Quotidiano Nazionale',
    'ilmessaggero.it': 'Quotidiano Nazionale',
    'ilrestodelcarlino.it': 'Quotidiano Nazionale',
    'lanazione.it': 'Quotidiano Nazionale',
    'avvenire.it': 'Quotidiano Nazionale',
    'ansa.it': 'Agenzia di Stampa',
    'adnkronos.com': 'Agenzia di Stampa',
    'agi.it': 'Agenzia di Stampa',
    'lapresse.it': 'Agenzia di Stampa',
    'dire.it': 'Agenzia di Stampa',
    'rai.it': 'Radio/TV',
    'mediaset.it': 'Radio/TV',
    'tgcom24.mediaset.it': 'Radio/TV',
    'skytg24.it': 'Radio/TV'
};

function extractSourceType(urlStr) {
    try {
        const hostname = new URL(urlStr).hostname.replace(/^www\./, '').toLowerCase();
        for (const domain in mediaTypesDB) {
            if (hostname === domain || hostname.endsWith('.' + domain)) {
                return mediaTypesDB[domain];
            }
        }
        return 'Web';
    } catch (e) {
        return 'Web';
    }
}

function formatDate(dateStr) {
    if (!dateStr) {
        const now = new Date();
        return `${now.getDate().toString().padStart(2, '0')}/${(now.getMonth() + 1).toString().padStart(2, '0')}/${now.getFullYear()}`;
    }
    try {
        const d = new Date(dateStr);
        if (isNaN(d.getTime())) throw new Error("Invalid date");
        return `${d.getDate().toString().padStart(2, '0')}/${(d.getMonth() + 1).toString().padStart(2, '0')}/${d.getFullYear()}`;
    } catch (e) {
        const now = new Date();
        return `${now.getDate().toString().padStart(2, '0')}/${(now.getMonth() + 1).toString().padStart(2, '0')}/${now.getFullYear()}`;
    }
}

// ---------------------------------------------------------------
// Main extractor — primary + cheerio fallback
// ---------------------------------------------------------------
async function extractArticle(url) {
    let article = null;
    let usedFallback = false;

    // 1) Try primary extractor
    try {
        const extract = await getExtractor();
        console.log(`[Estrattore] Analisi primaria: ${url}`);
        const result = await extract(url);
        if (result && result.title && result.content && result.content.length > 50) {
            article = result;
        } else {
            console.log(`[Estrattore] Risultato primario insufficiente, uso fallback.`);
        }
    } catch (primaryErr) {
        console.log(`[Estrattore] Errore primario (${primaryErr.message}), provo fallback.`);
    }

    // 2) Fallback with cheerio if primary failed or returned nothing useful
    if (!article) {
        try {
            console.log(`[Estrattore] Fallback cheerio per: ${url}`);
            article = await fallbackExtract(url);
            usedFallback = true;
        } catch (fallbackErr) {
            console.error(`[Estrattore] Anche il fallback ha fallito:`, fallbackErr.message);
            throw new Error(`Impossibile estrarre l'articolo. Il sito potrebbe bloccare le richieste automatiche.`);
        }
    }

    if (!article || (!article.title && !article.content)) {
        throw new Error('Impossibile estrarre contenuto dall\'URL.');
    }

    console.log(`[Estrattore] OK${usedFallback ? ' (fallback)' : ''}: ${article.title?.slice(0,60)}`);

    const sourceName = extractSourceName(url);

    // Run heavy tasks in parallel
    const [screenshotBase64, logoBase64, imageBase64] = await Promise.all([
        takeScreenshot(url),
        extractLogo(url, sourceName),
        article.image ? downloadImageAsBase64(article.image) : Promise.resolve(null)
    ]);

    return {
        url,
        title: (article.title || 'Titolo non disponibile').trim(),
        author: article.author || 'Autore non disponibile',
        published_date: formatDate(article.published),
        source_name: sourceName,
        source_type: extractSourceType(url),
        excerpt: cleanText(article.content, 500),
        imageBase64,
        logoBase64,
        screenshotBase64: screenshotBase64 ? `data:image/png;base64,${screenshotBase64}` : null
    };
}

module.exports = { extractArticle };
