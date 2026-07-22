// ---------------------------------------------------------------------------
// KEYWORD BOLDING
// Highlights words from rassegna title and client name in the article text
// ---------------------------------------------------------------------------
function buildKeywordRegex(title, clientName) {
    const stopWords = new Set([
        'il','lo','la','i','gli','le','un','uno','una','di','da','in','con',
        'su','per','tra','fra','che','non','più','del','dell','della','dello',
        'dei','degli','delle','al','alla','allo','ai','agli','alle','nel',
        'nella','nello','nei','negli','nelle','sul','sulla','sullo','sui',
        'sugli','sulle','come','sono','era','hanno','anche','dopo','prima',
    ]);

    const allWords = [title, clientName]
        .filter(Boolean)
        .join(' ')
        // Keep accented letters, letters, spaces
        .split(/[\s\-–—_\/]+/)
        .map(w => w.replace(/[^a-zA-ZàèéìòùÀÈÉÌÒÙ]/g, '').toLowerCase())
        .filter(w => w.length >= 4 && !stopWords.has(w));

    const unique = [...new Set(allWords)];
    if (unique.length === 0) return null;

    // Sort longest first to avoid partial match issues
    unique.sort((a, b) => b.length - a.length);

    // Escape regex special chars
    const pattern = unique.map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');

    // Use case-insensitive flag; word boundary via lookahead/behind for Unicode compat
    return new RegExp(`(?<![a-zA-ZàèéìòùÀÈÉÌÒÙ])(${pattern})(?![a-zA-ZàèéìòùÀÈÉÌÒÙ])`, 'gi');
}

function boldKeywords(text, regex) {
    if (!regex || !text) return text;
    return text.replace(regex, '<strong style="color:#1a1a2e;font-weight:700;">$1</strong>');
}

// ---------------------------------------------------------------------------
// MAIN BUILDER
// ---------------------------------------------------------------------------
function buildPDFHTML(articles, options) {
    const { title, userName, clientName, clientLogo, userLogo } = options;

    // Prepare keyword regex once for all articles
    const keywordRegex = buildKeywordRegex(title, clientName);

    // Create Italian date string
    const today = new Date();
    const dateStr = `${today.getDate().toString().padStart(2, '0')}/${(today.getMonth() + 1).toString().padStart(2, '0')}/${today.getFullYear()}`;

    let html = `
<!DOCTYPE html>
<html lang="it">
<head>
    <meta charset="UTF-8">
    <title>${title || 'Rassegna Stampa'}</title>
    <style>
        @page { size: A4; margin: 0; }
        
        * { box-sizing: border-box; margin: 0; padding: 0; }

        body {
            font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
            background-color: white;
            color: #333;
            -webkit-font-smoothing: antialiased;
        }

        .page {
            width: 210mm;
            height: 297mm;
            page-break-after: always;
            position: relative;
            background: white;
            padding: 15mm;
            overflow: hidden;
            display: flex;
            flex-direction: column;
        }
        .page:last-child { page-break-after: auto; }

        /* --- COVER PAGE --- */
        .cover-page {
            display: flex; flex-direction: column;
            justify-content: space-between;
            padding: 20mm; text-align: center;
            background-color: white;
            position: relative; z-index: 1;
        }
        .cover-bg-orb-1 {
            position: absolute; top: 20%; left: -30mm;
            width: 150mm; height: 150mm;
            background: radial-gradient(circle, rgba(124,92,255,0.05) 0%, transparent 70%);
            z-index: -1;
        }
        .cover-bg-orb-2 {
            position: absolute; bottom: 20%; right: -30mm;
            width: 150mm; height: 150mm;
            background: radial-gradient(circle, rgba(0,212,170,0.05) 0%, transparent 70%);
            z-index: -1;
        }
        .cover-top {
            height: 60mm; display: flex;
            align-items: flex-start; justify-content: center;
        }
        .client-logo { max-width: 150mm; max-height: 50mm; object-fit: contain; }
        .cover-center {
            position: relative; flex: 1;
            display: flex; flex-direction: column;
            justify-content: center; align-items: center;
            margin: 0 15mm; padding: 20mm 0;
        }
        .cover-title { font-size: 38pt; font-weight: 700; color: #1a1a2e; margin-bottom: 8mm; line-height: 1.2; }
        .cover-subtitle { font-size: 18pt; color: #555; margin-bottom: 6mm; font-family: 'Times New Roman', Times, serif; font-style: italic; }
        .cover-date { font-size: 14pt; color: #888; letter-spacing: 2px; text-transform: uppercase; }
        .cover-decor { width: 30mm; height: 3px; background: linear-gradient(90deg,#7c5cff,#00d4aa); margin: 10mm auto 15mm; border-radius: 2px; }
        .cover-bottom { height: 40mm; display: flex; align-items: flex-end; justify-content: center; }
        .agency-logo { max-width: 40mm; max-height: 20mm; object-fit: contain; }

        /* --- ARTICLE PAGE HEADER (default: light) --- */
        .header {
            flex: 0 0 auto;
            display: flex; justify-content: space-between; align-items: center;
            height: 25mm; padding: 0 5mm;
            background-color: #f8f9fa;
            border-bottom: 3px solid transparent;
            border-image: linear-gradient(to right, #7c5cff, #00d4aa) 1;
            margin-bottom: 10mm;
        }

        /* Dark header variant — activated by class or auto-detection via JS */
        .header.dark-header,
        .header[data-dark="1"] {
            background-color: #1a1a2e !important;
        }
        .header.dark-header .header-right,
        .header[data-dark="1"] .header-right {
            color: #cccccc !important;
        }
        .header.dark-header .source-type-badge,
        .header[data-dark="1"] .source-type-badge {
            background-color: #2a2a3e !important;
            color: #aaaaaa !important;
        }
        .header.dark-header .source-name-large,
        .header[data-dark="1"] .source-name-large {
            color: #ffffff !important;
        }

        .header-left { width: 50%; display: flex; justify-content: flex-start; align-items: center; }
        .header-right {
            width: 50%; font-size: 11pt; color: #666;
            text-align: right; display: flex; flex-direction: column;
            justify-content: center; align-items: flex-end; gap: 3px;
        }
        .source-type-badge {
            display: inline-block; background-color: #eef2f5; color: #555;
            padding: 2px 6px; border-radius: 4px; font-size: 7pt;
            font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px;
        }
        .source-logo-large { max-height: 18mm; max-width: 100%; object-fit: contain; }
        .source-name-large { font-size: 16pt; font-weight: 700; color: #1a1a2e; }

        .title-zone { flex: 0 0 auto; padding: 0 5mm; margin-bottom: 8mm; border-left: 4px solid #7c5cff; }
        .article-source-label { font-size: 8pt; color: #888; font-weight: 600; text-transform: uppercase; margin-bottom: 2mm; letter-spacing: 0.5px; }
        .article-title { font-size: 20pt; font-weight: 700; color: #1a1a2e; line-height: 1.3; }

        .visual-zone {
            flex: 0 0 auto; margin: 0 5mm 10mm; text-align: center;
            max-height: 70mm; overflow: hidden; border-radius: 8px;
            box-shadow: 0 4px 15px rgba(0,0,0,0.1);
            display: flex; justify-content: center; align-items: center;
        }
        .main-visual { width: 100%; height: auto; max-height: 70mm; object-fit: contain; object-position: top center; display: block; }

        .content-zone { flex: 1 1 auto; padding: 0 5mm; margin-bottom: 5mm; overflow: hidden; }
        .content-text {
            font-size: 11pt; line-height: 1.6; color: #333;
            text-align: justify; font-family: 'Times New Roman', Times, serif;
            display: -webkit-box; -webkit-box-orient: vertical; overflow: hidden;
        }
        /* Bold keyword highlight */
        .content-text strong { font-weight: 700; color: #1a1a2e; }

        .footer {
            flex: 0 0 10mm; display: flex; justify-content: space-between; align-items: flex-end;
            border-top: 1px solid #e0e0e0; padding-top: 3mm; padding-left: 5mm; padding-right: 5mm;
        }
        .footer-link { font-size: 9pt; color: #0066CC; text-decoration: none; max-width: 80%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .footer-page { font-size: 9pt; color: #888; }
    </style>
</head>
<body>
    `;

    // 1. Optional Cover Page
    if (title) {
        html += `
    <div class="page cover-page">
        <div class="cover-bg-orb-1"></div>
        <div class="cover-bg-orb-2"></div>
        <div class="cover-top">
            ${clientLogo ? `<img src="${clientLogo}" class="client-logo" alt="Client Logo">` : ''}
        </div>
        <div class="cover-center">
            <div class="cover-title">${title}</div>
            <div class="cover-decor"></div>
            <div class="cover-subtitle">${clientName || ''}</div>
            <div class="cover-date">${dateStr}</div>
        </div>
        <div class="cover-bottom">
            ${userLogo ? `<img src="${userLogo}" class="agency-logo" alt="Agency Logo">` : ''}
        </div>
    </div>
        `;
    }

    // 2. Article Pages
    articles.forEach((article, index) => {
        // Manual dark header: class + data-dark=1 so Puppeteer auto-detection skips it
        const darkClass = article.darkHeader ? 'dark-header' : '';
        const skipAttr  = article.darkHeader ? 'data-dark="1"' : '';

        // Bold keywords in the excerpt (plain text in, HTML out)
        const processedExcerpt = boldKeywords(article.excerpt || '', keywordRegex);
        const clampLines = article.imageBase64 ? 14 : 28;

        html += `
    <div class="page">
        <!-- HEADER -->
        <div class="header ${darkClass}" ${skipAttr}>
            <div class="header-left">
                ${article.logoBase64
                    ? `<img src="${article.logoBase64}" class="source-logo-large" alt="Source Logo">`
                    : `<div class="source-name-large">${article.source_name || ''}</div>`}
            </div>
            <div class="header-right">
                <span>${article.published_date || ''}</span>
                <span class="source-type-badge">${article.source_type || 'Web'}</span>
            </div>
        </div>

        <!-- TITLE -->
        <div class="title-zone">
            <div class="article-source-label">${article.source_name || ''}</div>
            <div class="article-title">${article.title || ''}</div>
        </div>
        ${article.imageBase64 ? `
        <div class="visual-zone">
            <img src="${article.imageBase64}" class="main-visual" alt="Article Image">
        </div>` : ''}
        <div class="content-zone">
            <div class="content-text" style="-webkit-line-clamp: ${clampLines};">
                ${processedExcerpt}
            </div>
        </div>

        <!-- FOOTER -->
        <div class="footer">
            <a href="${article.url || ''}" class="footer-link">${article.url || ''}</a>
            <div class="footer-page">Pagina ${title ? index + 2 : index + 1} di ${title ? articles.length + 1 : articles.length}</div>
        </div>
    </div>
        `;
    });

    html += `
</body>
</html>
    `;

    return html;
}

module.exports = { buildPDFHTML };
