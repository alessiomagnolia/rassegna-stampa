const { launchBrowser } = require('./screenshotService');
const { buildPDFHTML } = require('../templates/pdfTemplate');

/**
 * Runs inside Puppeteer's browser context.
 * For every .header that doesn't already have data-dark="1" (manual override),
 * it draws the source logo onto a canvas and checks average luminance.
 * If the logo is light/white, it applies the dark-header class inline.
 */
const AUTO_DETECT_SCRIPT = `
(function() {
    const headers = document.querySelectorAll('.header:not([data-dark="1"])');
    headers.forEach(function(header) {
        const img = header.querySelector('.source-logo-large');
        if (!img) return;
        try {
            var canvas = document.createElement('canvas');
            canvas.width = 60;
            canvas.height = 60;
            var ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, 60, 60);
            var data = ctx.getImageData(0, 0, 60, 60).data;
            var sumR = 0, sumG = 0, sumB = 0, count = 0;
            for (var i = 0; i < data.length; i += 4) {
                var a = data[i + 3];
                if (a < 30) continue; // skip transparent pixels
                sumR += data[i];
                sumG += data[i + 1];
                sumB += data[i + 2];
                count++;
            }
            if (count === 0) return;
            var luminance = (0.299 * (sumR/count)) + (0.587 * (sumG/count)) + (0.114 * (sumB/count));
            if (luminance > 210) {
                header.classList.add('dark-header');
            }
        } catch(e) {
            // Canvas tainted or other error — skip silently
        }
    });
})();
`;

async function generatePDF(articles, options) {
    let browser = null;
    let page = null;
    try {
        browser = await launchBrowser();
        
        const html = buildPDFHTML(articles, options);
        
        page = await browser.newPage();
        
        // Load HTML; base64 images are inline so 'load' fires immediately
        await page.setContent(html, { waitUntil: 'load', timeout: 90000 });

        // Auto-detect white/light logos via Canvas API (runs in real Chromium)
        try {
            await page.evaluate(AUTO_DETECT_SCRIPT);
        } catch (evalErr) {
            console.warn('[PDFGenerator] Auto-detect logo color failed (non-fatal):', evalErr.message);
        }

        const pdfBuffer = await page.pdf({
            format: 'A4',
            printBackground: true,
            margin: { top: '0mm', right: '0mm', bottom: '0mm', left: '0mm' },
            preferCSSPageSize: true
        });

        return pdfBuffer;
    } catch (error) {
        console.error('[PDFGenerator] Errore:', error);
        throw new Error('Errore durante la generazione del layout PDF.');
    } finally {
        if (page)    await page.close().catch(e => console.error(e));
        if (browser) await browser.close().catch(e => console.error(e));
    }
}

module.exports = { generatePDF };
