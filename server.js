require('dotenv').config();
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { initDatabase } = require('./database/db');
const { closeBrowser } = require('./services/screenshotService');
const { UPLOADS_DIR } = require('./config/storage');

// Initialize Express
const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());

// HTTP Compression (Gzip / Deflate / Brotli)
let compressionMiddleware;
try {
    const compression = require('compression');
    compressionMiddleware = compression({
        filter: (req, res) => {
            if (req.headers['x-no-compression']) return false;
            const ct = res.getHeader('Content-Type');
            // Non comprimere flussi PDF o archivi binari già compressi internamente
            if (ct && (String(ct).includes('application/pdf') || String(ct).includes('application/zip'))) {
                return false;
            }
            return compression.filter(req, res);
        },
        level: 6, // Bilanciamento ottimale tra risparmio banda e carico CPU
        threshold: 1024 // Comprime solo payload superiori a 1 KB
    });
} catch (e) {
    // Fallback nativo zlib
    const zlib = require('zlib');
    compressionMiddleware = (req, res, next) => {
        const accept = req.headers['accept-encoding'] || '';
        if (!accept.includes('gzip')) return next();
        const origSend = res.send;
        res.send = function (body) {
            const ct = res.getHeader('Content-Type') || '';
            if (typeof body === 'string' && body.length > 1024 && !String(ct).includes('application/pdf') && !String(ct).includes('image/')) {
                res.setHeader('Content-Encoding', 'gzip');
                res.removeHeader('Content-Length');
                zlib.gzip(body, (err, buf) => {
                    if (err) return origSend.call(res, body);
                    res.setHeader('Content-Length', buf.length);
                    origSend.call(res, buf);
                });
            } else {
                origSend.call(res, body);
            }
        };
        next();
    };
}
app.use(compressionMiddleware);

app.use(express.json({ limit: '50mb' }));

// Politica di Caching Intelligente per Asset Statici
app.use(express.static(path.join(__dirname, 'public'), {
    index: false,
    etag: true,
    lastModified: true,
    setHeaders: (res, filePath) => {
        const ext = path.extname(filePath).toLowerCase();

        // 1. Asset statici pesanti / immutabili (immagini, font, icone): cache 7 giorni
        if (['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.ico', '.woff', '.woff2', '.ttf', '.eot'].includes(ext)) {
            res.setHeader('Cache-Control', 'public, max-age=604800, stale-while-revalidate=86400');
        }
        // 2. Fogli di stile CSS: cache 1 giorno con ETag per 304 Not Modified immediato
        else if (['.css'].includes(ext)) {
            res.setHeader('Cache-Control', 'public, max-age=86400, stale-while-revalidate=3600');
        }
        // 3. Pagine HTML e JavaScript (app.js, dashboard.html, editor.html):
        // "no-cache" consente al browser di conservare il file in memoria, effettuando una revalidazione
        // HTTP 304 istantanea (0 byte trasferiti) se il file non è cambiato, e scaricando la nuova versione
        // appena si pubblica un aggiornamento.
        else if (['.html', '.js'].includes(ext)) {
            res.setHeader('Cache-Control', 'no-cache');
        }
    }
}));

app.use('/uploads', express.static(UPLOADS_DIR, {
    maxAge: '7d',
    etag: true,
    lastModified: true,
    setHeaders: (res) => {
        res.setHeader('Cache-Control', 'public, max-age=604800, stale-while-revalidate=86400');
    }
}));

// Routes
const authRoutes = require('./routes/authRoutes');
const articleRoutes = require('./routes/articleRoutes');
const pdfRoutes = require('./routes/pdfRoutes');
const adminRoutes = require('./routes/adminRoutes');
const newsRoutes = require('./routes/newsRoutes');
const pressReleaseRoutes = require('./routes/pressReleaseRoutes');
const clientRoutes = require('./routes/clientRoutes');
const contactRoutes = require('./routes/contactRoutes');
const teamRoutes = require('./routes/teamRoutes');
const reportRoutes = require('./routes/reportRoutes');
const seoRoutes = require('./routes/seoRoutes');
const transcribeRoutes = require('./routes/transcribeRoutes');
const archiveLogoRoutes = require('./routes/archiveLogoRoutes');

app.use('/api/auth', authRoutes);
app.use('/api/articles', articleRoutes);
app.use('/api/pdf', pdfRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/news', newsRoutes);
app.use('/api/press', pressReleaseRoutes);
app.use('/api/clients', clientRoutes);
app.use('/api/contacts', contactRoutes);
app.use('/api/teams', teamRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/transcribe', transcribeRoutes);
app.use('/api/archive-logos', archiveLogoRoutes);

// Health & Diagnostics Handler
app.get('/api/health', (req, res) => {
    const { isPersistent, DATA_DIR, DB_PATH, UPLOADS_DIR, OUTPUT_DIR } = require('./config/storage');
    res.json({
        status: 'ok',
        persistent: isPersistent,
        dataDir: DATA_DIR,
        dbPath: DB_PATH,
        uploadsDir: UPLOADS_DIR,
        outputDir: OUTPUT_DIR,
        uptime: Math.floor(process.uptime()),
        timestamp: new Date().toISOString()
    });
});

// Favicon Handler
app.get('/favicon.ico', (req, res) => {
    res.setHeader('Cache-Control', 'public, max-age=604800');
    res.sendFile(path.join(__dirname, 'public', 'favicon.ico'));
});

// Proxy endpoint for external images (avoids CORS for logo archive previews)
const https = require('https');
const http = require('http');
app.get('/api/proxy-image', (req, res) => {
    const { url } = req.query;
    if (!url) return res.status(400).send('Missing url');

    // Se è un percorso locale in /public
    if (url.startsWith('/')) {
        const publicDir = path.join(__dirname, 'public');
        let localCleanPath;
        try {
            localCleanPath = decodeURIComponent(url.split('?')[0]);
        } catch (e) {
            return res.status(400).send('Invalid url');
        }
        const localFilePath = path.resolve(publicDir, '.' + path.sep + localCleanPath);
        // Blocca il path traversal (es. "/../.env"): il file deve restare dentro /public
        if (!localFilePath.startsWith(publicDir + path.sep)) {
            return res.status(400).send('Invalid url');
        }
        if (fs.existsSync(localFilePath) && fs.statSync(localFilePath).isFile()) {
            return res.sendFile(localFilePath);
        }
        return res.status(404).send('Not found');
    }

    if (!url.startsWith('http://') && !url.startsWith('https://')) {
        return res.status(400).send('Invalid url');
    }
    // Niente richieste verso indirizzi interni del server (localhost, reti private, metadati cloud)
    try {
        const host = new URL(url).hostname.toLowerCase();
        if (host === 'localhost' || host.endsWith('.local') || host.endsWith('.internal') ||
            /^(127\.|10\.|192\.168\.|169\.254\.|0\.|172\.(1[6-9]|2\d|3[01])\.)/.test(host) || host === '[::1]') {
            return res.status(400).send('Invalid url');
        }
    } catch (e) {
        return res.status(400).send('Invalid url');
    }

    const protocol = url.startsWith('https') ? https : http;
    protocol.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (imgRes) => {
        if (imgRes.statusCode !== 200) {
            imgRes.resume();
            return res.status(404).send('Not found');
        }
        // Inoltra solo immagini: evita che il proxy venga usato per leggere pagine o API arbitrarie
        const contentType = String(imgRes.headers['content-type'] || '').toLowerCase();
        if (!contentType.startsWith('image/')) {
            imgRes.resume();
            return res.status(415).send('Not an image');
        }
        res.setHeader('Content-Type', contentType);
        imgRes.pipe(res);
    }).on('error', () => res.status(500).send('Error'));
});

// Interactive White-label Public Share Portal
app.get('/share/:token', (req, res) => {
    res.setHeader('Cache-Control', 'no-cache');
    res.sendFile(path.join(__dirname, 'public', 'share.html'));
});

// Interactive Public Coverage Report Portal
app.get('/report/:token', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'report.html'));
});

// Pagina pubblica di accettazione invito team
app.get('/accept-invite', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'accept-invite.html'));
});

// Editor Locandine Eventi
app.get('/locandine', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'locandine.html'));
});

// Editor LinkedIn Post
app.get('/linkedin', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'linkedin.html'));
});

// Editor Save the Date
app.get('/save-the-date', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'save-the-date.html'));
});

// SEO Routes & Public Portals
app.use('/', seoRoutes);

const { startCrawlerScheduler } = require('./services/newsCrawler');
const { initNewsIndexer } = require('./services/newsIndexer');

// Initialize database and start server
initDatabase();
startCrawlerScheduler(10); // Run background crawler every 10 minutes
initNewsIndexer(); // Initialize background RSS pre-indexer (PRESSToday style)

const server = app.listen(PORT, () => {
    console.log(`🚀 Server avviato sulla porta ${PORT}`);
    console.log(`📂 Cartella di lavoro: ${__dirname}`);
});

// Increase HTTP timeout to 180s to allow long PDF generation (Puppeteer) without
// hitting Render's default 30s proxy timeout.
server.setTimeout(180000);
server.keepAliveTimeout = 180000;
server.headersTimeout = 185000; // slightly above keepAliveTimeout

// Graceful shutdown
const shutdown = async () => {
    console.log('\nSpegnimento del server in corso...');
    try {
        await closeBrowser();
        try {
            const { getDb } = require('./database/db');
            const db = getDb();
            if (db) {
                console.log('[SHUTDOWN] Sincronizzazione WAL checkpoint su disco SQLite...');
                db.pragma('wal_checkpoint(TRUNCATE)');
                db.close();
            }
        } catch (dbErr) {
            console.error('[SHUTDOWN] Errore chiusura SQLite:', dbErr.message);
        }
        server.close(() => {
            console.log('Server Express chiuso.');
            process.exit(0);
        });
    } catch (err) {
        console.error('Errore durante lo spegnimento:', err);
        process.exit(1);
    }
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
