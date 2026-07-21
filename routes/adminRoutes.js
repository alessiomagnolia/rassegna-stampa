const express = require('express');
const jwt = require('jsonwebtoken');
const path = require('path');
const fs = require('fs');
const multer = require('multer');

const router = express.Router();

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@rassegna.io';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'Yellow95';
const JWT_SECRET = process.env.JWT_SECRET || 'rassegna-stampa-secret-key-dev';
const LOGOS_PATH = path.join(__dirname, '..', 'public', 'assets', 'logos.json');
const LOGO_UPLOADS_DIR = path.join(__dirname, '..', 'public', 'assets', 'logos');

// Ensure logos upload directory exists
if (!fs.existsSync(LOGO_UPLOADS_DIR)) {
    fs.mkdirSync(LOGO_UPLOADS_DIR, { recursive: true });
}

// Multer for logo file uploads (stored in public/assets/logos/)
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, LOGO_UPLOADS_DIR),
    filename: (req, file, cb) => {
        const safeName = Date.now() + '-' + file.originalname.replace(/[^a-z0-9.\-_]/gi, '_');
        cb(null, safeName);
    }
});
const upload = multer({
    storage,
    limits: { fileSize: 2 * 1024 * 1024 }, // 2MB
    fileFilter: (req, file, cb) => {
        if (file.mimetype.startsWith('image/')) cb(null, true);
        else cb(new Error('Solo immagini permesse'));
    }
});

// Admin auth middleware
function adminAuth(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Accesso negato.' });
    }
    try {
        const token = authHeader.split(' ')[1];
        const decoded = jwt.verify(token, JWT_SECRET);
        if (!decoded.isAdmin) {
            return res.status(403).json({ error: 'Non autorizzato.' });
        }
        next();
    } catch (e) {
        return res.status(401).json({ error: 'Token admin non valido o scaduto.' });
    }
}

// Helper: read logos.json
function readLogos() {
    try {
        const raw = fs.readFileSync(LOGOS_PATH, 'utf-8');
        return JSON.parse(raw);
    } catch {
        return [];
    }
}

// Helper: write logos.json
function writeLogos(logos) {
    fs.writeFileSync(LOGOS_PATH, JSON.stringify(logos, null, 4), 'utf-8');
}

// POST /api/admin/login
router.post('/login', (req, res) => {
    const { email, password } = req.body;
    if (email !== ADMIN_EMAIL || password !== ADMIN_PASSWORD) {
        return res.status(401).json({ error: 'Credenziali non valide.' });
    }
    const token = jwt.sign({ isAdmin: true, email }, JWT_SECRET, { expiresIn: '8h' });
    res.json({ token });
});

// GET /api/admin/logos
router.get('/logos', adminAuth, (req, res) => {
    res.json(readLogos());
});

// POST /api/admin/logos — add logo via URL
router.post('/logos', adminAuth, (req, res) => {
    const { name, url } = req.body;
    if (!name || !url) {
        return res.status(400).json({ error: 'Nome e URL sono obbligatori.' });
    }
    const logos = readLogos();
    logos.push({ name: name.trim(), url: url.trim() });
    writeLogos(logos);
    res.json({ success: true, logos });
});

// POST /api/admin/logos/upload — add logo via file upload
router.post('/logos/upload', adminAuth, upload.single('logo'), (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'File non ricevuto.' });
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: 'Il nome della testata è obbligatorio.' });

    const publicUrl = `/assets/logos/${req.file.filename}`;
    const logos = readLogos();
    logos.push({ name: name.trim(), url: publicUrl });
    writeLogos(logos);
    res.json({ success: true, logos });
});

// DELETE /api/admin/logos/:index
router.delete('/logos/:index', adminAuth, (req, res) => {
    const idx = parseInt(req.params.index, 10);
    const logos = readLogos();
    if (isNaN(idx) || idx < 0 || idx >= logos.length) {
        return res.status(404).json({ error: 'Logo non trovato.' });
    }
    // If it's a local file, delete it too
    const logo = logos[idx];
    if (logo.url && logo.url.startsWith('/assets/logos/')) {
        const filePath = path.join(__dirname, '..', 'public', logo.url);
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    }
    logos.splice(idx, 1);
    writeLogos(logos);
    res.json({ success: true, logos });
});

module.exports = router;
