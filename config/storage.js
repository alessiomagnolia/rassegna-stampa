const path = require('path');
const fs = require('fs');

/**
 * Risolve la directory radice di memorizzazione dati:
 * 1. process.env.DATA_DIR se valorizzata manualmente
 * 2. /var/data se presente (mount path standard Render per Persistent Disk)
 * 3. Fallback sulla cartella del progetto corrente (sviluppo locale)
 */
function getBaseDataDir() {
    if (process.env.DATA_DIR && process.env.DATA_DIR.trim() !== '') {
        return path.resolve(process.env.DATA_DIR);
    }
    try {
        if (fs.existsSync('/var/data')) {
            return '/var/data';
        }
    } catch (e) {
        // Fallback locale
    }
    return path.join(__dirname, '..');
}

const DATA_DIR = getBaseDataDir();
const isPersistent = DATA_DIR !== path.join(__dirname, '..');

// Risoluzione DB_PATH
let DB_PATH = process.env.DB_PATH;
if (!DB_PATH) {
    if (isPersistent) {
        const rootDb = path.join(DATA_DIR, 'rassegna.db');
        const subDb = path.join(DATA_DIR, 'database', 'rassegna.db');
        if (fs.existsSync(rootDb)) {
            DB_PATH = rootDb;
        } else {
            DB_PATH = subDb;
        }
    } else {
        DB_PATH = path.join(__dirname, '..', 'database', 'rassegna.db');
    }
}
const DB_DIR = path.dirname(DB_PATH);

// Risoluzione UPLOADS_DIR & OUTPUT_DIR
const UPLOADS_DIR = process.env.UPLOADS_DIR || (isPersistent ? path.join(DATA_DIR, 'uploads') : path.join(__dirname, '..', 'uploads'));
const OUTPUT_DIR = process.env.OUTPUT_DIR || (isPersistent ? path.join(DATA_DIR, 'output') : path.join(__dirname, '..', 'output'));

/**
 * Risolve un percorso relativo caricato (es. "/uploads/1/logo.png" o "uploads/1/logo.png")
 * cercando prima nella cartella attiva (UPLOADS_DIR) e poi eventualmente nella root legacy.
 */
function resolveUploadPath(storedPath) {
    if (!storedPath) return null;
    const cleanRel = storedPath.replace(/^[/\\]+/, '').replace(/^uploads[/\\]?/, '');
    const activePath = path.join(UPLOADS_DIR, cleanRel);
    if (fs.existsSync(activePath)) return activePath;

    // Fallback retrocompatibilità: verifica cartella locale di progetto
    const legacyPath = path.join(__dirname, '..', 'uploads', cleanRel);
    if (fs.existsSync(legacyPath)) return legacyPath;

    return activePath;
}

// Assicura l'esistenza preventiva delle cartelle necessarie
[DB_DIR, UPLOADS_DIR, OUTPUT_DIR].forEach(dir => {
    try {
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
    } catch (err) {
        console.error(`[STORAGE] Errore creazione cartella ${dir}:`, err.message);
    }
});

console.log(`[STORAGE] Configurazione Storage:`);
console.log(`  > Modalità Persistente: ${isPersistent ? 'ATTIVA (' + DATA_DIR + ')' : 'NO (Sviluppo Locale)'}`);
console.log(`  > Database SQLite:     ${DB_PATH}`);
console.log(`  > Cartella Uploads:     ${UPLOADS_DIR}`);
console.log(`  > Cartella Output PDF:  ${OUTPUT_DIR}`);

module.exports = {
    DATA_DIR,
    isPersistent,
    DB_DIR,
    DB_PATH,
    UPLOADS_DIR,
    OUTPUT_DIR,
    resolveUploadPath
};
