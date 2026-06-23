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

/** Başlamasına ≤60 dk kalan, henüz poll gönderilmemiş maçlar için anket at */
export async function sendPendingPolls(bot: Bot<Context>): Promise<void> {
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
                'SELECT id FROM prediction_polls WHERE match_id = ? AND chat_id = ?'
            ).get(match.id, chatId);
            if (existing) continue;

            await sendMatchPoll(bot, match, chatId);
        }
    }
}

async function sendMatchPoll(bot: Bot<Context>, match: PredictionMatch, chatId: string): Promise<void> {
    const miniAppUrl = process.env.MINIAPP_URL ?? 'https://cerrahakademi.com/app';

    try {
        const timeStr = formatIstanbulTime(match.start_time);
        const dayLabel = getDayLabel(match.start_time);

        // 1) Maç duyuru mesajı + Mini App butonu
        await bot.api.sendMessage(
            chatId,
            `🎯 *TAHMİN VAKTİ!*\n\n` +
            `⚽ *${match.home_team}* – *${match.away_team}*\n` +
            `🕐 ${dayLabel} ${timeStr} TR  |  ${match.league}\n\n` +
            `Aşağıdaki ankete oy ver veya Mini App'ten kesin skoru tahmin et!`,
            {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [[
                        { text: '🎯 Kesin Skoru Tahmin Et (+20 puan)', url: miniAppUrl },
                    ]],
                },
            }
        );

        // 2) Anket
        const question = `⚽ ${match.home_team} - ${match.away_team}\n🕐 ${dayLabel} ${timeStr} TR | ${match.league}\n\nSence sonuç ne olur? Doğru bilene +3 puan!`;

        const pollMsg = await bot.api.sendPoll(
            chatId,
            question,
            [
                { text: `🟦 ${match.home_team} Kazanır` },
                { text: '🟨 Berabere' },
                { text: `🟥 ${match.away_team} Kazanır` },
            ],
            {
                is_anonymous: false,
                allows_multiple_answers: false,
            }
        );

        const db = getDb();
        db.prepare(`
            INSERT OR IGNORE INTO prediction_polls (match_id, chat_id, poll_message_id, telegram_poll_id)
            VALUES (?, ?, ?, ?)
        `).run(match.id, chatId, pollMsg.message_id, pollMsg.poll.id);

        console.log(`[PollSender] ✅ Anket gönderildi: ${match.home_team} vs ${match.away_team} → ${chatId}`);
    } catch (err) {
        console.error(`[PollSender] Anket gönderilemedi (${chatId}):`, err);
    }
}
