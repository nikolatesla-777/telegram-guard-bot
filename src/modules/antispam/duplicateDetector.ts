import { Context } from 'grammy';
import { config, isAdmin } from '../../config';
import crypto from 'crypto';

interface UserMessageHistory {
    hashes: string[];
    lastClean: number;
}

const messageHistory = new Map<string, UserMessageHistory>();

// Her 10 dakikada eski kayıtları temizle
setInterval(() => {
    const now = Date.now();
    for (const [key, history] of messageHistory) {
        if (now - history.lastClean > 10 * 60 * 1000) {
            messageHistory.delete(key);
        }
    }
}, 10 * 60 * 1000);

function hashMessage(text: string): string {
    return crypto.createHash('md5').update(text.trim().toLowerCase()).digest('hex');
}

export async function checkDuplicate(ctx: Context): Promise<boolean> {
    const userId = ctx.from?.id;
    const chatId = ctx.chat?.id;
    if (!userId || !chatId) return false;
    if (isAdmin(userId)) return false;

    const text = ctx.message?.text || ctx.message?.caption;
    if (!text || text.length < 10) return false; // Çok kısa mesajları atla

    const key = `${chatId}:${userId}`;
    const hash = hashMessage(text);
    const now = Date.now();

    if (!messageHistory.has(key)) {
        messageHistory.set(key, { hashes: [hash], lastClean: now });
        return false;
    }

    const history = messageHistory.get(key)!;
    history.hashes.push(hash);

    // Son 20 mesajı tut
    if (history.hashes.length > 20) {
        history.hashes = history.hashes.slice(-20);
    }

    // Aynı hash'ten kaç tane var?
    const duplicateCount = history.hashes.filter((h) => h === hash).length;

    if (duplicateCount >= config.duplicateThreshold) {
        try {
            await ctx.deleteMessage();
            // 2 dakika sustur
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
                until_date: Math.floor(Date.now() / 1000) + 120,
            });
            // Geçmişi temizle
            history.hashes = [];
        } catch (err) {
            console.error('Duplicate tespiti sırasında hata:', err);
        }
        return true;
    }

    return false;
}
