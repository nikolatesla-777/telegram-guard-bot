import { getDb } from '../src/database';

async function main() {
    console.log('Veritabanı düzeltiliyor...');
    const db = getDb();

    try {
        db.exec(`
            CREATE TABLE IF NOT EXISTS auto_forward_config (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              source_chat_id TEXT NOT NULL,
              target_chat_id TEXT NOT NULL,
              created_by INTEGER NOT NULL DEFAULT 0,
              created_at TEXT NOT NULL DEFAULT (datetime('now')),
              UNIQUE(source_chat_id, target_chat_id)
            )
        `);
        console.log('✅ auto_forward_config tablosu oluşturuldu (veya zaten vardı).');

        // Doğrulama
        const result = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='auto_forward_config'").get();
        if (result) {
            console.log('✅ Tablo varlığı doğrulandı.');
        } else {
            console.error('❌ Tablo hala yok!');
        }

    } catch (e) {
        console.error('Hata:', e);
    }
}

main();
