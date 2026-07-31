const express = require('express');
const { authMiddleware } = require('../middleware/auth');
const { extractArticle } = require('../services/articleExtractor');
const { cleanAndUnwrapArticleUrl, resolveGoogleNewsUrl } = require('./newsRoutes');

const router = express.Router();

router.post('/extract', authMiddleware, async (req, res) => {
    try {
        let { url } = req.body;

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
            setTimeout(() => reject(new Error('TIMEOUT')), 90000)
        );

        console.log(`[Extraction] Inizio estrazione per URL pulito: ${url}`);
        
        try {
            const articleData = await Promise.race([
                extractArticle(url),
                timeoutPromise
            ]);
            
            // Ensure final articleData.url is the clean direct publisher URL
            if (articleData) {
                articleData.url = url;
            }
            
            res.json(articleData);
        } catch (extractError) {
            if (extractError.message === 'TIMEOUT') {
                return res.status(504).json({ error: 'Tempo scaduto. Il sito è troppo lento o blocca l\'estrazione.' });
            }
            throw extractError;
        }

    } catch (error) {
        console.error('Route extract error:', error);
        res.status(500).json({ error: 'Si è verificato un errore durante l\'estrazione dell\'articolo.' });
    }
});

module.exports = router;
