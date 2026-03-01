import { Context } from 'grammy';

export function registerGeneralCommands(bot: import('grammy').Bot<Context>): void {
    bot.command('start', async (ctx) => {
        const isGroup = ctx.chat?.type === 'group' || ctx.chat?.type === 'supergroup';

        if (isGroup) {
            await ctx.reply(
                '🛡️ *Telegram Guard Bot* aktif!\n\n' +
                'Bu bot grubunuzu spam ve istenmeyen içeriklerden korur.\n' +
                'Yönetici komutları için: /help',
                { parse_mode: 'Markdown' },
            );
        } else {
            await ctx.reply(
                '👋 Merhaba! Ben *Telegram Guard Bot*.\n\n' +
                '🛡️ Gruplarınızı spam ve istenmeyen içeriklerden koruyorum.\n' +
                '📅 Zamanlanmış otomatik gönderi yönetimi yapıyorum.\n\n' +
                'Beni bir gruba ekleyin ve admin yapın!\n' +
                'Komut listesi için: /help',
                { parse_mode: 'Markdown' },
            );
        }
    });

    bot.command('help', async (ctx) => {
        await ctx.reply(
            '📖 *Komut Listesi*\n\n' +
            '*Genel Komutlar:*\n' +
            '• /start - Bot bilgileri\n' +
            '• /help - Bu mesaj\n' +
            '• /rules - Grup kuralları\n\n' +
            '*Admin Komutları:*\n' +
            '• /addpost `<cron> <mesaj>` - Zamanlanmış gönderi ekle\n' +
            '• /listposts - Aktif gönderileri listele\n' +
            '• /removepost `<id>` - Gönderi sil\n' +
            '• /spamconfig - Spam filtre ayarları\n' +
            '• /warn - Kullanıcıya uyarı ver (mesaja yanıt)\n' +
            '• /ban - Kullanıcıyı banla (mesaja yanıt)\n' +
            '• /unban `<user_id>` - Kullanıcı banını kaldır\n' +
            '• /stats - Bot istatistikleri\n\n' +
            '*Cron Örnekleri:*\n' +
            '• `0 9 * * *` → Her gün 09:00\n' +
            '• `0 */2 * * *` → Her 2 saatte bir\n' +
            '• `30 10 * * 1` → Her Pazartesi 10:30\n' +
            '• `0 9,18 * * *` → Her gün 09:00 ve 18:00',
            { parse_mode: 'Markdown' },
        );
    });

    bot.command('rules', async (ctx) => {
        await ctx.reply(
            '📋 *Grup Kuralları*\n\n' +
            '1️⃣ Spam ve reklam yasaktır\n' +
            '2️⃣ Link paylaşımı kısıtlıdır\n' +
            '3️⃣ Saygılı olun, küfür etmeyin\n' +
            '4️⃣ Aynı mesajı tekrar tekrar göndermeyin\n' +
            '5️⃣ Yeni üyeler CAPTCHA doğrulamasından geçmelidir\n\n' +
            '⚠️ Kuralları ihlal edenler uyarılır ve gerekirse banlanır.',
            { parse_mode: 'Markdown' },
        );
    });

    bot.command('id', async (ctx) => {
        const chatId = ctx.chat.id;
        const chatTitle = ctx.chat.type === 'private' ? 'Özel Sohbet' : ctx.chat.title;
        await ctx.reply(
            `🆔 *Chat Bilgisi*\n\n` +
            `🔹 *ID:* \`${chatId}\`\n` +
            `🔸 *Başlık:* ${chatTitle}\n` +
            `▪️ *Tip:* ${ctx.chat.type}`,
            { parse_mode: 'Markdown' },
        );
    });
}
