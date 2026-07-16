const puppeteer = require('puppeteer');

let browser = null;

async function initBrowser() {
    if (!browser) {
        console.log('Avvio di Puppeteer...');
        browser = await puppeteer.launch({
            headless: 'new',
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
        });
    }
    return browser;
}

function getBrowser() {
    return browser;
}

async function closeBrowser() {
    if (browser) {
        await browser.close();
        browser = null;
    }
}

async function takeScreenshot(url) {
    let page = null;
    try {
        const browserInstance = await initBrowser();
        page = await browserInstance.newPage();
        
        await page.setViewport({ width: 1280, height: 900 });
        
        console.log(`[Screenshot] Navigazione verso: ${url}`);
        await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });

        // Try to close common cookie banners
        await page.evaluate(() => {
            const acceptTexts = ['accetta', 'accept', 'ok', 'acconsento', 'agree', 'accetto tutti'];
            const buttons = Array.from(document.querySelectorAll('button, a, [role="button"]'));
            
            for (const btn of buttons) {
                const text = btn.innerText.toLowerCase().trim();
                if (acceptTexts.some(t => text === t || text.includes(t))) {
                    btn.click();
                    break; // Just click the first one we find
                }
            }
            
            // Try to hide common overlay classes/ids just in case
            const selectorsToHide = [
                '#iubenda-cs-banner', '.qc-cmp2-container', '#cookie-notice', 
                '#cookie-law-info-bar', '.cookie-banner', '.cookie-consent'
            ];
            selectorsToHide.forEach(sel => {
                const els = document.querySelectorAll(sel);
                els.forEach(el => el.style.display = 'none');
            });
        });

        // Wait a bit for banner to disappear
        await new Promise(resolve => setTimeout(resolve, 1500));

        // Take a screenshot of the visible area
        console.log(`[Screenshot] Cattura in corso...`);
        const screenshotBuffer = await page.screenshot({ type: 'png' });
        
        return screenshotBuffer.toString('base64');
    } catch (error) {
        console.error(`[Screenshot] Errore per ${url}:`, error.message);
        return null;
    } finally {
        if (page) {
            await page.close().catch(e => console.error('Errore chiusura pagina:', e));
        }
    }
}

module.exports = {
    initBrowser,
    getBrowser,
    closeBrowser,
    takeScreenshot
};
