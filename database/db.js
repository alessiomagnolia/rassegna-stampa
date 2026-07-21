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
