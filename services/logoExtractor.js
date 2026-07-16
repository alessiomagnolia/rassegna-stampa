const cheerio = require('cheerio');

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

async function extractLogo(url) {
    try {
        const originUrl = new URL(url).origin;
        
        // Check cache
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

        // Try priority order
        const selectors = [
            'link[rel="apple-touch-icon"]',
            'meta[property="og:image"]',
            'link[rel="icon"][type="image/png"]',
            'link[rel="shortcut icon"]',
            'link[rel="icon"]'
        ];

        for (const selector of selectors) {
            const element = $(selector).first();
            if (element.length > 0) {
                const val = element.attr('href') || element.attr('content');
                if (val) {
                    logoUrl = val;
                    break;
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
