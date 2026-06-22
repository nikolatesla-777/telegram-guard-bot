import cron from 'node-cron';
import { Bot, Context, InputFile } from 'grammy';
import { syncUpcomingMatches } from './matchTracker';
import { sendPendingPolls } from './pollSender';
import { sendScoreAnnouncements } from './scoreSender';
import { checkResults } from './resultChecker';
import { getWeeklyChampion } from './leaderboard';
import { buildChampionImageUrl, fetchImageBuffer } from './imageGenerator';

function getPredictionGroups(): string[] {
    return (process.env.PREDICTION_GROUPS || '').split(',').map(s => s.trim()).filter(Boolean);
}

async function runCycle(bot: Bot<Context>): Promise<void> {
    await syncUpcomingMatches();
    await sendPendingPolls(bot);
    await sendScoreAnnouncements(bot);
    await checkResults(bot);
}

async function announceWeeklyChampion(bot: Bot<Context>): Promise<void> {
    const groups = getPredictionGroups();
    if (groups.length === 0) return;

    const champion = getWeeklyChampion();
    if (!champion || champion.total_points === 0) {
        console.log('[Prediction] Haftanın şampiyonu bulunamadı.');
        return;
    }

    const name = champion.username ? `@${champion.username}` : champion.first_name || 'Anonim';
    const accuracy = champion.total_predictions > 0
        ? Math.round((champion.correct_predictions / champion.total_predictions) * 100)
        : 0;

    const text =
        `🏆 *HAFTANIN ŞAMPIYONU*\n\n` +
        `👑 ${name}\n` +
        `📊 Puan: ${champion.total_points}\n` +
        `🎯 Doğruluk: %${accuracy} (${champion.correct_predictions}/${champion.total_predictions})\n\n` +
        `Tebrikler! Yeni hafta için hazır mısın? /siralama`;

    for (const chatId of groups) {
        try {
            try {
                const imageUrl = buildChampionImageUrl(name, champion.total_points);
                const imgBuffer = await fetchImageBuffer(imageUrl);
                await bot.api.sendPhoto(chatId, new InputFile(imgBuffer, 'champion.jpg'), {
                    caption: text,
                    parse_mode: 'Markdown',
                });
            } catch {
                await bot.api.sendMessage(chatId, text, { parse_mode: 'Markdown' });
            }
            console.log(`[Prediction] Haftalık şampiyon duyuruldu → ${chatId}`);
        } catch (err) {
            console.error(`[Prediction] Şampiyon duyurusu gönderilemedi (${chatId}):`, err);
        }
    }
}

export function initPredictionSystem(bot: Bot<Context>): void {
    // Her 30 dakikada bir: maç takibi + poll gönderim + sonuç kontrolü
    cron.schedule('*/30 * * * *', async () => {
        try {
            await runCycle(bot);
        } catch (err) {
            console.error('[Prediction] Cron hatası:', err);
        }
    }, { timezone: 'Europe/Istanbul' });

    // Pazartesi 10:00 — haftalık şampiyon ilanı
    cron.schedule('0 10 * * 1', async () => {
        try {
            await announceWeeklyChampion(bot);
        } catch (err) {
            console.error('[Prediction] Şampiyon ilanı hatası:', err);
        }
    }, { timezone: 'Europe/Istanbul' });

    // Başlangıçta bir kez çalıştır (5 sn gecikmeyle)
    setTimeout(async () => {
        try {
            await syncUpcomingMatches();
            await sendPendingPolls(bot);
        } catch (err) {
            console.error('[Prediction] İlk çalıştırma hatası:', err);
        }
    }, 5000);

    console.log('🎯 Tahmin Sistemi başlatıldı (her 30 dk | Pazartesi 10:00 şampiyon).');
}
