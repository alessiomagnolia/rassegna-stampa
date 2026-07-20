function buildPDFHTML(articles, options) {
    const { title, userName, clientName, clientLogo, userLogo } = options;
    
    // Create Italian date string
    const today = new Date();
    const dateStr = `${today.getDate().toString().padStart(2, '0')}/${(today.getMonth() + 1).toString().padStart(2, '0')}/${today.getFullYear()}`;

    let html = `
<!DOCTYPE html>
<html lang="it">
<head>
    <meta charset="UTF-8">
    <title>${title}</title>
    <style>
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap');
        
        @page { 
            size: A4; 
            margin: 0; 
        }
        
        * {
            box-sizing: border-box;
            margin: 0;
            padding: 0;
        }

        body {
            font-family: 'Inter', sans-serif;
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
        
        .page:last-child {
            page-break-after: auto;
        }

        /* --- COVER PAGE --- */
        .cover-page {
            justify-content: flex-start;
            padding-top: 40mm;
            align-items: center;
            text-align: center;
        }

        .client-logo {
            max-width: 150mm;
            max-height: 80mm;
            margin-bottom: 20mm;
            object-fit: contain;
        }

        .cover-title {
            font-size: 32pt;
            font-weight: 700;
            color: #1a1a2e;
            margin-bottom: 10mm;
            line-height: 1.2;
        }

        .cover-subtitle {
            font-size: 16pt;
            color: #666;
            margin-bottom: 5mm;
            text-transform: uppercase;
        }

        .cover-date {
            font-size: 14pt;
            color: #888;
        }
        
        .cover-decor {
            width: 50mm;
            height: 4px;
            background: linear-gradient(90deg, #7c5cff, #00d4aa);
            margin: 15mm auto;
            border-radius: 2px;
        }

        .agency-logo-container {
            position: absolute;
            bottom: 20mm;
            left: 0;
            right: 0;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
        }
        
        .agency-logo {
            max-width: 40mm;
            max-height: 20mm;
            object-fit: contain;
        }

        /* --- ARTICLE PAGE --- */
        .header {
            flex: 0 0 auto;
            display: flex;
            justify-content: space-between;
            align-items: center;
            height: 25mm;
            padding: 0 5mm;
            background-color: #f8f9fa;
            border-bottom: 3px solid #00d4aa;
            border-image: linear-gradient(to right, #7c5cff, #00d4aa) 1;
            margin-bottom: 10mm;
        }

        .header-left {
            width: 50%;
            display: flex;
            justify-content: flex-start;
            align-items: center;
        }

        .header-right {
            width: 50%;
            font-size: 11pt;
            color: #666;
            text-align: right;
            display: flex;
            justify-content: flex-end;
            align-items: center;
        }

        .source-type-badge {
            display: inline-block;
            background-color: #eef2f5;
            color: #555;
            padding: 3px 8px;
            border-radius: 4px;
            font-size: 8pt;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            margin-right: 8px;
        }

        .source-logo-large {
            max-height: 18mm;
            max-width: 100%;
            object-fit: contain;
        }
        
        .source-name-large {
            font-size: 16pt;
            font-weight: 700;
            color: #1a1a2e;
        }

        .title-zone {
            flex: 0 0 auto;
            padding: 0 5mm;
            margin-bottom: 8mm;
            border-left: 4px solid #7c5cff;
        }

        .article-title {
            font-size: 20pt;
            font-weight: 700;
            color: #1a1a2e;
            line-height: 1.3;
        }

        .visual-zone {
            flex: 0 0 auto;
            margin: 0 5mm 10mm 5mm;
            text-align: center;
            max-height: 70mm;
            overflow: hidden;
            border-radius: 8px;
            box-shadow: 0 4px 15px rgba(0,0,0,0.1);
            display: flex;
            justify-content: center;
            align-items: center;
        }

        .main-visual {
            width: 100%;
            height: auto;
            max-height: 70mm;
            object-fit: contain;
            object-position: top center;
            display: block;
        }

        .content-zone {
            flex: 1 1 auto; /* Automatically fills all remaining vertical space */
            padding: 0 5mm;
            margin-bottom: 5mm; /* Space just above the footer */
            overflow: hidden; /* Truncates the text brutally if it overshoots */
        }

        .content-text {
            font-size: 11pt;
            line-height: 1.6;
            color: #333;
            text-align: justify;
            
            display: -webkit-box;
            -webkit-box-orient: vertical;
            overflow: hidden;
            /* -webkit-line-clamp is set inline */
        }

        .footer {
            flex: 0 0 10mm; /* Fixed height for the footer zone */
            display: flex;
            justify-content: space-between;
            align-items: flex-end;
            border-top: 1px solid #e0e0e0;
            padding-top: 3mm;
            padding-left: 5mm;
            padding-right: 5mm;
        }

        .footer-link {
            font-size: 9pt;
            color: #0066CC;
            text-decoration: none;
            max-width: 80%;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }

        .footer-page {
            font-size: 9pt;
            color: #888;
        }
    </style>
</head>
<body>
    `;

    // 1. Optional Cover Page
    if (title) {
        html += `
    <div class="page cover-page">
        ${clientLogo ? `<img src="${clientLogo}" class="client-logo" alt="Client Logo">` : ''}
        <div class="cover-title">${title}</div>
        <div class="cover-decor"></div>
        <div class="cover-subtitle">${clientName ? clientName : ''}</div>
        <div class="cover-date">${dateStr}</div>
        
        ${userLogo ? `
        <div class="agency-logo-container">
            <img src="${userLogo}" class="agency-logo" alt="Agency Logo">
        </div>
        ` : ''}
    </div>
        `;
    }

    // 2. Article Pages
    articles.forEach((article, index) => {
        html += `
    <div class="page">
        <!-- HEADER -->
        <div class="header">
            <div class="header-left">
                ${article.logoBase64 ? `<img src="${article.logoBase64}" class="source-logo-large" alt="Source Logo">` : `<div class="source-name-large">${article.source_name}</div>`}
            </div>
            <div class="header-right">
                <span class="source-type-badge">${article.source_type || 'Web'}</span>
                <span>${article.published_date}</span>
            </div>
        </div>

        <!-- TITLE -->
        <div class="title-zone">
            <div class="article-title">${article.title}</div>
        </div>
        `;

        // Always show image if available
        if (article.imageBase64) {
            html += `
        <div class="visual-zone">
            <img src="${article.imageBase64}" class="main-visual" alt="Article Image">
        </div>
            `;
        }

        // CONTENT ZONE (Takes up all remaining space above the footer)
        const clampLines = article.imageBase64 ? 14 : 28;
        
        html += `
        <div class="content-zone">
            <div class="content-text" style="-webkit-line-clamp: ${clampLines};">
                ${article.excerpt}
            </div>
        </div>

        <!-- FOOTER -->
        <div class="footer">
            <a href="${article.url}" class="footer-link">${article.url}</a>
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
