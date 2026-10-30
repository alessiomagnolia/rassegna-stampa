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
            if (url.includes('news.google.com/rss/articles/') || url.includes('news.google.com/articles/')) {
                url = await resolveGoogleNewsUrl(url);
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
const { getAnthropicClient, callAnthropicMessages } = require('../services/aiHelper');

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
 * Generates an executive Morning Digest from selected articles
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
Il tuo compito è preparare l'"Executive Briefing" per il CEO e i vertici aziendali relativo al cliente: "${client}" (Oggetto rassegna: "${title}", Data: ${todayStr}).

Articoli raccolti nella rassegna odierna:
${articleSummaries}

Sentiment generale stimato: ${analytics.overallSentiment} (${analytics.sentimentDistribution.positivePct}% Positivo, ${analytics.sentimentDistribution.criticalPct}% Critico).

Genera una risposta ESCLUSIVAMENTE in formato JSON con la seguente struttura:
{
  "subject": "[Briefing] Rassegna Stampa - ${client} - ${todayStr}",
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
                    callAnthropicMessages(anthropic, {
                        max_tokens: 1500,
                        messages: [{ role: 'user', content: prompt }]
                    }, { type: 'fast' }),
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
                subject: `[Briefing] Rassegna Stampa - ${client} - ${todayStr}`,
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
        const emailDivider = '────────────────────';
        const emailText = [
            `BRIEFING ESECUTIVO STAMPA — ${client.toUpperCase()}`,
            `Data: ${todayStr} | ${articles.length} articoli | Audience netta: ~${analytics.formattedAudienceOTS} | Letture stimate: ~${analytics.formattedEstimatedReads}`,
            emailDivider,
            ``,
            `SINTESI ESECUTIVA`,
            ``,
            ...digestData.highlights.map(h => `• ${h}\n`),
            emailDivider,
            ``,
            `CLIP STAMPA PRINCIPALI`,
            ``,
            ...digestData.clips.map(c =>
                `${(c.source || 'MEDIA').toUpperCase()} • ${(c.sentiment || 'neutro').toUpperCase()}\n${c.title}\n${c.one_liner}\n`
            ),
            ...(digestData.mood_sentiment ? [emailDivider, ``, `CLIMA MEDIA`, ``, digestData.mood_sentiment] : [])
        ].join('\n');

        // Formatta Rich HTML per Email / Outlook (stessi colori e dimensioni dell'anteprima in piattaforma, tema scuro)
        const escHtml = (value) => String(value ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
        const mood = digestData.mood_sentiment || digestData.mood_summary || '';
        const emailHtml = `
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#121212" style="width: 100%; max-width: 650px; background: #121212; border: 1px solid #333333; border-radius: 10px; border-collapse: separate;">
<tr><td bgcolor="#121212" style="padding: 20px; background: #121212; border-radius: 10px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #efece5; line-height: 1.5;">
    <div style="border-bottom: 2px solid #a78bfa; padding-bottom: 12px; margin-bottom: 20px;">
        <div style="margin: 0 0 4px 0; color: #efece5; font-size: 19px; font-weight: 700; letter-spacing: -0.2px;">Briefing Esecutivo Stampa &mdash; ${escHtml(client)}</div>
        <div style="color: #888888; font-size: 13px;">Data: <strong style="color: #efece5;">${escHtml(todayStr)}</strong> &bull; <strong style="color: #efece5;">${articles.length} articoli</strong> &bull; Audience netta: <strong style="color: #efece5;">~${escHtml(analytics.formattedAudienceOTS)}</strong> &bull; Letture stimate: <strong style="color: #efece5;">~${escHtml(analytics.formattedEstimatedReads)}</strong></div>
    </div>

    <div style="font-size: 11.5px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.8px; color: #888888; margin-bottom: 10px;">SINTESI ESECUTIVA:</div>
    <ul style="margin: 0 0 20px 0; padding-left: 20px; font-size: 14px; color: #efece5; line-height: 1.65;">
        ${digestData.highlights.map(h => `<li style="margin-bottom: 4px;">${escHtml(h)}</li>`).join('')}
    </ul>

    <div style="font-size: 11.5px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.8px; color: #888888; margin: 20px 0 10px 0;">CLIP STAMPA PRINCIPALI:</div>
    ${digestData.clips.map(c => `
    <div style="margin-bottom: 14px; padding-bottom: 14px; border-bottom: 1px solid #262626;">
        <div style="font-size: 12.5px; font-weight: 700; color: #a78bfa; text-transform: capitalize; margin-bottom: 2px;">
            ${escHtml(c.source)} &bull; <span style="font-weight: 600; color: ${c.sentiment === 'positivo' ? '#10b981' : (c.sentiment === 'critico' ? '#ef4444' : '#888888')};">${escHtml(c.sentiment || 'Neutro')}</span>
        </div>
        <div style="font-size: 15.5px; font-weight: 700; color: #efece5; line-height: 1.35; margin: 2px 0 4px 0;">
            ${escHtml(c.title)}
        </div>
        <div style="font-size: 13.5px; color: #888888; line-height: 1.5;">
            ${escHtml(c.one_liner)}
        </div>
    </div>`).join('')}

    ${mood ? `
    <div style="margin-top: 16px; background: #1a1a1a; border-left: 3px solid #a78bfa; padding: 10px 14px; border-radius: 6px; font-size: 13px; color: #888888;">
        <strong>Clima Media:</strong> ${escHtml(mood)}
    </div>` : ''}
</td></tr>
</table>`;

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
