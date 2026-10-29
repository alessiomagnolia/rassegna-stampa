const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const jwt = require('jsonwebtoken');
const { getDb } = require('../database/db');
const { DATA_DIR } = require('../config/storage');

/**
 * Chiave di firma delle sessioni.
 * 1. JWT_SECRET dalle variabili d'ambiente (consigliato su Render)
 * 2. altrimenti una chiave casuale generata una sola volta e conservata sul disco persistente,
 *    così resta segreta (non è nel codice pubblico) e le sessioni sopravvivono ai riavvii.
 */
function resolveJwtSecret() {
    if (process.env.JWT_SECRET && process.env.JWT_SECRET.trim() !== '') {
        return process.env.JWT_SECRET.trim();
    }
    const secretFile = path.join(DATA_DIR, '.jwt_secret');
    try {
        if (fs.existsSync(secretFile)) {
            const saved = fs.readFileSync(secretFile, 'utf8').trim();
            if (saved.length >= 32) return saved;
        }
        const generated = crypto.randomBytes(48).toString('hex');
        fs.writeFileSync(secretFile, generated, { mode: 0o600 });
        console.warn(`[AUTH] JWT_SECRET non impostata: generata una chiave privata in ${secretFile}.`);
        return generated;
    } catch (err) {
        console.warn('[AUTH] Impossibile salvare la chiave delle sessioni, uso una chiave temporanea:', err.message);
        return crypto.randomBytes(48).toString('hex');
    }
}

const JWT_SECRET = resolveJwtSecret();

const authMiddleware = (req, res, next) => {
    // Read Authorization header (Bearer token format) or query parameter ?token=
    const authHeader = req.headers.authorization;
    let token = null;
    if (authHeader && authHeader.startsWith('Bearer ')) {
        token = authHeader.split(' ')[1];
    } else if (req.query && req.query.token) {
        token = req.query.token;
    }

    if (!token) {
        return res.status(401).json({ error: 'Accesso negato. Token mancante o non valido.' });
    }

    try {
        // Verify token
        const decoded = jwt.verify(token, JWT_SECRET);

        // L'utente deve esistere davvero: niente account ricreati automaticamente a partire da un token
        const db = getDb();
        const user = db.prepare('SELECT id FROM users WHERE id = ?').get(decoded.userId);
        if (!user) {
            return res.status(401).json({ error: 'Sessione scaduta o non valida. Effettua nuovamente il login.' });
        }

        // Set userId in request object
        req.userId = decoded.userId;

        // Inietta il teamId se l'utente fa parte di un team (usato da tutte le route per condivisione)
        try {
            const membership = db.prepare(
                'SELECT team_id FROM team_members WHERE user_id = ? LIMIT 1'
            ).get(decoded.userId);
            req.teamId = membership ? membership.team_id : null;
        } catch(e) {
            // La tabella team_members potrebbe non esistere su istanze molto vecchie
            req.teamId = null;
        }

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
    generateToken,
    JWT_SECRET
};
