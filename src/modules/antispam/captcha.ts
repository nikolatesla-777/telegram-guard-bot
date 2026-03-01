import { Context } from 'grammy';
import { config } from '../../config';

interface CaptchaChallenge {
    userId: number;
    chatId: number;
    answer: number;
    messageId: number;
    timeout: ReturnType<typeof setTimeout>;
}

const pendingCaptchas = new Map<string, CaptchaChallenge>();

function generateMathQuestion(): { question: string; answer: number } {
    const a = Math.floor(Math.random() * 20) + 1;
    const b = Math.floor(Math.random() * 20) + 1;
    const ops = ['+', '-', '×'] as const;
    const op = ops[Math.floor(Math.random() * ops.length)];

    let answer: number;
    switch (op) {
        case '+':
            answer = a + b;
            break;
        case '-':
            answer = a - b;
            break;
        case '×':
            answer = a * b;
            break;
    }

    return { question: `${a} ${op} ${b} = ?`, answer };
}

export async function handleNewMember(ctx: Context): Promise<void> {
    const newMembers = ctx.message?.new_chat_members;
    if (!newMembers || newMembers.length === 0) return;

    for (const member of newMembers) {
        if (member.is_bot) continue;

        const chatId = ctx.chat!.id;
        const userId = member.id;
        const key = `${chatId}:${userId}`;

        // Mevcut CAPTCHA varsa temizle
        if (pendingCaptchas.has(key)) {
            const existing = pendingCaptchas.get(key)!;
            clearTimeout(existing.timeout);
            pendingCaptchas.delete(key);
        }

        // Kullanıcıyı kısıtla (mesaj gönderemez)
        try {
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
            });
        } catch (err) {
            console.error('Kullanıcı kısıtlanırken hata:', err);
            continue;
        }

        const { question, answer } = generateMathQuestion();

        const displayName = member.username
            ? `@${member.username}`
            : member.first_name;

        const msg = await ctx.reply(
            `🔐 Hoş geldin ${displayName}!\n\n` +
            `Bot olmadığını doğrulamak için şu soruyu cevapla:\n\n` +
            `**${question}**\n\n` +
            `⏱ ${config.captchaTimeout} saniye süren var. Cevabı mesaj olarak yaz.`,
            { parse_mode: 'Markdown' },
        );

        // Timeout: süresi dolunca kick
        const timeout = setTimeout(async () => {
            try {
                const challenge = pendingCaptchas.get(key);
                if (challenge) {
                    await ctx.api.banChatMember(chatId, userId);
                    // Hemen unban yap ki tekrar katılabilsin
                    await ctx.api.unbanChatMember(chatId, userId);
                    await ctx.api.deleteMessage(chatId, challenge.messageId);
                    await ctx.api.sendMessage(
                        chatId,
                        `❌ ${displayName} doğrulamayı tamamlayamadı ve gruptan çıkarıldı.`,
                    );
                    pendingCaptchas.delete(key);
                }
            } catch (err) {
                console.error('CAPTCHA timeout işlemi sırasında hata:', err);
            }
        }, config.captchaTimeout * 1000);

        pendingCaptchas.set(key, {
            userId,
            chatId,
            answer,
            messageId: msg.message_id,
            timeout,
        });
    }
}

export async function checkCaptchaAnswer(ctx: Context): Promise<boolean> {
    const userId = ctx.from?.id;
    const chatId = ctx.chat?.id;
    if (!userId || !chatId) return false;

    const key = `${chatId}:${userId}`;
    const challenge = pendingCaptchas.get(key);
    if (!challenge) return false;

    const text = ctx.message?.text?.trim();
    if (!text) return true; // Bekleyen CAPTCHA var ama mesaj yok, engelle

    const userAnswer = parseInt(text, 10);

    if (userAnswer === challenge.answer) {
        // Doğru cevap - kısıtlamaları kaldır
        clearTimeout(challenge.timeout);
        pendingCaptchas.delete(key);

        try {
            await ctx.restrictChatMember(userId, {
                can_send_messages: true,
                can_send_audios: true,
                can_send_documents: true,
                can_send_photos: true,
                can_send_videos: true,
                can_send_video_notes: true,
                can_send_voice_notes: true,
                can_send_polls: true,
                can_send_other_messages: true,
                can_add_web_page_previews: true,
            });
            await ctx.api.deleteMessage(chatId, challenge.messageId);
            await ctx.deleteMessage(); // Cevap mesajını sil
            await ctx.reply(`✅ ${ctx.from?.first_name} doğrulandı! Gruba hoş geldin. 🎉`);
        } catch (err) {
            console.error('CAPTCHA doğrulama sonrası hata:', err);
        }
        return true;
    } else {
        // Yanlış cevap
        try {
            await ctx.deleteMessage();
            await ctx.reply(`❌ Yanlış cevap. Tekrar dene!`);
        } catch (err) {
            console.error('Yanlış CAPTCHA cevabı işlenirken hata:', err);
        }
        return true;
    }
}

export function hasPendingCaptcha(chatId: number, userId: number): boolean {
    return pendingCaptchas.has(`${chatId}:${userId}`);
}
