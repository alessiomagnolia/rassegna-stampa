const stopWords = new Set([
    'il','lo','la','i','gli','le','un','uno','una','di','da','in','con',
    'su','per','tra','fra','che','non','più','del','dell','della','dello',
    'dei','degli','delle','al','alla','allo','ai','agli','alle','nel',
    'nella','nello','nei','negli','nelle','sul','sulla','sullo','sui',
    'sugli','sulle','come','sono','era','hanno','anche','dopo','prima',
]);

function buildKeywordRegex(title, clientName) {
    const allWords = [title, clientName]
        .filter(Boolean)
        .join(' ')
        .split(/[\s\-–—_\/]+/)
        .map(w => w.replace(/[^a-zA-ZàèéìòùÀÈÉÌÒÙ]/g, '').toLowerCase())
        .filter(w => w.length >= 4 && !stopWords.has(w));

    const unique = [...new Set(allWords)];
    if (unique.length === 0) return null;

    unique.sort((a, b) => b.length - a.length);

    const pattern = unique.map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
    return new RegExp(`(?<![a-zA-ZàèéìòùÀÈÉÌÒÙ])(${pattern})(?![a-zA-ZàèéìòùÀÈÉÌÒÙ])`, 'gi');
}

function boldKeywords(text, regex) {
    if (!regex || !text) return text;
    return text.replace(regex, '<strong style="color:#1a1a2e;font-weight:700;">$1</strong>');
}

const title = "Rassegna Stampa Aeroitalia";
const text = "Oggi Aeroitalia ha annunciato i nuovi voli. AEROITALIA vince il bando. Un aereo di aeroitalia.";
const regex = buildKeywordRegex(title, "Aeroitalia S.p.A.");
console.log(regex);
console.log(boldKeywords(text, regex));
