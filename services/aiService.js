const Anthropic = require('@anthropic-ai/sdk');
const { callAnthropicMessages } = require('./aiHelper');

let anthropicClient = null;

function getAnthropic() {
    if (!anthropicClient) {
        const apiKey = process.env.ANTHROPIC_API_KEY;
        if (!apiKey) {
            console.warn('[AIService] ANTHROPIC_API_KEY non presente nel file .env. Verranno usate stime semantiche euristice.');
            return null;
        }
        anthropicClient = new Anthropic({ apiKey });
    }
    return anthropicClient;
}

const RISK_SCORES = { basso: 15, medio: 45, alto: 75 };

/**
 * Valutazione euristica per parole chiave: usata se l'AI non è configurata o non risponde,
 * così un articolo critico non viene mai classificato come "neutro" per default.
 */
function heuristicSentiment(title, cleanContent) {
    const lower = `${title} ${cleanContent}`.toLowerCase();
    const badWords = ['scandalo', 'crisi', 'denuncia', 'indagine', 'indagato', 'fallimento', 'polemica', 'multa', 'accusa', 'ritardo', 'blocco', 'sciopero', 'truffa', 'frode', 'buco', 'arresto', 'sequestro', 'licenziament', 'crollo', 'condanna'];
    const goodWords = ['successo', 'crescita', 'record', 'innovazione', 'premio', 'partnership', 'accordo', 'utile', 'leader', 'espansione', 'ottimo'];

    const badCount = badWords.filter(w => lower.includes(w)).length;
    const goodCount = goodWords.filter(w => lower.includes(w)).length;

    let sentiment = 'neutro';
    let score = 0;
    let risk_level = 'basso';
    let crisis_alert = false;

    if (badCount > goodCount) {
        sentiment = 'critico';
        score = Math.max(-100, -25 * badCount);
        risk_level = badCount >= 2 ? 'alto' : 'medio';
        crisis_alert = badCount >= 2;
    } else if (goodCount > badCount) {
        sentiment = 'positivo';
        score = Math.min(100, 25 * goodCount);
        risk_level = 'basso';
    }

    const explanation = `Valutazione euristica: rilevati ${goodCount} indicatori favorevoli e ${badCount} elementi di potenziale criticità.`;
    return {
        sentiment,
        score,
        risk_level,
        risk_score: RISK_SCORES[risk_level],
        crisis_alert,
        explanation,
        summary: explanation,
        defensive_actions: crisis_alert ? 'Preparare una nota di posizione e monitorare le riprese nelle prossime ore.' : '',
        executive_takeaway: title,
        key_quotes: []
    };
}

/**
 * Analisi semantica avanzata del Sentiment e del Rischio Reputazionale (Crisis Detection)
 * Supera i filtri booleani legacy delle piattaforme tradizionali.
 */
async function analyzeSentimentAndRisk({ title, content, clientName = '' }) {
    const client = getAnthropic();
    const cleanContent = (content || '').slice(0, 3500);

    if (!client) {
        return heuristicSentiment(title, cleanContent);
    }

    try {
        const prompt = `Analizza questo articolo giornalistico in relazione al cliente/brand "${clientName || 'Generico'}".
Titolo: ${title}
Testo: ${cleanContent}

Rispondi SOLO con un oggetto JSON valido (senza testo di contorno o blocchi markdown) avente esattamente questi campi:
{
  "sentiment": "positivo" | "neutro" | "critico",
  "score": numero intero da -100 (estremamente negativo/dannoso) a +100 (trionfale),
  "risk_level": "basso" | "medio" | "alto",
  "crisis_alert": booleano (true solo se c'è un rischio reputazionale o scandalo che richiede smentita/reazione immediata),
  "explanation": "Spiegazione sintetica in massimo 2 frasi del perché del voto e dell'impatto sul brand",
  "defensive_actions": "Se il rischio è medio o alto, 1-2 frasi su come deve reagire l'ufficio stampa; altrimenti stringa vuota",
  "executive_takeaway": "Sintesi di 1 frase per il CEO/Direzione Generale",
  "key_quotes": ["eventuale citazione importante 1", "eventuale citazione 2"]
}`;

        const response = await callAnthropicMessages(client, {
            max_tokens: 700,
            system: "Sei un analista senior di Media Intelligence e Crisis Management. Rispondi solo in formato JSON valido.",
            messages: [{ role: "user", content: prompt }]
        }, { type: 'fast' });

        const text = response.content[0].text.trim();
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        const result = JSON.parse(jsonMatch ? jsonMatch[0] : text);
        // Campi letti dalla pagina Analisi Rischio
        result.risk_score = RISK_SCORES[result.risk_level] ?? 15;
        result.summary = result.summary || result.explanation || '';
        result.defensive_actions = result.defensive_actions || '';
        return result;
    } catch (err) {
        console.error('[AIService] Errore Sentiment Analysis:', err.message);
        return heuristicSentiment(title, cleanContent);
    }
}

/**
 * Genera uno script radiofonico da 60-90 secondi per l'Executive Daily Audio Briefing
 */
async function generateAudioBriefingScript({ articles = [], clientName = '' }) {
    const client = getAnthropic();
    if (!articles || articles.length === 0) {
        return { script: "Nessun articolo selezionato per il briefing odierno." };
    }

    const itemsSummary = articles.slice(0, 5).map((a, i) => `${i+1}. [${a.source_name || 'Fonte'}] ${a.title} - ${a.excerpt ? a.excerpt.slice(0, 200) : ''}`).join('\n');

    if (!client) {
        const script = `Buongiorno. Ecco il bollettino sintetico per ${clientName || 'la vostra organizzazione'}. Oggi segnaliamo ${articles.length} notizie di rilievo. Prima notizia: ${articles[0].title}, pubblicata da ${articles[0].source_name || 'stampa'}. ${articles[1] ? `Inoltre: ${articles[1].title}.` : ''} Buona giornata e buon lavoro.`;
        return { script, durationSecondsEstimated: 45, articlesCount: articles.length };
    }

    try {
        const prompt = `Sei un conduttore radiofonico professionista e assistente esecutivo per il CEO/Direzione Generale.
Scrivi lo script per un bollettino vocale quotidiano ("Executive Audio Briefing") della durata stimata di 60 secondi in italiano naturale, dinamico e chiaro.
Cliente/Brand di riferimento: ${clientName || 'Azienda'}
Data di oggi: ${new Date().toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Rome' })} (se citi il giorno, usa questo).

Notizie selezionate:
${itemsSummary}

Regole:
1. Inizia con un saluto energico ed elegante (es. "Buongiorno, ecco il vostro Media Briefing delle ultime 24 ore per...").
2. Concentrati sui 2-3 punti chiave con linguaggio da notiziario radiofonico / podcast professionale.
3. Se ci sono notizie con tono critico o allarmi, evidenzia subito il punto di attenzione per il management.
4. Concludi con un augurio di buon lavoro.
5. NON usare parentesi di regia come [musica], scrivi SOLO il testo esatto che deve essere letto ad alta voce.`;

        const response = await callAnthropicMessages(client, {
            max_tokens: 700,
            system: "Sei uno speaker professionista di news radiofoniche. Scrivi solo il testo da leggere.",
            messages: [{ role: "user", content: prompt }]
        });

        const script = response.content[0].text.trim();
        const wordCount = script.split(/\s+/).length;
        const durationSecondsEstimated = Math.round((wordCount / 140) * 60);

        return {
            script,
            durationSecondsEstimated,
            articlesCount: articles.length
        };
    } catch (err) {
        console.error('[AIService] Errore Script Audio Briefing:', err.message);
        return {
            script: `Buongiorno. Ecco il briefing sintetico. Tra le notizie salienti: ${articles[0].title}.`,
            durationSecondsEstimated: 20,
            articlesCount: articles.length
        };
    }
}

/**
 * Genera il sommario esecutivo in 3 punti per il Board/CdA
 */
async function generateExecutiveBoardSummary({ articles = [], clientName = '' }) {
    const client = getAnthropic();
    if (!articles || articles.length === 0) return { summary: 'Nessun articolo disponibile per il sommario.' };

    const items = articles.slice(0, 8).map(a => `- ${a.title} (${a.source_name || 'Web'})`).join('\n');

    if (!client) {
        return {
            summary: articles.slice(0, 3).map(a => `• ${a.title}`).join('\n')
        };
    }

    try {
        const prompt = `Crea un Executive Briefing per il Consiglio di Amministrazione o per il Presidente aziendale riguardante ${clientName || 'il brand'}.
Raggruppa le seguenti notizie in:
1. "Scenario & Posizionamento": un paragrafo di 2 righe.
2. "3 Punti Chiave da Sapere": 3 bullet point netti e incisivi.
3. "Sentiment Generale": 1 riga sul clima mediatico.

Notizie:
${items}

Restituisci direttamente il testo formattato in Markdown elegante.`;

        const response = await callAnthropicMessages(client, {
            max_tokens: 500,
            system: "Sei un capo ufficio stampa istituzionale. Sii sintetico, autorevole e chiaro.",
            messages: [{ role: "user", content: prompt }]
        });

        return {
            summary: response.content[0].text.trim()
        };
    } catch (err) {
        return { summary: articles.slice(0, 3).map(a => `• ${a.title}`).join('\n') };
    }
}

module.exports = {
    analyzeSentimentAndRisk,
    generateAudioBriefingScript,
    generateExecutiveBoardSummary
};
