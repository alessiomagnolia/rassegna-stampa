/**
 * Transcription Service — Speech-to-Text (Whisper) + analisi AI della trascrizione
 *
 * Provider supportati (in ordine di priorità):
 *   1. Groq   (GROQ_API_KEY)   → whisper-large-v3  (veloce, economico)
 *   2. OpenAI (OPENAI_API_KEY) → whisper-1
 *
 * L'audio arriva dal browser già estratto (WAV mono 16 kHz) e diviso in segmenti < 25 MB.
 */
const { getAnthropicClient, callAnthropicMessages } = require('./aiHelper');

function cleanKey(k) {
    return (k || '').replace(/['"\s]/g, '').trim();
}

function getProvider() {
    const groq = cleanKey(process.env.GROQ_API_KEY);
    if (groq) {
        return {
            name: 'groq',
            label: 'Groq Whisper large-v3',
            url: 'https://api.groq.com/openai/v1/audio/transcriptions',
            model: process.env.GROQ_WHISPER_MODEL || 'whisper-large-v3',
            key: groq
        };
    }
    const openai = cleanKey(process.env.OPENAI_API_KEY);
    if (openai) {
        return {
            name: 'openai',
            label: 'OpenAI Whisper',
            url: 'https://api.openai.com/v1/audio/transcriptions',
            model: process.env.OPENAI_WHISPER_MODEL || 'whisper-1',
            key: openai
        };
    }
    return null;
}

function getStatus() {
    const p = getProvider();
    return {
        configured: Boolean(p),
        provider: p ? p.name : null,
        label: p ? p.label : null,
        ai_analysis: Boolean(cleanKey(process.env.ANTHROPIC_API_KEY))
    };
}

/**
 * Trascrive un singolo segmento audio.
 * @param {Buffer} buffer       dati audio
 * @param {string} filename     nome file (con estensione, es. chunk_1.wav)
 * @param {string} mimetype     tipo MIME
 * @param {number} offsetSec    secondi da aggiungere ai minutaggi (posizione del segmento nel file completo)
 * @param {string} language     codice lingua (default 'it')
 * @param {string} prompt       contesto opzionale (nomi propri, sigle) per migliorare l'accuratezza
 */
async function transcribeAudio({ buffer, filename = 'audio.wav', mimetype = 'audio/wav', offsetSec = 0, language = 'it', prompt = '' }) {
    const provider = getProvider();
    if (!provider) {
        const err = new Error('Servizio di trascrizione non configurato. Aggiungi GROQ_API_KEY oppure OPENAI_API_KEY nelle variabili d\'ambiente del server.');
        err.status = 503;
        throw err;
    }

    const maxAttempts = 3;
    let lastErr = null;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
            const form = new FormData();
            form.append('file', new Blob([buffer], { type: mimetype }), filename);
            form.append('model', provider.model);
            form.append('response_format', 'verbose_json');
            form.append('temperature', '0');
            if (language) form.append('language', language);
            if (prompt) form.append('prompt', String(prompt).slice(0, 800));

            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), 150000);
            const res = await fetch(provider.url, {
                method: 'POST',
                headers: { Authorization: `Bearer ${provider.key}` },
                body: form,
                signal: controller.signal
            });
            clearTimeout(timer);

            if (!res.ok) {
                let detail = '';
                try {
                    const j = await res.json();
                    detail = j?.error?.message || JSON.stringify(j);
                } catch (_) {
                    detail = await res.text().catch(() => '');
                }
                const err = new Error(`Errore ${provider.label} (${res.status}): ${detail}`.slice(0, 400));
                err.status = res.status;
                // Errori non recuperabili: chiave errata / file non valido
                if ([400, 401, 403, 413, 415].includes(res.status)) throw Object.assign(err, { fatal: true });
                throw err;
            }

            const data = await res.json();
            const segments = Array.isArray(data.segments)
                ? data.segments.map(s => ({
                    start: Math.max(0, Number(s.start || 0) + offsetSec),
                    end: Math.max(0, Number(s.end || 0) + offsetSec),
                    text: String(s.text || '').trim()
                })).filter(s => s.text)
                : [];

            return {
                text: String(data.text || '').trim(),
                segments,
                duration: Number(data.duration || 0),
                language: data.language || language,
                provider: provider.name
            };
        } catch (err) {
            lastErr = err;
            if (err.fatal) break;
            console.warn(`[Transcription] Tentativo ${attempt}/${maxAttempts} fallito: ${err.message}`);
            if (attempt < maxAttempts) {
                // Rate limit (429) → attesa più lunga
                const wait = err.status === 429 ? 6000 * attempt : 1500 * attempt;
                await new Promise(r => setTimeout(r, wait));
            }
        }
    }
    throw lastErr;
}

/**
 * Fallback senza AI: titolo = prima frase, virgolettati = frasi tra virgolette o frasi più lunghe.
 */
function heuristicAnalysis(text, sourceName) {
    const clean = String(text || '').replace(/\s+/g, ' ').trim();
    const sentences = clean.split(/(?<=[.!?])\s+/).filter(s => s.length > 20);
    const first = sentences[0] || clean.slice(0, 120);
    const title = first.length > 110 ? first.slice(0, 107).trim() + '...' : first;
    const quoted = clean.match(/[«"“][^»"”]{20,250}[»"”]/g) || [];
    const quotes = (quoted.length ? quoted : sentences.slice(1).sort((a, b) => b.length - a.length).slice(0, 3))
        .slice(0, 4)
        .map(q => q.replace(/^[«"“]|[»"”]$/g, '').trim());

    return {
        title: sourceName ? `${sourceName}: ${title}` : title,
        summary: sentences.slice(0, 3).join(' ').slice(0, 600),
        key_quotes: quotes,
        topics: [],
        speakers: [],
        ai: false
    };
}

/**
 * Analisi AI della trascrizione: titolo giornalistico, sintesi, virgolettati, temi, speaker.
 */
async function analyzeTranscript({ text, sourceName = '', clientName = '' }) {
    const clean = String(text || '').trim();
    if (!clean) throw new Error('Trascrizione vuota');

    let anthropic;
    try {
        anthropic = getAnthropicClient();
    } catch (_) {
        return heuristicAnalysis(clean, sourceName);
    }

    // Per trascrizioni molto lunghe teniamo inizio e fine (contengono di norma apertura e conclusioni)
    const MAX = 60000;
    const body = clean.length > MAX
        ? clean.slice(0, MAX * 0.7) + '\n\n[...]\n\n' + clean.slice(-MAX * 0.3)
        : clean;

    const prompt = `Sei un giornalista esperto di monitoraggio Radio/TV per un ufficio stampa italiano.
Ti fornisco la trascrizione automatica di un contenuto audio/video${sourceName ? ` (fonte: ${sourceName})` : ''}${clientName ? `. Il cliente monitorato è: ${clientName}` : ''}.

Restituisci SOLO un oggetto JSON valido (nessun testo prima o dopo) con questa struttura:
{
  "title": "titolo giornalistico sintetico e fattuale (max 110 caratteri)",
  "summary": "sintesi giornalistica in 3-4 frasi, in terza persona",
  "key_quotes": ["fino a 5 virgolettati testuali e significativi, ripresi fedelmente dalla trascrizione"],
  "speakers": ["nomi e ruoli delle persone che parlano, se deducibili, altrimenti array vuoto"],
  "topics": ["3-6 temi principali in poche parole"]
}

Regole: non inventare nulla che non sia nella trascrizione; correggi solo evidenti errori di trascrizione nei virgolettati.

TRASCRIZIONE:
"""
${body}
"""`;

    try {
        const response = await callAnthropicMessages(anthropic, {
            max_tokens: 1500,
            messages: [{ role: 'user', content: prompt }]
        }, { type: 'fast' });

        const raw = (response.content || []).map(c => c.text || '').join('').trim();
        const jsonMatch = raw.match(/\{[\s\S]*\}/);
        if (!jsonMatch) throw new Error('Risposta AI non in formato JSON');
        const parsed = JSON.parse(jsonMatch[0]);

        return {
            title: String(parsed.title || '').trim() || heuristicAnalysis(clean, sourceName).title,
            summary: String(parsed.summary || '').trim(),
            key_quotes: Array.isArray(parsed.key_quotes) ? parsed.key_quotes.map(q => String(q).trim()).filter(Boolean).slice(0, 5) : [],
            speakers: Array.isArray(parsed.speakers) ? parsed.speakers.map(s => String(s).trim()).filter(Boolean).slice(0, 8) : [],
            topics: Array.isArray(parsed.topics) ? parsed.topics.map(t => String(t).trim()).filter(Boolean).slice(0, 6) : [],
            ai: true
        };
    } catch (err) {
        console.warn('[Transcription] Analisi AI non riuscita, uso fallback euristico:', err.message);
        return heuristicAnalysis(clean, sourceName);
    }
}

module.exports = { getStatus, transcribeAudio, analyzeTranscript };
