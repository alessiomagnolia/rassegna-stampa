const path = require('path');
const Database = require('better-sqlite3');

let db;

function initDatabase() {
    const dbPath = path.join(__dirname, 'rassegna.db');
    db = new Database(dbPath);
    
    // Use Write-Ahead Logging for better performance and concurrency
    db.pragma('journal_mode = WAL');

    // Create users table
    db.prepare(`
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            email TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            company_name TEXT DEFAULT '',
            logo_path TEXT DEFAULT '',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `).run();

    // Create press_reviews table (history)
    db.prepare(`
        CREATE TABLE IF NOT EXISTS press_reviews (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            title TEXT DEFAULT 'Rassegna Stampa',
            pdf_filename TEXT NOT NULL,
            article_count INTEGER DEFAULT 0,
            articles_json TEXT DEFAULT NULL,
            client_name TEXT DEFAULT '',
            client_logo TEXT DEFAULT '',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id)
        )
    `).run();

    // Safe migrations for existing databases (SQLite doesn't support IF NOT EXISTS on ALTER)
    const existingCols = db.prepare("PRAGMA table_info(press_reviews)").all().map(c => c.name);
    if (!existingCols.includes('articles_json')) db.prepare('ALTER TABLE press_reviews ADD COLUMN articles_json TEXT DEFAULT NULL').run();
    if (!existingCols.includes('client_name'))   db.prepare("ALTER TABLE press_reviews ADD COLUMN client_name TEXT DEFAULT ''").run();
    if (!existingCols.includes('client_logo'))   db.prepare("ALTER TABLE press_reviews ADD COLUMN client_logo TEXT DEFAULT ''").run();
    if (!existingCols.includes('share_token'))   db.prepare("ALTER TABLE press_reviews ADD COLUMN share_token TEXT DEFAULT NULL").run();

    // Create articles table (if we want to cache/store them later)
    db.prepare(`
        CREATE TABLE IF NOT EXISTS articles (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            review_id INTEGER NOT NULL,
            url TEXT NOT NULL,
            title TEXT,
            author TEXT,
            published_date TEXT,
            source_name TEXT,
            excerpt TEXT,
            FOREIGN KEY (review_id) REFERENCES press_reviews(id) ON DELETE CASCADE
        )
    `).run();

    // Create link_collections table (saved news search results / draft rassegne)
    db.prepare(`
        CREATE TABLE IF NOT EXISTS link_collections (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            name TEXT NOT NULL,
            keyword TEXT DEFAULT '',
            links_json TEXT NOT NULL DEFAULT '[]',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id)
        )
    `).run();

    // Create press_releases table for AI generation and Tone of Voice memory
    db.prepare(`
        CREATE TABLE IF NOT EXISTS press_releases (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            client_name TEXT NOT NULL,
            title TEXT NOT NULL,
            content TEXT NOT NULL,
            is_reference INTEGER DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id)
        )
    `).run();

    // Create clients table for Client Workspace Context & Memory
    db.prepare(`
        CREATE TABLE IF NOT EXISTS clients (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            name TEXT NOT NULL,
            logo_base64 TEXT DEFAULT '',
            keywords TEXT DEFAULT '',
            tone_of_voice TEXT DEFAULT '',
            notes TEXT DEFAULT '',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id)
        )
    `).run();

    // Create indexed_articles table for continuous background crawling & instant 5ms search
    db.prepare(`
        CREATE TABLE IF NOT EXISTS indexed_articles (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            url TEXT UNIQUE NOT NULL,
            title TEXT NOT NULL,
            snippet TEXT DEFAULT '',
            source_name TEXT NOT NULL,
            domain TEXT NOT NULL,
            category TEXT DEFAULT 'web_digital',
            published_at TEXT DEFAULT '',
            timestamp INTEGER DEFAULT 0,
            favicon TEXT DEFAULT '',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `).run();

    db.prepare(`CREATE INDEX IF NOT EXISTS idx_indexed_articles_timestamp ON indexed_articles(timestamp)`).run();
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_indexed_articles_domain ON indexed_articles(domain)`).run();

    // Create url_cache table for 0ms unrolling of Google/Bing News links
    db.prepare(`
        CREATE TABLE IF NOT EXISTS url_cache (
            short_url TEXT PRIMARY KEY,
            final_url TEXT NOT NULL,
            domain TEXT NOT NULL,
            source_name TEXT NOT NULL,
            favicon TEXT DEFAULT '',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `).run();

    // Create media_contacts table for PR & Media CRM
    db.prepare(`
        CREATE TABLE IF NOT EXISTS media_contacts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            team_id INTEGER DEFAULT NULL,
            client_id INTEGER DEFAULT NULL,
            name TEXT NOT NULL,
            outlet TEXT NOT NULL,
            role TEXT DEFAULT '',
            beat TEXT DEFAULT 'generale',
            email TEXT NOT NULL,
            phone TEXT DEFAULT '',
            notes TEXT DEFAULT '',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id),
            FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE SET NULL
        )
    `).run();
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_media_contacts_user ON media_contacts(user_id)`).run();
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_media_contacts_beat ON media_contacts(beat)`).run();

    // ── TEAM ACCOUNTS ──────────────────────────────────────────────────────────

    // Tabella teams: un team per ogni owner
    db.prepare(`
        CREATE TABLE IF NOT EXISTS teams (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            owner_user_id INTEGER NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (owner_user_id) REFERENCES users(id)
        )
    `).run();

    // Tabella team_members: chi fa parte di quale team
    db.prepare(`
        CREATE TABLE IF NOT EXISTS team_members (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            team_id INTEGER NOT NULL,
            user_id INTEGER NOT NULL,
            role TEXT DEFAULT 'member',
            joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(team_id, user_id),
            FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )
    `).run();

    // Tabella team_invites: inviti pendenti con token univoco
    db.prepare(`
        CREATE TABLE IF NOT EXISTS team_invites (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            team_id INTEGER NOT NULL,
            invited_email TEXT NOT NULL,
            token TEXT NOT NULL UNIQUE,
            invited_by INTEGER NOT NULL,
            expires_at DATETIME NOT NULL,
            accepted INTEGER DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE,
            FOREIGN KEY (invited_by) REFERENCES users(id)
        )
    `).run();

    // Migration: aggiunta team_id alle risorse condivise (ignorata se esiste già)
    const prCols  = db.prepare('PRAGMA table_info(press_reviews)').all().map(c => c.name);
    const clCols  = db.prepare('PRAGMA table_info(clients)').all().map(c => c.name);
    const prlCols = db.prepare('PRAGMA table_info(press_releases)').all().map(c => c.name);
    const mcCols  = db.prepare('PRAGMA table_info(media_contacts)').all().map(c => c.name);

    if (!prCols.includes('team_id'))  db.prepare('ALTER TABLE press_reviews  ADD COLUMN team_id INTEGER DEFAULT NULL').run();
    if (!clCols.includes('team_id'))  db.prepare('ALTER TABLE clients         ADD COLUMN team_id INTEGER DEFAULT NULL').run();
    if (!prlCols.includes('team_id')) db.prepare('ALTER TABLE press_releases  ADD COLUMN team_id INTEGER DEFAULT NULL').run();
    if (!mcCols.includes('team_id'))  db.prepare('ALTER TABLE media_contacts  ADD COLUMN team_id INTEGER DEFAULT NULL').run();
    if (!mcCols.includes('client_id')) db.prepare('ALTER TABLE media_contacts ADD COLUMN client_id INTEGER DEFAULT NULL').run();
    if (!mcCols.includes('role'))     db.prepare('ALTER TABLE media_contacts ADD COLUMN role TEXT DEFAULT ""').run();
    if (!mcCols.includes('beat'))     db.prepare('ALTER TABLE media_contacts ADD COLUMN beat TEXT DEFAULT "generale"').run();
    if (!mcCols.includes('phone'))    db.prepare('ALTER TABLE media_contacts ADD COLUMN phone TEXT DEFAULT ""').run();
    if (!mcCols.includes('notes'))    db.prepare('ALTER TABLE media_contacts ADD COLUMN notes TEXT DEFAULT ""').run();

    db.prepare(`CREATE INDEX IF NOT EXISTS idx_press_reviews_team   ON press_reviews(team_id)`).run();
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_clients_team         ON clients(team_id)`).run();
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_press_releases_team  ON press_releases(team_id)`).run();
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_media_contacts_team  ON media_contacts(team_id)`).run();
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_team_members_user    ON team_members(user_id)`).run();

    // ── COVERAGE REPORTS (REPORT PERIODICI ESECUTIVI) ──────────────────────────
    db.prepare(`
        CREATE TABLE IF NOT EXISTS coverage_reports (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            team_id INTEGER DEFAULT NULL,
            client_id INTEGER DEFAULT NULL,
            client_name TEXT NOT NULL,
            client_logo TEXT DEFAULT '',
            title TEXT NOT NULL,
            period_start TEXT NOT NULL,
            period_end TEXT NOT NULL,
            period_label TEXT NOT NULL,
            recipient_salutation TEXT DEFAULT '',
            recipient_title TEXT DEFAULT '',
            events_supported TEXT DEFAULT '[]',
            executive_notes TEXT DEFAULT '',
            sender_signature TEXT DEFAULT '',
            summary_kpis TEXT NOT NULL DEFAULT '{}',
            launches_json TEXT NOT NULL DEFAULT '[]',
            top_media_json TEXT NOT NULL DEFAULT '[]',
            share_token TEXT UNIQUE NOT NULL,
            pdf_filename TEXT DEFAULT '',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id),
            FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE SET NULL,
            FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE
        )
    `).run();

    db.prepare(`CREATE INDEX IF NOT EXISTS idx_coverage_reports_user ON coverage_reports(user_id)`).run();
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_coverage_reports_team ON coverage_reports(team_id)`).run();
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_coverage_reports_token ON coverage_reports(share_token)`).run();
    // ── FINE COVERAGE REPORTS ──────────────────────────────────────────────────

    console.log('✅ Database SQLite inizializzato.');
    return db;
}

function getDb() {
    if (!db) {
        return initDatabase();
    }
    return db;
}

module.exports = {
    initDatabase,
    getDb
};
