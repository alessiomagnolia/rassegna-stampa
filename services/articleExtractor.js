const { takeScreenshot, launchBrowser } = require('./screenshotService');
const { extractLogo, downloadImageAsBase64 } = require('./logoExtractor');
const { PRIORITY_SOURCES } = require('../config/prioritySources');
const https = require('https');
const http = require('http');
const zlib = require('zlib');

// Allow fetching news sites with incomplete intermediate SSL certificate chains
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const httpsAgent = new https.Agent({ rejectUnauthorized: false });
const httpAgent = new http.Agent();

let extractorModule = null;
let cheerio = null;

async function getExtractor() {
    if (!extractorModule) {
        try {
            extractorModule = await import('@extractus/article-extractor');
        } catch (e) {
            console.warn('[Estrattore] Impossibile caricare @extractus:', e.message);
            return null;
        }
    }
    return extractorModule ? extractorModule.extract : null;
}

async function getCheerio() {
    if (!cheerio) {
        try { cheerio = require('cheerio'); } catch { cheerio = null; }
    }
    return cheerio;
}

// ---------------------------------------------------------------
// Tier 2 helper: Fetch HTML with modern headers, decompression & Cloudflare bypass
// ---------------------------------------------------------------
async function fetchHtml(url, customHeaders = {}) {
    const modernHeaders = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Accept-Language': 'it-IT,it;q=0.9,en-US;q=0.8,en;q=0.7',
        'Sec-Ch-Ua': '"Chromium";v="124", "Google Chrome";v="124", "Not-A.Brand";v="99"',
        'Sec-Ch-Ua-Mobile': '?0',
        'Sec-Ch-Ua-Platform': '"Windows"',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
        'Sec-Fetch-User': '?1',
        'Upgrade-Insecure-Requests': '1',
        'Cache-Control': 'no-cache',
        ...customHeaders
    };

    // 1. Try global fetch (Node 18+) with automatic gzip/brotli decompression
    if (typeof fetch === 'function') {
        try {
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), 6000);
            const res = await fetch(url, {
                signal: controller.signal,
                redirect: 'follow',
                headers: modernHeaders
            });
            clearTimeout(timer);
            if (res.ok) {
                const text = await res.text();
                if (text && text.length > 50 && !isBotChallenge('', text)) {
                    return text;
                }
            }
        } catch (fetchErr) {
            console.log(`[fetchHtml] Global fetch failed (${fetchErr.message}), provo con http client...`);
        }
    }

    // 2. Fallback using Node https/http with zlib decompression
    let nodeClientHtml = null;
    try {
        nodeClientHtml = await new Promise((resolve, reject) => {
            const lib = url.startsWith('https') ? https : http;
            const options = {
                agent: url.startsWith('https') ? httpsAgent : httpAgent,
                headers: {
                    ...modernHeaders,
                    'Accept-Encoding': 'gzip, deflate, br'
                }
            };

            const req = lib.get(url, options, (res) => {
                if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
                    try {
                        const redirectUrl = new URL(res.headers.location, url).href;
                        fetchHtml(redirectUrl, customHeaders).then(resolve).catch(reject);
                    } catch { reject(new Error('Redirect non valido')); }
                    return;
                }
                if (res.statusCode < 200 || res.statusCode >= 400) {
                    reject(new Error(`HTTP ${res.statusCode}`));
                    return;
                }

                const encoding = (res.headers['content-encoding'] || '').toLowerCase();
                let stream = res;
                if (encoding === 'gzip') {
                    stream = res.pipe(zlib.createGunzip());
                } else if (encoding === 'deflate') {
                    stream = res.pipe(zlib.createInflate());
                } else if (encoding === 'br') {
                    stream = res.pipe(zlib.createBrotliDecompress());
                }

                const chunks = [];
                stream.on('data', c => chunks.push(c));
                stream.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
                stream.on('error', reject);
            });

            req.setTimeout(8000, () => { req.destroy(); reject(new Error('Timeout fetch')); });
            req.on('error', reject);
        });

        if (nodeClientHtml && nodeClientHtml.length > 50 && !isBotChallenge('', nodeClientHtml)) {
            return nodeClientHtml;
        }
    } catch (nodeErr) {
        console.log(`[fetchHtml] Node HTTP client non riuscito (${nodeErr.message}), provo Google Proxy bypass...`);
    }

    // 3. Fallback: Google Proxy (Bypassa Cloudflare Bot Fight Mode su IP datacenter/cloud)
    try {
        console.log(`[fetchHtml] Tentativo bypass Cloudflare tramite Google Proxy per: ${url}`);
        const googleProxyUrl = `https://translate.google.com/translate?sl=auto&tl=it&u=${encodeURIComponent(url)}`;
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 7000);
        const res = await fetch(googleProxyUrl, {
            signal: controller.signal,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
            }
        });
        clearTimeout(timer);
        if (res.ok) {
            const text = await res.text();
            if (text && text.length > 50 && !isBotChallenge('', text)) {
                console.log(`[fetchHtml] Successo bypass Cloudflare via Google Proxy per: ${url}`);
                return text;
            }
        }
    } catch (gErr) {
        console.log(`[fetchHtml] Google proxy bypass fallito (${gErr.message})`);
    }

    if (nodeClientHtml) return nodeClientHtml;
    throw new Error('Impossibile scaricare HTML (connessione rifiutata o blocco anti-bot)');
}

// ---------------------------------------------------------------
// Tier 2: Cheerio extraction with metadata, JSON-LD & body parsing
// ---------------------------------------------------------------
async function fallbackExtract(url) {
    const $ = await getCheerio();
    if (!$) throw new Error('Cheerio non disponibile');

    const html = await fetchHtml(url);
    if (!html || html.length < 50) throw new Error('HTML vuoto o insufficiente');

    const ch = $.load(html);

    // Title: try og:title, twitter:title, <title>, h1
    const title =
        ch('meta[property="og:title"]').attr('content') ||
        ch('meta[name="twitter:title"]').attr('content') ||
        ch('meta[name="title"]').attr('content') ||
        ch('title').text() ||
        ch('h1').first().text() ||
        '';

    // Description
    let description =
        ch('meta[property="og:description"]').attr('content') ||
        ch('meta[name="twitter:description"]').attr('content') ||
        ch('meta[name="description"]').attr('content') ||
        '';

    // Image: og:image, twitter:image
    let imageUrl =
        ch('meta[property="og:image"]').attr('content') ||
        ch('meta[name="twitter:image"]').attr('content') ||
        ch('meta[name="twitter:image:src"]').attr('content') ||
        null;

    // Author
    let authorStr =
        ch('meta[name="author"]').attr('content') ||
        ch('meta[property="article:author"]').attr('content') ||
        ch('meta[name="byl"]').attr('content') ||
        null;

    // Date
    let dateStr =
        ch('meta[property="article:published_time"]').attr('content') ||
        ch('meta[name="publication_date"]').attr('content') ||
        ch('meta[name="date"]').attr('content') ||
        ch('time[datetime]').attr('datetime') ||
        null;

    // Inspect JSON-LD schemas
    ch('script[type="application/ld+json"]').each((_, el) => {
        try {
            const raw = ch(el).html();
            if (!raw) return;
            const json = JSON.parse(raw);
            const items = Array.isArray(json) ? json : (json['@graph'] || [json]);
            for (const item of items) {
                if (!item) continue;
                if (!dateStr && (item.datePublished || item.dateCreated)) {
                    dateStr = item.datePublished || item.dateCreated;
                }
                if (!imageUrl && item.image) {
                    if (typeof item.image === 'string') imageUrl = item.image;
                    else if (item.image?.url) imageUrl = item.image.url;
                    else if (Array.isArray(item.image) && item.image[0]) {
                        imageUrl = typeof item.image[0] === 'string' ? item.image[0] : item.image[0].url;
                    }
                }
                if (!authorStr && item.author) {
                    if (typeof item.author === 'string') authorStr = item.author;
                    else if (item.author?.name) authorStr = item.author.name;
                    else if (Array.isArray(item.author) && item.author[0]?.name) authorStr = item.author[0].name;
                }
                if (!description && item.description) {
                    description = item.description;
                }
            }
        } catch {}
    });

    // Content: article tag, .entry-content, .post-content, .article-body, .content, main p
    const contentSelectors = [
        'article',
        '[class*="article-body"]',
        '[class*="article__body"]',
        '[class*="entry-content"]',
        '[class*="post-content"]',
        '[class*="article-content"]',
        '[class*="story-body"]',
        '[class*="content-body"]',
        '[class*="corpo-articolo"]',
        '[class*="testo-articolo"]',
        '[class*="article-text"]',
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

    // Fallback: collected paragraph text
    if (!contentHtml) {
        const pTexts = ch('article p, main p, p')
            .map((_, el) => ch(el).text().trim())
            .get()
            .filter(t => t.length > 25);
        if (pTexts.length > 0) {
            contentHtml = pTexts.slice(0, 15).join('\n\n');
        }
    }

    // Fallback: use description as body if content extraction yielded nothing
    if (!contentHtml && description) {
        contentHtml = description;
    }

    return {
        title: title.trim(),
        content: contentHtml,
        description: description.trim(),
        published: dateStr || null,
        image: imageUrl,
        author: authorStr ? authorStr.trim() : null
    };
}

// ---------------------------------------------------------------
// Bot Challenge Detection & Entities Unescaping
// ---------------------------------------------------------------
function decodeHtmlEntities(str) {
    if (!str) return '';
    return str
        .replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(dec))
        .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
        .replace(/&amp;/g, '&')
        .replace(/&quot;/g, '"')
        .replace(/&#039;/g, "'")
        .replace(/&apos;/g, "'")
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&nbsp;/g, ' ')
        .replace(/&#8217;/g, "'")
        .replace(/&#8220;/g, '“')
        .replace(/&#8221;/g, '”')
        .replace(/&#8211;/g, '–')
        .replace(/&#8212;/g, '—');
}

function isBotChallenge(title, content) {
    const t = (title || '').toLowerCase().trim();
    const c = (content || '').toLowerCase().trim();
    if (!t && !c) return false;

    const challengeSnippets = [
        'just a moment...',
        'just a moment',
        'attention required!',
        'security check',
        'access denied',
        'ddos-guard',
        'bot verification',
        'checking your browser',
        'please verify you are a human',
        'are you a human',
        '403 forbidden',
        'shieldsquare captcha'
    ];

    if (challengeSnippets.some(cs => t === cs || t.startsWith(cs) || (cs.length > 10 && t.includes(cs)))) return true;
    if (t === 'cloudflare' || t.startsWith('cloudflare |') || t.includes('attention required! | cloudflare') || t.includes('just a moment... | cloudflare')) return true;

    if (c.includes('enable javascript and cookies to continue') ||
        c.includes('ray id:') ||
        c.includes('cloudflare to restrict access') ||
        c.includes('checking if the site connection is secure') ||
        c.includes('ddos protection by cloudflare') ||
        c.includes('challenge-platform')) {
        return true;
    }

    return false;
}

// ---------------------------------------------------------------
// Tier 1.5: WordPress REST API fallback (Bypassa Cloudflare su testate WP)
// ---------------------------------------------------------------
async function extractWithWordPressApi(url) {
    try {
        const parsed = new URL(url);
        const pathSegments = parsed.pathname.split('/').filter(Boolean);
        if (pathSegments.length === 0) return null;

        let slug = pathSegments[pathSegments.length - 1];
        slug = slug.replace(/\.(html?|php)$/i, '');
        if (!slug || slug.length < 3) return null;

        const apiUrl = `${parsed.origin}/wp-json/wp/v2/posts?slug=${encodeURIComponent(slug)}&_embed=1`;
        console.log(`[Estrattore WP-API] Tentativo WordPress REST API per slug: ${apiUrl}`);

        let rawText = '';
        try {
            rawText = await fetchHtml(apiUrl, { 'Accept': 'application/json' });
        } catch (fetchErr) {
            console.log(`[Estrattore WP-API] Slug fetch fallito (${fetchErr.message})`);
        }

        let posts = null;
        if (rawText) {
            try { posts = JSON.parse(rawText); } catch {}
        }

        // Se non trovato per slug esatto, prova la ricerca per parole chiave tratte dallo slug
        if (!Array.isArray(posts) || posts.length === 0) {
            try {
                const searchKeywords = slug.replace(/[-_]+/g, ' ').trim();
                const searchApiUrl = `${parsed.origin}/wp-json/wp/v2/posts?search=${encodeURIComponent(searchKeywords)}&_embed=1`;
                console.log(`[Estrattore WP-API] Tentativo ricerca WP: ${searchApiUrl}`);
                const searchRaw = await fetchHtml(searchApiUrl, { 'Accept': 'application/json' });
                if (searchRaw) {
                    const searchPosts = JSON.parse(searchRaw);
                    if (Array.isArray(searchPosts) && searchPosts.length > 0) {
                        posts = searchPosts;
                    }
                }
            } catch (searchErr) {
                console.log(`[Estrattore WP-API] Ricerca WP fallita (${searchErr.message})`);
            }
        }

        if (!Array.isArray(posts) || posts.length === 0) return null;

        const post = posts[0];
        const rawTitle = decodeHtmlEntities(post.title?.rendered || '').replace(/<[^>]+>/g, '').trim();

        if (!rawTitle || isBotChallenge(rawTitle, '')) return null;

        let imageUrl = null;
        const media = post._embedded?.['wp:featuredmedia'];
        if (Array.isArray(media) && media[0]) {
            imageUrl = media[0].source_url || media[0].media_details?.sizes?.large?.source_url || media[0].media_details?.sizes?.full?.source_url;
        }

        let author = null;
        const authors = post._embedded?.author;
        if (Array.isArray(authors) && authors[0]?.name) {
            author = authors[0].name;
        }

        const rawExcerpt = decodeHtmlEntities(post.excerpt?.rendered || '');
        const rawContent = post.content?.rendered || rawExcerpt;

        console.log(`[Estrattore WP-API] Successo! Trovato articolo: "${rawTitle.slice(0, 50)}"`);
        return {
            title: rawTitle,
            content: rawContent,
            description: cleanText(rawExcerpt, 120),
            published: post.date || post.modified || null,
            image: imageUrl,
            author: author || null
        };
    } catch (e) {
        console.log(`[Estrattore WP-API] Fallito: ${e.message}`);
        return null;
    }
}

// ---------------------------------------------------------------
// Tier 1.6: WordPress RSS Feed fallback (Bypassa Cloudflare perché i feed sono sempre pubblici)
// ---------------------------------------------------------------
async function extractWithWordPressRss(url) {
    try {
        const parsed = new URL(url);
        const pathSegments = parsed.pathname.split('/').filter(Boolean);
        if (pathSegments.length === 0) return null;

        const slug = pathSegments[pathSegments.length - 1].replace(/\.(html?|php)$/i, '');
        if (!slug || slug.length < 3) return null;

        const feedCandidates = [
            `${parsed.origin}/feed/`,
            `${parsed.origin}/?feed=rss2`,
            `${parsed.origin}/rss.xml`
        ];

        console.log(`[Estrattore RSS] Tentativo estrazione feed RSS per: ${slug}`);

        for (const feedUrl of feedCandidates) {
            try {
                const xmlText = await fetchHtml(feedUrl);
                if (!xmlText || !xmlText.includes('<item>')) continue;

                const items = xmlText.split('<item>').slice(1);
                for (const itemXml of items) {
                    const item = itemXml.split('</item>')[0];
                    const linkMatch = item.match(/<link>(.*?)<\/link>/is) || item.match(/<guid[^>]*>(.*?)<\/guid>/is);
                    const itemLink = linkMatch ? linkMatch[1].replace(/<!\[CDATA\[(.*?)\]\]>/is, '$1').trim() : '';

                    if (itemLink.includes(slug) || url.includes(itemLink) || itemLink.includes(url)) {
                        const titleMatch = item.match(/<title>(.*?)<\/title>/is);
                        const rawTitle = titleMatch ? titleMatch[1].replace(/<!\[CDATA\[(.*?)\]\]>/is, '$1').replace(/<[^>]+>/g, '').trim() : '';
                        if (!rawTitle || isBotChallenge(rawTitle, '')) continue;

                        const encMatch = item.match(/<enclosure[^>]+url=["']([^"']+)["']/i) || item.match(/<media:content[^>]+url=["']([^"']+)["']/i);
                        const imageUrl = encMatch ? encMatch[1].trim() : null;

                        const contentMatch = item.match(/<content:encoded>(.*?)<\/content:encoded>/is) || item.match(/<description>(.*?)<\/description>/is);
                        const rawContent = contentMatch ? contentMatch[1].replace(/<!\[CDATA\[(.*?)\]\]>/is, '$1').trim() : '';

                        const dateMatch = item.match(/<pubDate>(.*?)<\/pubDate>/is);
                        const published = dateMatch ? dateMatch[1].trim() : null;

                        const authorMatch = item.match(/<dc:creator>(.*?)<\/dc:creator>/is) || item.match(/<author>(.*?)<\/author>/is);
                        const author = authorMatch ? authorMatch[1].replace(/<!\[CDATA\[(.*?)\]\]>/is, '$1').trim() : null;

                        console.log(`[Estrattore RSS] Successo! Trovato articolo in feed RSS: "${rawTitle.slice(0, 50)}"`);
                        return {
                            title: decodeHtmlEntities(rawTitle),
                            content: rawContent,
                            description: cleanText(rawContent, 120),
                            published,
                            image: imageUrl,
                            author
                        };
                    }
                }
            } catch (feedErr) {
                console.log(`[Estrattore RSS] Feed ${feedUrl} non disponibile: ${feedErr.message}`);
            }
        }
        return null;
    } catch (e) {
        console.log(`[Estrattore RSS] Fallito: ${e.message}`);
        return null;
    }
}

// ---------------------------------------------------------------
// Tier 3: Puppeteer DOM extraction for anti-bot / JS-rendered sites
// ---------------------------------------------------------------
async function extractWithPuppeteer(url) {
    let browser = null;
    let page = null;
    try {
        console.log(`[Estrattore Puppeteer] Avvio browser headless per: ${url}`);
        browser = await launchBrowser();
        page = await browser.newPage();

        // Block heavy resources (images, media, fonts) to load quickly
        await page.setRequestInterception(true);
        page.on('request', (req) => {
            const rt = req.resourceType();
            if (['image', 'media', 'font'].includes(rt)) {
                req.abort();
            } else {
                req.continue();
            }
        });

        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36');
        await page.setViewport({ width: 1280, height: 800 });

        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 12000 });

        let extracted = await page.evaluate(() => {
            const getMeta = (names) => {
                for (const name of names) {
                    const el = document.querySelector(`meta[property="${name}"], meta[name="${name}"]`);
                    if (el && el.content && el.content.trim()) return el.content.trim();
                }
                return null;
            };

            const title = getMeta(['og:title', 'twitter:title', 'title']) || document.title || '';
            const description = getMeta(['og:description', 'twitter:description', 'description']) || '';
            const image = getMeta(['og:image', 'twitter:image:src', 'twitter:image']) || null;
            const author = getMeta(['author', 'article:author', 'twitter:creator']) || '';
            const published = getMeta(['article:published_time', 'publication_date', 'date']) || null;

            const selectors = [
                'article', '[class*="article-body"]', '[class*="entry-content"]',
                '[class*="post-content"]', '[class*="article__body"]', '[class*="story-body"]',
                '[class*="corpo-articolo"]', '[class*="testo-articolo"]', 'main', '.content'
            ];
            let bodyText = '';
            for (const sel of selectors) {
                const el = document.querySelector(sel);
                if (el && el.innerText && el.innerText.trim().length > 100) {
                    bodyText = el.innerText.trim();
                    break;
                }
            }
            if (!bodyText) {
                const ps = Array.from(document.querySelectorAll('article p, main p, p'))
                    .map(p => p.innerText.trim())
                    .filter(t => t.length > 25);
                bodyText = ps.slice(0, 12).join('\n\n');
            }

            return {
                title,
                content: bodyText || description,
                description,
                image,
                author,
                published
            };
        });

        // If Puppeteer got an anti-bot challenge page, wait up to 4s for challenge to resolve
        if (extracted && isBotChallenge(extracted.title, extracted.content)) {
            console.log(`[Estrattore Puppeteer] Rilevato interstitial anti-bot ("${extracted.title}"), attendo risoluzione...`);
            await new Promise(r => setTimeout(r, 4000));
            const reTitle = await page.evaluate(() => document.title || '');
            if (!isBotChallenge(reTitle, '')) {
                extracted = await page.evaluate(() => {
                    const getMeta = (names) => {
                        for (const name of names) {
                            const el = document.querySelector(`meta[property="${name}"], meta[name="${name}"]`);
                            if (el && el.content && el.content.trim()) return el.content.trim();
                        }
                        return null;
                    };
                    const title = getMeta(['og:title', 'twitter:title', 'title']) || document.title || '';
                    const description = getMeta(['og:description', 'twitter:description', 'description']) || '';
                    const image = getMeta(['og:image', 'twitter:image:src', 'twitter:image']) || null;
                    const author = getMeta(['author', 'article:author', 'twitter:creator']) || '';
                    const published = getMeta(['article:published_time', 'publication_date', 'date']) || null;
                    const selectors = ['article', '[class*="article-body"]', '[class*="entry-content"]', '[class*="post-content"]', 'main', '.content'];
                    let bodyText = '';
                    for (const sel of selectors) {
                        const el = document.querySelector(sel);
                        if (el && el.innerText && el.innerText.trim().length > 100) {
                            bodyText = el.innerText.trim();
                            break;
                        }
                    }
                    return { title, content: bodyText || description, description, image, author, published };
                });
            }
        }

        if (extracted && (extracted.title || extracted.content) && !isBotChallenge(extracted.title, extracted.content)) {
            console.log(`[Estrattore Puppeteer] Successo per: ${url} -> ${extracted.title?.slice(0, 50)}`);
            return extracted;
        }
        return null;
    } catch (err) {
        console.warn(`[Estrattore Puppeteer] Errore: ${err.message}`);
        return null;
    } finally {
        if (page) await page.close().catch(() => {});
        if (browser) await browser.close().catch(() => {});
    }
}

// ---------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------
function cleanText(html, wordLimit = 500) {
    if (!html) return '';
    
    // Strip all HTML tags cleanly
    let text = html.replace(/<[^>]+>/g, ' ');
    
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
        return text;
    }
    return text;
}

function extractSourceName(urlStr) {
    try {
        const hostname = new URL(urlStr).hostname.replace(/^www\./, '').toLowerCase();
        if (Array.isArray(PRIORITY_SOURCES)) {
            for (const s of PRIORITY_SOURCES) {
                if (hostname === s.domain || hostname.endsWith('.' + s.domain)) {
                    return s.name;
                }
            }
        }
        const parts = hostname.split('.');
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
        if (Array.isArray(PRIORITY_SOURCES)) {
            for (const s of PRIORITY_SOURCES) {
                if (hostname === s.domain || hostname.endsWith('.' + s.domain)) {
                    if (s.category === 'quotidiano_nazionale') return 'Quotidiano Nazionale';
                    if (s.category === 'agenzia_stampa') return 'Agenzia di Stampa';
                    if (s.category === 'tv_radio') return 'Radio/TV';
                    if (s.category === 'quotidiano_locale') return 'Quotidiano Locale';
                    if (s.category === 'web_digital') return 'Web';
                }
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
// Main extractor — Tier 1 (@extractus) + Tier 1.5 (WP REST API) + Tier 2 (Cheerio) + Tier 3 (Puppeteer)
// ---------------------------------------------------------------
async function extractArticle(url, options = {}) {
    let article = null;
    let tierUsed = 'none';

    // 1) Tier 1: Primary @extractus/article-extractor (with safe 5s timeout)
    try {
        const extract = await getExtractor();
        if (extract) {
            console.log(`[Estrattore Tier 1] Analisi primaria: ${url}`);
            const extractPromise = extract(url);
            const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout @extractus')), 5000));
            const result = await Promise.race([extractPromise, timeoutPromise]);
            if (result && (result.title || result.content)) {
                if (!isBotChallenge(result.title, result.content)) {
                    article = result;
                    tierUsed = 'Tier 1 (@extractus)';
                } else {
                    console.log(`[Estrattore Tier 1] Rilevata schermata bot/Cloudflare ("${result.title}"), provo alternative...`);
                }
            }
        }
    } catch (primaryErr) {
        console.log(`[Estrattore Tier 1] Primario non riuscito (${primaryErr.message}), provo Tier alternativi...`);
    }

    // 2) Tier 1.5: WordPress REST API fallback (risolve siti WordPress dietro Cloudflare come corrieredelleconomia.it)
    if (!article || (!article.title && !article.content) || isBotChallenge(article.title, article.content)) {
        try {
            console.log(`[Estrattore Tier 1.5] Tentativo WordPress REST API per: ${url}`);
            const wpResult = await extractWithWordPressApi(url);
            if (wpResult && (wpResult.title || wpResult.content)) {
                article = wpResult;
                tierUsed = 'Tier 1.5 (WordPress REST API)';
            }
        } catch (wpErr) {
            console.log(`[Estrattore Tier 1.5] WP API fallito (${wpErr.message})`);
        }
    }

    // 2b) Tier 1.6: WordPress RSS Feed fallback (Cloudflare non blocca mai /feed/)
    if (!article || (!article.title && !article.content) || isBotChallenge(article.title, article.content)) {
        try {
            console.log(`[Estrattore Tier 1.6] Tentativo WordPress RSS Feed per: ${url}`);
            const rssResult = await extractWithWordPressRss(url);
            if (rssResult && (rssResult.title || rssResult.content)) {
                article = rssResult;
                tierUsed = 'Tier 1.6 (WordPress RSS Feed)';
            }
        } catch (rssErr) {
            console.log(`[Estrattore Tier 1.6] RSS fallito (${rssErr.message})`);
        }
    }

    // 3) Tier 2: Cheerio fallback (fast HTML fetch with decompression + metadata/JSON-LD)
    if (!article || (!article.title && !article.content) || isBotChallenge(article.title, article.content)) {
        try {
            console.log(`[Estrattore Tier 2] Fallback Cheerio per: ${url}`);
            const fbResult = await fallbackExtract(url);
            if (fbResult && (fbResult.title || fbResult.content)) {
                if (!isBotChallenge(fbResult.title, fbResult.content)) {
                    article = fbResult;
                    tierUsed = 'Tier 2 (Cheerio)';
                } else {
                    console.log(`[Estrattore Tier 2] Rilevata schermata bot/Cloudflare ("${fbResult.title}"), passo a Puppeteer...`);
                }
            }
        } catch (fallbackErr) {
            console.log(`[Estrattore Tier 2] Fallback Cheerio non riuscito (${fallbackErr.message})`);
            try {
                const extract = await getExtractor();
                if (extract) {
                    const html = await fetchHtml(url);
                    if (html && html.length > 50 && !isBotChallenge('', html)) {
                        const parsedFromHtml = await extract(html);
                        if (parsedFromHtml && (parsedFromHtml.title || parsedFromHtml.content) && !isBotChallenge(parsedFromHtml.title, parsedFromHtml.content)) {
                            article = parsedFromHtml;
                            tierUsed = 'Tier 2 (@extractus da HTML)';
                        }
                    }
                }
            } catch (e2) {}
        }
    }

    // 4) Tier 3: Puppeteer fallback (real Chrome DOM evaluation to bypass bot challenges/JS)
    if (!article || (!article.title && !article.content) || isBotChallenge(article.title, article.content)) {
        try {
            console.log(`[Estrattore Tier 3] Fallback Puppeteer per: ${url}`);
            const puppeteerResult = await extractWithPuppeteer(url);
            if (puppeteerResult && (puppeteerResult.title || puppeteerResult.content)) {
                if (!isBotChallenge(puppeteerResult.title, puppeteerResult.content)) {
                    article = puppeteerResult;
                    tierUsed = 'Tier 3 (Puppeteer Chrome)';
                } else {
                    console.warn(`[Estrattore Tier 3] Puppeteer ha ancora schermata bot (${puppeteerResult.title})`);
                }
            }
        } catch (puppeteerErr) {
            console.warn(`[Estrattore Tier 3] Fallback Puppeteer non riuscito:`, puppeteerErr.message);
        }
    }

    // Final validation: reject if null, empty or STILL a bot challenge
    if (!article || (!article.title && !article.content && !article.description) || isBotChallenge(article.title, article.content || article.description)) {
        throw new Error(`Impossibile estrarre automaticamente i contenuti da questo sito (il sito è protetto da un blocco anti-bot/Cloudflare o richiede login). Usa l'inserimento manuale.`);
    }

    console.log(`[Estrattore] OK via ${tierUsed}: "${(article.title || '').slice(0, 60)}"`);

    const sourceName = extractSourceName(url);

    // Parallel secondary assets
    // Only take a screenshot if requested and if article doesn't already have an image
    const hasImage = Boolean(article.image);
    const shouldTakeScreenshot = !options.skipScreenshot && !hasImage;

    const screenshotTask = shouldTakeScreenshot
        ? takeScreenshot(url).catch(e => { console.log('[Screenshot Notice]:', e.message); return null; })
        : Promise.resolve(null);

    const logoTask = extractLogo(url, sourceName).catch(e => { console.log('[Logo Notice]:', e.message); return null; });
    const imageTask = hasImage ? downloadImageAsBase64(article.image).catch(e => { console.log('[Image Notice]:', e.message); return null; }) : Promise.resolve(null);

    let rawScreenshot = null;
    let logoBase64 = null;
    let imageBase64 = null;

    try {
        const results = await Promise.allSettled([screenshotTask, logoTask, imageTask]);
        rawScreenshot = results[0]?.status === 'fulfilled' ? results[0].value : null;
        logoBase64 = results[1]?.status === 'fulfilled' ? results[1].value : null;
        imageBase64 = results[2]?.status === 'fulfilled' ? results[2].value : null;
    } catch(err) {
        console.log('[Secondary Asset Notice]:', err.message);
    }

    const excerptText = cleanText(article.content || article.description || '', 500);
    const fullText = cleanText(article.content || article.description || '', 12000);
    const quotesMatches = fullText.match(/[«"“][^»"”]{20,250}[»"”]/g) || [];
    const keyQuotes = quotesMatches.slice(0, 4).map(q => q.replace(/^[«"“]|[\»"”]$/g, '').trim());

    return {
        url,
        title: (article.title || 'Titolo non disponibile').trim(),
        author: article.author || 'Autore non disponibile',
        published_date: formatDate(article.published),
        source_name: sourceName,
        source_type: extractSourceType(url),
        excerpt: excerptText,
        full_content: fullText,
        key_quotes: keyQuotes,
        word_count: fullText.split(/\s+/).length,
        reading_time_min: Math.max(1, Math.round(fullText.split(/\s+/).length / 200)),
        imageBase64,
        logoBase64,
        screenshotBase64: rawScreenshot ? (rawScreenshot.startsWith('data:') ? rawScreenshot : `data:image/png;base64,${rawScreenshot}`) : null
    };
}

module.exports = { extractArticle };
