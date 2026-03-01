import { Context, Bot } from 'grammy';
import { getDb } from '../database';

interface TriggerRow {
    id: number;
    chat_id: string;
    trigger_word: string;
    response: string;
    created_by: number;
    created_at: string;
}

/**
 * Mesajda trigger (tetikleyici) olup olmadığını kontrol eder.
 * Örn: kullanıcı "!site" yazarsa, veritabanında kayıtlı cevabı gönderir.
 */
export async function checkTriggers(ctx: Context): Promise<boolean> {
    const text = ctx.message?.text?.trim();
    const chatId = ctx.chat?.id;
    if (!text || !chatId) return false;

    // Sadece ! ile başlayan mesajları kontrol et
    if (!text.startsWith('!')) return false;

    const triggerWord = text.toLowerCase().split(/\s+/)[0]; // "!site" gibi ilk kelimeyi al

    const db = getDb();
    const row = db.prepare(
        'SELECT * FROM triggers WHERE chat_id = ? AND trigger_word = ?'
    ).get(String(chatId), triggerWord) as TriggerRow | undefined;

    if (!row) return false;

    try {
        await ctx.reply(row.response, {
            parse_mode: 'Markdown',
            reply_parameters: { message_id: ctx.message!.message_id },
        });
    } catch (err) {
        // Markdown parse hatası olursa düz metin gönder
        try {
            await ctx.reply(row.response, {
                reply_parameters: { message_id: ctx.message!.message_id },
            });
        } catch (err2) {
            console.error('Trigger yanıtı gönderilemedi:', err2);
        }
    }

    return true;
}

// ═══════════════════════════════════════════
// Trigger CRUD işlemleri
// ═══════════════════════════════════════════

export function addTrigger(chatId: string, triggerWord: string, response: string, createdBy: number): TriggerRow | null {
    const db = getDb();
    try {
        db.prepare(`
      INSERT OR REPLACE INTO triggers (chat_id, trigger_word, response, created_by)
      VALUES (?, ?, ?, ?)
    `).run(chatId, triggerWord.toLowerCase(), response, createdBy);

        return db.prepare('SELECT * FROM triggers WHERE chat_id = ? AND trigger_word = ?')
            .get(chatId, triggerWord.toLowerCase()) as TriggerRow;
    } catch (err) {
        console.error('Trigger eklenirken hata:', err);
        return null;
    }
}

export function listTriggers(chatId: string): TriggerRow[] {
    const db = getDb();
    return db.prepare('SELECT * FROM triggers WHERE chat_id = ? ORDER BY trigger_word')
        .all(chatId) as TriggerRow[];
}

export function removeTrigger(chatId: string, triggerWord: string): boolean {
    const db = getDb();
    const result = db.prepare('DELETE FROM triggers WHERE chat_id = ? AND trigger_word = ?')
        .run(chatId, triggerWord.toLowerCase());
    return result.changes > 0;
}
