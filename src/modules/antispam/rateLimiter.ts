import { Context } from 'grammy';
import { config, isAdmin } from '../../config';

interface MessageRecord {
    timestamps: number[];
}

const userMessages = new Map<string, MessageRecord>();

// Periyodik temizleme (5 dakikada bir eski kayıtları sil)
setInterval(() => {
    const now = Date.now();
    const windowMs = config.rateLimitWindow * 1000;
    for (const [key, record] of userMessages) {
        record.timestamps = record.timestamps.filter((t) => now - t < windowMs);
        if (record.timestamps.length === 0) {
            userMessages.delete(key);
        }
    }
}, 5 * 60 * 1000);

export async function checkRateLimit(ctx: Context): Promise<boolean> {
    const userId = ctx.from?.id;
    const chatId = ctx.chat?.id;
    if (!userId || !chatId) return false;
    if (isAdmin(userId)) return false;

    const key = `${chatId}:${userId}`;
    const now = Date.now();
    const windowMs = config.rateLimitWindow * 1000;

    if (!userMessages.has(key)) {
        userMessages.set(key, { timestamps: [now] });
        return false;
    }

    const record = userMessages.get(key)!;
    // Pencere dışındaki kayıtları temizle
    record.timestamps = record.timestamps.filter((t) => now - t < windowMs);
    record.timestamps.push(now);

    if (record.timestamps.length > config.rateLimitMax) {
        try {
            // Kullanıcıyı 5 dakika sustur
            await ctx.restrictChatMember(userId, {
                can_send_messages: false,
                can_send_audios: false,
                can_send_documents: false,
                can_send_photos: false,
                can_send_videos: false,
                can_send_video_notes: false,
                can_send_voice_notes: false,
                can_send_polls: false,
                can_send_other_messages: false,
                can_add_web_page_previews: false,
            }, {
                until_date: Math.floor(Date.now() / 1000) + 300,
            });
            await ctx.deleteMessage();
            // Sayacı sıfırla
            record.timestamps = [];
        } catch (err) {
            console.error('Rate limit uygulanırken hata:', err);
        }
        return true;
    }

    return false;
}
