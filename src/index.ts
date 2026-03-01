import { createBot } from './bot';
import { closeDb } from './database';
import { startApiServer } from './api/server';

async function main() {
    console.log('🤖 Telegram Guard Bot başlatılıyor...');
    console.log('═'.repeat(40));
    // Force restart for API Error Logging

    const bot = createBot();

    // API Dashboard server'ını başlat
    startApiServer(bot);

    // Graceful shutdown
    const shutdown = async (signal: string) => {
        console.log(`\n📴 ${signal} sinyali alındı. Bot kapatılıyor...`);
        await bot.stop();
        closeDb();
        console.log('👋 Bot kapatıldı. Güle güle!');
        process.exit(0);
    };

    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));

    // Bot'u başlat
    console.log('🚀 Bot başlatıldı! Ctrl+C ile kapatabilirsiniz.');
    console.log('═'.repeat(40));

    // Webhook varsa sil (localde polling kullanıyoruz)
    try {
        await bot.api.deleteWebhook();
        console.log('Webhook silindi, polling başlatılıyor...');
    } catch (err) {
        console.error('Webhook silme hatası (önemsiz):', err);
    }

    await bot.start({
        onStart: (botInfo) => {
            console.log(`✅ Bot online: @${botInfo.username}`);
            console.log(`📛 Bot adı: ${botInfo.first_name}`);
        },
        allowed_updates: ['message', 'channel_post', 'callback_query', 'my_chat_member', 'chat_member'],
    });
}

main().catch((err) => {
    console.error('💥 Bot başlatılamadı:', err);
    process.exit(1);
});
