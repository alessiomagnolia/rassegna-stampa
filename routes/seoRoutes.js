const express = require('express');
const path = require('path');
const Anthropic = require('@anthropic-ai/sdk');

const router = express.Router();

// Memory store for basic rate limiting on the free SEO tool (max 5 req/hour per IP)
const ipRequestCounts = new Map();
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000; // 1 hour
const MAX_REQUESTS_PER_WINDOW = 6;

function checkRateLimit(ip) {
    const now = Date.now();
    const entry = ipRequestCounts.get(ip) || { count: 0, resetTime: now + RATE_LIMIT_WINDOW_MS };

    if (now > entry.resetTime) {
        entry.count = 1;
        entry.resetTime = now + RATE_LIMIT_WINDOW_MS;
        ipRequestCounts.set(ip, entry);
        return true;
    }

    if (entry.count >= MAX_REQUESTS_PER_WINDOW) {
        return false;
    }

    entry.count += 1;
    ipRequestCounts.set(ip, entry);
    return true;
}

// ---------------------------------------------------------------------------
// Clean SEO Page Handlers
// ---------------------------------------------------------------------------

// Homepage (SEO Landing Page)
router.get(['/', '/home'], (req, res) => {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.sendFile(path.join(__dirname, '..', 'public', 'landing.html'));
});

// Direct Login / Workspace entry
router.get(['/login', '/accedi'], (req, res) => {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

// Solutions Page
router.get('/soluzioni', (req, res) => {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.sendFile(path.join(__dirname, '..', 'public', 'soluzioni.html'));
});

// Comparison Page (Alternative a Mimesi, Volocom, Telpress)
router.get('/confronto', (req, res) => {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.sendFile(path.join(__dirname, '..', 'public', 'confronto.html'));
});

// Free Tool Lead Magnet
router.get('/strumenti-gratuiti/generatore-comunicati-stampa', (req, res) => {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.sendFile(path.join(__dirname, '..', 'public', 'strumento-comunicato-stampa-gratuito.html'));
});

router.get('/strumenti-gratuiti', (req, res) => {
    res.redirect('/strumenti-gratuiti/generatore-comunicati-stampa');
});

// Sitemap.xml & Robots.txt
router.get('/sitemap.xml', (req, res) => {
    res.header('Content-Type', 'application/xml');
    res.sendFile(path.join(__dirname, '..', 'public', 'sitemap.xml'));
});

router.get('/robots.txt', (req, res) => {
    res.header('Content-Type', 'text/plain');
    res.sendFile(path.join(__dirname, '..', 'public', 'robots.txt'));
});

// ---------------------------------------------------------------------------
// Public Free Press Release Generation Endpoint (Rate-Limited Lead Magnet)
// ---------------------------------------------------------------------------
router.post('/api/seo/free-pr-generate', async (req, res) => {
    const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';

    if (!checkRateLimit(clientIp)) {
        return res.status(429).json({
            error: 'Hai raggiunto il limite di utilizzi gratuiti orari per questo indirizzo IP. Crea un account gratuito per continuare.'
        });
    }

    const { company, tone, topic, details } = req.body;
    if (!company || !topic) {
        return res.status(400).json({ error: 'Nome azienda e argomento sono obbligatori.' });
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    const today = new Date();
    const dateFormatted = `${today.getDate()} ${['Gennaio','Febbraio','Marzo','Aprile','Maggio','Giugno','Luglio','Agosto','Settembre','Ottobre','Novembre','Dicembre'][today.getMonth()]} ${today.getFullYear()}`;

    if (!apiKey) {
        // Fallback strutturato se API key non è impostata
        const fallbackText = `COMUNICATO STAMPA

${company.toUpperCase()} ANNUNCIA: ${topic.toUpperCase()}

Roma/Milano, ${dateFormatted} – ${company} ha annunciato oggi un importante sviluppo strategico riguardante: ${topic}.

${details ? `Nel corso dell'annuncio, sono stati evidenziati i seguenti elementi chiave: ${details}.` : `L'iniziativa si inserisce nel piano di consolidamento e crescita intrapreso dall'organizzazione per rafforzare la propria presenza sul mercato e rispondere con puntualità alle esigenze del settore.`}

"Questo passo rappresenta una tappa fondamentale nel nostro percorso di innovazione", hanno commentato i vertici di ${company}. "Puntiamo a ridefinire gli standard qualitativi e a creare valore tangibile per tutti i nostri interlocutori".

L'azienda conferma che le attività proseguiranno secondo la tabella di marcia definita, con ulteriori aggiornamenti previsti nelle prossime settimane.

Informazioni su ${company}:
${company} è una realtà attiva nel proprio comparto di riferimento, impegnata nell'eccellenza operativa e nello sviluppo di soluzioni all'avanguardia.

Contatti Ufficio Stampa:
Email: press@${company.toLowerCase().replace(/[^a-z0-9]/g, '') || 'azienda'}.it
Web: www.${company.toLowerCase().replace(/[^a-z0-9]/g, '') || 'azienda'}.it`;

        return res.json({ pressRelease: fallbackText });
    }

    try {
        const anthropic = new Anthropic({ apiKey });
        const model = process.env.ANTHROPIC_MODEL || 'claude-3-5-sonnet-20241022';

        const prompt = `Sei un esperto Capo Ufficio Stampa. Scrivi un Comunicato Stampa impeccabile in italiano giornalistico.
Azienda/Soggetto: ${company}
Argomento/Notizia: ${topic}
Tono di voce: ${tone || 'Istituzionale'}
Dettagli/Virgolettati opzionali: ${details || 'Nessun dettaglio extra specificato'}
Data: ${dateFormatted}

Regole formali:
1. Inizia con la dicitura "COMUNICATO STAMPA"
2. Inserisci un Titolo accattivante giornalistico nel formato: "[Azienda]: [Sintesi Notizia]"
3. Inserisci un Sommario/Sottotitolo (Catenaccio) di 2 righe
4. Dateline: "Città, ${dateFormatted} – " seguito dal primo paragrafo con la regola delle 5W (Who, What, When, Where, Why)
5. Corpo del comunicato con virgolettato di una figura aziendale (es. AD, Presidente o Fondatore)
6. Boilerplate finale "Informazioni su [Azienda]" e blocco Contatti Ufficio Stampa
7. NON inserire commenti personali, restituisci solo il testo del comunicato.`;

        const response = await anthropic.messages.create({
            model,
            max_tokens: 1200,
            system: "Sei un giornalista e addetto stampa professionista. Rispondi solo con il comunicato stampa formattato.",
            messages: [{ role: "user", content: prompt }]
        });

        const pressRelease = response.content[0].text.trim();
        res.json({ pressRelease });
    } catch (err) {
        console.error('[SEO Routes] Errore generazione comunicato free:', err.message);
        res.status(500).json({ error: 'Errore temporaneo durante la generazione con AI.' });
    }
});

module.exports = router;
