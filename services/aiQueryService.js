const Anthropic = require('@anthropic-ai/sdk');

/**
 * AI QUERY MULTIPLIER SERVICE
 * Generates 5-8 smart contextual query variations for media monitoring search.
 */

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
 * Fallback query generator based on Italian press review search patterns.
 */
function generateFallbackQueries(baseQuery) {
    const clean = baseQuery.trim();
    if (!clean) return [baseQuery];

    const variations = [
        clean,
        `${clean} notizie`,
        `${clean} accordo`,
        `${clean} comunicato`,
        `${clean} ministero`,
        `${clean} gare appalto`
    ];

    return Array.from(new Set(variations));
}

/**
 * Expands a user search term into 5-8 contextual search query variations.
 */
async function expandQueryWithAI(baseQuery) {
    if (!baseQuery || typeof baseQuery !== 'string' || baseQuery.trim().length < 2) {
        return [baseQuery];
    }

    const cleanQuery = baseQuery.replace(/["']/g, '').trim();

    try {
        const client = getAnthropicClient();
        if (client) {
            const prompt = `Sei un esperto rassegnista stampa e ricercatore di notizie giornalistiche in Italia.
Data la parola chiave o il soggetto di ricerca: "${cleanQuery}"

Genera da 4 a 6 brevi varianti o combinazioni di ricerca in lingua italiana per trovare il maggior numero possibile di articoli di giornale pertinenti (es. includendo termini come "accordi", "bonifiche", "nomine", "bilancio", "ministero", "gare").

Rispondi ESCLUSIVAMENTE con un array JSON di stringhe di ricerca pulite, senza spiegazioni, formattato così:
["chiave 1", "chiave 2", "chiave 3", "chiave 4", "chiave 5"]`;

            const response = await Promise.race([
                client.messages.create({
                    model: 'claude-3-5-haiku-20241022',
                    max_tokens: 200,
                    messages: [{ role: 'user', content: prompt }]
                }),
                new Promise((_, reject) => setTimeout(() => reject(new Error('AI Query Expansion Timeout')), 3000))
            ]);

            if (response && response.content && response.content[0] && response.content[0].text) {
                const text = response.content[0].text.trim();
                const match = text.match(/\[[\s\S]*\]/);
                if (match) {
                    const parsed = JSON.parse(match[0]);
                    if (Array.isArray(parsed) && parsed.length > 0) {
                        const cleanedAI = parsed.map(q => String(q).trim()).filter(q => q.length > 1);
                        const result = Array.from(new Set([cleanQuery, ...cleanedAI])).slice(0, 6);
                        console.log(`[AI Query Multiplier] Query: "${cleanQuery}" → Espansa con successo in ${result.length} varianti AI:`, result);
                        return result;
                    }
                }
            }
        }
    } catch (err) {
        console.log(`[AI Query Multiplier Notice] Fallback euristico attivato per "${cleanQuery}":`, err.message);
    }

    // Return heuristic fallback variations
    return generateFallbackQueries(cleanQuery);
}

module.exports = {
    expandQueryWithAI,
    generateFallbackQueries
};
