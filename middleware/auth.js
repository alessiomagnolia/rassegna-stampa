const jwt = require('jsonwebtoken');
const { getDb } = require('../database/db');

const JWT_SECRET = process.env.JWT_SECRET || 'rassegna-stampa-secret-key-dev';

const authMiddleware = (req, res, next) => {
    // Read Authorization header (Bearer token format)
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Accesso negato. Token mancante o non valido.' });
    }

    const token = authHeader.split(' ')[1];

    try {
        // Verify token
        const decoded = jwt.verify(token, JWT_SECRET);
        
        // Ensure user exists in database (auto-heal if Render server restarted and DB was reset)
        const db = getDb();
        let user = db.prepare('SELECT id FROM users WHERE id = ?').get(decoded.userId);
        
        if (!user) {
            try {
                const autoEmail = `user_${decoded.userId}@rassegna-stampa.it`;
                db.prepare('INSERT OR REPLACE INTO users (id, email, password_hash, company_name) VALUES (?, ?, ?, ?)')
                    .run(decoded.userId, autoEmail, 'auto_restored_hash', 'La Tua Azienda');
                user = { id: decoded.userId };
            } catch(e) {
                console.log('Error auto-restoring user in DB:', e.message);
            }
        }

        // Set userId in request object
        req.userId = decoded.userId;
        next();
    } catch (error) {
        return res.status(401).json({ error: 'Sessione scaduta o non valida. Effettua nuovamente il login.' });
    }
};

const generateToken = (userId) => {
    return jwt.sign({ userId }, JWT_SECRET, { expiresIn: '7d' });
};

module.exports = {
    authMiddleware,
    generateToken
};
