/**
 * teamRoutes.js
 * Gestione account team: creazione, inviti, accettazione, rimozione membri.
 *
 * Endpoint:
 *   POST   /api/teams                       - Crea un nuovo team (divento owner)
 *   GET    /api/teams/mine                  - Ottieni il team di cui faccio parte
 *   POST   /api/teams/invite                - Owner invia invito (genera link + manda email)
 *   GET    /api/teams/invite/:token         - Verifica token invito (usato da accept-invite.html)
 *   POST   /api/teams/invite/:token/accept  - Accetta l'invito (registrazione o login già fatto)
 *   DELETE /api/teams/members/:userId       - Owner rimuove un membro
 *   POST   /api/teams/leave                 - Membro abbandona il team
 *   DELETE /api/teams                       - Owner scioglie il team
 */

const express  = require('express');
const crypto   = require('crypto');
const { getDb } = require('../database/db');
const { authMiddleware } = require('../middleware/auth');
const { sendInviteEmail } = require('../services/emailService');

const router = express.Router();

// ── Helper ─────────────────────────────────────────────────────────────────

/** Genera un token di invito URL-safe a 32 caratteri */
function generateInviteToken() {
    return crypto.randomBytes(24).toString('base64url');
}

/** Calcola la data di scadenza (7 giorni da adesso) */
function expiresAt7Days() {
    const d = new Date();
    d.setDate(d.getDate() + 7);
    return d.toISOString();
}

/** Costruisce il link di accettazione invito */
function buildInviteLink(req, token) {
    const proto = req.headers['x-forwarded-proto'] || req.protocol;
    const host  = req.headers['x-forwarded-host'] || req.get('host');
    return `${proto}://${host}/accept-invite?token=${token}`;
}

// ── Crea team ──────────────────────────────────────────────────────────────

/**
 * POST /api/teams
 * Crea un nuovo team. L'utente non deve già appartenere a nessun team.
 * Body: { name: string }
 */
router.post('/', authMiddleware, (req, res) => {
    try {
        const { name } = req.body;
        if (!name || !name.trim()) {
            return res.status(400).json({ error: 'Inserisci un nome per il team.' });
        }

        const db = getDb();

        // Verifica che l'utente non sia già in un team
        const existing = db.prepare('SELECT id FROM team_members WHERE user_id = ?').get(req.userId);
        if (existing) {
            return res.status(400).json({ error: 'Fai già parte di un team. Abbandonalo prima di crearne uno nuovo.' });
        }

        // Crea il team
        const teamInfo = db.prepare(
            'INSERT INTO teams (name, owner_user_id) VALUES (?, ?)'
        ).run(name.trim(), req.userId);

        const teamId = teamInfo.lastInsertRowid;

        // Aggiunge l'owner come membro con ruolo 'owner'
        db.prepare(
            "INSERT INTO team_members (team_id, user_id, role) VALUES (?, ?, 'owner')"
        ).run(teamId, req.userId);

        const team = db.prepare('SELECT * FROM teams WHERE id = ?').get(teamId);

        res.status(201).json({ success: true, team });
    } catch (error) {
        console.error('Errore creazione team:', error);
        res.status(500).json({ error: 'Impossibile creare il team.' });
    }
});

// ── Ottieni team corrente ──────────────────────────────────────────────────

/**
 * GET /api/teams/mine
 * Restituisce il team dell'utente corrente con i suoi membri (null se non ne fa parte).
 */
router.get('/mine', authMiddleware, (req, res) => {
    try {
        const db = getDb();

        const membership = db.prepare(
            'SELECT team_id, role FROM team_members WHERE user_id = ?'
        ).get(req.userId);

        if (!membership) {
            return res.json({ team: null });
        }

        const team = db.prepare('SELECT * FROM teams WHERE id = ?').get(membership.team_id);
        if (!team) return res.json({ team: null });

        // Recupera tutti i membri con email e company_name
        const members = db.prepare(`
            SELECT tm.user_id, tm.role, tm.joined_at, u.email, u.company_name
            FROM team_members tm
            JOIN users u ON u.id = tm.user_id
            WHERE tm.team_id = ?
            ORDER BY tm.joined_at ASC
        `).all(membership.team_id);

        // Recupera inviti pendenti (solo per l'owner)
        let pendingInvites = [];
        if (membership.role === 'owner') {
            pendingInvites = db.prepare(`
                SELECT id, invited_email, created_at, expires_at, accepted
                FROM team_invites
                WHERE team_id = ? AND accepted = 0 AND expires_at > datetime('now')
                ORDER BY created_at DESC
            `).all(membership.team_id);
        }

        res.json({
            team: {
                ...team,
                myRole: membership.role,
                members,
                pendingInvites
            }
        });
    } catch (error) {
        console.error('Errore recupero team:', error);
        res.status(500).json({ error: 'Impossibile recuperare le informazioni del team.' });
    }
});

// ── Invita un membro ───────────────────────────────────────────────────────

/**
 * POST /api/teams/invite
 * L'owner invia un invito via email (o restituisce il link se email non configurata).
 * Body: { email: string }
 */
router.post('/invite', authMiddleware, async (req, res) => {
    try {
        const { email } = req.body;
        if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
            return res.status(400).json({ error: 'Inserisci un indirizzo email valido.' });
        }

        const db = getDb();

        // Verifica che l'utente sia un owner
        const membership = db.prepare(
            "SELECT team_id, role FROM team_members WHERE user_id = ? AND role = 'owner'"
        ).get(req.userId);

        if (!membership) {
            return res.status(403).json({ error: 'Solo il proprietario del team può inviare inviti.' });
        }

        const teamId = membership.team_id;
        const team   = db.prepare('SELECT * FROM teams WHERE id = ?').get(teamId);
        const inviter = db.prepare('SELECT company_name, email FROM users WHERE id = ?').get(req.userId);

        const invitedEmail = email.trim().toLowerCase();

        // Verifica che non sia già un membro
        const alreadyMember = db.prepare(`
            SELECT tm.id FROM team_members tm
            JOIN users u ON u.id = tm.user_id
            WHERE tm.team_id = ? AND LOWER(u.email) = ?
        `).get(teamId, invitedEmail);

        if (alreadyMember) {
            return res.status(400).json({ error: 'Questo utente fa già parte del team.' });
        }

        // Cancella eventuali inviti precedenti non accettati per la stessa email
        db.prepare(
            'DELETE FROM team_invites WHERE team_id = ? AND invited_email = ? AND accepted = 0'
        ).run(teamId, invitedEmail);

        // Crea il nuovo invito
        const token     = generateInviteToken();
        const expiresAt = expiresAt7Days();

        db.prepare(`
            INSERT INTO team_invites (team_id, invited_email, token, invited_by, expires_at)
            VALUES (?, ?, ?, ?, ?)
        `).run(teamId, invitedEmail, token, req.userId, expiresAt);

        const inviteLink = buildInviteLink(req, token);

        // Tentativo di invio email (non bloccante)
        let emailSent = false;
        let emailError = null;
        try {
            emailSent = await sendInviteEmail(
                invitedEmail,
                inviter.company_name || inviter.email,
                team.name,
                inviteLink
            );
        } catch (emailErr) {
            emailError = emailErr.message || 'Errore connessione SMTP';
            console.warn('[Team] Invio email fallito:', emailErr.message);
        }

        res.json({
            success: true,
            inviteLink,
            emailSent,
            emailError,
            message: emailSent
                ? `Invito inviato via email a ${invitedEmail}.`
                : (emailError ? `Impossibile spedire l'email (${emailError}). Copia il link di seguito:` : `Link di invito generato. Copialo e invialo a ${invitedEmail}.`)
        });
    } catch (error) {
        console.error('Errore invito team:', error);
        res.status(500).json({ error: 'Impossibile generare l\'invito.' });
    }
});

// ── Verifica token invito ──────────────────────────────────────────────────

/**
 * GET /api/teams/invite/:token
 * Usato dalla pagina accept-invite.html per mostrare le info prima di accettare.
 * Non richiede autenticazione.
 */
router.get('/invite/:token', (req, res) => {
    try {
        const { token } = req.params;
        const db = getDb();

        const invite = db.prepare(`
            SELECT ti.*, t.name AS team_name, u.company_name AS inviter_name, u.email AS inviter_email
            FROM team_invites ti
            JOIN teams t ON t.id = ti.team_id
            JOIN users u ON u.id = ti.invited_by
            WHERE ti.token = ?
        `).get(token);

        if (!invite) {
            return res.status(404).json({ error: 'Invito non trovato o non valido.' });
        }

        if (invite.accepted) {
            return res.status(410).json({ error: 'Questo invito è già stato accettato.' });
        }

        if (new Date(invite.expires_at) < new Date()) {
            return res.status(410).json({ error: 'Questo invito è scaduto. Chiedi un nuovo invito.' });
        }

        res.json({
            valid: true,
            invite: {
                teamName:    invite.team_name,
                inviterName: invite.inviter_name || invite.inviter_email,
                invitedEmail: invite.invited_email,
                expiresAt:   invite.expires_at
            }
        });
    } catch (error) {
        console.error('Errore verifica invito:', error);
        res.status(500).json({ error: 'Errore durante la verifica dell\'invito.' });
    }
});

// ── Accetta invito ─────────────────────────────────────────────────────────

/**
 * POST /api/teams/invite/:token/accept
 * L'utente (già autenticato) accetta l'invito e viene aggiunto al team.
 */
router.post('/invite/:token/accept', authMiddleware, (req, res) => {
    try {
        const { token } = req.params;
        const db = getDb();

        const invite = db.prepare(
            'SELECT * FROM team_invites WHERE token = ?'
        ).get(token);

        if (!invite) {
            return res.status(404).json({ error: 'Invito non trovato o non valido.' });
        }
        if (invite.accepted) {
            return res.status(410).json({ error: 'Questo invito è già stato accettato.' });
        }
        if (new Date(invite.expires_at) < new Date()) {
            return res.status(410).json({ error: 'Questo invito è scaduto.' });
        }

        // Verifica che l'utente non sia già in un team
        const existingMembership = db.prepare(
            'SELECT id FROM team_members WHERE user_id = ?'
        ).get(req.userId);

        if (existingMembership) {
            return res.status(400).json({ error: 'Fai già parte di un team. Abbandonalo prima di accettare un nuovo invito.' });
        }

        // Aggiunge l'utente come membro del team
        db.prepare(
            "INSERT OR IGNORE INTO team_members (team_id, user_id, role) VALUES (?, ?, 'member')"
        ).run(invite.team_id, req.userId);

        // Segna l'invito come accettato
        db.prepare('UPDATE team_invites SET accepted = 1 WHERE id = ?').run(invite.id);

        const team = db.prepare('SELECT * FROM teams WHERE id = ?').get(invite.team_id);

        res.json({ success: true, team, message: `Benvenuto nel team "${team.name}"!` });
    } catch (error) {
        console.error('Errore accettazione invito:', error);
        res.status(500).json({ error: 'Impossibile accettare l\'invito.' });
    }
});

// ── Rimuovi membro ─────────────────────────────────────────────────────────

/**
 * DELETE /api/teams/members/:userId
 * L'owner rimuove un membro dal team (non può rimuovere se stesso).
 */
router.delete('/members/:userId', authMiddleware, (req, res) => {
    try {
        const targetUserId = parseInt(req.params.userId);
        if (!targetUserId) {
            return res.status(400).json({ error: 'ID utente non valido.' });
        }
        if (targetUserId === req.userId) {
            return res.status(400).json({ error: 'Non puoi rimuovere te stesso. Usa "Abbandona team".' });
        }

        const db = getDb();

        // Verifica che chi richiede sia l'owner
        const ownerMembership = db.prepare(
            "SELECT team_id FROM team_members WHERE user_id = ? AND role = 'owner'"
        ).get(req.userId);

        if (!ownerMembership) {
            return res.status(403).json({ error: 'Solo il proprietario può rimuovere i membri.' });
        }

        const result = db.prepare(
            'DELETE FROM team_members WHERE team_id = ? AND user_id = ?'
        ).run(ownerMembership.team_id, targetUserId);

        if (result.changes === 0) {
            return res.status(404).json({ error: 'Membro non trovato nel team.' });
        }

        res.json({ success: true, message: 'Membro rimosso dal team.' });
    } catch (error) {
        console.error('Errore rimozione membro:', error);
        res.status(500).json({ error: 'Impossibile rimuovere il membro.' });
    }
});

// ── Abbandona team ─────────────────────────────────────────────────────────

/**
 * POST /api/teams/leave
 * Un membro (non owner) abbandona il team.
 */
router.post('/leave', authMiddleware, (req, res) => {
    try {
        const db = getDb();

        const membership = db.prepare(
            'SELECT team_id, role FROM team_members WHERE user_id = ?'
        ).get(req.userId);

        if (!membership) {
            return res.status(404).json({ error: 'Non fai parte di nessun team.' });
        }

        if (membership.role === 'owner') {
            return res.status(400).json({ error: 'Sei il proprietario del team. Usa "Sciogli team" per eliminarlo.' });
        }

        db.prepare('DELETE FROM team_members WHERE user_id = ? AND team_id = ?')
            .run(req.userId, membership.team_id);

        res.json({ success: true, message: 'Hai abbandonato il team.' });
    } catch (error) {
        console.error('Errore abbandono team:', error);
        res.status(500).json({ error: 'Impossibile abbandonare il team.' });
    }
});

// ── Sciogli team ───────────────────────────────────────────────────────────

/**
 * DELETE /api/teams
 * L'owner scioglie il team. I dati rimangono ma team_id viene nullificato
 * sulle risorse (le rassegne restano all'owner via user_id).
 */
router.delete('/', authMiddleware, (req, res) => {
    try {
        const db = getDb();

        const ownerMembership = db.prepare(
            "SELECT team_id FROM team_members WHERE user_id = ? AND role = 'owner'"
        ).get(req.userId);

        if (!ownerMembership) {
            return res.status(403).json({ error: 'Solo il proprietario può sciogliere il team.' });
        }

        const teamId = ownerMembership.team_id;

        // Le risorse con team_id rimangono ma il campo viene nullificato
        // (diventano di nuovo personali dell'owner via user_id)
        db.prepare('UPDATE press_reviews  SET team_id = NULL WHERE team_id = ?').run(teamId);
        db.prepare('UPDATE clients        SET team_id = NULL WHERE team_id = ?').run(teamId);
        db.prepare('UPDATE press_releases SET team_id = NULL WHERE team_id = ?').run(teamId);

        // Elimina il team (CASCADE rimuove team_members e team_invites)
        db.prepare('DELETE FROM teams WHERE id = ?').run(teamId);

        res.json({ success: true, message: 'Team sciolto. I tuoi dati sono ancora disponibili nel tuo account personale.' });
    } catch (error) {
        console.error('Errore scioglimento team:', error);
        res.status(500).json({ error: 'Impossibile sciogliere il team.' });
    }
});

module.exports = router;
