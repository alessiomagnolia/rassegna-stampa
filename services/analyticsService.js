/**
 * ANALYTICS & PR METRICS SERVICE
 * Standard di calcolo professionale conforme a benchmark Audiweb, ADS e AMEC Framework.
 * Calcola:
 * 1. Audience Netta Testate (OTS - Opportunity to See deduplicata per fonte)
 * 2. Letture Stimate Articoli (Estimated Article Reads / Views - modello AMEC)
 * 3. Sentiment Analysis ponderata
 */

function extractDomain(url = '') {
    if (!url) return '';
    try {
        let domain = url.replace(/^https?:\/\//i, '').split('/')[0];
        domain = domain.replace(/^www\./i, '').toLowerCase();
        return domain;
    } catch (e) {
        return '';
    }
}

function normalizeSourceName(name = '', url = '') {
    const raw = (name || extractDomain(url) || 'media').toLowerCase();
    return raw.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * Database certificato delle principali testate italiane
 * Dati: Audiweb Giorno Medio (Online) + ADS Diffusione Media Giorno (Carta)
 * ReadRate: quota stimata di audience che visualizza un singolo articolo specifico
 */
const CERTIFIED_OUTLETS = [
    // --- TIER 1: Grandi Quotidiani & Network Nazionali ---
    {
        patterns: ['corriere della sera', 'corriere', 'corriere it'],
        domain: 'corriere.it',
        tier: 1,
        tierLabel: 'Quotidiano Nazionale / Tier 1',
        dailyAudience: 3500000,
        readRate: 0.012
    },
    {
        patterns: ['repubblica', 'la repubblica', 'repubblica it'],
        domain: 'repubblica.it',
        tier: 1,
        tierLabel: 'Quotidiano Nazionale / Tier 1',
        dailyAudience: 3150000,
        readRate: 0.012
    },
    {
        patterns: ['il sole 24 ore', 'sole 24 ore', 'ilsole24ore', 'sole24ore'],
        domain: 'ilsole24ore.com',
        tier: 1,
        tierLabel: 'Economia & Finanza / Tier 1',
        dailyAudience: 1350000,
        readRate: 0.018
    },
    {
        patterns: ['ansa', 'ansa it', 'agenzia ansa'],
        domain: 'ansa.it',
        tier: 1,
        tierLabel: 'Agenzia di Stampa / Tier 1',
        dailyAudience: 2600000,
        readRate: 0.013
    },
    {
        patterns: ['la stampa', 'lastampa', 'lastampa it'],
        domain: 'lastampa.it',
        tier: 1,
        tierLabel: 'Quotidiano Nazionale / Tier 1',
        dailyAudience: 1150000,
        readRate: 0.014
    },
    {
        patterns: ['il messaggero', 'ilmessaggero', 'ilmessaggero it'],
        domain: 'ilmessaggero.it',
        tier: 1,
        tierLabel: 'Quotidiano Nazionale / Tier 1',
        dailyAudience: 1450000,
        readRate: 0.013
    },
    {
        patterns: ['fanpage', 'fanpage it'],
        domain: 'fanpage.it',
        tier: 1,
        tierLabel: 'Digital Native / Tier 1',
        dailyAudience: 2200000,
        readRate: 0.014
    },
    {
        patterns: ['tgcom24', 'tgcom'],
        domain: 'tgcom24.mediaset.it',
        tier: 1,
        tierLabel: 'Network TV & Web / Tier 1',
        dailyAudience: 1950000,
        readRate: 0.012
    },
    {
        patterns: ['sky tg24', 'skytg24', 'tg24 sky'],
        domain: 'tg24.sky.it',
        tier: 1,
        tierLabel: 'Network TV & Web / Tier 1',
        dailyAudience: 1400000,
        readRate: 0.013
    },
    {
        patterns: ['il fatto quotidiano', 'ilfattoquotidiano', 'ilfattoquotidiano it'],
        domain: 'ilfattoquotidiano.it',
        tier: 1,
        tierLabel: 'Quotidiano Nazionale / Tier 1',
        dailyAudience: 1250000,
        readRate: 0.014
    },
    {
        patterns: ['rainews', 'rai news', 'rainews it', 'rai'],
        domain: 'rainews.it',
        tier: 1,
        tierLabel: 'Servizio Pubblico / Tier 1',
        dailyAudience: 1100000,
        readRate: 0.013
    },
    {
        patterns: ['il giornale', 'ilgiornale', 'ilgiornale it'],
        domain: 'ilgiornale.it',
        tier: 1,
        tierLabel: 'Quotidiano Nazionale / Tier 1',
        dailyAudience: 850000,
        readRate: 0.014
    },
    {
        patterns: ['libero quotidiano', 'libero', 'liberoquotidiano'],
        domain: 'liberoquotidiano.it',
        tier: 1,
        tierLabel: 'Quotidiano Nazionale / Tier 1',
        dailyAudience: 780000,
        readRate: 0.014
    },
    {
        patterns: ['huffington post', 'huffpost', 'huffingtonpost'],
        domain: 'huffingtonpost.it',
        tier: 1,
        tierLabel: 'Digital Native / Tier 1',
        dailyAudience: 580000,
        readRate: 0.015
    },
    {
        patterns: ['la verita', 'laverita'],
        domain: 'laverita.info',
        tier: 1,
        tierLabel: 'Quotidiano Nazionale / Tier 1',
        dailyAudience: 480000,
        readRate: 0.015
    },
    {
        patterns: ['adnkronos'],
        domain: 'adnkronos.com',
        tier: 1,
        tierLabel: 'Agenzia di Stampa / Tier 1',
        dailyAudience: 850000,
        readRate: 0.015
    },
    {
        patterns: ['agi', 'agenzia giornalistica italia'],
        domain: 'agi.it',
        tier: 1,
        tierLabel: 'Agenzia di Stampa / Tier 1',
        dailyAudience: 620000,
        readRate: 0.015
    },
    {
        patterns: ['askanews'],
        domain: 'askanews.it',
        tier: 1,
        tierLabel: 'Agenzia di Stampa / Tier 1',
        dailyAudience: 420000,
        readRate: 0.016
    },
    {
        patterns: ['agenzia dire', 'dire it', 'agenziadire'],
        domain: 'dire.it',
        tier: 1,
        tierLabel: 'Agenzia di Stampa / Tier 1',
        dailyAudience: 350000,
        readRate: 0.016
    },
    {
        patterns: ['agenzia nova', 'agenzianova'],
        domain: 'agenzianova.com',
        tier: 1,
        tierLabel: 'Agenzia di Stampa / Tier 1',
        dailyAudience: 220000,
        readRate: 0.018
    },

    // --- TIER 2: Economia, Business, Finanza & Verticali ---
    {
        patterns: ['milano finanza', 'milanofinanza', 'class cnbc'],
        domain: 'milanofinanza.it',
        tier: 2,
        tierLabel: 'Economia & Finanza / Tier 2',
        dailyAudience: 380000,
        readRate: 0.022
    },
    {
        patterns: ['italia oggi', 'italiaoggi'],
        domain: 'italiaoggi.it',
        tier: 2,
        tierLabel: 'Economia & Fisco / Tier 2',
        dailyAudience: 290000,
        readRate: 0.022
    },
    {
        patterns: ['forbes italia', 'forbes'],
        domain: 'forbes.it',
        tier: 2,
        tierLabel: 'Business & Leadership / Tier 2',
        dailyAudience: 280000,
        readRate: 0.025
    },
    {
        patterns: ['affaritaliani'],
        domain: 'affaritaliani.it',
        tier: 2,
        tierLabel: 'Informazione Online / Tier 2',
        dailyAudience: 450000,
        readRate: 0.018
    },
    {
        patterns: ['wall street italia', 'wallstreetitalia'],
        domain: 'wallstreetitalia.com',
        tier: 2,
        tierLabel: 'Finanza & Risparmio / Tier 2',
        dailyAudience: 180000,
        readRate: 0.025
    },
    {
        patterns: ['finanzaonline', 'finanza online'],
        domain: 'finanzaonline.com',
        tier: 2,
        tierLabel: 'Finanza & Mercati / Tier 2',
        dailyAudience: 320000,
        readRate: 0.020
    },
    {
        patterns: ['wired', 'wired italia'],
        domain: 'wired.it',
        tier: 2,
        tierLabel: 'Tech & Innovazione / Tier 2',
        dailyAudience: 340000,
        readRate: 0.022
    },
    {
        patterns: ['startupitalia'],
        domain: 'startupitalia.eu',
        tier: 2,
        tierLabel: 'Innovazione & Startup / Tier 2',
        dailyAudience: 85000,
        readRate: 0.028
    },

    // --- TIER 2: Grandi Quotidiani Regionali & Metropolitani ---
    {
        patterns: ['il resto del carlino', 'resto del carlino', 'quotidiano nazionale', 'qn'],
        domain: 'ilrestodelcarlino.it',
        tier: 2,
        tierLabel: 'Regionale Storico / Tier 2',
        dailyAudience: 650000,
        readRate: 0.016
    },
    {
        patterns: ['la nazione', 'lanazione'],
        domain: 'lanazione.it',
        tier: 2,
        tierLabel: 'Regionale Storico / Tier 2',
        dailyAudience: 420000,
        readRate: 0.017
    },
    {
        patterns: ['il giorno', 'ilgiorno'],
        domain: 'ilgiorno.it',
        tier: 2,
        tierLabel: 'Regionale Storico / Tier 2',
        dailyAudience: 380000,
        readRate: 0.017
    },
    {
        patterns: ['il mattino', 'ilmattino'],
        domain: 'ilmattino.it',
        tier: 2,
        tierLabel: 'Regionale Storico / Tier 2',
        dailyAudience: 390000,
        readRate: 0.017
    },
    {
        patterns: ['il gazzettino', 'ilgazzettino'],
        domain: 'ilgazzettino.it',
        tier: 2,
        tierLabel: 'Regionale Storico / Tier 2',
        dailyAudience: 360000,
        readRate: 0.017
    },
    {
        patterns: ['il secolo xix', 'secolo xix'],
        domain: 'ilsecoloxix.it',
        tier: 2,
        tierLabel: 'Regionale Storico / Tier 2',
        dailyAudience: 280000,
        readRate: 0.018
    },
    {
        patterns: ['unione sarda', 'l unione sarda'],
        domain: 'unionesarda.it',
        tier: 2,
        tierLabel: 'Regionale Storico / Tier 2',
        dailyAudience: 310000,
        readRate: 0.018
    },
    {
        patterns: ['la nuova sardegna', 'nuova sardegna'],
        domain: 'lanuovasardegna.it',
        tier: 2,
        tierLabel: 'Regionale Storico / Tier 2',
        dailyAudience: 210000,
        readRate: 0.019
    },
    {
        patterns: ['gazzetta del mezzogiorno', 'la gazzetta del mezzogiorno'],
        domain: 'lagazzettadelmezzogiorno.it',
        tier: 2,
        tierLabel: 'Regionale Storico / Tier 2',
        dailyAudience: 240000,
        readRate: 0.018
    },
    {
        patterns: ['eco di bergamo', 'l eco di bergamo'],
        domain: 'ecodibergamo.it',
        tier: 2,
        tierLabel: 'Regionale / Tier 2',
        dailyAudience: 190000,
        readRate: 0.020
    },
    {
        patterns: ['giornale di brescia'],
        domain: 'giornaledibrescia.it',
        tier: 2,
        tierLabel: 'Regionale / Tier 2',
        dailyAudience: 180000,
        readRate: 0.020
    },
    {
        patterns: ['l arena', 'arena di verona'],
        domain: 'larena.it',
        tier: 2,
        tierLabel: 'Regionale / Tier 2',
        dailyAudience: 170000,
        readRate: 0.020
    },
    {
        patterns: ['messaggero veneto', 'il piccolo'],
        domain: 'messaggeroveneto.gelocal.it',
        tier: 2,
        tierLabel: 'Regionale / Tier 2',
        dailyAudience: 180000,
        readRate: 0.020
    },
    {
        patterns: ['il tirreno'],
        domain: 'iltirreno.it',
        tier: 2,
        tierLabel: 'Regionale / Tier 2',
        dailyAudience: 210000,
        readRate: 0.019
    },
    {
        patterns: ['citynews', 'milanotoday', 'romatoday', 'napolitoday', 'torinotoday', 'bolognatoday', 'firenzetoday', 'palermotoday'],
        domain: 'citynews.it',
        tier: 2,
        tierLabel: 'Digital Locale / Tier 2',
        dailyAudience: 420000,
        readRate: 0.018
    }
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
 * Classifies an outlet into Tier 1, Tier 2, Tier 3 with daily audience & read rate benchmarks
 */
function classifyOutlet(sourceName = '', url = '', sourceType = '') {
    const rawName = (sourceName || '').toLowerCase().trim();
    const cleanName = normalizeSourceName(sourceName, url);
    const domain = extractDomain(url);

    // 1. Direct match in certified database
    for (const item of CERTIFIED_OUTLETS) {
        if (domain && domain.includes(item.domain)) {
            return item;
        }
        for (const pattern of item.patterns) {
            if (cleanName.includes(pattern) || rawName.includes(pattern)) {
                return item;
            }
        }
    }

    // 2. Intelligent heuristics based on source type or name cues
    const t = (sourceType || '').toLowerCase();
    if (t.includes('nazionale') || t.includes('agenzia')) {
        return {
            tier: 1,
            tierLabel: 'Quotidiano Nazionale / Tier 1',
            dailyAudience: 750000,
            readRate: 0.015
        };
    }
    if (t.includes('locale') || t.includes('regionale') || cleanName.includes('gazzetta') || cleanName.includes('corriere') || cleanName.includes('cronaca')) {
        return {
            tier: 2,
            tierLabel: 'Stampa Locale / Tier 2',
            dailyAudience: 180000,
            readRate: 0.020
        };
    }
    if (t.includes('periodico') || t.includes('magazine') || cleanName.includes('rivista')) {
        return {
            tier: 2,
            tierLabel: 'Periodico / Magazine',
            dailyAudience: 110000,
            readRate: 0.025
        };
    }
    if (cleanName.includes('tech') || cleanName.includes('finanz') || cleanName.includes('lavoro') || cleanName.includes('business') || cleanName.includes('diritto')) {
        return {
            tier: 2,
            tierLabel: 'Media Specializzato B2B',
            dailyAudience: 65000,
            readRate: 0.030
        };
    }
    if (cleanName.length > 0 && !cleanName.includes('blog') && !cleanName.includes('comunicato')) {
        return {
            tier: 2,
            tierLabel: 'Testata di Settore',
            dailyAudience: 50000,
            readRate: 0.030
        };
    }

    // Tier 3 Default (Digital / Web / Blog)
    return {
        tier: 3,
        tierLabel: 'Digital / Web Media',
        dailyAudience: 20000,
        readRate: 0.035
    };
}

/**
 * Evaluates sentiment of an individual article
 */
function analyzeArticleSentiment(article) {
    const text = `${article.title || ''} ${article.excerpt || ''}`.toLowerCase();
    
    let posScore = 0;
    let negScore = 0;

    POSITIVE_KEYWORDS.forEach(word => {
        const regex = new RegExp(`(\\b(?:non|nessun|nessuna|senza)\\s+(?:\\w+\\s+){0,2})?\\b${word}\\b`, 'gi');
        let match;
        while ((match = regex.exec(text)) !== null) {
            if (match[1]) {
                // Negated positive: "non è un successo" -> lieve tono critico o neutro
                negScore += 0.8;
            } else {
                posScore += 1;
            }
        }
    });

    NEGATIVE_KEYWORDS.forEach(word => {
        const regex = new RegExp(`(\\b(?:non|nessun|nessuna|senza|smentisce|smentita|evita|evitato|evitata|superato|superata)\\s+(?:\\w+\\s+){0,2})?\\b${word}\\b`, 'gi');
        let match;
        while ((match = regex.exec(text)) !== null) {
            if (match[1]) {
                // Negated negative: "non è in crisi", "evitato il fallimento" -> tono favorevole/risolto
                posScore += 0.6;
            } else {
                negScore += match.length ? 1.2 : 1.2;
            }
        }
    });

    if (posScore > negScore && posScore >= 1) {
        return { sentiment: 'positivo', label: 'Positivo', score: posScore - negScore };
    }
    if (negScore > posScore && negScore >= 1) {
        return { sentiment: 'critico', label: 'Critico', score: posScore - negScore };
    }
    return { sentiment: 'neutro', label: 'Neutro / Informativo', score: 0 };
}

function formatMetricNumber(num = 0) {
    if (num >= 1000000) {
        return (num / 1000000).toFixed(1) + 'M';
    } else if (num >= 1000) {
        return Math.round(num / 1000) + 'K';
    }
    return num.toString();
}

/**
 * Generates aggregated PR analytics and KPIs from an array of articles
 * Includes:
 * - Unduplicated Net Audience (OTS): each source audience counted only ONCE
 * - Estimated Article Reads: AMEC model for individual article visibility
 */
function calculatePRAnalytics(articles = []) {
    if (!articles || !Array.isArray(articles) || articles.length === 0) {
        return {
            totalArticles: 0,
            uniqueOutlets: 0,
            tierDistribution: { tier1: 0, tier2: 0, tier3: 0 },
            sentimentDistribution: { positivo: 0, neutro: 0, critico: 0, positivePct: 0, neutralPct: 0, criticalPct: 0 },
            totalAudienceOTS: 0,
            formattedAudienceOTS: '0',
            totalEstimatedReads: 0,
            formattedEstimatedReads: '0',
            totalEstimatedReach: 0,
            formattedReach: '0',
            overallSentiment: 'Neutro',
            topOutlets: [],
            annotatedArticles: [],
            methodologyNote: 'Audience Netta calcolata su dati giorno medio Audiweb/ADS con deduplicazione delle fonti. Letture Stimate calcolate con coefficiente AMEC per singolo articolo.'
        };
    }

    const uniqueSourcesSet = new Set();
    const outletCounts = {};
    const seenOutletMap = new Map(); // outletKey -> dailyAudience
    const outletArticleCounts = {}; // outletKey -> count

    let tier1Count = 0;
    let tier2Count = 0;
    let tier3Count = 0;

    let totalAudienceOTS = 0;
    let totalEstimatedReads = 0;

    let posCount = 0;
    let neuCount = 0;
    let criCount = 0;

    const annotatedArticles = articles.map(art => {
        const outletClass = classifyOutlet(art.source_name, art.url, art.source_type);
        const sentAnalysis = analyzeArticleSentiment(art);

        const source = art.source_name ? art.source_name.trim() : 'Media';
        const normKey = normalizeSourceName(source, art.url);

        uniqueSourcesSet.add(source);
        outletCounts[source] = (outletCounts[source] || 0) + 1;
        outletArticleCounts[normKey] = (outletArticleCounts[normKey] || 0) + 1;

        if (outletClass.tier === 1) tier1Count++;
        else if (outletClass.tier === 2) tier2Count++;
        else tier3Count++;

        // 1. DEDUPLICATED AUDIENCE (OTS): count each unique outlet's audience ONCE!
        if (!seenOutletMap.has(normKey)) {
            seenOutletMap.set(normKey, outletClass.dailyAudience);
            totalAudienceOTS += outletClass.dailyAudience;
        }

        // 2. ESTIMATED ARTICLE READS (AMEC Framework):
        // Each article has its own readers. If there are multiple articles in the same outlet,
        // subsequent articles have diminishing returns for cannibalized attention:
        const occurrence = outletArticleCounts[normKey];
        const multiplier = occurrence === 1 ? 1.0 : (occurrence === 2 ? 0.75 : 0.5);
        const articleEstimatedReads = Math.max(10, Math.round(outletClass.dailyAudience * outletClass.readRate * multiplier));
        totalEstimatedReads += articleEstimatedReads;

        if (sentAnalysis.sentiment === 'positivo') posCount++;
        else if (sentAnalysis.sentiment === 'critico') criCount++;
        else neuCount++;

        return {
            ...art,
            tier: outletClass.tier,
            tierLabel: outletClass.tierLabel,
            dailyAudience: outletClass.dailyAudience,
            estimatedReads: articleEstimatedReads,
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

    const formattedAudienceOTS = formatMetricNumber(totalAudienceOTS);
    const formattedEstimatedReads = formatMetricNumber(totalEstimatedReads);

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
        totalAudienceOTS,
        formattedAudienceOTS,
        totalEstimatedReads,
        formattedEstimatedReads,
        // Backward compatibility
        totalEstimatedReach: totalAudienceOTS,
        formattedReach: formattedAudienceOTS,
        methodologyNote: 'Audience Netta calcolata su dati giorno medio Audiweb/ADS con deduplicazione delle fonti. Letture Stimate calcolate con coefficiente AMEC per singolo articolo.',
        overallSentiment,
        topOutlets,
        annotatedArticles
    };
}

module.exports = {
    classifyOutlet,
    analyzeArticleSentiment,
    calculatePRAnalytics,
    formatMetricNumber,
    normalizeSourceName
};
