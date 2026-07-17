const express = require('express');
const { authMiddleware } = require('../middleware/auth');
const { extractArticle } = require('../services/articleExtractor');

const router = express.Router();

router.post('/extract', authMiddleware, async (req, res) => {
    try {
        const { url } = req.body;

        if (!url) {
            return res.status(400).json({ error: 'L\'URL è obbligatorio.' });
        }

        try {
            new URL(url); // Validate URL format
        } catch (e) {
            return res.status(400).json({ error: 'Formato URL non valido.' });
        }

        // Set a timeout to prevent hanging requests
        const timeoutPromise = new Promise((_, reject) => 
            setTimeout(() => reject(new Error('TIMEOUT')), 90000)
        );

        console.log(`[Extracrtion] Inizio estrazione per: ${url}`);
        
        try {
            const articleData = await Promise.race([
                extractArticle(url),
                timeoutPromise
            ]);
            
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
