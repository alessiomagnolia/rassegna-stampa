const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');

// Simple in-memory cache
const logoCache = new Map();

async function downloadImageAsBase64(imageUrl) {
    try {
        const response = await fetch(imageUrl);
        if (!response.ok) return null;
        
        const buffer = await response.arrayBuffer();
        const base64 = Buffer.from(buffer).toString('base64');
        const contentType = response.headers.get('content-type') || 'image/png';
        
        return `data:${contentType};base64,${base64}`;
    } catch (error) {
        console.error(`Failed to download image ${imageUrl}:`, error.message);
        return null;
    }
}

async function extractLogo(url, sourceName = '') {
    try {
        const originUrl = new URL(url).origin;
        
        // 1. Check if a local logo exists for this sourceName
        if (sourceName) {
            const normalizedSource = sourceName.toLowerCase().replace(/[^a-z0-9]/g, '');
            const logosDir = path.join(__dirname, '..', 'public', 'logos');
            if (fs.existsSync(logosDir)) {
                const files = fs.readdirSync(logosDir);
                const matchingFile = files.find(file => {
                    const ext = path.extname(file);
                    const nameWithoutExt = path.basename(file, ext).toLowerCase().replace(/[^a-z0-9]/g, '');
                    return nameWithoutExt === normalizedSource;
                });

                if (matchingFile) {
                    console.log(`[Logo] Trovato logo locale per: ${sourceName} (${matchingFile})`);
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

        console.log(`[Logo] Cerco logo per: ${originUrl}`);
        const response = await fetch(originUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            }
        });
        
        if (!response.ok) {
            return null;
        }

        const html = await response.text();
        const $ = cheerio.load(html);
        
        let logoUrl = null;

        // 1. Try to find the real logo image using heuristics
        let bestScore = -1;
        let bestImgSrc = null;

        $('img').each((i, el) => {
            const $el = $(el);
            const src = $el.attr('src') || $el.attr('data-src');
            if (!src) return;

            const alt = ($el.attr('alt') || '').toLowerCase();
            const className = ($el.attr('class') || '').toLowerCase();
            const id = ($el.attr('id') || '').toLowerCase();
            const srcLower = src.toLowerCase();
            
            let score = 0;

            if (className.includes('logo')) score += 10;
            if (id.includes('logo')) score += 10;
            if (srcLower.includes('logo')) score += 10;
            if (alt.includes('logo')) score += 5;

            const parentA = $el.closest('a');
            if (parentA.length > 0) {
                const href = parentA.attr('href');
                if (href === '/' || href === originUrl || href === originUrl + '/') {
                    score += 8;
                }
            }

            const inHeader = $el.closest('header, nav, .header, .nav, #header, #nav').length > 0;
            if (inHeader) score += 5;

            if (srcLower.includes('icon') || srcLower.includes('avatar') || srcLower.includes('spinner')) score -= 20;
            if (className.includes('icon') || id.includes('icon')) score -= 20;
            if (srcLower.endsWith('.gif')) score -= 10;

            if (score > bestScore && score > 0) {
                bestScore = score;
                bestImgSrc = src;
            }
        });

        if (bestScore > 0 && bestImgSrc) {
            logoUrl = bestImgSrc;
        } else {
            // 2. Fallback to priority order for metadata/favicons
            const selectors = [
                'meta[property="og:image"]',
                'link[rel="apple-touch-icon"]',
                'link[rel="icon"][type="image/png"]',
                'link[rel="shortcut icon"]',
                'link[rel="icon"]'
            ];

            for (const selector of selectors) {
                const element = $(selector).first();
                if (element.length > 0) {
                    const val = element.attr('href') || element.attr('content');
                    if (val && !val.includes('avatar') && !val.includes('icon-')) {
                        logoUrl = val;
                        break;
                    }
                }
            }
        }

        // Resolve absolute URL
        if (logoUrl) {
            logoUrl = new URL(logoUrl, originUrl).href;
        } else {
            // Fallback to favicon.ico
            logoUrl = `${originUrl}/favicon.ico`;
        }

        const base64Logo = await downloadImageAsBase64(logoUrl);
        
        if (base64Logo) {
            logoCache.set(originUrl, base64Logo);
        }
        
        return base64Logo;
    } catch (error) {
        console.error(`[Logo] Errore estrazione logo da ${url}:`, error.message);
        return null;
    }
}

module.exports = {
    extractLogo,
    downloadImageAsBase64
};
