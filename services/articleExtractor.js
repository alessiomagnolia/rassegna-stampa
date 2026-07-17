const { takeScreenshot } = require('./screenshotService');
const { extractLogo, downloadImageAsBase64 } = require('./logoExtractor');

let extractorModule = null;

async function getExtractor() {
    if (!extractorModule) {
        // Use dynamic import for ESM module
        extractorModule = await import('@extractus/article-extractor');
    }
    return extractorModule.extract;
}

function cleanText(html, wordLimit = 500) {
    if (!html) return '';
    // Strip HTML tags using regex
    let text = html.replace(/<[^>]*>?/gm, ' ');
    
    // Remove common UI artifacts and boilerplate
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

    // Remove extra spaces
    text = text.replace(/\s+/g, ' ').trim();
    
    // Limit words
    const words = text.split(' ');
    if (words.length > wordLimit) {
        return words.slice(0, wordLimit).join(' ') + '...';
    }
    return text;
}

function extractSourceName(urlStr) {
    try {
        const hostname = new URL(urlStr).hostname;
        // Remove www. and get main domain part
        const parts = hostname.replace(/^www\./, '').split('.');
        if (parts.length > 0) {
            // Capitalize first letter
            return parts[0].charAt(0).toUpperCase() + parts[0].slice(1);
        }
        return hostname;
    } catch (e) {
        return 'Fonte sconosciuta';
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

async function extractArticle(url) {
    try {
        const extract = await getExtractor();
        
        console.log(`[Estrattore] Analisi di: ${url}`);
        const article = await extract(url);
        
        if (!article) {
            throw new Error('Impossibile estrarre il contenuto dall\'URL.');
        }

        // Run heavy tasks in parallel
        console.log(`[Estrattore] Recupero immagini e screenshot in parallelo...`);
        const [screenshotBase64, logoBase64, imageBase64] = await Promise.all([
            takeScreenshot(url),
            extractLogo(url),
            article.image ? downloadImageAsBase64(article.image) : Promise.resolve(null)
        ]);

        return {
            url,
            title: article.title || 'Titolo non disponibile',
            author: article.author || 'Autore non disponibile',
            published_date: formatDate(article.published),
            source_name: extractSourceName(url),
            excerpt: cleanText(article.content, 500),
            imageBase64,
            logoBase64,
            screenshotBase64: screenshotBase64 ? `data:image/png;base64,${screenshotBase64}` : null
        };

    } catch (error) {
        console.error(`[Estrattore] Errore fatale:`, error);
        throw new Error(`Errore durante l'estrazione: ${error.message}`);
    }
}

module.exports = {
    extractArticle
};
