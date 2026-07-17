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
        
        // Ensure user actually still exists in database
        const db = getDb();
        const user = db.prepare('SELECT id FROM users WHERE id = ?').get(decoded.userId);
        
        if (!user) {
            return res.status(401).json({ error: 'L\\'account è stato resettato dal sistema. Effettua nuovamente la registrazione.' });
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
