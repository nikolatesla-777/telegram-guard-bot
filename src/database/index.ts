import Database from 'better-sqlite3';
import path from 'path';

const DB_PATH = path.join(__dirname, '..', '..', 'guard-bot.db');

let db: Database.Database;

export function getDb(): Database.Database {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    initTables();
  }
  return db;
}

function initTables(): void {
  const database = db;

  // Zamanlanmış gönderiler
  database.exec(`
    CREATE TABLE IF NOT EXISTS scheduled_posts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      chat_id TEXT NOT NULL,
      content TEXT NOT NULL,
      cron_expression TEXT NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 1,
      image_path TEXT DEFAULT NULL,
      media_file_id TEXT DEFAULT NULL,
      buttons_json TEXT DEFAULT NULL,
      created_by INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  // Migration: Add image_path and buttons_json if missing
  try {
    database.exec(`ALTER TABLE scheduled_posts ADD COLUMN image_path TEXT DEFAULT NULL`);
  } catch { }
  try {
    database.exec(`ALTER TABLE scheduled_posts ADD COLUMN buttons_json TEXT DEFAULT NULL`);
  } catch { }
  try {
    database.exec(`ALTER TABLE scheduled_posts ADD COLUMN media_file_id TEXT DEFAULT NULL`);
  } catch { }

  // Kanal gönderileri (kaydedilen mesajlar)
  database.exec(`
    CREATE TABLE IF NOT EXISTS channel_posts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      message_id INTEGER NOT NULL,
      chat_id TEXT NOT NULL,
      text TEXT,
      has_photo INTEGER NOT NULL DEFAULT 0,
      has_video INTEGER NOT NULL DEFAULT 0,
      has_document INTEGER NOT NULL DEFAULT 0,
      caption TEXT,
      date INTEGER NOT NULL,
      raw_json TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(chat_id, message_id)
    )
  `);

  // Bilinen gruplar
  database.exec(`
    CREATE TABLE IF NOT EXISTS known_groups (
      chat_id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'group',
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  // Kullanıcı uyarıları
  database.exec(`
    CREATE TABLE IF NOT EXISTS user_warnings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      chat_id TEXT NOT NULL,
      reason TEXT NOT NULL,
      warned_by INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  // Spam konfigürasyonu (grup bazlı)
  database.exec(`
    CREATE TABLE IF NOT EXISTS spam_config (
      chat_id TEXT PRIMARY KEY,
      rate_limit_enabled INTEGER NOT NULL DEFAULT 1,
      captcha_enabled INTEGER NOT NULL DEFAULT 1,
      link_filter_enabled INTEGER NOT NULL DEFAULT 1,
      word_filter_enabled INTEGER NOT NULL DEFAULT 1,
      duplicate_filter_enabled INTEGER NOT NULL DEFAULT 1,
      whitelisted_domains TEXT NOT NULL DEFAULT '',
      blacklisted_words TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  // Özel tetikleyiciler (trigger'lar)
  database.exec(`
    CREATE TABLE IF NOT EXISTS triggers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      chat_id TEXT NOT NULL,
      trigger_word TEXT NOT NULL,
      response TEXT NOT NULL,
      created_by INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(chat_id, trigger_word)
    )
  `);

  // Otomatik iletim konfigürasyonu
  database.exec(`
    CREATE TABLE IF NOT EXISTS auto_forward_config (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source_chat_id TEXT NOT NULL,
      target_chat_id TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(source_chat_id, target_chat_id)
    )
  `);

  console.log('✅ Veritabanı tabloları hazır.');
}

export function closeDb(): void {
  if (db) {
    db.close();
    console.log('🔒 Veritabanı bağlantısı kapatıldı.');
  }
}
