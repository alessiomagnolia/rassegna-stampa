const { initBrowser } = require('./screenshotService');
const { buildPDFHTML } = require('../templates/pdfTemplate');

async function generatePDF(articles, options) {
    let page = null;
    try {
        const browser = await initBrowser();
        if (!browser) {
            throw new Error('Browser Puppeteer non inizializzato.');
        }

        const html = buildPDFHTML(articles, options);
        
        page = await browser.newPage();
        
        await page.setContent(html, { waitUntil: 'networkidle0', timeout: 30000 });

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
        if (page) {
            await page.close().catch(e => console.error('Errore chiusura pagina PDF:', e));
        }
    }
}

module.exports = {
    generatePDF
};
