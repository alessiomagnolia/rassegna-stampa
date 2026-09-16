require('dotenv').config();
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { initDatabase } = require('./database/db');
const { closeBrowser } = require('./services/screenshotService');

// Create required directories
const dirs = ['uploads', 'output', 'database'].map(dir => path.join(__dirname, dir));
dirs.forEach(dir => {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
});

// Initialize Express
const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

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

// Proxy endpoint for external images (avoids CORS for logo archive previews)
const https = require('https');
const http = require('http');
app.get('/api/proxy-image', (req, res) => {
    const { url } = req.query;
    if (!url) return res.status(400).send('Missing url');

    // Se è un percorso locale in /public
    if (url.startsWith('/')) {
        const localCleanPath = url.split('?')[0];
        const localFilePath = path.join(__dirname, 'public', decodeURIComponent(localCleanPath));
        if (fs.existsSync(localFilePath)) {
            return res.sendFile(localFilePath);
        }
        return res.status(404).send('Not found');
    }

    if (!url.startsWith('http://') && !url.startsWith('https://')) {
        return res.status(400).send('Invalid url');
    }

    const protocol = url.startsWith('https') ? https : http;
    protocol.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (imgRes) => {
        if (imgRes.statusCode !== 200) return res.status(404).send('Not found');
        res.setHeader('Content-Type', imgRes.headers['content-type'] || 'image/png');
        imgRes.pipe(res);
    }).on('error', () => res.status(500).send('Error'));
});

// Interactive White-label Public Share Portal
app.get('/share/:token', (req, res) => {
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

// Fallback to index.html for SPA if needed (currently using multiple HTML files though)
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

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

// Graceful shutdown
const shutdown = async () => {
    console.log('\nSpegnimento del server in corso...');
    try {
        await closeBrowser();
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
