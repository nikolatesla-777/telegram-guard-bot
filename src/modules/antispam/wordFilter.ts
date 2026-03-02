import { Context } from 'grammy';
import { isAdmin } from '../../config';
import { getDb } from '../../database';
import { SpamConfig } from '../../database/models';

// Varsayılan kara liste
export const defaults = [
    'yatırım fırsatı', 'kripto fırsat', 'whatsapp grubu',
    'bcgame', 'bc.game', 'bc slots',
    'promocode', 'code', 'dm', 'özelden'
];

function getBlacklistedWords(chatId: string): string[] {
    const db = getDb();
    const row = db.prepare('SELECT blacklisted_words FROM spam_config WHERE chat_id = ?').get(chatId) as SpamConfig | undefined;

    // Eğer veritabanında kayıt yoksa varsayılanları döndür
    if (!row) return defaults;

    // Kayıt varsa (boş string olsa bile) veritabanındakini kullan
    // Kullanıcı listeyi temizlemiş olabilir, bu durumda varsayılanları tekrar eklememeliyiz.
    if (!row.blacklisted_words || row.blacklisted_words.trim() === '') return [];

    return row.blacklisted_words.split(',').map((w) => w.trim().toLowerCase()).filter(Boolean);
}

function normalize(text: string): string {
    // Sadece harf ve rakamları bırak, diğer her şeyi (boşluk, emoji, sembol) sil
    return text.toLowerCase().replace(/[^a-z0-9]/g, '');
}

export async function checkBlacklistedWords(ctx: Context): Promise<boolean> {
    const userId = ctx.from?.id;
    const chatId = ctx.chat?.id;
    if (!userId || !chatId) return false;
    if (isAdmin(userId)) return false;

    const rawText = (ctx.message?.text || ctx.message?.caption || '').toLowerCase();
    if (!rawText) return false;

    const blacklist = getBlacklistedWords(String(chatId));
    const normalizedText = normalize(rawText);

    // 1. Normal metin kontrolü (ör: "canlı bahis" gibi boşluklu kelimeler için)
    let foundWord = blacklist.find((word) => rawText.includes(word));

    // 2. Normalize edilmiş metin kontrolü (ör: "B C G A M E" -> "bcgame" yakalamak için)
    if (!foundWord) {
        // Blacklist'teki kelimeleri de normalize edip kontrol et
        foundWord = blacklist.find((word) => {
            const normalizedWord = normalize(word);
            return normalizedWord.length > 3 && normalizedText.includes(normalizedWord); // Çok kısa kelimeleri (ör: "ve") yanlışlamamak için min uzunluk
        });
    }

    if (foundWord) {
        try {
            await ctx.deleteMessage();
            console.log(`[WordFilter] Kullanıcı ${userId} yasaklı kelime kullandı: "${foundWord}"`);
        } catch (err) {
            console.error('Kelime filtreleme sırasında hata:', err);
        }
        return true;
    }

    return false;
}
