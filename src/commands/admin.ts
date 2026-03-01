import { Context, Bot } from 'grammy';
import { isAdmin } from '../config';
import {
    addPost,
    listPosts,
    removePost,
    schedulePost,
    unschedulePost,
    getActiveTaskCount,
} from '../modules/scheduler';
import { addTrigger, listTriggers, removeTrigger } from '../modules/triggers';
import { getDb } from '../database';
import { cronToHuman, formatDate } from '../utils/helpers';
import cron from 'node-cron';

function adminOnly(ctx: Context): boolean {
    const userId = ctx.from?.id;
    if (!userId || !isAdmin(userId)) {
        ctx.reply('🚫 Bu komut sadece adminler içindir.').catch(console.error);
        return false;
    }
    return true;
}

export function registerAdminCommands(bot: Bot<Context>): void {
    // ═══════════════════════════════════════════
    // /addpost <cron> <mesaj>
    // Örnek: /addpost 0 9 * * * Günaydın!
    // ═══════════════════════════════════════════
    bot.command('addpost', async (ctx) => {
        if (!adminOnly(ctx)) return;

        const chatId = ctx.chat?.id;
        if (!chatId) return;

        const text = ctx.match?.trim();
        if (!text) {
            await ctx.reply(
                '📝 *Kullanım:* /addpost `<cron_ifadesi> | <mesaj>`\n\n' +
                '*Örnek:*\n' +
                '`/addpost 0 9 * * * | Günaydın! Bugün harika bir gün. 🌞`\n\n' +
                '`|` karakteri cron ifadesini mesajdan ayırır.',
                { parse_mode: 'Markdown' },
            );
            return;
        }

        // Ayırıcı olarak | kullan
        const separatorIndex = text.indexOf('|');
        if (separatorIndex === -1) {
            await ctx.reply(
                '❌ Lütfen cron ifadesini ve mesajı `|` ile ayırın.\n\n' +
                '*Örnek:* `/addpost 0 9 * * * | Günaydın!`',
                { parse_mode: 'Markdown' },
            );
            return;
        }

        const cronExpression = text.substring(0, separatorIndex).trim();
        const messageContent = text.substring(separatorIndex + 1).trim();

        if (!messageContent) {
            await ctx.reply('❌ Mesaj içeriği boş olamaz.');
            return;
        }

        // Cron ifadesini doğrula
        if (!cron.validate(cronExpression)) {
            await ctx.reply(
                `❌ Geçersiz cron ifadesi: \`${cronExpression}\`\n\n` +
                '*Geçerli formatlar:*\n' +
                '• `0 9 * * *` → Her gün 09:00\n' +
                '• `*/30 * * * *` → Her 30 dakikada bir\n' +
                '• `0 9,18 * * 1-5` → Hafta içi 09:00 ve 18:00',
                { parse_mode: 'Markdown' },
            );
            return;
        }

        const post = addPost(String(chatId), messageContent, cronExpression, ctx.from!.id);
        const scheduled = schedulePost(bot, post);

        if (scheduled) {
            await ctx.reply(
                `✅ *Gönderi #${post.id} oluşturuldu!*\n\n` +
                `📅 Zamanlama: \`${cronExpression}\`\n` +
                `🕐 ${cronToHuman(cronExpression)}\n\n` +
                `📄 İçerik:\n${messageContent}`,
                { parse_mode: 'Markdown' },
            );
        } else {
            await ctx.reply('❌ Gönderi oluşturuldu ama zamanlama başarısız oldu. Cron ifadesini kontrol edin.');
        }
    });

    // ═══════════════════════════════════════════
    // /listposts - Aktif gönderileri listele
    // ═══════════════════════════════════════════
    bot.command('listposts', async (ctx) => {
        if (!adminOnly(ctx)) return;

        const chatId = ctx.chat?.id;
        if (!chatId) return;

        const posts = listPosts(String(chatId));

        if (posts.length === 0) {
            await ctx.reply('📭 Bu grupta zamanlanmış gönderi yok.');
            return;
        }

        let message = '📋 *Zamanlanmış Gönderiler*\n\n';
        for (const post of posts) {
            const preview = post.content.length > 50
                ? post.content.substring(0, 50) + '...'
                : post.content;
            message += `*#${post.id}* - \`${post.cron_expression}\`\n`;
            message += `🕐 ${cronToHuman(post.cron_expression)}\n`;
            message += `📄 ${preview}\n`;
            message += `📅 Oluşturulma: ${formatDate(post.created_at)}\n\n`;
        }

        await ctx.reply(message, { parse_mode: 'Markdown' });
    });

    // ═══════════════════════════════════════════
    // /removepost <id> - Gönderi sil
    // ═══════════════════════════════════════════
    bot.command('removepost', async (ctx) => {
        if (!adminOnly(ctx)) return;

        const idStr = ctx.match?.trim();
        if (!idStr) {
            await ctx.reply('📝 *Kullanım:* `/removepost <id>`\n\nÖrnek: `/removepost 3`', { parse_mode: 'Markdown' });
            return;
        }

        const id = parseInt(idStr, 10);
        if (isNaN(id)) {
            await ctx.reply('❌ Geçersiz gönderi ID\'si.');
            return;
        }

        const removed = removePost(id);
        if (removed) {
            unschedulePost(id);
            await ctx.reply(`✅ Gönderi #${id} silindi ve zamanlama kaldırıldı.`);
        } else {
            await ctx.reply(`❌ Gönderi #${id} bulunamadı veya zaten silinmiş.`);
        }
    });

    // ═══════════════════════════════════════════
    // /spamconfig - Spam filtre ayarları
    // ═══════════════════════════════════════════
    bot.command('spamconfig', async (ctx) => {
        if (!adminOnly(ctx)) return;

        const chatId = ctx.chat?.id;
        if (!chatId) return;

        const db = getDb();
        let configRow = db.prepare('SELECT * FROM spam_config WHERE chat_id = ?').get(String(chatId)) as any;

        if (!configRow) {
            db.prepare(`
        INSERT INTO spam_config (chat_id) VALUES (?)
      `).run(String(chatId));
            configRow = db.prepare('SELECT * FROM spam_config WHERE chat_id = ?').get(String(chatId));
        }

        const status = (val: number) => val ? '✅ Aktif' : '❌ Kapalı';

        await ctx.reply(
            '⚙️ *Spam Filtre Ayarları*\n\n' +
            `🔄 Rate Limiting: ${status(configRow.rate_limit_enabled)}\n` +
            `🔐 CAPTCHA: ${status(configRow.captcha_enabled)}\n` +
            `🔗 Link Filtresi: ${status(configRow.link_filter_enabled)}\n` +
            `📝 Kelime Filtresi: ${status(configRow.word_filter_enabled)}\n` +
            `🔁 Tekrar Tespiti: ${status(configRow.duplicate_filter_enabled)}\n\n` +
            `🌐 Whitelist Domains: ${configRow.whitelisted_domains || '(boş)'}\n` +
            `🚫 Kara Liste Kelimeler: ${configRow.blacklisted_words || '(varsayılan)'}\n\n` +
            '_Ayarları değiştirmek için:_\n' +
            '`/togglespam <özellik>` (rate\\_limit, captcha, link\\_filter, word\\_filter, duplicate)',
            { parse_mode: 'Markdown' },
        );
    });

    // ═══════════════════════════════════════════
    // /togglespam <feature> - Spam özelliğini aç/kapat
    // ═══════════════════════════════════════════
    bot.command('togglespam', async (ctx) => {
        if (!adminOnly(ctx)) return;

        const chatId = ctx.chat?.id;
        if (!chatId) return;

        const feature = ctx.match?.trim()?.toLowerCase();
        const validFeatures: Record<string, string> = {
            'rate_limit': 'rate_limit_enabled',
            'captcha': 'captcha_enabled',
            'link_filter': 'link_filter_enabled',
            'word_filter': 'word_filter_enabled',
            'duplicate': 'duplicate_filter_enabled',
        };

        if (!feature || !validFeatures[feature]) {
            await ctx.reply(
                '📝 *Kullanım:* `/togglespam <özellik>`\n\n' +
                'Geçerli özellikler: `rate_limit`, `captcha`, `link_filter`, `word_filter`, `duplicate`',
                { parse_mode: 'Markdown' },
            );
            return;
        }

        const column = validFeatures[feature];
        const db = getDb();

        // Önce config kaydı yoksa oluştur
        db.prepare('INSERT OR IGNORE INTO spam_config (chat_id) VALUES (?)').run(String(chatId));

        const current = db.prepare(`SELECT ${column} FROM spam_config WHERE chat_id = ?`).get(String(chatId)) as any;
        const newValue = current[column] ? 0 : 1;

        db.prepare(`UPDATE spam_config SET ${column} = ?, updated_at = datetime('now') WHERE chat_id = ?`).run(newValue, String(chatId));

        const statusText = newValue ? '✅ Aktif' : '❌ Kapalı';
        await ctx.reply(`⚙️ *${feature}* ayarı değiştirildi: ${statusText}`, { parse_mode: 'Markdown' });
    });

    // ═══════════════════════════════════════════
    // /warn - Kullanıcıya uyarı ver (reply ile)
    // ═══════════════════════════════════════════
    bot.command('warn', async (ctx) => {
        if (!adminOnly(ctx)) return;

        const replyMsg = ctx.message?.reply_to_message;
        if (!replyMsg || !replyMsg.from) {
            await ctx.reply('⚠️ Bu komutu bir mesaja yanıt olarak kullanın.');
            return;
        }

        const targetUser = replyMsg.from;
        if (targetUser.is_bot) {
            await ctx.reply('❌ Bot kullanıcılara uyarı verilemez.');
            return;
        }

        const chatId = ctx.chat!.id;
        const reason = ctx.match?.trim() || 'Kural ihlali';
        const db = getDb();

        db.prepare(`
      INSERT INTO user_warnings (user_id, chat_id, reason, warned_by)
      VALUES (?, ?, ?, ?)
    `).run(targetUser.id, String(chatId), reason, ctx.from!.id);

        // Toplam uyarı sayısı
        const { count } = db.prepare(
            'SELECT COUNT(*) as count FROM user_warnings WHERE user_id = ? AND chat_id = ?'
        ).get(targetUser.id, String(chatId)) as { count: number };

        const displayName = targetUser.username ? `@${targetUser.username}` : targetUser.first_name;

        if (count >= 3) {
            try {
                await ctx.banChatMember(targetUser.id);
                await ctx.reply(
                    `🔨 ${displayName} ${count} uyarıya ulaştı ve banlandı.\n` +
                    `Son sebep: ${reason}`,
                );
            } catch (err) {
                console.error('Ban uygulama hatası:', err);
            }
        } else {
            await ctx.reply(
                `⚠️ ${displayName} uyarıldı! (${count}/3)\n` +
                `Sebep: ${reason}\n\n` +
                `3 uyarıya ulaşırsa banlanacak.`,
            );
        }
    });

    // ═══════════════════════════════════════════
    // /ban - Kullanıcıyı banla (reply ile)
    // ═══════════════════════════════════════════
    bot.command('ban', async (ctx) => {
        if (!adminOnly(ctx)) return;

        const replyMsg = ctx.message?.reply_to_message;
        if (!replyMsg || !replyMsg.from) {
            await ctx.reply('⚠️ Bu komutu bir mesaja yanıt olarak kullanın.');
            return;
        }

        const targetUser = replyMsg.from;

        try {
            await ctx.banChatMember(targetUser.id);
            const displayName = targetUser.username ? `@${targetUser.username}` : targetUser.first_name;
            await ctx.reply(`🔨 ${displayName} banlandı.`);
        } catch (err) {
            await ctx.reply('❌ Kullanıcı banlanırken hata oluştu.');
            console.error('Ban hatası:', err);
        }
    });

    // ═══════════════════════════════════════════
    // /unban <user_id> - Banı kaldır
    // ═══════════════════════════════════════════
    bot.command('unban', async (ctx) => {
        if (!adminOnly(ctx)) return;

        const userIdStr = ctx.match?.trim();
        if (!userIdStr) {
            await ctx.reply('📝 *Kullanım:* `/unban <user_id>`', { parse_mode: 'Markdown' });
            return;
        }

        const targetId = parseInt(userIdStr, 10);
        if (isNaN(targetId)) {
            await ctx.reply('❌ Geçersiz kullanıcı ID\'si.');
            return;
        }

        try {
            await ctx.api.unbanChatMember(ctx.chat!.id, targetId);
            await ctx.reply(`✅ Kullanıcı ${targetId} banı kaldırıldı.`);
        } catch (err) {
            await ctx.reply('❌ Ban kaldırılırken hata oluştu.');
            console.error('Unban hatası:', err);
        }
    });

    // ═══════════════════════════════════════════
    // /stats - Bot istatistikleri
    // ═══════════════════════════════════════════
    bot.command('stats', async (ctx) => {
        if (!adminOnly(ctx)) return;

        const chatId = ctx.chat?.id;
        if (!chatId) return;

        const db = getDb();

        const postCount = (db.prepare(
            'SELECT COUNT(*) as count FROM scheduled_posts WHERE chat_id = ? AND is_active = 1'
        ).get(String(chatId)) as { count: number }).count;

        const warningCount = (db.prepare(
            'SELECT COUNT(*) as count FROM user_warnings WHERE chat_id = ?'
        ).get(String(chatId)) as { count: number }).count;

        const uniqueWarned = (db.prepare(
            'SELECT COUNT(DISTINCT user_id) as count FROM user_warnings WHERE chat_id = ?'
        ).get(String(chatId)) as { count: number }).count;

        const activeJobs = getActiveTaskCount();

        await ctx.reply(
            '📊 *Bot İstatistikleri*\n\n' +
            `📅 Aktif zamanlanmış gönderi: ${postCount}\n` +
            `⏰ Çalışan cron job: ${activeJobs}\n` +
            `⚠️ Toplam uyarı: ${warningCount}\n` +
            `👤 Uyarılan kullanıcı: ${uniqueWarned}\n\n` +
            `🕐 Sunucu zamanı: ${new Date().toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul' })}`,
            { parse_mode: 'Markdown' },
        );
    });

    // ═══════════════════════════════════════════
    // /addwhitelist <domain> - Whitelist'e domain ekle
    // ═══════════════════════════════════════════
    bot.command('addwhitelist', async (ctx) => {
        if (!adminOnly(ctx)) return;

        const domain = ctx.match?.trim()?.toLowerCase();
        if (!domain) {
            await ctx.reply('📝 *Kullanım:* `/addwhitelist <domain>`\n\nÖrnek: `/addwhitelist youtube.com`', { parse_mode: 'Markdown' });
            return;
        }

        const chatId = String(ctx.chat!.id);
        const db = getDb();

        db.prepare('INSERT OR IGNORE INTO spam_config (chat_id) VALUES (?)').run(chatId);

        const row = db.prepare('SELECT whitelisted_domains FROM spam_config WHERE chat_id = ?').get(chatId) as any;
        const currentDomains = row.whitelisted_domains ? row.whitelisted_domains.split(',').map((d: string) => d.trim()).filter(Boolean) : [];

        if (currentDomains.includes(domain)) {
            await ctx.reply(`ℹ️ \`${domain}\` zaten whitelist'te.`, { parse_mode: 'Markdown' });
            return;
        }

        currentDomains.push(domain);
        db.prepare('UPDATE spam_config SET whitelisted_domains = ?, updated_at = datetime("now") WHERE chat_id = ?')
            .run(currentDomains.join(','), chatId);

        await ctx.reply(`✅ \`${domain}\` whitelist'e eklendi.`, { parse_mode: 'Markdown' });
    });

    // ═══════════════════════════════════════════
    // /addblacklist <kelime> - Kara listeye kelime ekle
    // ═══════════════════════════════════════════
    bot.command('addblacklist', async (ctx) => {
        if (!adminOnly(ctx)) return;

        const word = ctx.match?.trim()?.toLowerCase();
        if (!word) {
            await ctx.reply('📝 *Kullanım:* `/addblacklist <kelime>`\n\nÖrnek: `/addblacklist kripto`', { parse_mode: 'Markdown' });
            return;
        }

        const chatId = String(ctx.chat!.id);
        const db = getDb();

        db.prepare('INSERT OR IGNORE INTO spam_config (chat_id) VALUES (?)').run(chatId);

        const row = db.prepare('SELECT blacklisted_words FROM spam_config WHERE chat_id = ?').get(chatId) as any;
        const currentWords = row.blacklisted_words ? row.blacklisted_words.split(',').map((w: string) => w.trim()).filter(Boolean) : [];

        if (currentWords.includes(word)) {
            await ctx.reply(`ℹ️ \`${word}\` zaten kara listede.`, { parse_mode: 'Markdown' });
            return;
        }

        currentWords.push(word);
        db.prepare('UPDATE spam_config SET blacklisted_words = ?, updated_at = datetime("now") WHERE chat_id = ?')
            .run(currentWords.join(','), chatId);

        await ctx.reply(`✅ \`${word}\` kara listeye eklendi.`, { parse_mode: 'Markdown' });
    });

    // ═══════════════════════════════════════════
    // /addtrigger <tetikleyici> | <cevap>
    // Örnek: /addtrigger !site | https://cutt.ly/orancerrahi
    // ═══════════════════════════════════════════
    bot.command('addtrigger', async (ctx) => {
        if (!adminOnly(ctx)) return;

        const chatId = ctx.chat?.id;
        if (!chatId) return;

        const text = ctx.match?.trim();
        if (!text) {
            await ctx.reply(
                '📝 *Kullanım:* `/addtrigger <tetikleyici> | <cevap>`\n\n' +
                '*Örnekler:*\n' +
                '`/addtrigger !site | https://cutt.ly/orancerrahi`\n' +
                '`/addtrigger !kurallar | Grubumuzun kuralları için /rules yazın`\n' +
                '`/addtrigger !kanal | VIP kanalımız: @cerrahvip`',
                { parse_mode: 'Markdown' },
            );
            return;
        }

        const separatorIndex = text.indexOf('|');
        if (separatorIndex === -1) {
            await ctx.reply(
                '❌ Lütfen tetikleyici ve cevabı `|` ile ayırın.\n\n' +
                '*Örnek:* `/addtrigger !site | https://cutt.ly/orancerrahi`',
                { parse_mode: 'Markdown' },
            );
            return;
        }

        let triggerWord = text.substring(0, separatorIndex).trim().toLowerCase();
        const response = text.substring(separatorIndex + 1).trim();

        if (!triggerWord || !response) {
            await ctx.reply('❌ Tetikleyici ve cevap boş olamaz.');
            return;
        }

        // ! ile başlamıyorsa ekle
        if (!triggerWord.startsWith('!')) {
            triggerWord = '!' + triggerWord;
        }

        const trigger = addTrigger(String(chatId), triggerWord, response, ctx.from!.id);
        if (trigger) {
            await ctx.reply(
                `✅ Trigger oluşturuldu!\n\n` +
                `🔑 Tetikleyici: \`${triggerWord}\`\n` +
                `💬 Cevap: ${response}`,
                { parse_mode: 'Markdown' },
            );
        } else {
            await ctx.reply('❌ Trigger oluşturulurken hata oluştu.');
        }
    });

    // ═══════════════════════════════════════════
    // /listtriggers - Aktif trigger'ları listele
    // ═══════════════════════════════════════════
    bot.command('listtriggers', async (ctx) => {
        if (!adminOnly(ctx)) return;

        const chatId = ctx.chat?.id;
        if (!chatId) return;

        const triggers = listTriggers(String(chatId));

        if (triggers.length === 0) {
            await ctx.reply('📭 Bu grupta tanımlı trigger yok.\n\nEklemek için: `/addtrigger !site | https://ornek.com`', { parse_mode: 'Markdown' });
            return;
        }

        let message = '🔑 *Aktif Trigger\'lar*\n\n';
        for (const t of triggers) {
            const preview = t.response.length > 60
                ? t.response.substring(0, 60) + '...'
                : t.response;
            message += `• \`${t.trigger_word}\` → ${preview}\n`;
        }

        await ctx.reply(message, { parse_mode: 'Markdown' });
    });

    // ═══════════════════════════════════════════
    // /removetrigger <tetikleyici> - Trigger sil
    // ═══════════════════════════════════════════
    bot.command('removetrigger', async (ctx) => {
        if (!adminOnly(ctx)) return;

        const chatId = ctx.chat?.id;
        if (!chatId) return;

        let triggerWord = ctx.match?.trim()?.toLowerCase();
        if (!triggerWord) {
            await ctx.reply('📝 *Kullanım:* `/removetrigger <tetikleyici>`\n\nÖrnek: `/removetrigger !site`', { parse_mode: 'Markdown' });
            return;
        }

        if (!triggerWord.startsWith('!')) {
            triggerWord = '!' + triggerWord;
        }

        const removed = removeTrigger(String(chatId), triggerWord);
        if (removed) {
            await ctx.reply(`✅ \`${triggerWord}\` trigger'ı silindi.`, { parse_mode: 'Markdown' });
        } else {
            await ctx.reply(`❌ \`${triggerWord}\` trigger'ı bulunamadı.`, { parse_mode: 'Markdown' });
        }
    });
}
