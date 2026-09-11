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

function formatLinkUrl(url) {
    if (!url) return '#';
    let str = String(url).trim();
    if (!str) return '#';
    if (!/^https?:\/\//i.test(str)) {
        str = 'https://' + str;
    }
    return str;
}

// ---------------------------------------------------------------------------
// MAIN BUILDER SWITCH
// ---------------------------------------------------------------------------
function buildPDFHTML(articles, options = {}) {
    const templateId = options.templateId || 'classic';
    if (templateId === 'modern') {
        return buildModernHTML(articles, options);
    } else if (templateId === 'minimal') {
        return buildMinimalHTML(articles, options);
    }
    return buildClassicHTML(articles, options);
}

// ---------------------------------------------------------------------------
// PR ANALYTICS & SENTIMENT EXECUTIVE PAGE
// ---------------------------------------------------------------------------
function buildAnalyticsPageHTML(analytics, options = {}) {
    const { title, clientName } = options;
    const posPct = analytics.sentimentDistribution.positivePct;
    const neuPct = analytics.sentimentDistribution.neutralPct;
    const criPct = analytics.sentimentDistribution.criticalPct;

    return `
    <div class="page" style="padding: 16mm 18mm; display: flex; flex-direction: column; justify-content: space-between; background: #ffffff; page-break-after: always;">
        <div>
            <!-- Section Header -->
            <div style="border-bottom: 2px solid #1a1a2e; padding-bottom: 4mm; margin-bottom: 7mm; display: flex; justify-content: space-between; align-items: flex-end;">
                <div>
                    <div style="font-size: 8pt; font-weight: 700; text-transform: uppercase; letter-spacing: 1.5px; color: #7c5cff; margin-bottom: 1.5mm;">Executive Overview & PR Intelligence</div>
                    <div style="font-size: 17pt; font-weight: 700; color: #1a1a2e; font-family: 'Helvetica Neue', Arial, sans-serif;">Rapporto di Impatto e Visibilità Media</div>
                </div>
                <div style="text-align: right; font-size: 8.5pt; color: #666;">
                    ${clientName ? `<div>Cliente: <strong>${clientName}</strong></div>` : ''}
                    <div>Uscite analizzate: <strong>${analytics.totalArticles}</strong></div>
                </div>
            </div>

            <!-- Top 4 KPI Cards -->
            <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 4mm; margin-bottom: 7mm;">
                <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 4px; padding: 4mm; text-align: center;">
                    <div style="font-size: 7pt; text-transform: uppercase; letter-spacing: 0.8px; color: #64748b; margin-bottom: 1.5mm;">Uscite Totali</div>
                    <div style="font-size: 19pt; font-weight: 800; color: #1a1a2e;">${analytics.totalArticles}</div>
                    <div style="font-size: 7pt; color: #94a3b8; margin-top: 1mm;">ritagli stampa</div>
                </div>
                <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 4px; padding: 4mm; text-align: center;">
                    <div style="font-size: 7pt; text-transform: uppercase; letter-spacing: 0.8px; color: #64748b; margin-bottom: 1.5mm;">Testate Monitorate</div>
                    <div style="font-size: 19pt; font-weight: 800; color: #1a1a2e;">${analytics.uniqueOutlets}</div>
                    <div style="font-size: 7pt; color: #94a3b8; margin-top: 1mm;">fonti uniche</div>
                </div>
                <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 4px; padding: 4mm; text-align: center;">
                    <div style="font-size: 7pt; text-transform: uppercase; letter-spacing: 0.8px; color: #64748b; margin-bottom: 1.5mm;">Reach Stimata</div>
                    <div style="font-size: 19pt; font-weight: 800; color: #7c5cff;">~${analytics.formattedReach}</div>
                    <div style="font-size: 7pt; color: #94a3b8; margin-top: 1mm;">lettori potenziali</div>
                </div>
                <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 4px; padding: 4mm; text-align: center;">
                    <div style="font-size: 7pt; text-transform: uppercase; letter-spacing: 0.8px; color: #64748b; margin-bottom: 1.5mm;">Sentiment Generale</div>
                    <div style="font-size: 13pt; font-weight: 700; color: #059669; padding-top: 2mm;">${analytics.overallSentiment}</div>
                    <div style="font-size: 7pt; color: #94a3b8; margin-top: 1mm;">tono prevalente</div>
                </div>
            </div>

            <!-- Sentiment Distribution Section -->
            <div style="background: #ffffff; border: 1px solid #e2e8f0; border-radius: 4px; padding: 4.5mm; margin-bottom: 7mm;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 3mm;">
                    <div style="font-size: 8.5pt; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; color: #334155;">Distribuzione Sentiment Copertura</div>
                    <div style="font-size: 7.5pt; color: #64748b;">
                        <span style="color: #059669; font-weight: 600;">● Positivo: ${posPct}%</span> &nbsp;|&nbsp; 
                        <span style="color: #64748b; font-weight: 600;">● Neutro: ${neuPct}%</span> &nbsp;|&nbsp; 
                        <span style="color: #dc2626; font-weight: 600;">● Critico: ${criPct}%</span>
                    </div>
                </div>
                <!-- Visual Bar -->
                <div style="display: flex; height: 8mm; border-radius: 3px; overflow: hidden; background: #e2e8f0;">
                    ${posPct > 0 ? `<div style="width: ${posPct}%; background: #10b981; display: flex; align-items: center; justify-content: center; color: white; font-size: 7pt; font-weight: bold;">${posPct > 8 ? posPct + '%' : ''}</div>` : ''}
                    ${neuPct > 0 ? `<div style="width: ${neuPct}%; background: #94a3b8; display: flex; align-items: center; justify-content: center; color: white; font-size: 7pt; font-weight: bold;">${neuPct > 8 ? neuPct + '%' : ''}</div>` : ''}
                    ${criPct > 0 ? `<div style="width: ${criPct}%; background: #ef4444; display: flex; align-items: center; justify-content: center; color: white; font-size: 7pt; font-weight: bold;">${criPct > 8 ? criPct + '%' : ''}</div>` : ''}
                </div>
            </div>

            <!-- Media Breakdown & Top Sources Grid -->
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 5mm;">
                <!-- Media Tier Breakdown -->
                <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 4px; padding: 4mm;">
                    <div style="font-size: 8pt; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; color: #334155; margin-bottom: 3mm; border-bottom: 1px solid #cbd5e1; padding-bottom: 2mm;">
                        Ripartizione Autorevolezza Testate
                    </div>
                    <div style="font-size: 8pt; line-height: 1.9;">
                        <div style="display: flex; justify-content: space-between;">
                            <span><strong>Tier 1</strong> — Grandi Quotidiani & Network Nazionali:</span>
                            <strong>${analytics.tierDistribution.tier1} articoli</strong>
                        </div>
                        <div style="display: flex; justify-content: space-between;">
                            <span><strong>Tier 2</strong> — Testate Regionali & Settoriali B2B:</span>
                            <strong>${analytics.tierDistribution.tier2} articoli</strong>
                        </div>
                        <div style="display: flex; justify-content: space-between;">
                            <span><strong>Tier 3</strong> — Portali Digitali & Web Media:</span>
                            <strong>${analytics.tierDistribution.tier3} articoli</strong>
                        </div>
                    </div>
                </div>

                <!-- Top Outlets Table -->
                <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 4px; padding: 4mm;">
                    <div style="font-size: 8pt; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; color: #334155; margin-bottom: 3mm; border-bottom: 1px solid #cbd5e1; padding-bottom: 2mm;">
                        Principali Testate Rilevate
                    </div>
                    <table style="width: 100%; border-collapse: collapse; font-size: 7.5pt;">
                        ${(analytics.topOutlets || []).slice(0, 5).map((out, idx) => `
                        <tr style="border-bottom: 1px solid #e2e8f0;">
                            <td style="padding: 1.2mm 0; color: #475569;">${idx + 1}. <strong>${out.name}</strong></td>
                            <td style="padding: 1.2mm 0; text-align: right; font-weight: bold; color: #1e293b;">${out.count} ${out.count === 1 ? 'uscita' : 'uscite'}</td>
                        </tr>`).join('')}
                    </table>
                </div>
            </div>
        </div>

        <!-- Footer Notice -->
        <div style="border-top: 1px solid #e2e8f0; padding-top: 3mm; font-size: 7pt; color: #94a3b8; display: flex; justify-content: space-between;">
            <span>Metriche generate automaticamente tramite analisi semantica e classificazione media.</span>
            <span>Rassegna Stampa Intelligence</span>
        </div>
    </div>`;
}

// ---------------------------------------------------------------------------
// TEMPLATE 1: CLASSICO CORPORATE (INVARIATO)
// ---------------------------------------------------------------------------
function buildClassicHTML(articles, options) {
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
            display: flex;
            flex-direction: column;
            overflow: hidden;
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
            display: flex; justify-content: space-between; align-items: center;
            height: 25mm; padding: 0 5mm;
            background-color: #f8f9fa;
            border-bottom: 3px solid transparent;
            border-image: linear-gradient(to right, #7c5cff, #00d4aa) 1;
            margin-bottom: 10mm;
            page-break-inside: avoid;
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

        .title-zone { padding: 0 5mm; margin-bottom: 8mm; border-left: 4px solid #7c5cff; page-break-inside: avoid; }
        .article-source-label { font-size: 8pt; color: #888; font-weight: 600; text-transform: uppercase; margin-bottom: 2mm; letter-spacing: 0.5px; }
        .article-title { font-size: 20pt; font-weight: 700; color: #1a1a2e; line-height: 1.3; }

        .visual-zone {
            flex: 0 0 auto; margin: 0 5mm 10mm; text-align: center;
            max-height: 70mm; overflow: hidden; border-radius: 8px;
            box-shadow: 0 4px 15px rgba(0,0,0,0.1);
            display: flex; justify-content: center; align-items: center;
        }
        .main-visual { width: 100%; height: auto; max-height: 70mm; object-fit: contain; object-position: top center; display: block; }

        .content-zone { flex: 1 1 auto; padding: 0 5mm; margin-bottom: 5mm; overflow: hidden; position: relative; }
        .content-text {
            font-size: 11pt; line-height: 1.6; color: #333;
            text-align: justify; font-family: 'Times New Roman', Times, serif;
            display: -webkit-box; -webkit-box-orient: vertical; overflow: hidden;
        }
        /* Fade out at the bottom to elegantly hide any partially sliced letters */
        .content-zone::after {
            content: ''; position: absolute; bottom: 0; left: 0; right: 0; height: 10mm;
            background: linear-gradient(to bottom, rgba(255,255,255,0), rgba(255,255,255,1));
            pointer-events: none;
        }
        /* Bold keyword highlight */
        .content-text strong { font-weight: 700; color: #1a1a2e; }

        .footer {
            flex: 0 0 auto; min-height: 8mm; display: flex; justify-content: space-between; align-items: center;
            border-top: 1px solid #e0e0e0; padding-top: 2.5mm; padding-left: 5mm; padding-right: 5mm; gap: 10px;
        }
        .footer-link {
            color: #0066CC; text-decoration: none;
            flex: 1 1 auto; min-width: 0; line-height: 1.25;
            word-break: break-all; overflow-wrap: anywhere;
            display: inline-block; cursor: pointer;
        }
        .footer-page { font-size: 8.5pt; color: #888; flex: 0 0 auto; white-space: nowrap; }
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

    // Optional PR Analytics Executive Summary Page
    if (options.includeAnalytics) {
        const { calculatePRAnalytics } = require('../services/analyticsService');
        const analytics = calculatePRAnalytics(articles);
        html += buildAnalyticsPageHTML(analytics, options);
    }

    // 2. Article Pages
    articles.forEach((article, index) => {
        // Manual dark header: class + data-dark=1 so Puppeteer auto-detection skips it
        const darkClass = article.darkHeader ? 'dark-header' : '';
        const skipAttr  = article.darkHeader ? 'data-dark="1"' : '';

        // Bold keywords in the excerpt (plain text in, HTML out)
        const processedExcerpt = boldKeywords(article.excerpt || '', keywordRegex);
        const clampLines = article.imageBase64 ? 14 : 28;

        const titleStyle = article.customTitleSize ? `style="font-size: ${article.customTitleSize}px;"` : '';
        const textStyle = article.customTextSize ? `style="font-size: ${article.customTextSize}px;"` : '';
        const sourceStyle = article.customSourceSize ? `style="font-size: ${article.customSourceSize}px;"` : '';
        const logoStyle = article.customLogoHeight ? `style="max-height: ${article.customLogoHeight}px; height: ${article.customLogoHeight}px;"` : '';
        const visualZoneStyle = article.customImageHeight ? `style="max-height: ${article.customImageHeight}px; height: ${article.customImageHeight}px;"` : '';
        const imgPosY = article.customImagePosY !== undefined ? article.customImagePosY : 50;
        const imgStyle = `style="object-position: center ${imgPosY}%; ${article.customImageHeight ? `max-height:${article.customImageHeight}px;` : ''}"`;

        html += `
    <div class="page">
        <!-- HEADER -->
        <div class="header ${darkClass}" ${skipAttr}>
            <div class="header-left">
                ${article.logoBase64
                    ? `<img src="${article.logoBase64}" class="source-logo-large" ${logoStyle} alt="Source Logo">`
                    : `<div class="source-name-large">${article.source_name || ''}</div>`}
            </div>
            <div class="header-right">
                <span>${article.published_date || ''}</span>
                <span class="source-type-badge">${article.source_type || 'Web'}</span>
            </div>
        </div>

        <!-- TITLE -->
        <div class="title-zone">
            <div class="article-source-label" ${sourceStyle}>${article.source_name || ''}</div>
            <div class="article-title" ${titleStyle}>${article.title || ''}</div>
        </div>
        ${article.imageBase64 ? `
        <div class="visual-zone" ${visualZoneStyle}>
            <img src="${article.imageBase64}" class="main-visual" ${imgStyle} alt="Article Image">
        </div>` : ''}
        <div class="content-zone">
            <div class="content-text" style="-webkit-line-clamp: ${clampLines}; ${article.customTextSize ? `font-size: ${article.customTextSize}px;` : ''}">
                ${processedExcerpt}
            </div>
        </div>

        <!-- FOOTER -->
        <div class="footer">
            <a href="${formatLinkUrl(article.url)}" target="_blank" rel="noopener noreferrer" class="footer-link" style="${(article.url || '').length > 110 ? 'font-size: 6.8pt;' : ((article.url || '').length > 70 ? 'font-size: 7.5pt;' : 'font-size: 8.5pt;')}" title="${article.url || ''}">${article.url || ''}</a>
            <div class="footer-page">Articolo ${index + 1} di ${articles.length}</div>
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

// ---------------------------------------------------------------------------
// TEMPLATE 2: MODERN EXECUTIVE (MODERNO & HIGH-TECH)
// ---------------------------------------------------------------------------
function buildModernHTML(articles, options) {
    const { title, userName, clientName, clientLogo, userLogo } = options;
    const keywordRegex = buildKeywordRegex(title, clientName);
    const today = new Date();
    const dateStr = `${today.getDate().toString().padStart(2, '0')}/${(today.getMonth() + 1).toString().padStart(2, '0')}/${today.getFullYear()}`;

    let html = `
<!DOCTYPE html>
<html lang="it">
<head>
    <meta charset="UTF-8">
    <title>${title || 'Rassegna Stampa'}</title>
    <style>
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap');
        @page { size: A4; margin: 0; }
        * { box-sizing: border-box; margin: 0; padding: 0; }

        body {
            font-family: 'Inter', system-ui, -apple-system, sans-serif;
            background-color: #f8fafc;
            color: #0f172a;
            -webkit-font-smoothing: antialiased;
        }

        .page {
            width: 210mm; height: 297mm;
            page-break-after: always; position: relative;
            background: #ffffff; padding: 14mm;
            display: flex; flex-direction: column; overflow: hidden;
        }
        .page:last-child { page-break-after: auto; }

        /* COVER PAGE MODERN */
        .cover-page {
            display: flex; flex-direction: column; justify-content: space-between;
            padding: 20mm; background: linear-gradient(135deg, #0f172a 0%, #1e1b4b 100%);
            color: #ffffff; text-align: center; position: relative; z-index: 1;
        }
        .cover-top { height: 55mm; display: flex; align-items: flex-start; justify-content: center; }
        .client-logo-m { max-width: 140mm; max-height: 45mm; object-fit: contain; filter: drop-shadow(0 4px 10px rgba(0,0,0,0.3)); }
        .cover-center { flex: 1; display: flex; flex-direction: column; justify-content: center; align-items: center; }
        .cover-badge-m { display: inline-block; padding: 6px 16px; background: rgba(99, 102, 241, 0.2); border: 1px solid rgba(99, 102, 241, 0.4); border-radius: 30px; font-size: 10pt; font-weight: 600; color: #818cf8; text-transform: uppercase; letter-spacing: 1.5px; margin-bottom: 8mm; }
        .cover-title-m { font-size: 34pt; font-weight: 800; color: #ffffff; margin-bottom: 6mm; line-height: 1.15; letter-spacing: -0.5px; }
        .cover-subtitle-m { font-size: 16pt; color: #94a3b8; font-weight: 400; }
        .cover-date-m { font-size: 11pt; color: #64748b; font-weight: 500; margin-top: 10mm; letter-spacing: 1px; }
        .cover-bottom { height: 35mm; display: flex; align-items: flex-end; justify-content: center; }

        /* MODERN HEADER */
        .header-m {
            display: flex; justify-content: space-between; align-items: center;
            height: 24mm; padding: 0 16px; background: #0f172a; border-radius: 10px;
            margin-bottom: 8mm; color: #ffffff; page-break-inside: avoid;
        }
        .header-m-left { width: 50%; display: flex; align-items: center; }
        .header-m-right { width: 50%; font-size: 9.5pt; color: #94a3b8; text-align: right; display: flex; flex-direction: column; align-items: flex-end; gap: 4px; }
        .source-badge-m { background: #6366f1; color: #ffffff; padding: 3px 8px; border-radius: 4px; font-size: 7.5pt; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; }
        .source-logo-m { max-height: 16mm; max-width: 100%; object-fit: contain; filter: brightness(0) invert(1); }
        .source-name-m { font-size: 15pt; font-weight: 800; color: #ffffff; }

        /* MODERN TITLE */
        .title-zone-m { padding: 0 4px; margin-bottom: 6mm; page-break-inside: avoid; }
        .title-bar-m { width: 40px; height: 4px; background: linear-gradient(90deg, #6366f1, #10b981); border-radius: 2px; margin-bottom: 8px; }
        .article-title-m { font-size: 19pt; font-weight: 800; color: #0f172a; line-height: 1.3; letter-spacing: -0.3px; }

        /* VISUAL ZONE MODERN */
        .visual-zone-m {
            flex: 0 0 auto; margin: 0 0 8mm; text-align: center;
            max-height: 68mm; overflow: hidden; border-radius: 10px;
            box-shadow: 0 10px 25px -5px rgba(15, 23, 42, 0.1); border: 1px solid #e2e8f0;
            display: flex; justify-content: center; align-items: center;
        }
        .main-visual-m { width: 100%; height: auto; max-height: 68mm; object-fit: contain; object-position: top center; display: block; }

        /* CONTENT ZONE MODERN */
        .content-zone-m { flex: 1 1 auto; padding: 0 4px; margin-bottom: 4mm; overflow: hidden; position: relative; }
        .content-text-m {
            font-size: 10.5pt; line-height: 1.65; color: #334155;
            text-align: justify; font-family: 'Inter', sans-serif; font-weight: 400;
            display: -webkit-box; -webkit-box-orient: vertical; overflow: hidden;
        }
        .content-zone-m::after {
            content: ''; position: absolute; bottom: 0; left: 0; right: 0; height: 12mm;
            background: linear-gradient(to bottom, rgba(255,255,255,0), rgba(255,255,255,1)); pointer-events: none;
        }
        .content-text-m strong { font-weight: 700; color: #4338ca; }

        /* FOOTER MODERN */
        .footer-m {
            flex: 0 0 auto; min-height: 8mm; display: flex; justify-content: space-between; align-items: center;
            border-top: 1px solid #e2e8f0; padding-top: 2.5mm; padding-left: 4px; padding-right: 4px; gap: 10px;
        }
        .footer-link-m {
            color: #6366f1; text-decoration: none; font-weight: 500;
            flex: 1 1 auto; min-width: 0; line-height: 1.25;
            word-break: break-all; overflow-wrap: anywhere;
            display: inline-block; cursor: pointer;
        }
        .footer-page-m { font-size: 8pt; color: #64748b; font-weight: 600; background: #f1f5f9; padding: 2px 8px; border-radius: 12px; flex: 0 0 auto; white-space: nowrap; }
    </style>
</head>
<body>
    ${title ? `
    <div class="page cover-page">
        <div class="cover-top">
            ${clientLogo ? `<img src="${clientLogo}" class="client-logo-m" alt="Client Logo">` : ''}
        </div>
        <div class="cover-center">
            <div class="cover-badge-m">Rassegna Stampa</div>
            <div class="cover-title-m">${title}</div>
            <div class="cover-subtitle-m">${clientName || ''}</div>
            <div class="cover-date-m">${dateStr}</div>
        </div>
        <div class="cover-bottom">
            ${userLogo ? `<img src="${userLogo}" style="max-height:22mm; filter:brightness(0) invert(1);" alt="Agency Logo">` : ''}
        </div>
    </div>` : ''}

    ${options.includeAnalytics ? buildAnalyticsPageHTML(require('../services/analyticsService').calculatePRAnalytics(articles), options) : ''}

    ${articles.map((article, index) => {
        const processedExcerpt = boldKeywords(article.excerpt || '', keywordRegex);
        const clampLines = article.imageBase64 ? 13 : 26;
        return `
    <div class="page">
        <div class="header-m">
            <div class="header-m-left">
                ${article.logoBase64
                    ? `<img src="${article.logoBase64}" class="source-logo-m" alt="Source Logo">`
                    : `<div class="source-name-m">${article.source_name || ''}</div>`}
            </div>
            <div class="header-m-right">
                <span>${article.published_date || ''}</span>
                <span class="source-badge-m">${article.source_type || 'Web'}</span>
            </div>
        </div>

        <div class="title-zone-m">
            <div class="title-bar-m"></div>
            <div class="article-title-m">${article.title || ''}</div>
        </div>

        ${article.imageBase64 ? `
        <div class="visual-zone-m">
            <img src="${article.imageBase64}" class="main-visual-m" style="object-position: ${article.imagePosition || 'top center'};" alt="Article Image">
        </div>` : ''}

        <div class="content-zone-m">
            <div class="content-text-m" style="-webkit-line-clamp: ${clampLines};">
                ${processedExcerpt}
            </div>
        </div>

        <div class="footer-m">
            <a href="${formatLinkUrl(article.url)}" target="_blank" rel="noopener noreferrer" class="footer-link-m" style="${(article.url || '').length > 110 ? 'font-size: 6.8pt;' : ((article.url || '').length > 70 ? 'font-size: 7.5pt;' : 'font-size: 8.5pt;')}" title="${article.url || ''}">${article.url || ''}</a>
            <div class="footer-page-m">PAGINA ${index + 1} DI ${articles.length}</div>
        </div>
    </div>`;
    }).join('')}
</body>
</html>`;
    return html;
}

// ---------------------------------------------------------------------------
// TEMPLATE 3: MINIMAL EDITORIAL (ELEGANTE & RIVISTA)
// ---------------------------------------------------------------------------
function buildMinimalHTML(articles, options) {
    const { title, userName, clientName, clientLogo, userLogo } = options;
    const keywordRegex = buildKeywordRegex(title, clientName);
    const today = new Date();
    const dateStr = `${today.getDate().toString().padStart(2, '0')}/${(today.getMonth() + 1).toString().padStart(2, '0')}/${today.getFullYear()}`;

    let html = `
<!DOCTYPE html>
<html lang="it">
<head>
    <meta charset="UTF-8">
    <title>${title || 'Rassegna Stampa'}</title>
    <style>
        @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,600;0,700;1,400&family=Source+Serif+4:ital,wght@0,400;0,600;1,400&display=swap');
        @page { size: A4; margin: 0; }
        * { box-sizing: border-box; margin: 0; padding: 0; }

        body {
            font-family: 'Source Serif 4', Georgia, serif;
            background-color: #faf9f6;
            color: #1c1917;
            -webkit-font-smoothing: antialiased;
        }

        .page {
            width: 210mm; height: 297mm;
            page-break-after: always; position: relative;
            background: #faf9f6; padding: 16mm;
            display: flex; flex-direction: column; overflow: hidden;
        }
        .page:last-child { page-break-after: auto; }

        /* COVER PAGE MINIMAL */
        .cover-page-e {
            display: flex; flex-direction: column; justify-content: space-between;
            padding: 22mm; background: #faf9f6; text-align: center; position: relative;
            border: 1px solid #e7e5e4; margin: 0;
        }
        .cover-top-e { height: 50mm; display: flex; align-items: flex-start; justify-content: center; }
        .client-logo-e { max-width: 140mm; max-height: 45mm; object-fit: contain; }
        .cover-center-e { flex: 1; display: flex; flex-direction: column; justify-content: center; align-items: center; }
        .cover-rule-top { width: 100%; border-top: 2px solid #1c1917; border-bottom: 1px solid #1c1917; height: 4px; margin-bottom: 10mm; }
        .cover-title-e { font-family: 'Playfair Display', Georgia, serif; font-size: 36pt; font-weight: 700; color: #1c1917; margin-bottom: 6mm; line-height: 1.2; }
        .cover-subtitle-e { font-size: 15pt; color: #78716c; font-style: italic; font-family: 'Playfair Display', serif; }
        .cover-rule-bottom { width: 100%; border-top: 1px solid #1c1917; border-bottom: 2px solid #1c1917; height: 4px; margin-top: 10mm; }
        .cover-date-e { font-size: 11pt; color: #78716c; letter-spacing: 2px; text-transform: uppercase; margin-top: 6mm; }
        .cover-bottom-e { height: 35mm; display: flex; align-items: flex-end; justify-content: center; }

        /* MINIMAL HEADER */
        .header-e {
            display: flex; justify-content: space-between; align-items: flex-end;
            padding-bottom: 3mm; border-bottom: 2px solid #1c1917;
            margin-bottom: 8mm; page-break-inside: avoid;
        }
        .header-e-left { width: 60%; display: flex; align-items: center; }
        .header-e-right { width: 40%; font-size: 9.5pt; color: #78716c; text-align: right; font-style: italic; }
        .source-logo-e { max-height: 16mm; max-width: 100%; object-fit: contain; }
        .source-name-e { font-family: 'Playfair Display', serif; font-size: 18pt; font-weight: 700; color: #1c1917; }

        /* MINIMAL TITLE */
        .title-zone-e { margin-bottom: 6mm; page-break-inside: avoid; }
        .article-title-e { font-family: 'Playfair Display', Georgia, serif; font-size: 21pt; font-weight: 700; color: #1c1917; line-height: 1.25; }

        /* VISUAL ZONE MINIMAL */
        .visual-zone-e {
            flex: 0 0 auto; margin: 0 0 8mm; text-align: center;
            max-height: 68mm; overflow: hidden; border-radius: 2px;
            display: flex; justify-content: center; align-items: center;
        }
        .main-visual-e { width: 100%; height: auto; max-height: 68mm; object-fit: contain; object-position: top center; display: block; }

        /* CONTENT ZONE MINIMAL */
        .content-zone-e { flex: 1 1 auto; margin-bottom: 4mm; overflow: hidden; position: relative; }
        .content-text-e {
            font-size: 11pt; line-height: 1.7; color: #292524;
            text-align: justify; font-family: 'Source Serif 4', Georgia, serif;
            display: -webkit-box; -webkit-box-orient: vertical; overflow: hidden;
        }
        .content-zone-e::after {
            content: ''; position: absolute; bottom: 0; left: 0; right: 0; height: 12mm;
            background: linear-gradient(to bottom, rgba(250,249,246,0), rgba(250,249,246,1)); pointer-events: none;
        }
        .content-text-e strong { font-weight: 700; color: #000000; }

        /* FOOTER MINIMAL */
        .footer-e {
            flex: 0 0 auto; min-height: 8mm; display: flex; justify-content: space-between; align-items: center;
            border-top: 1px solid #d6d3d1; padding-top: 2.5mm; gap: 10px;
        }
        .footer-link-e {
            color: #57534e; text-decoration: none; font-style: italic;
            flex: 1 1 auto; min-width: 0; line-height: 1.25;
            word-break: break-all; overflow-wrap: anywhere;
            display: inline-block; cursor: pointer;
        }
        .footer-page-e { font-size: 8pt; color: #78716c; font-style: italic; flex: 0 0 auto; white-space: nowrap; }
    </style>
</head>
<body>
    ${title ? `
    <div class="page cover-page-e">
        <div class="cover-top-e">
            ${clientLogo ? `<img src="${clientLogo}" class="client-logo-e" alt="Client Logo">` : ''}
        </div>
        <div class="cover-center-e">
            <div class="cover-rule-top"></div>
            <div class="cover-title-e">${title}</div>
            <div class="cover-subtitle-e">${clientName || ''}</div>
            <div class="cover-rule-bottom"></div>
            <div class="cover-date-e">${dateStr}</div>
        </div>
        <div class="cover-bottom-e">
            ${userLogo ? `<img src="${userLogo}" style="max-height:20mm;" alt="Agency Logo">` : ''}
        </div>
    </div>` : ''}

    ${options.includeAnalytics ? buildAnalyticsPageHTML(require('../services/analyticsService').calculatePRAnalytics(articles), options) : ''}

    ${articles.map((article, index) => {
        const processedExcerpt = boldKeywords(article.excerpt || '', keywordRegex);
        const clampLines = article.imageBase64 ? 13 : 26;
        return `
    <div class="page">
        <div class="header-e">
            <div class="header-e-left">
                ${article.logoBase64
                    ? `<img src="${article.logoBase64}" class="source-logo-e" alt="Source Logo">`
                    : `<div class="source-name-e">${article.source_name || ''}</div>`}
            </div>
            <div class="header-e-right">
                <span>${article.published_date || ''} • ${article.source_type || 'Web'}</span>
            </div>
        </div>

        <div class="title-zone-e">
            <div class="article-title-e">${article.title || ''}</div>
        </div>

        ${article.imageBase64 ? `
        <div class="visual-zone-e">
            <img src="${article.imageBase64}" class="main-visual-e" style="object-position: ${article.imagePosition || 'top center'};" alt="Article Image">
        </div>` : ''}

        <div class="content-zone-e">
            <div class="content-text-e" style="-webkit-line-clamp: ${clampLines};">
                ${processedExcerpt}
            </div>
        </div>

        <div class="footer-e">
            <a href="${formatLinkUrl(article.url)}" target="_blank" rel="noopener noreferrer" class="footer-link-e" style="${(article.url || '').length > 110 ? 'font-size: 6.8pt;' : ((article.url || '').length > 70 ? 'font-size: 7.5pt;' : 'font-size: 8.5pt;')}" title="${article.url || ''}">${article.url || ''}</a>
            <div class="footer-page-e">Articolo ${index + 1} di ${articles.length}</div>
        </div>
    </div>`;
    }).join('')}
</body>
</html>`;
    return html;
}

module.exports = { buildPDFHTML };
