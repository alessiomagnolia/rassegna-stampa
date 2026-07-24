const puppeteer = require('puppeteer');

// Launch a fresh browser instance optimized for low-memory servers (512MB RAM)
async function launchBrowser() {
    console.log('Avvio di Puppeteer...');
    return await puppeteer.launch({
        headless: 'new',
        executablePath: process.env.RENDER ? '/usr/bin/google-chrome' : undefined,
        args: [
            '--no-sandbox', 
            '--disable-setuid-sandbox', 
            '--disable-dev-shm-usage',
            '--disable-gpu'
        ]
    });
}

// Dummy functions to prevent server.js from crashing
function getBrowser() { return null; }
async function initBrowser() { return await launchBrowser(); }
async function closeBrowser() { return true; }

async function takeScreenshot(url) {
    let browser = null;
    let page = null;
    try {
        browser = await launchBrowser();
        page = await browser.newPage();
        
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
                    break;
                }
            }
            
            const selectorsToHide = [
                '#iubenda-cs-banner', '.qc-cmp2-container', '#cookie-notice', 
                '#cookie-law-info-bar', '.cookie-banner', '.cookie-consent'
            ];
            selectorsToHide.forEach(sel => {
                const els = document.querySelectorAll(sel);
                els.forEach(el => el.style.display = 'none');
            });
        });

        await new Promise(resolve => setTimeout(resolve, 1500));

        console.log(`[Screenshot] Cattura in corso...`);
        const screenshotBuffer = await page.screenshot({ type: 'png' });
        
        return screenshotBuffer.toString('base64');
    } catch (error) {
        console.error(`[Screenshot] Errore per ${url}:`, error.message);
        return null;
    } finally {
        if (page) await page.close().catch(e => console.error(e));
        if (browser) await browser.close().catch(e => console.error(e));
    }
}

module.exports = {
    initBrowser,
    getBrowser,
    closeBrowser,
    launchBrowser,
    takeScreenshot
};
