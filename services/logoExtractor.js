const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');

// In-memory logo cache
const logoCache = new Map();

async function downloadImageAsBase64(imageUrl) {
    if (!imageUrl) return null;
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 6000);

        const response = await fetch(imageUrl, {
            signal: controller.signal,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
            }
        });
        clearTimeout(timeoutId);

        if (!response.ok) return null;
        
        const buffer = await response.arrayBuffer();
        const base64 = Buffer.from(buffer).toString('base64');
        const contentType = response.headers.get('content-type') || 'image/png';
        
        return `data:${contentType};base64,${base64}`;
    } catch (error) {
        return null;
    }
}

async function extractLogo(url, sourceName = '') {
    try {
        if (!url || !url.startsWith('http')) return null;
        const originUrl = new URL(url).origin;
        const domainHost = new URL(url).hostname.toLowerCase().replace(/^www\./, '');

        // 1. Check if a local file logo exists in /public/logos (e.g. libero.png, repubblica.png)
        const candidateNames = [
            sourceName ? sourceName.toLowerCase().replace(/[^a-z0-9]/g, '') : '',
            domainHost.replace(/[^a-z0-9]/g, ''),
            domainHost.split('.')[0]
        ].filter(Boolean);

        const logosDir = path.join(__dirname, '..', 'public', 'logos');
        if (fs.existsSync(logosDir)) {
            const files = fs.readdirSync(logosDir);
            for (const targetName of candidateNames) {
                const matchingFile = files.find(file => {
                    const ext = path.extname(file);
                    const nameWithoutExt = path.basename(file, ext).toLowerCase().replace(/[^a-z0-9]/g, '');
                    return nameWithoutExt === targetName;
                });

                if (matchingFile) {
                    console.log(`[Logo Extractor] Trovato logo locale per: ${sourceName || domainHost} (${matchingFile})`);
                    const filePath = path.join(logosDir, matchingFile);
                    const buffer = fs.readFileSync(filePath);
                    const ext = path.extname(matchingFile).toLowerCase();
                    const contentType = ext === '.svg' ? 'image/svg+xml' : (ext === '.png' ? 'image/png' : 'image/jpeg');
                    return `data:${contentType};base64,${buffer.toString('base64')}`;
                }
            }
        }

        // 2. Check cache
        if (logoCache.has(originUrl)) {
            return logoCache.get(originUrl);
        }

        console.log(`[Logo Extractor] Estrazione automatica da pagina web: ${originUrl}`);
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 7000);

        const response = await fetch(originUrl, {
            signal: controller.signal,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
            }
        });
        clearTimeout(timeoutId);
        
        if (!response.ok) return null;

        const html = await response.text();
        const $ = cheerio.load(html);
        let extractedLogoUrl = null;

        // HEURISTIC A: Check JSON-LD Schema.org (<script type="application/ld+json">)
        $('script[type="application/ld+json"]').each((i, el) => {
            if (extractedLogoUrl) return;
            try {
                const json = JSON.parse($(el).html());
                const objects = Array.isArray(json) ? json : [json];
                for (const obj of objects) {
                    if (obj.publisher && obj.publisher.logo) {
                        extractedLogoUrl = typeof obj.publisher.logo === 'string' ? obj.publisher.logo : (obj.publisher.logo.url || obj.publisher.logo.contentUrl);
                        if (extractedLogoUrl) break;
                    }
                    if (obj.logo) {
                        extractedLogoUrl = typeof obj.logo === 'string' ? obj.logo : (obj.logo.url || obj.logo.contentUrl);
                        if (extractedLogoUrl) break;
                    }
                }
            } catch(e){}
        });

        // HEURISTIC B: Check <picture> and <img> tags with class/id/alt/src matching 'logo' or header container
        if (!extractedLogoUrl) {
            let bestScore = -1;
            let bestSrc = null;

            $('img, picture source').each((i, el) => {
                const $el = $(el);
                const src = $el.attr('src') || $el.attr('srcset') || $el.attr('data-src');
                if (!src) return;

                const cleanSrc = src.split(',')[0].split(' ')[0]; // Handle srcset
                const alt = ($el.attr('alt') || '').toLowerCase();
                const className = ($el.attr('class') || '').toLowerCase();
                const id = ($el.attr('id') || '').toLowerCase();
                const srcLower = cleanSrc.toLowerCase();
                
                let score = 0;
                if (className.includes('logo') || id.includes('logo') || srcLower.includes('logo') || alt.includes('logo')) {
                    score += 15;
                }
                if ($el.closest('header, nav, .header, .nav, #header, #nav, .site-header, .brand').length > 0) {
                    score += 8;
                }
                if ($el.closest('a[href="/"], a[href="' + originUrl + '"]').length > 0) {
                    score += 10;
                }

                if (srcLower.includes('icon') || srcLower.includes('avatar') || srcLower.includes('banner')) score -= 15;
                if (srcLower.endsWith('.gif')) score -= 10;

                if (score > bestScore && score > 5) {
                    bestScore = score;
                    bestSrc = cleanSrc;
                }
            });

            if (bestSrc) extractedLogoUrl = bestSrc;
        }

        // HEURISTIC C: OpenGraph & Apple Touch Icons
        if (!extractedLogoUrl) {
            const metaSelectors = [
                'link[rel="apple-touch-icon-precomposed"]',
                'link[rel="apple-touch-icon"]',
                'meta[property="og:logo"]',
                'link[rel="icon"][sizes="192x192"]',
                'link[rel="icon"][sizes="128x128"]',
                'link[rel="icon"][type="image/png"]'
            ];

            for (const selector of metaSelectors) {
                const el = $(selector).first();
                if (el.length > 0) {
                    const val = el.attr('href') || el.attr('content');
                    if (val && !val.includes('avatar')) {
                        extractedLogoUrl = val;
                        break;
                    }
                }
            }
        }

        // Resolve absolute URL & Fallback to High-Res Favicon API
        let finalLogoBase64 = null;
        if (extractedLogoUrl) {
            const resolvedUrl = new URL(extractedLogoUrl, originUrl).href;
            finalLogoBase64 = await downloadImageAsBase64(resolvedUrl);
        }

        if (!finalLogoBase64) {
            const highResFaviconUrl = `https://www.google.com/s2/favicons?domain=${domainHost}&sz=128`;
            finalLogoBase64 = await downloadImageAsBase64(highResFaviconUrl);
        }

        if (finalLogoBase64) {
            logoCache.set(originUrl, finalLogoBase64);
        }
        
        return finalLogoBase64;
    } catch (error) {
        console.error(`[Logo Extractor] Errore estrazione da ${url}:`, error.message);
        return null;
    }
}

module.exports = {
    extractLogo,
    downloadImageAsBase64
};
