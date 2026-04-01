import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.resolve(__dirname, '../data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = path.resolve(dataDir, 'jjbot.db');
const db = new Database(dbPath);

// Enable WAL mode for better concurrency
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

function init() {
  // Novels table
  db.exec(`
    CREATE TABLE IF NOT EXISTS novels (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      author TEXT,
      author_id TEXT,
      summary TEXT,
      status TEXT,
      word_count INTEGER,
      chapter_count INTEGER,
      click_count INTEGER,
      collection_count INTEGER,
      score REAL,
      update_time TEXT,
      cover_url TEXT,
      created_at INTEGER,
      updated_at INTEGER,
      last_synced_at INTEGER,
      is_deleted INTEGER DEFAULT 0
    );
  `);

  // Tags dictionary
  db.exec(`
    CREATE TABLE IF NOT EXISTS tags (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL
    );
  `);

  // Novel-Tag many-to-many
  db.exec(`
    CREATE TABLE IF NOT EXISTS novel_tags (
      novel_id TEXT,
      tag_id INTEGER,
      PRIMARY KEY (novel_id, tag_id),
      FOREIGN KEY (novel_id) REFERENCES novels(id) ON DELETE CASCADE,
      FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
    );
  `);

  // Indexes for tag queries
  db.exec(`CREATE INDEX IF NOT EXISTS idx_novel_tags_novel ON novel_tags(novel_id);`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_novel_tags_tag ON novel_tags(tag_id);`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_novels_author ON novels(author);`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_novels_updated ON novels(updated_at);`);

  // Reading history
  db.exec(`
    CREATE TABLE IF NOT EXISTS reading_history (
      novel_id TEXT PRIMARY KEY,
      last_chapter_id INTEGER,
      last_read_at INTEGER,
      total_read_seconds INTEGER DEFAULT 0
    );
  `);

  // Config
  db.exec(`
    CREATE TABLE IF NOT EXISTS config (
      key TEXT PRIMARY KEY,
      value TEXT
    );
  `);
}

init();

export default db;
