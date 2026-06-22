import { Bot, Context } from 'grammy';
import { getDb } from '../../database';
import { PredictionMatch } from '../../database/models';

function getPredictionGroups(): string[] {
    return (process.env.PREDICTION_GROUPS || '').split(',').map(s => s.trim()).filter(Boolean);
}

function formatIstanbulTime(timestamp: number): string {
    const d = new Date(timestamp);
    const h = (d.getUTCHours() + 3) % 24;
    const m = d.getUTCMinutes();
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function getDayLabel(startTime: number): string {
    const nowIst = Date.now() + 3 * 60 * 60 * 1000;
    const matchIst = startTime + 3 * 60 * 60 * 1000;
    const nowDay = new Date(nowIst).toISOString().split('T')[0];
    const matchDay = new Date(matchIst).toISOString().split('T')[0];
    return nowDay === matchDay ? 'Bugün' : 'Yarın';
}

/** Başlamasına ≤60 dk kalan, henüz skor duyurusu gönderilmemiş maçlar için duyuru at */
export async function sendScoreAnnouncements(bot: Bot<Context>): Promise<void> {
    const groups = getPredictionGroups();
    if (groups.length === 0) return;

    const db = getDb();
    const now = Date.now();
    const in60min = now + 60 * 60 * 1000;

    const matches = db.prepare(`
        SELECT * FROM prediction_matches
        WHERE status = 'scheduled'
          AND start_time > ?
          AND start_time <= ?
    `).all(now, in60min) as PredictionMatch[];

    for (const match of matches) {
        for (const chatId of groups) {
            const existing = db.prepare(
                'SELECT id FROM score_announcements WHERE match_id = ? AND chat_id = ?'
            ).get(match.id, chatId);
            if (existing) continue;

            await sendScoreAnnouncement(bot, match, chatId);
        }
    }
}

async function sendScoreAnnouncement(bot: Bot<Context>, match: PredictionMatch, chatId: string): Promise<void> {
    const db = getDb();
    const miniAppUrl = process.env.MINIAPP_URL ?? 'https://cerrahakademi.com/app';

    try {
        const timeStr = formatIstanbulTime(match.start_time);
        const dayLabel = getDayLabel(match.start_time);

        const text =
            `🎯 *SKOR TAHMİNİ YARIŞMASI*\n\n` +
            `⚽ ${match.home_team} – ${match.away_team}\n` +
            `🕐 ${dayLabel} ${timeStr} TR  |  ${match.league}\n\n` +
            `Maçın kesin skorunu tahmin et!\n` +
            `✅ Doğru skor → *+20 Puan* 🎉\n\n` +
            `Mini App'ten tahminini gir 👇`;

        const msg = await bot.api.sendMessage(chatId, text, {
            parse_mode: 'Markdown',
            reply_markup: {
                inline_keyboard: [[
                    { text: '🎯 Skoru Tahmin Et', url: miniAppUrl },
                ]],
            },
        });

        db.prepare(`
            INSERT OR IGNORE INTO score_announcements (match_id, chat_id, message_id)
            VALUES (?, ?, ?)
        `).run(match.id, chatId, msg.message_id);

        console.log(`[ScoreSender] ✅ Skor duyurusu gönderildi: ${match.home_team} vs ${match.away_team} → ${chatId}`);
    } catch (err) {
        console.error(`[ScoreSender] Duyuru gönderilemedi (${chatId}):`, err);
    }
}
