/**
 * ANALYTICS & PR METRICS SERVICE
 * Provides credible KPI metrics, outlet tiering, estimated reach, and sentiment analysis
 * for press coverage reports (inspired by CoverageBook & PR intelligence standards).
 */

const TIER_1_SOURCES = [
    'corriere', 'repubblica', 'il sole 24 ore', 'sole 24 ore', 'ansa', 'la stampa',
    'sky tg24', 'tgcom24', 'il messaggero', 'il giornale', 'libero quotidiano', 'libero',
    'il fatto quotidiano', 'agi', 'adnkronos', 'askanews', 'rainews', 'fanpage',
    'huffington post', 'forbes italia', 'milano finanza', 'italia oggi', 'dire', 'agenzia nova'
];

const POSITIVE_KEYWORDS = [
    'successo', 'record', 'crescita', 'approvato', 'premiato', 'eccellente', 'accordo',
    'partnership', 'espansione', 'utile', 'positivo', 'positiva', 'innovazione', 'trionfo',
    'storico', 'leader', 'investimento', 'investimenti', 'potenziamento', 'traguardo',
    'intesa', 'rilancio', 'vittoria', 'svolta', 'protagonista', 'eccellenza', 'sviluppo',
    'avanti', 'apertura', 'opportunità', 'rinnovo', 'soddisfazione', 'primato'
];

const NEGATIVE_KEYWORDS = [
    'crisi', 'calo', 'crollo', 'indagine', 'indagini', 'sanzione', 'sanzioni', 'polemica',
    'polemiche', 'scontro', 'scontri', 'ritardo', 'ritardi', 'fallimento', 'perdita',
    'perdite', 'protesta', 'proteste', 'scandalo', 'arresto', 'arresti', 'truffa', 'stop',
    'allarme', 'denuncia', 'denunce', 'smentita', 'rischio', 'rischi', 'bocciato', 'bocciata',
    'bufera', 'difficoltà', 'sospeso', 'grave', 'tagli', 'chiusura'
];

/**
 * Classifies an outlet into Tier 1 (National/Top), Tier 2 (Regional/Specialized), Tier 3 (Web/Digital)
 */
function classifyOutlet(sourceName = '', url = '') {
    const s = (sourceName || '').toLowerCase().trim();
    const u = (url || '').toLowerCase();

    for (const top of TIER_1_SOURCES) {
        if (s.includes(top) || u.includes(top.replace(/\s+/g, ''))) {
            return { tier: 1, label: 'Nazionale / Tier 1', estimatedReach: 1850000 };
        }
    }

    // Known regional or vertical outlets
    if (s.includes('mattino') || s.includes('carlino') || s.includes('nazione') || 
        s.includes('giorno') || s.includes('secolo') || s.includes('sannio') || 
        s.includes('diario del lavoro') || s.includes('gazzetta') || s.includes('messaggero veneto') ||
        s.includes('tirreno') || s.includes('brescia') || s.includes('arena') || s.includes('unione sarda')) {
        return { tier: 2, label: 'Regionale / Specializzata', estimatedReach: 240000 };
    }

    // Default to Tier 2 if recognizable publisher, Tier 3 if niche web/blog
    if (s.length > 0 && !s.includes('blog') && !s.includes('comunicato')) {
        return { tier: 2, label: 'Media Specializzato', estimatedReach: 110000 };
    }

    return { tier: 3, label: 'Digital / Web', estimatedReach: 25000 };
}

/**
 * Evaluates sentiment of an individual article
 */
function analyzeArticleSentiment(article) {
    const text = `${article.title || ''} ${article.excerpt || ''}`.toLowerCase();
    
    let posScore = 0;
    let negScore = 0;

    POSITIVE_KEYWORDS.forEach(word => {
        const regex = new RegExp(`\\b${word}\\b`, 'gi');
        const matches = text.match(regex);
        if (matches) posScore += matches.length;
    });

    NEGATIVE_KEYWORDS.forEach(word => {
        const regex = new RegExp(`\\b${word}\\b`, 'gi');
        const matches = text.match(regex);
        if (matches) negScore += matches.length * 1.2;
    });

    if (posScore > negScore && posScore >= 1) {
        return { sentiment: 'positivo', label: 'Positivo', score: posScore - negScore };
    }
    if (negScore > posScore && negScore >= 1) {
        return { sentiment: 'critico', label: 'Critico', score: posScore - negScore };
    }
    return { sentiment: 'neutro', label: 'Neutro / Informativo', score: 0 };
}

/**
 * Generates aggregated PR analytics and KPIs from an array of articles
 */
function calculatePRAnalytics(articles = []) {
    if (!articles || !Array.isArray(articles) || articles.length === 0) {
        return {
            totalArticles: 0,
            uniqueOutlets: 0,
            tierDistribution: { tier1: 0, tier2: 0, tier3: 0 },
            sentimentDistribution: { positivo: 0, neutro: 0, critico: 0, positivePct: 0, neutralPct: 0, criticalPct: 0 },
            totalEstimatedReach: 0,
            formattedReach: '0',
            overallSentiment: 'Neutro',
            topOutlets: [],
            annotatedArticles: []
        };
    }

    const uniqueSourcesSet = new Set();
    const outletCounts = {};
    let tier1Count = 0;
    let tier2Count = 0;
    let tier3Count = 0;
    let totalReach = 0;

    let posCount = 0;
    let neuCount = 0;
    let criCount = 0;

    const annotatedArticles = articles.map(art => {
        const outletClass = classifyOutlet(art.source_name, art.url);
        const sentAnalysis = analyzeArticleSentiment(art);

        const source = art.source_name || 'Altra Testata';
        uniqueSourcesSet.add(source);
        outletCounts[source] = (outletCounts[source] || 0) + 1;

        if (outletClass.tier === 1) tier1Count++;
        else if (outletClass.tier === 2) tier2Count++;
        else tier3Count++;

        totalReach += outletClass.estimatedReach;

        if (sentAnalysis.sentiment === 'positivo') posCount++;
        else if (sentAnalysis.sentiment === 'critico') criCount++;
        else neuCount++;

        return {
            ...art,
            tier: outletClass.tier,
            tierLabel: outletClass.label,
            estimatedReach: outletClass.estimatedReach,
            sentiment: sentAnalysis.sentiment,
            sentimentLabel: sentAnalysis.label
        };
    });

    const total = articles.length;
    const positivePct = Math.round((posCount / total) * 100);
    const criticalPct = Math.round((criCount / total) * 100);
    const neutralPct = Math.max(0, 100 - positivePct - criticalPct);

    let overallSentiment = 'Neutro / Informativo';
    if (positivePct >= 50 && criticalPct < 15) {
        overallSentiment = 'Molto Favorevole';
    } else if (positivePct > criticalPct) {
        overallSentiment = 'Prevalentemente Positivo';
    } else if (criticalPct > 35) {
        overallSentiment = 'Attenzione Richiesta';
    }

    let formattedReach = '';
    if (totalReach >= 1000000) {
        formattedReach = (totalReach / 1000000).toFixed(1) + 'M';
    } else if (totalReach >= 1000) {
        formattedReach = Math.round(totalReach / 1000) + 'K';
    } else {
        formattedReach = totalReach.toString();
    }

    const topOutlets = Object.entries(outletCounts)
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 6);

    return {
        totalArticles: total,
        uniqueOutlets: uniqueSourcesSet.size,
        tierDistribution: {
            tier1: tier1Count,
            tier2: tier2Count,
            tier3: tier3Count
        },
        sentimentDistribution: {
            positivo: posCount,
            neutro: neuCount,
            critico: criCount,
            positivePct,
            neutralPct,
            criticalPct
        },
        totalEstimatedReach: totalReach,
        formattedReach,
        overallSentiment,
        topOutlets,
        annotatedArticles
    };
}

module.exports = {
    classifyOutlet,
    analyzeArticleSentiment,
    calculatePRAnalytics
};
