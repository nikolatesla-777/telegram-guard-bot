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

  // ═══════════════════════════════════════════
  // Tahmin Oyunu tabloları
  // ═══════════════════════════════════════════

  // Kullanıcı profilleri + puan tablosu
  database.exec(`
    CREATE TABLE IF NOT EXISTS prediction_users (
      user_id INTEGER PRIMARY KEY,
      username TEXT,
      first_name TEXT,
      total_points INTEGER NOT NULL DEFAULT 0,
      total_predictions INTEGER NOT NULL DEFAULT 0,
      correct_predictions INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  // Takip edilen maçlar (ESPN event ID + sonuç)
  database.exec(`
    CREATE TABLE IF NOT EXISTS prediction_matches (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      espn_event_id TEXT UNIQUE NOT NULL,
      espn_league_id TEXT NOT NULL,
      home_team TEXT NOT NULL,
      away_team TEXT NOT NULL,
      league TEXT NOT NULL,
      start_time INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'scheduled',
      home_score INTEGER DEFAULT NULL,
      away_score INTEGER DEFAULT NULL,
      result TEXT DEFAULT NULL,
      result_announced INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  // Gönderilen anketler (match_id + chat_id + poll_id)
  database.exec(`
    CREATE TABLE IF NOT EXISTS prediction_polls (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      match_id INTEGER NOT NULL,
      chat_id TEXT NOT NULL,
      poll_message_id INTEGER NOT NULL,
      telegram_poll_id TEXT NOT NULL,
      sent_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(match_id, chat_id)
    )
  `);

  // Oylar (user_id + match_id + vote + is_correct)
  database.exec(`
    CREATE TABLE IF NOT EXISTS prediction_votes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      match_id INTEGER NOT NULL,
      vote TEXT NOT NULL,
      is_correct INTEGER DEFAULT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(user_id, match_id)
    )
  `);

  // Skor tahmini oyları
  database.exec(`
    CREATE TABLE IF NOT EXISTS score_votes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      match_id INTEGER NOT NULL,
      home_guess INTEGER NOT NULL,
      away_guess INTEGER NOT NULL,
      is_correct INTEGER DEFAULT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(user_id, match_id)
    )
  `);

  // Skor duyuruları (tekrar gönderimini önler)
  database.exec(`
    CREATE TABLE IF NOT EXISTS score_announcements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      match_id INTEGER NOT NULL,
      chat_id TEXT NOT NULL,
      message_id INTEGER,
      sent_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(match_id, chat_id)
    )
  `);

  // Hitbet scraper
  database.exec(`
    CREATE TABLE IF NOT EXISTS hitbet_daily_count (
      date TEXT PRIMARY KEY,
      count INTEGER NOT NULL DEFAULT 0
    )
  `);
  database.exec(`
    CREATE TABLE IF NOT EXISTS hitbet_seen_posts (
      post_id TEXT PRIMARY KEY,
      seen_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  // Zamanlanmış iletimler
  database.exec(`
    CREATE TABLE IF NOT EXISTS scheduled_forwards (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source_chat_id TEXT NOT NULL,
      message_id INTEGER NOT NULL,
      target_chat_id TEXT NOT NULL,
      cron_expression TEXT NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
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
