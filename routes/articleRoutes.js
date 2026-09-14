const express = require('express');
const { authMiddleware } = require('../middleware/auth');
const { extractArticle } = require('../services/articleExtractor');
const { cleanAndUnwrapArticleUrl, resolveGoogleNewsUrl } = require('./newsRoutes');

const router = express.Router();

router.post('/extract', authMiddleware, async (req, res) => {
    try {
        let { url, skipScreenshot } = req.body;

        if (!url) {
            return res.status(400).json({ error: 'L\'URL è obbligatorio.' });
        }

        // Post-selection URL Unwrapping: resolve Google News & Bing RSS links to direct publisher URLs
        try {
            url = cleanAndUnwrapArticleUrl(url);
            if (url.includes('news.google.com/rss/articles/')) {
                url = await Promise.race([
                    resolveGoogleNewsUrl(url),
                    new Promise(r => setTimeout(() => r(url), 3500))
                ]);
                url = cleanAndUnwrapArticleUrl(url);
            }
        } catch(e) {}

        try {
            new URL(url); // Validate URL format
        } catch (e) {
            return res.status(400).json({ error: 'Formato URL non valido.' });
        }

        // Set a timeout to prevent hanging requests
        const timeoutPromise = new Promise((_, reject) => 
            setTimeout(() => reject(new Error('TIMEOUT')), 45000)
        );

        console.log(`[Extraction] Inizio estrazione per URL pulito: ${url}`);
        
        try {
            const articleData = await Promise.race([
                extractArticle(url, { skipScreenshot: !!skipScreenshot }),
                timeoutPromise
            ]);
            
            // Ensure final articleData.url is the clean direct publisher URL
            if (articleData) {
                articleData.url = url;
            }
            
            res.json(articleData);
        } catch (extractError) {
            if (extractError.message === 'TIMEOUT') {
                return res.status(504).json({ error: 'Tempo scaduto durante l\'estrazione. Il sito è troppo lento o blocca l\'accesso automatico. Usa l\'inserimento manuale.' });
            }
            throw extractError;
        }

    } catch (error) {
        console.error('Route extract error:', error);
        res.status(422).json({ error: error.message || 'Impossibile estrarre l\'articolo da questo link. Usa l\'inserimento manuale.' });
    }
});

const { calculatePRAnalytics } = require('../services/analyticsService');
const Anthropic = require('@anthropic-ai/sdk');

function getAnthropicClient() {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return null;
    try {
        return new Anthropic({ apiKey });
    } catch {
        return null;
    }
}

/**
 * POST /api/articles/analytics
 * Calculates PR impact metrics, media tiers, reach estimate, and sentiment
 */
router.post('/analytics', authMiddleware, (req, res) => {
    try {
        const { articles } = req.body;
        if (!articles || !Array.isArray(articles)) {
            return res.status(400).json({ error: 'Fornisci una lista di articoli valida.' });
        }
        const analytics = calculatePRAnalytics(articles);
        res.json({ success: true, analytics });
    } catch (error) {
        console.error('Errore calcolo analytics:', error);
        res.status(500).json({ error: 'Impossibile calcolare le metriche.' });
    }
});

/**
 * POST /api/articles/digest
 * Generates an executive 8:00 AM Morning Digest from selected articles
 */
router.post('/digest', authMiddleware, async (req, res) => {
    try {
        const { articles, clientName, rassegnaTitle } = req.body;

        if (!articles || !Array.isArray(articles) || articles.length === 0) {
            return res.status(400).json({ error: 'Seleziona almeno un articolo per generare il Morning Digest.' });
        }

        const client = clientName || 'Cliente';
        const title = rassegnaTitle || 'Rassegna Stampa';
        const todayStr = new Date().toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' });
        
        // Base analytics
        const analytics = calculatePRAnalytics(articles);

        const anthropic = getAnthropicClient();
        let digestData = null;

        if (anthropic) {
            try {
                const articleSummaries = articles.slice(0, 20).map((a, idx) => 
                    `[${idx + 1}] Testata: ${a.source_name || 'Media'} | Titolo: ${a.title || ''} | Estratto: ${(a.excerpt || '').slice(0, 180)}`
                ).join('\n\n');

                const prompt = `Sei il capo ufficio stampa senior di un'agenzia PR di primo livello.
Il tuo compito è preparare il "Morning Executive Briefing" delle ore 8:00 per il CEO e i vertici aziendali relativo al cliente: "${client}" (Oggetto rassegna: "${title}", Data: ${todayStr}).

Articoli raccolti nella rassegna odierna:
${articleSummaries}

Sentiment generale stimato: ${analytics.overallSentiment} (${analytics.sentimentDistribution.positivePct}% Positivo, ${analytics.sentimentDistribution.criticalPct}% Critico).

Genera una risposta ESCLUSIVAMENTE in formato JSON con la seguente struttura:
{
  "subject": "[Briefing 8:00] Rassegna Stampa - ${client} - ${todayStr}",
  "highlights": [
    "Punto chiave 1 sintetico ed esecutivo (max 1-2 righe)",
    "Punto chiave 2",
    "Punto chiave 3"
  ],
  "clips": [
    {
      "source": "Nome Testata",
      "title": "Titolo articolo",
      "one_liner": "Spiegazione in 1 riga dell'impatto o del focus dell'articolo",
      "sentiment": "positivo | neutro | critico"
    }
  ],
  "mood_sentiment": "Breve commento sul clima media generale di oggi (1-2 frasi)"
}`;

                const response = await Promise.race([
                    anthropic.messages.create({
                        model: 'claude-3-5-haiku-20241022',
                        max_tokens: 1500,
                        messages: [{ role: 'user', content: prompt }]
                    }),
                    new Promise((_, reject) => setTimeout(() => reject(new Error('AI_TIMEOUT')), 25000))
                ]);

                const textRes = response.content[0]?.text || '';
                const jsonMatch = textRes.match(/\{[\s\S]*\}/);
                if (jsonMatch) {
                    const parsed = JSON.parse(jsonMatch[0]);
                    // Validate required arrays exist before accepting the AI response
                    if (parsed && Array.isArray(parsed.highlights) && Array.isArray(parsed.clips)) {
                        digestData = parsed;
                    } else {
                        console.warn('[Digest] AI response missing required arrays (highlights/clips), using fallback.');
                    }
                }
            } catch (aiErr) {
                console.warn('[Digest] Fallback AI error/timeout, using structured engine:', aiErr.message);
            }
        }

        // Fallback generator if AI offline or key not present
        if (!digestData) {
            digestData = {
                subject: `[Briefing Stampa] ${client} - ${todayStr}`,
                highlights: [
                    `Rassegna odierna con ${articles.length} uscite monitorate su ${analytics.uniqueOutlets} testate.`,
                    `Esposizione netta stimata: circa ${analytics.formattedAudienceOTS} lettori potenziali (~${analytics.formattedEstimatedReads} letture stimate articoli).`,
                    `Clima mediatico prevalente: ${analytics.overallSentiment}.`
                ],
                clips: analytics.annotatedArticles.map(a => ({
                    source: a.source_name || 'Media',
                    title: a.title || 'Senza titolo',
                    one_liner: (a.excerpt && a.excerpt.trim()) ? a.excerpt.slice(0, 120) + '...' : 'Copertura stampa dedicata.',
                    sentiment: a.sentiment || 'neutro'
                })),
                mood_sentiment: `Copertura complessivamente stabile con ${analytics.sentimentDistribution.positivePct}% di riscontri positivi.`
            };
        }

        // Formatta testo per chat executive / WhatsApp (senza emoji infantili, stile corporate pulito)
        const whatsappLines = [
            `*BRIEFING ESECUTIVO STAMPA — ${client.toUpperCase()}*`,
            `_${todayStr} | ${articles.length} articoli | Audience netta: ~${analytics.formattedAudienceOTS} | Letture st.: ~${analytics.formattedEstimatedReads}_`,
            ``,
            `*SINTESI ESECUTIVA:*`,
            ...digestData.highlights.map(h => `• ${h}`),
            ``,
            `*CLIP STAMPA PRINCIPALI:*`,
            ``,
            ...digestData.clips.slice(0, 15).map(c => 
                `*${c.source}* • _${c.sentiment}_\n*${c.title}*\n${c.one_liner}\n`
            ),
            digestData.mood_sentiment ? `*Clima Media:* ${digestData.mood_sentiment}` : ''
        ].filter(Boolean);

        // Formatta testo plain text pulito per email
        const emailText = [
            `BRIEFING ESECUTIVO STAMPA — ${client.toUpperCase()}`,
            `Data: ${todayStr} | ${articles.length} articoli | Audience netta: ~${analytics.formattedAudienceOTS} | Letture stimate: ~${analytics.formattedEstimatedReads}`,
            ``,
            `SINTESI ESECUTIVA:`,
            ...digestData.highlights.map(h => `• ${h}`),
            ``,
            `CLIP STAMPA PRINCIPALI:`,
            ``,
            ...digestData.clips.map(c => 
                `${c.source} • ${c.sentiment}\n${c.title}\n${c.one_liner}\n`
            ),
            digestData.mood_sentiment ? `Clima Media: ${digestData.mood_sentiment}` : ''
        ].filter(Boolean).join('\n');

        // Formatta Rich HTML per Email / Outlook (stessa identica gerarchia grafica dell'anteprima)
        const emailHtml = `
<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1e293b; max-width: 650px; line-height: 1.5; background: #ffffff; padding: 10px 0;">
    <div style="border-bottom: 2px solid #7c5cff; padding-bottom: 12px; margin-bottom: 20px;">
        <h2 style="margin: 0 0 4px 0; color: #0f172a; font-size: 19px; font-weight: 700; letter-spacing: -0.2px;">Briefing Esecutivo Stampa &mdash; ${client}</h2>
        <div style="color: #64748b; font-size: 13px;">Data: <strong>${todayStr}</strong> &bull; <strong>${articles.length} articoli</strong> &bull; Audience netta: <strong>~${analytics.formattedAudienceOTS}</strong> &bull; Letture stimate: <strong>~${analytics.formattedEstimatedReads}</strong></div>
    </div>

    <div style="margin-bottom: 22px;">
        <div style="font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.8px; color: #64748b; margin-bottom: 8px;">SINTESI ESECUTIVA:</div>
        <ul style="margin: 0; padding-left: 18px; font-size: 13.5px; color: #1e293b; line-height: 1.6;">
            ${digestData.highlights.map(h => `<li style="margin-bottom: 5px;">${h}</li>`).join('')}
        </ul>
    </div>

    <div style="margin-bottom: 20px;">
        <div style="font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.8px; color: #64748b; margin-bottom: 12px;">CLIP STAMPA PRINCIPALI:</div>
        ${digestData.clips.map(c => `
        <div style="margin-bottom: 14px; padding-bottom: 14px; border-bottom: 1px solid #e2e8f0;">
            <div style="font-size: 12px; font-weight: 700; color: #4f46e5; text-transform: capitalize; margin-bottom: 2px;">
                ${c.source} &bull; <span style="font-weight: 600; color: ${c.sentiment === 'positivo' ? '#16a34a' : (c.sentiment === 'critico' ? '#dc2626' : '#64748b')};">${c.sentiment}</span>
            </div>
            <div style="font-size: 15px; font-weight: 700; color: #0f172a; line-height: 1.35; margin-bottom: 4px;">
                ${c.title}
            </div>
            <div style="font-size: 13px; color: #475569; line-height: 1.5;">
                ${c.one_liner}
            </div>
        </div>`).join('')}
    </div>

    ${digestData.mood_sentiment ? `
    <div style="background: #f8fafc; border-left: 3px solid #7c5cff; padding: 10px 14px; border-radius: 4px; font-size: 12.5px; color: #475569;">
        <strong>Clima Media:</strong> ${digestData.mood_sentiment}
    </div>` : ''}
</div>`;

        res.json({
            success: true,
            digest: digestData,
            whatsappText: whatsappLines.join('\n'),
            emailText,
            emailHtml,
            analytics
        });

    } catch (error) {
        console.error('Errore generazione Morning Digest:', error);
        res.status(500).json({ error: 'Errore durante la generazione del Morning Digest.' });
    }
});

module.exports = router;
