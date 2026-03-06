import cron, { ScheduledTask } from 'node-cron';
import { Bot, Context, InputFile } from 'grammy';
import { InlineKeyboard } from 'grammy';
import { listPosts } from './postStore';
import { ScheduledPost } from '../../database/models';
import { getDb } from '../../database';

const activeTasks = new Map<number, ScheduledTask>();
const forwardTasks: ScheduledTask[] = [];

// Inline keyboard oluştur
function buildInlineKeyboard(buttonsJson: string | null): InlineKeyboard | undefined {
    if (!buttonsJson) return undefined;
    try {
        const buttons: { text: string; url: string }[] = JSON.parse(buttonsJson);
        if (!buttons || buttons.length === 0) return undefined;
        const keyboard = new InlineKeyboard();
        for (const btn of buttons) {
            if (btn.text && btn.url) {
                keyboard.url(btn.text, btn.url).row();
            }
        }
        return keyboard;
    } catch {
        return undefined;
    }
}

export function initScheduler(bot: Bot<Context>): void {
    const posts = listPosts();

    console.log(`📅 ${posts.length} zamanlanmış gönderi yükleniyor...`);

    for (const post of posts) {
        schedulePost(bot, post);
    }

    initForwardScheduler(bot);

    console.log(`✅ Tüm zamanlanmış gönderiler aktif.`);
}

function initForwardScheduler(bot: Bot<Context>): void {
    try {
        const db = getDb();
        const forwards = db.prepare('SELECT * FROM scheduled_forwards WHERE is_active = 1').all() as {
            id: number; source_chat_id: string; message_id: number; target_chat_id: string; cron_expression: string;
        }[];

        for (const fw of forwards) {
            if (!cron.validate(fw.cron_expression)) continue;
            const task = cron.schedule(fw.cron_expression, async () => {
                try {
                    await bot.api.forwardMessage(fw.target_chat_id, fw.source_chat_id, fw.message_id);
                    console.log(`📤 [ForwardSchedule #${fw.id}] ✅ ${fw.source_chat_id}/${fw.message_id} → ${fw.target_chat_id}`);
                } catch (err: any) {
                    console.error(`📤 [ForwardSchedule #${fw.id}] ❌ Hata:`, err.message);
                }
            }, { timezone: 'Europe/Istanbul' });
            forwardTasks.push(task);
        }

        console.log(`📅 ${forwards.length} zamanlanmış iletim yüklendi.`);
    } catch (err) {
        console.error('ForwardScheduler başlatma hatası:', err);
    }
}

export function schedulePost(bot: Bot<Context>, post: ScheduledPost): boolean {
    // Geçerli cron expression mı kontrol et
    if (!cron.validate(post.cron_expression)) {
        console.error(`❌ Geçersiz cron ifadesi (post #${post.id}): ${post.cron_expression}`);
        return false;
    }

    // Önceki task varsa durdur
    if (activeTasks.has(post.id)) {
        activeTasks.get(post.id)!.stop();
        activeTasks.delete(post.id);
    }

    const task = cron.schedule(post.cron_expression, async () => {
        try {
            console.log(`📤 Zamanlanmış gönderi #${post.id} gönderiliyor...`);

            const keyboard = buildInlineKeyboard(post.buttons_json);

            if (post.media_file_id) {
                // File ID ile gönder (daha hızlı ve verimli)
                try {
                    await bot.api.sendPhoto(post.chat_id, post.media_file_id, {
                        caption: post.content || '',
                        parse_mode: 'Markdown',
                        reply_markup: keyboard,
                    });
                } catch (imgErr) {
                    // Hata olursa ve image_path varsa fallback yapabiliriz ama genelde gerekmez
                    console.error('File ID send error:', imgErr);
                }
            } else if (post.image_path) {
                // Görsel dosya yolundan gönder
                const inputFile = new InputFile(post.image_path);
                try {
                    await bot.api.sendPhoto(post.chat_id, inputFile, {
                        caption: post.content || '',
                        parse_mode: 'Markdown',
                        reply_markup: keyboard,
                    });
                } catch {
                    // Markdown hatası ise düz metin dene
                    await bot.api.sendPhoto(post.chat_id, new InputFile(post.image_path), {
                        caption: post.content || '',
                        reply_markup: keyboard,
                    });
                }
            } else {
                // Sadece metin gönder
                try {
                    await bot.api.sendMessage(post.chat_id, post.content, {
                        parse_mode: 'Markdown',
                        reply_markup: keyboard,
                    });
                } catch {
                    await bot.api.sendMessage(post.chat_id, post.content, {
                        reply_markup: keyboard,
                    });
                }
            }

            console.log(`✅ Gönderi #${post.id} başarıyla gönderildi.`);
        } catch (err) {
            console.error(`❌ Gönderi #${post.id} gönderilemedi:`, err);
        }
    }, {
        timezone: 'Europe/Istanbul',
    });

    activeTasks.set(post.id, task);
    return true;
}

export function unschedulePost(postId: number): void {
    const task = activeTasks.get(postId);
    if (task) {
        task.stop();
        activeTasks.delete(postId);
        console.log(`🗑️ Gönderi #${postId} zamanlaması kaldırıldı.`);
    }
}

export function getActiveTaskCount(): number {
    return activeTasks.size;
}
