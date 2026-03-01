import { Bot } from 'grammy';
import { config } from '../src/config';

async function main() {
    console.log('🧪 TEST MODU: Telegram güncellemeleri dinleniyor...');
    console.log('Lütfen şimdi kanala bir mesaj gönderin.');

    const bot = new Bot(config.botToken);

    // Hata yakalama
    bot.catch((err) => {
        console.error('❌ Bot hatası:', err);
    });

    // Her şeyi logla
    bot.use(async (ctx, next) => {
        const updateType = Object.keys(ctx.update).filter(k => k !== 'update_id')[0];
        console.log('📨 GÜNCELLEME ALINDI!');
        console.log(`TYPE: ${updateType}`);
        console.log(`FULL JSON:`, JSON.stringify(ctx.update, null, 2));
        await next();
    });

    try {
        await bot.api.deleteWebhook();
        console.log('Webhook temizlendi.');
    } catch (e) {
        console.error('Webhook temizleme hatası:', e);
    }

    console.log('Polling başlatılıyor...');
    await bot.start({
        allowed_updates: ['message', 'channel_post', 'callback_query', 'my_chat_member', 'chat_member'],
        onStart: (info) => {
            console.log(`✅ Test Bot Online: @${info.username}`);
        }
    });
}

main();
