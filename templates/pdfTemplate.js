function buildPDFHTML(articles, options) {
    const { title, userName, clientName, userLogo } = options;
    
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
        }
        
        .page:last-child {
            page-break-after: auto;
        }

        /* --- COVER PAGE --- */
        .cover-page {
            display: flex;
            flex-direction: column;
            justify-content: center;
            align-items: center;
            text-align: center;
        }

        .cover-logo {
            max-width: 120mm;
            max-height: 60mm;
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

        /* --- ARTICLE PAGE --- */
        .header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            height: 22mm;
            padding: 0 5mm;
            background-color: #f8f9fa;
            border-bottom: 3px solid #00d4aa;
            border-image: linear-gradient(to right, #7c5cff, #00d4aa) 1;
            margin-bottom: 10mm;
        }

        .header-left {
            display: flex;
            align-items: center;
            gap: 10px;
        }

        .source-logo {
            height: 12mm;
            max-width: 30mm;
            object-fit: contain;
        }

        .source-info {
            display: flex;
            flex-direction: column;
        }

        .source-name {
            font-size: 12pt;
            font-weight: 700;
            color: #1a1a2e;
        }

        .source-date {
            font-size: 10pt;
            color: #666;
        }

        .user-logo {
            height: 12mm;
            max-width: 40mm;
            object-fit: contain;
        }

        .title-zone {
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
            margin: 0 5mm 10mm 5mm;
            text-align: center;
            max-height: 110mm;
            overflow: hidden;
            border-radius: 8px;
            box-shadow: 0 4px 15px rgba(0,0,0,0.1);
        }

        .main-visual {
            width: 100%;
            height: auto;
            max-height: 110mm;
            object-fit: contain;
            object-position: top center;
            display: block;
        }

        .content-zone {
            display: flex;
            flex-direction: column;
            gap: 5mm;
            padding: 0 5mm;
            margin-bottom: 20mm;
        }

        .article-link {
            display: block;
            color: #0066CC;
            text-decoration: none;
            font-size: 10pt;
            word-break: break-all;
        }

        .content-text {
            font-size: 11pt;
            line-height: 1.6;
            color: #333;
            text-align: justify;
            
            /* Stop text before end of page */
            display: -webkit-box;
            -webkit-line-clamp: 15;
            -webkit-box-orient: vertical;
            overflow: hidden;
            text-overflow: ellipsis;
        }

        .footer {
            position: absolute;
            bottom: 15mm;
            left: 15mm;
            right: 15mm;
            height: 10mm;
            display: flex;
            justify-content: flex-end;
            align-items: flex-end;
            border-top: 1px solid #e0e0e0;
            padding-top: 3mm;
            background: white;
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
        ${userLogo ? \`<img src="\${userLogo}" class="cover-logo" alt="Company Logo">\` : ''}
        <div class="cover-title">\${title}</div>
        <div class="cover-decor"></div>
        <div class="cover-subtitle">\${clientName ? \`Generata per: \${clientName}\` : ''}</div>
        <div class="cover-date">\${dateStr}</div>
    </div>
        `;
    }

    // 2. Article Pages
    articles.forEach((article, index) => {
        html += `
    <div class="page">
        <div class="header">
            <div class="header-left">
                \${article.logoBase64 ? \`<img src="\${article.logoBase64}" class="source-logo" alt="Source Logo">\` : ''}
                <div class="source-info">
                    <div class="source-name">\${article.source_name}</div>
                    <div class="source-date">\${article.published_date}</div>
                </div>
            </div>
            \${userLogo ? \`<img src="\${userLogo}" class="user-logo" alt="Your Logo">\` : ''}
        </div>

        <div class="title-zone">
            <div class="article-title">\${article.title}</div>
        </div>
        `;

        // Always show image if available, NO SCREENSHOT
        if (article.imageBase64) {
            html += `
        <div class="visual-zone">
            <img src="\${article.imageBase64}" class="main-visual" alt="Article Image">
        </div>
            `;
        }

        // Link above the text, text truncated
        html += `
        <div class="content-zone">
            <a href="\${article.url}" class="article-link">\${article.url}</a>
            <div class="content-text">
                \${article.excerpt}
            </div>
        </div>

        <div class="footer">
            <div class="footer-page">Pagina \${title ? index + 2 : index + 1} di \${title ? articles.length + 1 : articles.length}</div>
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
