// Controllo desktop - confronto dei rilievi "prima" (ultimo commit) e "dopo" (file attuali).
// Uso: node tools/desktop-check/compare.js
// Esce con codice 1 se sul desktop qualcosa si è spostato, ridimensionato, è comparso o sparito.
const fs = require('fs');
const os = require('os');
const path = require('path');

const work = path.join(os.tmpdir(), 'rassegna-desktop-check');
const TOLERANCE = 1; // pixel
const MAX_EXAMPLES = 12;

const load = (label) => {
    const dir = path.join(work, label);
    if (!fs.existsSync(dir)) return {};
    const pages = {};
    for (const file of fs.readdirSync(dir).filter(f => f.endsWith('.json'))) {
        pages[file.replace('.json', '')] = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'));
    }
    return pages;
};

const before = load('prima');
const after = load('dopo');
const names = Array.from(new Set([...Object.keys(before), ...Object.keys(after)])).sort();

if (names.length === 0) {
    console.log(`Nessun rilievo trovato in ${work}: esegui prima serve.ps1 per "prima" e "dopo".`);
    process.exit(2);
}

let totalIssues = 0;
for (const name of names) {
    const a = before[name], b = after[name];
    if (!a || !b) {
        console.log(`\n[${name}] rilievo mancante per ${!a ? '"prima"' : '"dopo"'}`);
        totalIssues++;
        continue;
    }
    if (a.width !== b.width) console.log(`\n[${name}] ATTENZIONE: larghezza diversa (${a.width} vs ${b.width})`);

    for (const section of Object.keys({ ...a.sections, ...b.sections })) {
        const sa = a.sections[section] || {}, sb = b.sections[section] || {};
        const moved = [], gone = [], added = [];
        for (const key of Object.keys(sa)) {
            if (!sb[key]) { gone.push(sa[key].d); continue; }
            const [x1, y1, w1, h1] = sa[key].r, [x2, y2, w2, h2] = sb[key].r;
            if (Math.abs(x1 - x2) > TOLERANCE || Math.abs(y1 - y2) > TOLERANCE || Math.abs(w1 - w2) > TOLERANCE || Math.abs(h1 - h2) > TOLERANCE) {
                moved.push(`${sb[key].d}  [${x1},${y1} ${w1}x${h1}] -> [${x2},${y2} ${w2}x${h2}]`);
            }
        }
        for (const key of Object.keys(sb)) if (!sa[key]) added.push(sb[key].d);

        const issues = moved.length + gone.length + added.length;
        if (!issues) continue;
        totalIssues += issues;
        console.log(`\n[${name}${section !== 'main' ? ' > ' + section : ''}] ${moved.length} spostati/ridimensionati, ${gone.length} spariti, ${added.length} nuovi`);
        moved.slice(0, MAX_EXAMPLES).forEach(s => console.log('  spostato  ' + s));
        gone.slice(0, MAX_EXAMPLES).forEach(s => console.log('  sparito   ' + s));
        added.slice(0, MAX_EXAMPLES).forEach(s => console.log('  nuovo     ' + s));
    }
}

console.log(totalIssues === 0
    ? `\nOK: versione desktop identica in tutte le ${names.length} pagine controllate.`
    : `\nDIFFERENZE sul desktop: ${totalIssues} elementi. Controlla prima di pubblicare.`);
process.exit(totalIssues === 0 ? 0 : 1);
