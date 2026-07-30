/**
 * FONTI PRIORITARIE — Database testate standard
 * 
 * Estratte dall'analisi COMPLETA della rassegna stampa "La Ripartenza – Maratea 2026"
 * (297 URL analizzati dal file DOCX, 191 domini unici identificati).
 *
 * Ogni fonte include:
 *  - domain:   dominio principale (usato per site: query e favicon)
 *  - url:      homepage completa del sito
 *  - rss:      feed RSS/Atom del sito (se disponibile) per ricerca diretta
 *  - category: categoria editoriale
 */

const PRIORITY_SOURCES = [
    // ── Agenzie di Stampa ───────────────────────────────────────────────────
    { name: 'ANSA',              domain: 'ansa.it',           url: 'https://www.ansa.it',           rss: 'https://www.ansa.it/sito/notizie/economia/economia_rss.xml',     category: 'agenzia_stampa' },
    { name: 'Agenzia Nova',      domain: 'agenzianova.com',   url: 'https://www.agenzianova.com',   rss: 'https://www.agenzianova.com/feed/',                              category: 'agenzia_stampa' },
    { name: 'AGI',               domain: 'agi.it',            url: 'https://www.agi.it',            rss: 'https://www.agi.it/feed/rss.xml',                                category: 'agenzia_stampa' },
    { name: 'Askanews',          domain: 'askanews.it',       url: 'https://askanews.it',           rss: 'https://askanews.it/feed/',                                      category: 'agenzia_stampa' },
    { name: 'Adnkronos',         domain: 'adnkronos.com',     url: 'https://www.adnkronos.com',     rss: 'https://www.adnkronos.com/rss/economia.xml',                     category: 'agenzia_stampa' },
    { name: 'Italpress',         domain: 'italpress.com',     url: 'https://www.italpress.com',     rss: 'https://www.italpress.com/feed/',                                category: 'agenzia_stampa' },
    { name: 'AGIpress',          domain: 'agipress.it',       url: 'https://www.agipress.it',       rss: null,                                                             category: 'agenzia_stampa' },

    // ── Quotidiani Nazionali ────────────────────────────────────────────────
    { name: 'Corriere della Sera',       domain: 'corriere.it',              url: 'https://www.corriere.it',              rss: 'https://xml2.corrieredellasera.it/rss/homepage.xml',            category: 'quotidiano_nazionale' },
    { name: 'la Repubblica',             domain: 'repubblica.it',            url: 'https://www.repubblica.it',            rss: 'https://www.repubblica.it/rss/homepage/rss2.0.xml',             category: 'quotidiano_nazionale' },
    { name: 'La Stampa',                 domain: 'lastampa.it',              url: 'https://www.lastampa.it',              rss: 'https://www.lastampa.it/rss.xml',                               category: 'quotidiano_nazionale' },
    { name: 'Il Sole 24 ORE',            domain: 'ilsole24ore.com',          url: 'https://www.ilsole24ore.com',          rss: 'https://www.ilsole24ore.com/rss/italia--economia.xml',          category: 'quotidiano_nazionale' },
    { name: 'Il Sole 24 ORE (Stream)',   domain: 'stream24.ilsole24ore.com', url: 'https://stream24.ilsole24ore.com',     rss: null,                                                            category: 'quotidiano_nazionale' },
    { name: 'Il Messaggero',             domain: 'ilmessaggero.it',          url: 'https://www.ilmessaggero.it',          rss: 'https://www.ilmessaggero.it/rss/home.xml',                      category: 'quotidiano_nazionale' },
    { name: 'Il Mattino',                domain: 'ilmattino.it',             url: 'https://www.ilmattino.it',             rss: 'https://www.ilmattino.it/rss/home.xml',                         category: 'quotidiano_nazionale' },
    { name: 'Il Gazzettino',             domain: 'ilgazzettino.it',          url: 'https://www.ilgazzettino.it',          rss: 'https://www.ilgazzettino.it/rss/home.xml',                      category: 'quotidiano_nazionale' },
    { name: 'il Giornale',               domain: 'ilgiornale.it',            url: 'https://www.ilgiornale.it',            rss: 'https://www.ilgiornale.it/rss.xml',                             category: 'quotidiano_nazionale' },
    { name: "Il Giornale d'Italia",      domain: 'ilgiornaleditalia.it',     url: 'https://www.ilgiornaleditalia.it',     rss: 'https://www.ilgiornaleditalia.it/feed/',                        category: 'quotidiano_nazionale' },
    { name: 'Il Tempo',                  domain: 'iltempo.it',               url: 'https://www.iltempo.it',               rss: 'https://www.iltempo.it/rss/home.xml',                           category: 'quotidiano_nazionale' },
    { name: 'Libero',                    domain: 'liberoquotidiano.it',      url: 'https://www.liberoquotidiano.it',      rss: 'https://www.liberoquotidiano.it/rss.xml',                       category: 'quotidiano_nazionale' },
    { name: 'Leggo',                     domain: 'leggo.it',                 url: 'https://www.leggo.it',                 rss: 'https://www.leggo.it/rss/home.xml',                             category: 'quotidiano_nazionale' },
    { name: 'Quotidiano Nazionale',      domain: 'quotidiano.net',           url: 'https://www.quotidiano.net',           rss: 'https://www.quotidiano.net/rss',                                category: 'quotidiano_nazionale' },
    { name: 'Quotidiano del Sud',        domain: 'quotidianodelsud.it',      url: 'https://www.quotidianodelsud.it',      rss: 'https://www.quotidianodelsud.it/feed/',                         category: 'quotidiano_nazionale' },
    { name: "L'Identità",               domain: 'lidentita.it',             url: 'https://lidentita.it',                 rss: 'https://lidentita.it/feed/',                                    category: 'quotidiano_nazionale' },
    { name: 'La Discussione',            domain: 'ladiscussione.com',        url: 'https://www.ladiscussione.com',        rss: 'https://www.ladiscussione.com/feed/',                           category: 'quotidiano_nazionale' },
    { name: 'Dagospia',                  domain: 'dagospia.com',             url: 'https://www.dagospia.com',             rss: null,                                                            category: 'quotidiano_nazionale' },
    { name: 'La Ragione',                domain: 'laragione.eu',             url: 'https://www.laragione.eu',             rss: 'https://www.laragione.eu/feed/',                                category: 'quotidiano_nazionale' },
    { name: 'Repubblica Finanza',        domain: 'finanza.repubblica.it',    url: 'https://finanza.repubblica.it',        rss: null,                                                            category: 'quotidiano_nazionale' },
    { name: 'La Stampa Finanza',         domain: 'finanza.lastampa.it',      url: 'https://finanza.lastampa.it',          rss: null,                                                            category: 'quotidiano_nazionale' },
    { name: 'Il Secolo XIX Finanza',     domain: 'finanza.ilsecoloxix.it',   url: 'https://finanza.ilsecoloxix.it',       rss: null,                                                            category: 'quotidiano_nazionale' },
    { name: 'Borsa Italiana',            domain: 'borsaitaliana.it',         url: 'https://www.borsaitaliana.it',         rss: null,                                                            category: 'quotidiano_nazionale' },
    { name: 'Teleborsa',                 domain: 'teleborsa.it',             url: 'https://www.teleborsa.it',             rss: 'https://www.teleborsa.it/News/RSS.aspx',                        category: 'quotidiano_nazionale' },

    // ── TV / Radio ──────────────────────────────────────────────────────────
    { name: 'Rai News',                  domain: 'rainews.it',               url: 'https://www.rainews.it',               rss: 'https://www.rainews.it/rss/notizie.xml',                        category: 'tv_radio' },
    { name: 'TRM TV',                    domain: 'trmtv.it',                 url: 'https://www.trmtv.it',                 rss: 'https://www.trmtv.it/feed/',                                    category: 'tv_radio' },
    { name: 'CN24 TV',                   domain: 'cn24tv.it',                url: 'https://www.cn24tv.it',                rss: 'https://www.cn24tv.it/feed/',                                   category: 'tv_radio' },
    { name: 'Antenna Sud',               domain: 'antennasud.com',           url: 'https://www.antennasud.com',           rss: 'https://www.antennasud.com/feed/',                              category: 'tv_radio' },
    { name: 'Radio Lombardia',           domain: 'radiolombardia.it',        url: 'https://www.radiolombardia.it',        rss: null,                                                            category: 'tv_radio' },
    { name: 'Rete 55',                   domain: 'rete55.it',                url: 'https://www.rete55.it',                rss: null,                                                            category: 'tv_radio' },
    { name: 'Reggio TV',                 domain: 'reggiotv.it',              url: 'https://www.reggiotv.it',              rss: 'https://www.reggiotv.it/feed/',                                 category: 'tv_radio' },
    { name: 'Canale Dieci',              domain: 'canaledieci.it',           url: 'https://www.canaledieci.it',           rss: null,                                                            category: 'tv_radio' },

    // ── Web & Digital ───────────────────────────────────────────────────────
    { name: 'Affaritaliani',             domain: 'affaritaliani.it',         url: 'https://www.affaritaliani.it',         rss: 'https://www.affaritaliani.it/rss.xml',                          category: 'web_digital' },
    { name: 'Fanpage',                   domain: 'fanpage.it',               url: 'https://www.fanpage.it',               rss: 'https://www.fanpage.it/feed/',                                  category: 'web_digital' },
    { name: 'Formiche',                  domain: 'formiche.net',             url: 'https://formiche.net',                 rss: 'https://formiche.net/feed/',                                    category: 'web_digital' },
    { name: 'Basilicata24',              domain: 'basilicata24.it',          url: 'https://www.basilicata24.it',          rss: 'https://www.basilicata24.it/feed/',                             category: 'web_digital' },
    { name: 'Key4Biz',                   domain: 'key4biz.it',               url: 'https://www.key4biz.it',               rss: 'https://www.key4biz.it/feed/',                                  category: 'web_digital' },
    { name: 'Economy Magazine',          domain: 'economymagazine.it',       url: 'https://www.economymagazine.it',       rss: 'https://www.economymagazine.it/feed/',                          category: 'web_digital' },
    { name: 'Startup Business',          domain: 'startupbusiness.it',       url: 'https://www.startupbusiness.it',       rss: 'https://www.startupbusiness.it/feed/',                          category: 'web_digital' },
    { name: 'Il Denaro',                 domain: 'ildenaro.it',              url: 'https://www.ildenaro.it',              rss: 'https://www.ildenaro.it/feed/',                                 category: 'web_digital' },
    { name: 'Notizie.it',                domain: 'notizie.it',               url: 'https://www.notizie.it',               rss: null,                                                            category: 'web_digital' },
    { name: 'Le Dìcola',                 domain: 'ledicola.it',              url: 'https://www.ledicola.it',              rss: 'https://www.ledicola.it/feed/',                                 category: 'web_digital' },
    { name: 'Distretto Economico',       domain: 'distrettoeconomico.com',   url: 'https://www.distrettoeconomico.com',   rss: 'https://www.distrettoeconomico.com/feed/',                      category: 'web_digital' },
    { name: 'FS News',                   domain: 'fsnews.it',                url: 'https://www.fsnews.it',                rss: 'https://www.fsnews.it/feed/',                                   category: 'web_digital' },
    { name: 'Meridiana Notizie',         domain: 'meridiananotizie.it',      url: 'https://www.meridiananotizie.it',      rss: 'https://www.meridiananotizie.it/feed/',                         category: 'web_digital' },

    // ── Quotidiani Locali ───────────────────────────────────────────────────
    // Basilicata
    { name: 'Le Cronache Lucane',        domain: 'lecronachelucane.it',      url: 'https://www.lecronachelucane.it',      rss: 'https://www.lecronachelucane.it/feed/',                         category: 'quotidiano_locale' },
    { name: 'Accade Ora',                domain: 'accadeora.it',             url: 'https://www.accadeora.it',             rss: 'https://www.accadeora.it/feed/',                                category: 'quotidiano_locale' },
    { name: 'Potenza News',              domain: 'potenzanews.net',          url: 'https://www.potenzanews.net',          rss: 'https://www.potenzanews.net/feed/',                             category: 'quotidiano_locale' },
    { name: 'Giornale di Basilicata',    domain: 'giornaledibasilicata.com', url: 'https://www.giornaledibasilicata.com', rss: 'https://www.giornaledibasilicata.com/feed/',                    category: 'quotidiano_locale' },
    { name: 'Sassi Live',                domain: 'sassilive.it',             url: 'https://www.sassilive.it',             rss: 'https://www.sassilive.it/feed/',                                category: 'quotidiano_locale' },
    // Calabria
    { name: 'Cronache della Calabria',   domain: 'cronachedellacalabria.it', url: 'https://www.cronachedellacalabria.it', rss: 'https://www.cronachedellacalabria.it/feed/',                   category: 'quotidiano_locale' },
    { name: 'Corriere della Calabria',   domain: 'corrieredellacalabria.it', url: 'https://corrieredellacalabria.it',    rss: 'https://corrieredellacalabria.it/feed/',                        category: 'quotidiano_locale' },
    { name: 'Stretto Web',               domain: 'strettoweb.com',           url: 'https://www.strettoweb.com',           rss: 'https://www.strettoweb.com/feed/',                              category: 'quotidiano_locale' },
    { name: 'City Now',                  domain: 'citynow.it',               url: 'https://www.citynow.it',               rss: 'https://www.citynow.it/feed/',                                  category: 'quotidiano_locale' },
    { name: 'Qui Cosenza',               domain: 'quicosenza.it',            url: 'https://www.quicosenza.it',            rss: 'https://www.quicosenza.it/feed/',                               category: 'quotidiano_locale' },
    // Sicilia
    { name: 'QDS',                       domain: 'qds.it',                   url: 'https://www.qds.it',                   rss: 'https://www.qds.it/feed/',                                      category: 'quotidiano_locale' },
    { name: 'Il Fatto Nisseno',          domain: 'ilfattonisseno.it',        url: 'https://www.ilfattonisseno.it',        rss: 'https://www.ilfattonisseno.it/feed/',                           category: 'quotidiano_locale' },
    { name: 'Blog Sicilia',              domain: 'blogsicilia.it',           url: 'https://www.blogsicilia.it',           rss: 'https://www.blogsicilia.it/feed/',                              category: 'quotidiano_locale' },
    { name: 'Corriere di Palermo',       domain: 'corrieredipalermo.it',     url: 'https://www.corrieredipalermo.it',     rss: 'https://www.corrieredipalermo.it/feed/',                        category: 'quotidiano_locale' },
    { name: 'Live Sicilia',              domain: 'livesicilia.it',           url: 'https://livesicilia.it',               rss: 'https://livesicilia.it/feed/',                                  category: 'quotidiano_locale' },
    // Campania
    { name: 'Campania Press',            domain: 'campaniapress.it',         url: 'https://www.campaniapress.it',         rss: 'https://www.campaniapress.it/feed/',                            category: 'quotidiano_locale' },
    { name: 'Corriere Flegreo',          domain: 'corriereflegreo.it',       url: 'https://www.corriereflegreo.it',       rss: 'https://www.corriereflegreo.it/feed/',                          category: 'quotidiano_locale' },
    // Puglia
    { name: 'Cronache di Bari',          domain: 'cronachedibari.com',       url: 'https://www.cronachedibari.com',       rss: 'https://www.cronachedibari.com/feed/',                          category: 'quotidiano_locale' },
    { name: 'Quotidiano di Puglia',      domain: 'quotidianodipuglia.it',    url: 'https://www.quotidianodipuglia.it',    rss: null,                                                            category: 'quotidiano_locale' },
    { name: 'Puglia Live',               domain: 'puglialive.net',           url: 'https://www.puglialive.net',           rss: 'https://www.puglialive.net/home/feed.rss',                      category: 'quotidiano_locale' },
    // Liguria
    { name: 'Savona News',               domain: 'savonanews.it',            url: 'https://www.savonanews.it',            rss: 'https://www.savonanews.it/rss.xml',                             category: 'quotidiano_locale' },
    { name: 'San Remo News',             domain: 'sanremonews.it',           url: 'https://www.sanremonews.it',           rss: 'https://www.sanremonews.it/rss.xml',                            category: 'quotidiano_locale' },
    { name: 'Gazzetta di Genova',        domain: 'gazzettadigenova.it',      url: 'https://www.gazzettadigenova.it',      rss: 'https://www.gazzettadigenova.it/feed/',                         category: 'quotidiano_locale' },
    // Piemonte
    { name: 'Torino Oggi',               domain: 'torinoggi.it',             url: 'https://www.torinoggi.it',             rss: 'https://www.torinoggi.it/rss.xml',                              category: 'quotidiano_locale' },
    { name: 'Targato CN',                domain: 'targatocn.it',             url: 'https://www.targatocn.it',             rss: 'https://www.targatocn.it/rss.xml',                              category: 'quotidiano_locale' },
    // Sardegna
    { name: 'Unione Sarda',              domain: 'unionesarda.it',           url: 'https://www.unionesarda.it',           rss: 'https://www.unionesarda.it/rss',                                category: 'quotidiano_locale' },
    { name: 'Corriere della Sardegna',   domain: 'corrieredellasardegna.it', url: 'https://www.corrieredellasardegna.it', rss: 'https://www.corrieredellasardegna.it/feed/',                    category: 'quotidiano_locale' },
    // Marche/Abruzzo
    { name: 'Corriere Adriatico',        domain: 'corriereadriatico.it',     url: 'https://www.corriereadriatico.it',     rss: 'https://www.corriereadriatico.it/rss.xml',                      category: 'quotidiano_locale' },
    // Centro Italia
    { name: 'Il Tirreno',                domain: 'iltirreno.it',             url: 'https://www.iltirreno.it',             rss: 'https://www.iltirreno.it/rss.xml',                              category: 'quotidiano_locale' },
    { name: "Corriere dell'Umbria",      domain: 'corrieredellumbria.it',    url: 'https://www.corrieredellumbria.it',    rss: 'https://www.corrieredellumbria.it/feed/',                       category: 'quotidiano_locale' },
    // Emilia-Romagna
    { name: 'Corriere di Bologna',       domain: 'ilcorrieredibologna.it',   url: 'https://www.ilcorrieredibologna.it',   rss: null,                                                            category: 'quotidiano_locale' },
    { name: 'Gazzetta di Modena',        domain: 'gazzettadimodena.it',      url: 'https://www.gazzettadimodena.it',      rss: 'https://www.gazzettadimodena.it/rss.xml',                       category: 'quotidiano_locale' },
];

/**
 * Restituisce le fonti filtrate per categoria.
 */
function getSourcesByCategory(categories) {
    if (!categories || categories.length === 0) return PRIORITY_SOURCES;
    return PRIORITY_SOURCES.filter(s => categories.includes(s.category));
}

/**
 * Restituisce i domini di tutte le fonti prioritarie.
 */
function getAllDomains() {
    return PRIORITY_SOURCES.map(s => s.domain);
}

/**
 * Restituisce tutti i feed RSS disponibili (per ricerca diretta sui siti).
 */
function getAllRssFeeds() {
    return PRIORITY_SOURCES.filter(s => s.rss).map(s => ({ name: s.name, domain: s.domain, rss: s.rss, category: s.category }));
}

/**
 * Costruisce una stringa di query Google News con site: operator
 * per cercare solo nelle fonti prioritarie.
 * Priorità: agenzie > nazionali > TV > digital > locali
 */
function buildSiteQuery(maxSites = 25) {
    const ordered = [
        ...PRIORITY_SOURCES.filter(s => s.category === 'agenzia_stampa'),
        ...PRIORITY_SOURCES.filter(s => s.category === 'quotidiano_nazionale'),
        ...PRIORITY_SOURCES.filter(s => s.category === 'tv_radio'),
        ...PRIORITY_SOURCES.filter(s => s.category === 'web_digital'),
        ...PRIORITY_SOURCES.filter(s => s.category === 'quotidiano_locale'),
    ];
    const sites = ordered.slice(0, maxSites).map(s => `site:${s.domain}`);
    return sites.join(' OR ');
}

module.exports = { PRIORITY_SOURCES, getSourcesByCategory, getAllDomains, getAllRssFeeds, buildSiteQuery };
