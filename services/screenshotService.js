const fs = require('fs');
let puppeteer = null;
try {
    puppeteer = require('puppeteer');
} catch (e) {
    console.warn('[ScreenshotService] Puppeteer non caricabile:', e.message);
}

// Launch a fresh browser instance optimized for low-memory servers (512MB RAM)
async function launchBrowser() {
    if (!puppeteer) {
        try {
            puppeteer = require('puppeteer');
        } catch(e) {
            throw new Error('Puppeteer non installato o non disponibile: ' + e.message);
        }
    }
    console.log('Avvio di Puppeteer...');

    // Resolve chrome executable path across environments (Docker, Railway, Render, Linux, Windows)
    let chromePath = process.env.PUPPETEER_EXECUTABLE_PATH;
    if (!chromePath || !fs.existsSync(chromePath)) {
        const candidates = [
            '/usr/bin/google-chrome',
            '/usr/bin/google-chrome-stable',
            '/usr/bin/chromium',
            '/usr/bin/chromium-browser',
            'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
            'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
            'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
        ];
        chromePath = candidates.find(p => fs.existsSync(p)) || undefined;
    }

    return await puppeteer.launch({
        headless: true,
        ...(chromePath ? { executablePath: chromePath } : {}),
        args: [
            '--no-sandbox', 
            '--disable-setuid-sandbox', 
            '--disable-dev-shm-usage',
            '--disable-gpu',
            '--disable-extensions',
            '--disable-background-networking',
            '--font-render-hinting=none'
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

        // Filter out slow/heavy resources (media, fonts, heavy ad/tracker domains) to prevent hangs
        try {
            await page.setRequestInterception(true);
            page.on('request', (req) => {
                const rt = req.resourceType();
                const reqUrl = req.url().toLowerCase();
                const isBlockedDomain = 
                    reqUrl.includes('google-analytics') || 
                    reqUrl.includes('doubleclick') || 
                    reqUrl.includes('googletagservices') ||
                    reqUrl.includes('taboola') || 
                    reqUrl.includes('outbrain') || 
                    reqUrl.includes('criteo') ||
                    reqUrl.includes('hotjar') ||
                    reqUrl.includes('facebook.net');

                if (rt === 'media' || rt === 'font' || isBlockedDomain) {
                    req.abort();
                } else {
                    req.continue();
                }
            });
        } catch (e) {}
        
        console.log(`[Screenshot] Navigazione verso: ${url}`);
        // Use domcontentloaded with a reasonable timeout instead of networkidle2
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 10000 });

        // Try to close common cookie banners
        await page.evaluate(() => {
            const acceptTexts = ['accetta', 'accept', 'ok', 'acconsento', 'agree', 'accetto tutti'];
            const buttons = Array.from(document.querySelectorAll('button, a, [role="button"]'));
            
            for (const btn of buttons) {
                const text = btn.innerText?.toLowerCase().trim() || '';
                if (acceptTexts.some(t => text === t || text.includes(t))) {
                    btn.click();
                    break;
                }
            }
            
            const selectorsToHide = [
                '#iubenda-cs-banner', '.qc-cmp2-container', '#cookie-notice', 
                '#cookie-law-info-bar', '.cookie-banner', '.cookie-consent',
                '.tp-modal', '.tp-backdrop', '#onesignal-slidedown-dialog'
            ];
            selectorsToHide.forEach(sel => {
                const els = document.querySelectorAll(sel);
                els.forEach(el => { el.style.display = 'none'; });
            });
        }).catch(() => {});

        await new Promise(resolve => setTimeout(resolve, 800));

        console.log(`[Screenshot] Cattura in corso...`);
        const screenshotBuffer = await page.screenshot({ type: 'png' });
        
        return screenshotBuffer.toString('base64');
    } catch (error) {
        console.error(`[Screenshot] Errore per ${url}:`, error.message);
        return null;
    } finally {
        if (page) await page.close().catch(() => {});
        if (browser) await browser.close().catch(() => {});
    }
}

module.exports = {
    initBrowser,
    getBrowser,
    closeBrowser,
    launchBrowser,
    takeScreenshot
};
