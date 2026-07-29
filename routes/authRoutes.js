const express = require('express');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { getDb } = require('../database/db');
const { authMiddleware, generateToken } = require('../middleware/auth');

const router = express.Router();

// Setup Multer for logo uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const userDir = path.join(__dirname, '..', 'uploads', req.userId.toString());
        if (!fs.existsSync(userDir)) {
            fs.mkdirSync(userDir, { recursive: true });
        }
        cb(null, userDir);
    },
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname);
        cb(null, `logo${ext}`);
    }
});

const upload = multer({
    storage,
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
    fileFilter: (req, file, cb) => {
        const allowedTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/svg+xml', 'image/webp'];
        if (allowedTypes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error('Formato immagine non supportato. Usa PNG, JPG o SVG.'));
        }
    }
});

// Register
router.post('/register', async (req, res) => {
    try {
        const { email, password, company_name } = req.body;

        if (!email || !password || password.length < 6) {
            return res.status(400).json({ error: 'Dati mancanti o password troppo corta (minimo 6 caratteri).' });
        }

        const db = getDb();
        
        // Check if user exists
        const existingUser = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
        if (existingUser) {
            return res.status(400).json({ error: 'Email già registrata.' });
        }

        // Hash password
        const salt = await bcrypt.genSalt(10);
        const password_hash = await bcrypt.hash(password, salt);

        // Insert user
        const info = db.prepare('INSERT INTO users (email, password_hash, company_name) VALUES (?, ?, ?)')
            .run(email, password_hash, company_name || '');

        const userId = info.lastInsertRowid;
        const token = generateToken(userId);

        res.status(201).json({
            token,
            user: { id: userId, email, company_name: company_name || '', logo_path: '' }
        });
    } catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({ error: 'Errore durante la registrazione.' });
    }
});

// Login
router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ error: 'Inserisci email e password.' });
        }

        const db = getDb();
        const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);

        if (!user) {
            return res.status(401).json({ error: 'Credenziali non valide.' });
        }

        const isMatch = await bcrypt.compare(password, user.password_hash);
        if (!isMatch) {
            return res.status(401).json({ error: 'Credenziali non valide.' });
        }

        const token = generateToken(user.id);

        res.json({
            token,
            user: {
                id: user.id,
                email: user.email,
                company_name: user.company_name,
                logo_path: user.logo_path
            }
        });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ error: 'Errore durante il login.' });
    }
});

// Get Profile
router.get('/profile', authMiddleware, (req, res) => {
    try {
        const db = getDb();
        const user = db.prepare('SELECT id, email, company_name, logo_path, created_at FROM users WHERE id = ?').get(req.userId);
        
        if (!user) {
            return res.status(404).json({ error: 'Utente non trovato.' });
        }

        res.json({ user });
    } catch (error) {
        console.error('Profile error:', error);
        res.status(500).json({ error: 'Errore nel recupero del profilo.' });
    }
});

// Update Profile
router.put('/profile', authMiddleware, (req, res) => {
    try {
        const { company_name } = req.body;
        const db = getDb();
        
        db.prepare('UPDATE users SET company_name = ? WHERE id = ?').run(company_name, req.userId);
        
        const user = db.prepare('SELECT id, email, company_name, logo_path FROM users WHERE id = ?').get(req.userId);
        res.json({ user });
    } catch (error) {
        console.error('Update profile error:', error);
        res.status(500).json({ error: 'Errore nell\'aggiornamento del profilo.' });
    }
});

// Upload Logo
router.post('/upload-logo', authMiddleware, (req, res) => {
    upload.single('logo')(req, res, (err) => {
        if (err) {
            return res.status(400).json({ error: err.message || 'Errore durante l\'upload del logo.' });
        }

        if (!req.file) {
            return res.status(400).json({ error: 'Nessun file selezionato.' });
        }

        try {
            const logoPath = `/uploads/${req.userId}/${req.file.filename}`;
            const db = getDb();
            
            db.prepare('UPDATE users SET logo_path = ? WHERE id = ?').run(logoPath, req.userId);
            
            res.json({ logo_path: logoPath });
        } catch (error) {
            console.error('Save logo path error:', error);
            res.status(500).json({ error: 'Errore nel salvataggio del logo.' });
        }
    });
});

// Delete Logo
router.delete('/logo', authMiddleware, (req, res) => {
    try {
        const db = getDb();
        const user = db.prepare('SELECT logo_path FROM users WHERE id = ?').get(req.userId);
        
        if (user && user.logo_path) {
            const fullPath = path.join(__dirname, '..', user.logo_path);
            if (fs.existsSync(fullPath)) {
                fs.unlinkSync(fullPath);
            }
            
            db.prepare('UPDATE users SET logo_path = "" WHERE id = ?').run(req.userId);
        }
        
        res.json({ success: true, message: 'Logo eliminato con successo.' });
    } catch (error) {
        console.error('Delete logo error:', error);
        res.status(500).json({ error: 'Errore durante l\'eliminazione del logo.' });
    }
});

module.exports = router;
