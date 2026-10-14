const express = require('express');
const multer = require('multer');
const { authMiddleware } = require('../middleware/auth');
const { getStatus, transcribeAudio, analyzeTranscript } = require('../services/transcriptionService');

const router = express.Router();

// Segmenti audio in memoria (il browser invia blocchi WAV/WebM < 25 MB, limite Whisper)
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 25 * 1024 * 1024 }
});

/**
 * GET /api/transcribe/status — indica se il servizio di trascrizione è configurato
 */
router.get('/status', authMiddleware, (req, res) => {
    res.json(getStatus());
});

/**
 * POST /api/transcribe — trascrive un singolo segmento audio
 * multipart: audio (file), offset (secondi), language, prompt
 */
router.post('/', authMiddleware, (req, res) => {
    upload.single('audio')(req, res, async (uploadErr) => {
        if (uploadErr) {
            const msg = uploadErr.code === 'LIMIT_FILE_SIZE'
                ? 'Segmento audio troppo grande (max 25 MB).'
                : `Errore caricamento audio: ${uploadErr.message}`;
            return res.status(413).json({ error: msg });
        }
        if (!req.file || !req.file.buffer || req.file.size === 0) {
            return res.status(400).json({ error: 'Nessun file audio ricevuto.' });
        }

        try {
            const result = await transcribeAudio({
                buffer: req.file.buffer,
                filename: req.file.originalname || 'audio.wav',
                mimetype: req.file.mimetype || 'audio/wav',
                offsetSec: Number(req.body.offset) || 0,
                language: (req.body.language || 'it').slice(0, 5),
                prompt: req.body.prompt || ''
            });
            res.json(result);
        } catch (err) {
            console.error('[TranscribeRoutes] Errore trascrizione:', err.message);
            res.status(err.status === 503 ? 503 : 502).json({ error: err.message || 'Errore durante la trascrizione' });
        }
    });
});

/**
 * POST /api/transcribe/analyze — titolo, sintesi, virgolettati e temi dalla trascrizione
 */
router.post('/analyze', authMiddleware, async (req, res) => {
    try {
        const { text, sourceName, clientName } = req.body || {};
        if (!text || !String(text).trim()) {
            return res.status(400).json({ error: 'Trascrizione mancante.' });
        }
        const analysis = await analyzeTranscript({ text, sourceName, clientName });
        res.json(analysis);
    } catch (err) {
        console.error('[TranscribeRoutes] Errore analisi:', err.message);
        res.status(500).json({ error: 'Errore durante l\'analisi della trascrizione' });
    }
});

module.exports = router;
