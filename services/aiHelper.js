const Anthropic = require('@anthropic-ai/sdk');

let cachedWorkingModel = null;
let cachedFastModel = null;

function getAnthropicClient() {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
        throw new Error('Chiave API di Anthropic non configurata nel server (.env)');
    }
    return new Anthropic({ apiKey });
}

/**
 * Esegue messaggi Anthropic con risoluzione e fallback automatico tra i modelli disponibili per l'account.
 * Supporta i modelli della serie claude-sonnet-4-6, claude-sonnet-5, claude-haiku-4-5, ecc.
 */
async function callAnthropicMessages(anthropic, params, options = {}) {
    const isFastTask = options.type === 'fast';

    const candidateModels = isFastTask
        ? [
            cachedFastModel,
            'claude-haiku-4-5-20251001',
            'claude-sonnet-4-6',
            'claude-sonnet-5',
            'claude-sonnet-4-5-20250929',
            'claude-3-5-haiku-20241022',
            'claude-3-5-sonnet-20241022'
          ].filter(Boolean)
        : [
            cachedWorkingModel,
            'claude-sonnet-4-6',
            'claude-sonnet-5',
            'claude-sonnet-4-5-20250929',
            'claude-opus-4-6',
            'claude-opus-5',
            'claude-haiku-4-5-20251001',
            'claude-3-5-sonnet-20241022'
          ].filter(Boolean);

    const uniqueCandidates = Array.from(new Set(candidateModels));
    let lastError = null;

    for (const model of uniqueCandidates) {
        try {
            const response = await anthropic.messages.create({
                ...params,
                model
            });
            if (isFastTask) {
                cachedFastModel = model;
            } else {
                cachedWorkingModel = model;
            }
            return response;
        } catch (err) {
            lastError = err;
            if (err.status === 404 || (err.message && err.message.includes('not_found_error'))) {
                console.warn(`[Anthropic AI] Modello "${model}" non trovato (404), provo il prossimo modello disponibile...`);
                continue;
            }
            throw err;
        }
    }

    try {
        const apiKey = process.env.ANTHROPIC_API_KEY;
        if (apiKey) {
            const res = await fetch('https://api.anthropic.com/v1/models', {
                headers: {
                    'x-api-key': apiKey,
                    'anthropic-version': '2023-06-01'
                }
            });
            const data = await res.json();
            if (data.data && Array.isArray(data.data) && data.data.length > 0) {
                const availableIds = data.data.map(m => m.id);
                const dynamicChoice = availableIds.find(id => isFastTask ? id.includes('haiku') : id.includes('sonnet'))
                    || availableIds.find(id => id.includes('sonnet'))
                    || availableIds.find(id => id.includes('opus'))
                    || availableIds[0];

                if (dynamicChoice) {
                    console.log(`[Anthropic AI] Modello rilevato dinamicamente: ${dynamicChoice}`);
                    const response = await anthropic.messages.create({
                        ...params,
                        model: dynamicChoice
                    });
                    if (isFastTask) cachedFastModel = dynamicChoice;
                    else cachedWorkingModel = dynamicChoice;
                    return response;
                }
            }
        }
    } catch (discoveryErr) {
        console.error('[Anthropic AI] Recupero dinamico modelli fallito:', discoveryErr.message);
    }

    throw lastError;
}

module.exports = {
    getAnthropicClient,
    callAnthropicMessages
};
