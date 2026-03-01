import { Bot, Context } from 'grammy';
import { config, isAdmin } from './config';
import { getDb } from './database';
import { SpamConfig } from './database/models';
import {
    checkRateLimit,
    handleNewMember,
    checkCaptchaAnswer,
    hasPendingCaptcha,
    checkLinks,
    checkBlacklistedWords,
    checkDuplicate,
} from './modules/antispam';
import { checkTriggers } from './modules/triggers';
import { initScheduler } from './modules/scheduler';
import { registerGeneralCommands } from './commands/general';
import { registerAdminCommands } from './commands/admin';

export function createBot(): Bot<Context> {
    const bot = new Bot<Context>(config.botToken);

    // DEBUG LOGGER: Log ALL updates
    bot.use(async (ctx, next) => {
        try {
            const fs = require('fs');
            const logPath = require('path').join(__dirname, '..', 'debug_all_updates.log');
            const updateType = Object.keys(ctx.update).filter(k => k !== 'update_id')[0];
            const logMsg = `[${new Date().toISOString()}] Update received: ID=${ctx.update.update_id}, Type=${updateType}\n`;
            fs.appendFileSync(logPath, logMsg);
            fs.appendFileSync(logPath, `FULL CONTENT: ${JSON.stringify(ctx.update)}\n`);

            if (updateType === 'channel_post') {
                fs.appendFileSync(logPath, `Channel Post Content: ${JSON.stringify(ctx.channelPost)}\n`);
            }
        } catch (e) {
            console.error('Debug log error:', e);
        }
        await next();
    });

    // ═══════════════════════════════════════════
    // Error handling
    // ═══════════════════════════════════════════
    bot.catch((err) => {
        console.error('❌ Bot hatası:', err);
    });

    // ═══════════════════════════════════════════
    // Yeni üye katılımı → CAPTCHA
    // ═══════════════════════════════════════════
    bot.on('message:new_chat_members', async (ctx) => {
        const chatConfig = getSpamConfig(String(ctx.chat.id));
        if (chatConfig?.captcha_enabled !== 0) {
            await handleNewMember(ctx);
        }
    });

    // ═══════════════════════════════════════════
    // Komutları kaydet
    // ═══════════════════════════════════════════
    registerGeneralCommands(bot);
    registerAdminCommands(bot);

    // ═══════════════════════════════════════════
    // Anti-spam middleware (text mesajları için)
    // ═══════════════════════════════════════════
    bot.on('message', async (ctx, next) => {
        // Özel mesajlarda spam kontrolü yapma
        if (ctx.chat.type === 'private') {
            await next();
            return;
        }

        const chatId = String(ctx.chat.id);
        const userId = ctx.from?.id;

        if (!userId) {
            await next();
            return;
        }

        // Bekleyen CAPTCHA cevabı mı kontrol et
        if (!isAdmin(userId) && hasPendingCaptcha(ctx.chat.id, userId)) {
            const handled = await checkCaptchaAnswer(ctx);
            if (handled) return;
        }

        // Trigger komutları (ör: !site) - HERKESİN kullanabilmesi için anti-spam'den önce
        const triggered = await checkTriggers(ctx);
        if (triggered) return;

        // Admin'ler spam kontrolünden muaf
        if (isAdmin(userId)) {
            await next();
            return;
        }

        const chatConfig = getSpamConfig(chatId);

        // 1. Rate limiting
        if (chatConfig?.rate_limit_enabled !== 0) {
            const blocked = await checkRateLimit(ctx);
            if (blocked) return;
        }

        // 2. Link filtreleme
        if (chatConfig?.link_filter_enabled !== 0) {
            const blocked = await checkLinks(ctx);
            if (blocked) return;
        }

        // 3. Kelime filtreleme
        if (chatConfig?.word_filter_enabled !== 0) {
            const blocked = await checkBlacklistedWords(ctx);
            if (blocked) return;
        }

        // 4. Tekrarlayan mesaj tespiti
        if (chatConfig?.duplicate_filter_enabled !== 0) {
            const blocked = await checkDuplicate(ctx);
            if (blocked) return;
        }

        await next();
    });

    // ═══════════════════════════════════════════
    // Kanal gönderilerini kaydet
    // ═══════════════════════════════════════════
    bot.on('channel_post', (ctx) => {
        try {
            const msg = ctx.channelPost;
            const db = getDb();

            // Dashboard @username ile sorguladığı için, varsa username'i kaydet
            const dbChatId = msg.chat.username ? `@${msg.chat.username}` : String(msg.chat.id);

            db.prepare(`
            INSERT OR REPLACE INTO channel_posts (message_id, chat_id, text, has_photo, has_video, has_document, caption, date, raw_json)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
                msg.message_id,
                dbChatId,
                msg.text || null,
                msg.photo ? 1 : 0,
                msg.video ? 1 : 0,
                msg.document ? 1 : 0,
                msg.caption || null,
                msg.date,
                JSON.stringify(msg),
            );
            // ═══════════════════════════════════════════
            // OTOMATİK İLETİM (AUTO-FORWARD)
            // ═══════════════════════════════════════════
            try {
                const fs = require('fs');
                const logPath = require('path').join(__dirname, '..', 'debug_auto_forward.log');

                const sourceId = String(msg.chat.id);
                const sourceUsername = msg.chat.username ? `@${msg.chat.username}` : null;

                fs.appendFileSync(logPath, `[${new Date().toISOString()}] Msg ${msg.message_id} from ID: ${sourceId}, Username: ${sourceUsername}\n`);

                let targets: { target_chat_id: string }[] = [];

                if (sourceUsername) {
                    targets = db.prepare('SELECT target_chat_id FROM auto_forward_config WHERE source_chat_id = ? OR source_chat_id = ?').all(sourceId, sourceUsername) as { target_chat_id: string }[];
                } else {
                    targets = db.prepare('SELECT target_chat_id FROM auto_forward_config WHERE source_chat_id = ?').all(sourceId) as { target_chat_id: string }[];
                }

                fs.appendFileSync(logPath, `[${new Date().toISOString()}] Targets found: ${JSON.stringify(targets)}\n`);

                if (targets.length > 0) {
                    console.log(`[AutoForward] Yeni mesaj (${msg.message_id}) ${targets.length} gruba iletiliyor...`);
                    targets.forEach(async (t) => {
                        try {
                            await ctx.api.forwardMessage(t.target_chat_id, ctx.chat.id, msg.message_id);
                            console.log(`[AutoForward] ✅ -> ${t.target_chat_id}`);
                            fs.appendFileSync(logPath, `[${new Date().toISOString()}] Forwarded to ${t.target_chat_id}\n`);
                        } catch (fwErr: any) {
                            console.error(`[AutoForward] ❌ -> ${t.target_chat_id} başarısız:`, fwErr);
                            fs.appendFileSync(logPath, `[${new Date().toISOString()}] Error forwarding to ${t.target_chat_id}: ${fwErr.message}\n`);
                        }
                    });
                }
            } catch (afErr: any) {
                console.error('[AutoForward] Config okuma hatası:', afErr);
                const fs = require('fs');
                const logPath = require('path').join(__dirname, '..', 'debug_auto_forward.log');
                fs.appendFileSync(logPath, `[${new Date().toISOString()}] Critical Error: ${afErr.message}\n`);
            }

        } catch (err) {
            console.error('Kanal gönderisi kaydedilemedi:', err);
        }
    });

    // ═══════════════════════════════════════════
    // Bilinen grupları kaydet
    // ═══════════════════════════════════════════
    bot.on('message', (ctx, next) => {
        try {
            if (ctx.chat.type === 'group' || ctx.chat.type === 'supergroup') {
                const db = getDb();
                db.prepare(`
                    INSERT OR REPLACE INTO known_groups (chat_id, title, type, updated_at)
                    VALUES (?, ?, ?, datetime('now'))
                `).run(String(ctx.chat.id), ctx.chat.title || 'Grup', ctx.chat.type);
            }
        } catch { }
        return next();
    });

    // ═══════════════════════════════════════════
    // Scheduler'ı başlat
    // ═══════════════════════════════════════════
    initScheduler(bot);

    return bot;
}

function getSpamConfig(chatId: string): SpamConfig | null {
    try {
        const db = getDb();
        const row = db.prepare('SELECT * FROM spam_config WHERE chat_id = ?').get(chatId) as SpamConfig | undefined;
        return row || null;
    } catch {
        return null;
    }
}
