/**
 * EXECUTIVE REPORT PDF TEMPLATE
 * Impaginazione A4 elegante e autorevole per Board, Presidenti e Direzioni Comunicazione.
 * Conforme a standard AMEC e benchmark Audiweb/ADS.
 */

function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function buildReportPDFHTML(reportData) {
    const {
        title = 'Report Media Relations & Press Office',
        clientName = 'Cliente',
        clientLogo = '',
        periodLabel = '',
        recipientSalutation = '',
        recipientTitle = '',
        eventsSupported = [],
        executiveNotes = '',
        senderSignature = '',
        summaryKPIs = {},
        launches = [],
        topMedia = [],
        shareUrl = ''
    } = reportData;

    const launchesCount = launches.length || summaryKPIs.total_launches || 0;
    const totalPickups = summaryKPIs.total_pickups || launches.reduce((acc, l) => acc + (l.pickups || 0), 0);
    const audienceOTS = summaryKPIs.formatted_audience_ots || summaryKPIs.formattedAudienceOTS || 'N/D';
    const estimatedReads = summaryKPIs.formatted_estimated_reads || summaryKPIs.formattedEstimatedReads || 'N/D';
    const sentiment = summaryKPIs.overall_sentiment || summaryKPIs.overallSentiment || 'Positivo / Costruttivo';

    // Logo cliente
    const logoHtml = clientLogo
        ? `<img src="${clientLogo}" alt="${escapeHtml(clientName)}" class="client-logo">`
        : `<div class="client-badge">${escapeHtml(clientName)}</div>`;

    // Eventi supportati
    let eventsHtml = '';
    if (eventsSupported && eventsSupported.length > 0) {
        eventsHtml = `
            <div class="section-card">
                <div class="section-title">Attivita ed Eventi Speciali Supportati</div>
                <ul class="events-list">
                    ${eventsSupported.map(ev => `<li><span class="bullet-dot">&bull;</span> <strong>${escapeHtml(ev)}</strong></li>`).join('')}
                </ul>
            </div>
        `;
    }

    // Top media cloud/list
    let topMediaHtml = '';
    if (topMedia && topMedia.length > 0) {
        topMediaHtml = `
            <div class="section-card">
                <div class="section-title">Testate Piu Significative Rilevate</div>
                <div class="media-tags-grid">
                    ${topMedia.map(m => `<span class="media-tag">${escapeHtml(m)}</span>`).join('')}
                </div>
            </div>
        `;
    }

    // Tabella lanci cronologica
    let launchesRowsHtml = '';
    const maxPickups = Math.max(...launches.map(l => l.pickups || 0), 1);
    launches.forEach((l, idx) => {
        const pct = Math.min(100, Math.round(((l.pickups || 0) / maxPickups) * 100));
        launchesRowsHtml += `
            <tr class="launch-row">
                <td class="col-num">${idx + 1}</td>
                <td class="col-date">${escapeHtml(l.date || '')}</td>
                <td class="col-title">
                    <strong>${escapeHtml(l.title)}</strong>
                    ${l.downloadUrl ? `<div class="launch-link">Rassegna allegata</div>` : ''}
                </td>
                <td class="col-pickups">
                    <div class="pickups-badge"><strong>${l.pickups || 0}</strong> uscite</div>
                    <div class="progress-bar-bg"><div class="progress-bar-fill" style="width:${pct}%;"></div></div>
                </td>
            </tr>
        `;
    });

    return `<!DOCTYPE html>
<html lang="it">
<head>
    <meta charset="UTF-8">
    <title>${escapeHtml(title)}</title>
    <style>
        @page {
            size: A4 portrait;
            margin: 14mm 14mm 16mm 14mm;
            @bottom-right {
                content: counter(page) " / " counter(pages);
                font-family: 'Inter', system-ui, sans-serif;
                font-size: 8pt;
                color: #888888;
            }
        }

        * {
            box-sizing: border-box;
            margin: 0;
            padding: 0;
        }

        body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            color: #1a1a24;
            background: #ffffff;
            font-size: 9.5pt;
            line-height: 1.45;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
        }

        /* HEADER & BRANDING */
        .report-header {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            padding-bottom: 12px;
            border-bottom: 2px solid #6366f1;
            margin-bottom: 14px;
        }

        .header-title-block h1 {
            font-size: 16pt;
            font-weight: 800;
            color: #0f172a;
            letter-spacing: -0.02em;
            text-transform: uppercase;
            margin-bottom: 4px;
        }

        .header-subtitle {
            font-size: 9pt;
            color: #64748b;
            font-weight: 500;
        }

        .client-logo-box {
            text-align: right;
            max-width: 180px;
        }

        .client-logo {
            max-height: 44px;
            max-width: 160px;
            object-fit: contain;
        }

        .client-badge {
            background: #f1f5f9;
            color: #0f172a;
            font-size: 10pt;
            font-weight: 700;
            padding: 6px 12px;
            border-radius: 6px;
            display: inline-block;
            border: 1px solid #cbd5e1;
        }

        /* SALUTATION BOX */
        .salutation-box {
            background: #f8fafc;
            border-left: 4px solid #6366f1;
            padding: 10px 14px;
            border-radius: 0 6px 6px 0;
            margin-bottom: 14px;
            font-size: 9pt;
            color: #334155;
        }

        .salutation-greeting {
            font-size: 11pt;
            font-weight: 700;
            color: #0f172a;
            margin-bottom: 4px;
        }

        /* KPI METRICS STRIP */
        .kpi-grid {
            display: grid;
            grid-template-columns: repeat(5, 1fr);
            gap: 8px;
            margin-bottom: 14px;
        }

        .kpi-card {
            background: #ffffff;
            border: 1px solid #e2e8f0;
            border-radius: 8px;
            padding: 10px 8px;
            text-align: center;
        }

        .kpi-val {
            font-size: 14pt;
            font-weight: 800;
            color: #0f172a;
            line-height: 1.1;
            margin-bottom: 3px;
        }

        .kpi-label {
            font-size: 7pt;
            font-weight: 700;
            text-transform: uppercase;
            color: #64748b;
            letter-spacing: 0.5px;
        }

        .kpi-sub {
            font-size: 6.5pt;
            color: #94a3b8;
            margin-top: 2px;
        }

        .kpi-card.highlight {
            background: #f5f3ff;
            border-color: #c4b5fd;
        }

        .kpi-card.highlight .kpi-val {
            color: #4f46e5;
        }

        /* SECTION CARDS */
        .section-card {
            background: #ffffff;
            border: 1px solid #e2e8f0;
            border-radius: 8px;
            padding: 10px 14px;
            margin-bottom: 12px;
        }

        .section-title {
            font-size: 9pt;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            color: #475569;
            margin-bottom: 8px;
            display: flex;
            align-items: center;
            gap: 6px;
        }

        .events-list {
            list-style: none;
        }

        .events-list li {
            font-size: 8.5pt;
            color: #1e293b;
            margin-bottom: 4px;
            display: flex;
            align-items: baseline;
            gap: 6px;
        }

        .bullet-dot {
            color: #6366f1;
            font-size: 12pt;
            line-height: 0;
        }

        .media-tags-grid {
            display: flex;
            flex-wrap: wrap;
            gap: 4px;
        }

        .media-tag {
            background: #f1f5f9;
            color: #334155;
            font-size: 7.5pt;
            font-weight: 600;
            padding: 2.5px 7px;
            border-radius: 4px;
            border: 1px solid #e2e8f0;
        }

        /* LAUNCHES TABLE */
        .launches-table-wrap {
            margin-bottom: 14px;
        }

        .table-title {
            font-size: 9.5pt;
            font-weight: 700;
            color: #0f172a;
            margin-bottom: 6px;
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }

        table.launches-table {
            width: 100%;
            border-collapse: collapse;
            font-size: 8.5pt;
        }

        table.launches-table th {
            background: #f8fafc;
            color: #475569;
            font-size: 7.5pt;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            text-align: left;
            padding: 6px 8px;
            border-bottom: 2px solid #cbd5e1;
        }

        table.launches-table td {
            padding: 7px 8px;
            border-bottom: 1px solid #e2e8f0;
            vertical-align: middle;
        }

        .col-num {
            width: 28px;
            color: #94a3b8;
            font-weight: 600;
            font-size: 8pt;
        }

        .col-date {
            width: 75px;
            font-weight: 600;
            color: #475569;
            white-space: nowrap;
        }

        .col-title strong {
            color: #0f172a;
            font-size: 8.5pt;
            display: block;
        }

        .launch-link {
            font-size: 7pt;
            color: #6366f1;
            margin-top: 1px;
        }

        .col-pickups {
            width: 100px;
            text-align: right;
        }

        .pickups-badge {
            font-size: 8pt;
            color: #0f172a;
            margin-bottom: 2px;
        }

        .pickups-badge strong {
            font-weight: 700;
            color: #4f46e5;
        }

        .progress-bar-bg {
            background: #e2e8f0;
            height: 3px;
            border-radius: 2px;
            width: 100%;
            overflow: hidden;
        }

        .progress-bar-fill {
            background: #6366f1;
            height: 100%;
            border-radius: 2px;
        }

        /* FOOTER / SIGNATURE */
        .report-footer {
            margin-top: 16px;
            padding-top: 10px;
            border-top: 1px solid #e2e8f0;
            display: flex;
            justify-content: space-between;
            align-items: flex-end;
            font-size: 8pt;
            color: #64748b;
        }

        .signature-block strong {
            color: #0f172a;
            display: block;
            margin-top: 3px;
        }

        .share-link-box {
            text-align: right;
        }

        .share-link-box a {
            color: #4f46e5;
            text-decoration: none;
            font-weight: 600;
        }

        .methodology-note {
            font-size: 7pt;
            color: #94a3b8;
            margin-top: 8px;
            line-height: 1.3;
        }
    </style>
</head>
<body>

    <!-- HEADER -->
    <div class="report-header">
        <div class="header-title-block">
            <h1>${escapeHtml(title)}</h1>
            <div class="header-subtitle">
                Periodo: <strong>${escapeHtml(periodLabel)}</strong> &bull; Analisi quantitativa e qualitativa copertura media
            </div>
        </div>
        <div class="client-logo-box">
            ${logoHtml}
        </div>
    </div>

    <!-- SALUTO / DESTINATARIO -->
    ${recipientSalutation ? `
    <div class="salutation-box">
        <div class="salutation-greeting">${escapeHtml(recipientSalutation)}</div>
        ${recipientTitle ? `<div style="font-weight:600; color:#475569; margin-bottom:4px;">${escapeHtml(recipientTitle)}</div>` : ''}
        <div>
            Con la presente Vi trasmettiamo il resoconto analitico delle attivita di Media Relations e Ufficio Stampa relative al periodo <strong>${escapeHtml(periodLabel)}</strong>, con <strong>${launchesCount} lanci</strong> di comunicati stampa e dichiarazioni per un totale di <strong>${totalPickups} pubblicazioni</strong> rilevate.
        </div>
    </div>
    ` : ''}

    <!-- KPI STRIP -->
    <div class="kpi-grid">
        <div class="kpi-card highlight">
            <div class="kpi-val">${launchesCount}</div>
            <div class="kpi-label">Lanci Effettuati</div>
            <div class="kpi-sub">Comunicati &amp; statement</div>
        </div>
        <div class="kpi-card highlight">
            <div class="kpi-val">${totalPickups}</div>
            <div class="kpi-label">Pubblicazioni Totali</div>
            <div class="kpi-sub">Articoli e uscite media</div>
        </div>
        <div class="kpi-card">
            <div class="kpi-val">${audienceOTS}</div>
            <div class="kpi-label">Audience Netta (OTS)</div>
            <div class="kpi-sub">Fonti deduplicate Audiweb/ADS</div>
        </div>
        <div class="kpi-card">
            <div class="kpi-val">${estimatedReads}</div>
            <div class="kpi-label">Letture Stimate</div>
            <div class="kpi-sub">Benchmark assorbimento AMEC</div>
        </div>
        <div class="kpi-card">
            <div class="kpi-val" style="font-size:11pt; padding-top:4px;">${escapeHtml(sentiment)}</div>
            <div class="kpi-label">Sentiment Rilevato</div>
            <div class="kpi-sub">Analisi del tono editoriale</div>
        </div>
    </div>

    <!-- ATTIVITA ED EVENTI SPECIALI -->
    ${eventsHtml}

    <!-- TESTATE PIU SIGNIFICATIVE -->
    ${topMediaHtml}

    <!-- TABELLA LANCI CRONOLOGICA -->
    <div class="launches-table-wrap">
        <div class="table-title">Dettaglio Cronologico dei Lanci (${launchesCount} Lanci per ${totalPickups} Uscite)</div>
        <table class="launches-table">
            <thead>
                <tr>
                    <th class="col-num">#</th>
                    <th class="col-date">Data</th>
                    <th class="col-title">Comunicato Stampa / Evento</th>
                    <th class="col-pickups">Copertura</th>
                </tr>
            </thead>
            <tbody>
                ${launchesRowsHtml}
            </tbody>
        </table>
    </div>

    <!-- NOTE ESECUTIVE SE PRESENTI -->
    ${executiveNotes ? `
    <div class="section-card" style="margin-top:10px;">
        <div class="section-title">Note Strategiche &amp; Prossimi Passi</div>
        <p style="font-size:8.5pt; color:#334155; white-space:pre-line;">${escapeHtml(executiveNotes)}</p>
    </div>
    ` : ''}

    <!-- FOOTER E FIRMA -->
    <div class="report-footer">
        <div class="signature-block">
            Restiamo a disposizione per qualsiasi approfondimento.
            ${senderSignature ? `<strong>${escapeHtml(senderSignature)}</strong>` : ''}
        </div>
        ${shareUrl ? `
        <div class="share-link-box">
            <div>Archivio Rassegne Online Permanente:</div>
            <a href="${shareUrl}">${shareUrl}</a>
        </div>
        ` : ''}
    </div>

    <div class="methodology-note">
        Metodologia PR: Benchmark conformi agli standard AMEC e alle linee guida Audiweb/ADS per la reach deduplicata e le visualizzazioni stimate.
    </div>

</body>
</html>`;
}

module.exports = {
    buildReportPDFHTML
};
