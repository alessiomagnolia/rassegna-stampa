require('dotenv').config();
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

app.use('/api/auth', authRoutes);
app.use('/api/articles', articleRoutes);
app.use('/api/pdf', pdfRoutes);
app.use('/api/admin', adminRoutes);

// Proxy endpoint for external images (avoids CORS for logo archive previews)
const https = require('https');
const http = require('http');
app.get('/api/proxy-image', (req, res) => {
    const { url } = req.query;
    if (!url) return res.status(400).send('Missing url');
    const protocol = url.startsWith('https') ? https : http;
    protocol.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (imgRes) => {
        if (imgRes.statusCode !== 200) return res.status(404).send('Not found');
        res.setHeader('Content-Type', imgRes.headers['content-type'] || 'image/png');
        imgRes.pipe(res);
    }).on('error', () => res.status(500).send('Error'));
});

// Fallback to index.html for SPA if needed (currently using multiple HTML files though)
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Initialize database and start server
initDatabase();

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
