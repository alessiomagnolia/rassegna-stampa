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
                    digestData = JSON.parse(jsonMatch[0]);
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
                    `Esposizione stimata complessiva: circa ${analytics.formattedReach} lettori potenziali.`,
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

        // Formatta testo pronto per WhatsApp/Slack (Markdown con emoji)
        const whatsappLines = [
            `📰 *BRIEFING STAMPA — ${client.toUpperCase()}*`,
            `🗓 *${todayStr}* | *${articles.length} uscite* | Reach st.: ~${analytics.formattedReach}`,
            ``,
            `🎯 *I FATTI CHIAVE DI OGGI:*`,
            ...digestData.highlights.map(h => `• ${h}`),
            ``,
            `📋 *LE PRINCIPALI USCITE:*`,
            ...digestData.clips.slice(0, 12).map(c => {
                const badge = c.sentiment === 'positivo' ? '🟢' : c.sentiment === 'critico' ? '🔴' : '⚪';
                return `${badge} *${c.source}*: ${c.title}\n   ↳ _${c.one_liner}_`;
            }),
            ``,
            `📊 *Sentiment:* ${digestData.mood_sentiment}`,
            `Generato con Rassegna Stampa AI`
        ];

        // Formatta HTML pulito per Email/Outlook
        const emailHtml = `
<div style="font-family: Arial, sans-serif; color: #222; max-width: 620px; line-height: 1.5;">
    <div style="border-bottom: 2px solid #7c5cff; padding-bottom: 12px; margin-bottom: 16px;">
        <h2 style="margin: 0 0 4px 0; color: #111; font-size: 18px;">Executive Morning Briefing — ${client}</h2>
        <div style="color: #666; font-size: 13px;">Data: <strong>${todayStr}</strong> | <strong>${articles.length} articoli</strong> | Reach stimata: <strong>~${analytics.formattedReach}</strong></div>
    </div>
    <div style="background: #f8f7fa; border-left: 4px solid #7c5cff; padding: 12px 16px; margin-bottom: 20px; border-radius: 4px;">
        <h3 style="margin: 0 0 8px 0; font-size: 14px; text-transform: uppercase; letter-spacing: 0.5px; color: #7c5cff;">Cosa c'è da sapere oggi</h3>
        <ul style="margin: 0; padding-left: 18px; font-size: 13.5px; color: #333;">
            ${digestData.highlights.map(h => `<li style="margin-bottom: 4px;">${h}</li>`).join('')}
        </ul>
    </div>
    <h3 style="font-size: 14px; text-transform: uppercase; letter-spacing: 0.5px; color: #555; margin-bottom: 10px;">Riepilogo Uscite</h3>
    <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
        ${digestData.clips.map(c => {
            const color = c.sentiment === 'positivo' ? '#10b981' : c.sentiment === 'critico' ? '#ef4444' : '#6b7280';
            return `
            <tr style="border-bottom: 1px solid #e5e7eb;">
                <td style="padding: 10px 8px; vertical-align: top; width: 130px; font-weight: bold; color: #111;">
                    ${c.source}
                    <div style="font-size: 10px; font-weight: normal; color: ${color}; text-transform: uppercase;">● ${c.sentiment}</div>
                </td>
                <td style="padding: 10px 8px; vertical-align: top;">
                    <div style="font-weight: 600; color: #1f2937; margin-bottom: 3px;">${c.title}</div>
                    <div style="color: #6b7280; font-size: 12px;">${c.one_liner}</div>
                </td>
            </tr>`;
        }).join('')}
    </table>
    <div style="margin-top: 20px; padding-top: 12px; border-top: 1px solid #e5e7eb; font-size: 12px; color: #6b7280;">
        <strong>Clima Media:</strong> ${digestData.mood_sentiment}
    </div>
</div>`;

        res.json({
            success: true,
            digest: digestData,
            whatsappText: whatsappLines.join('\n'),
            emailHtml,
            analytics
        });

    } catch (error) {
        console.error('Errore generazione Morning Digest:', error);
        res.status(500).json({ error: 'Errore durante la generazione del Morning Digest.' });
    }
});

module.exports = router;
