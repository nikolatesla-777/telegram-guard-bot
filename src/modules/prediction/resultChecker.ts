import { Bot, Context, InputFile } from 'grammy';
import { getDb } from '../../database';
import { PredictionMatch } from '../../database/models';
import { buildResultImageUrl, fetchImageBuffer } from './imageGenerator';
import { addPoints, incrementPredictionCount } from './leaderboard';

function getPredictionGroups(): string[] {
    return (process.env.PREDICTION_GROUPS || '').split(',').map(s => s.trim()).filter(Boolean);
}

interface EventResult {
    eventId: string;
    completed: boolean;
    homeScore: number;
    awayScore: number;
    result: '1' | 'X' | '2';
}

/** ESPN scoreboard'dan tamamlanan maçları çeker */
async function fetchCompletedFromScoreboard(league: string, dateStr: string): Promise<EventResult[]> {
    const espnDate = dateStr.replace(/-/g, '');
    const url = `https://site.api.espn.com/apis/site/v2/sports/soccer/${league}/scoreboard?dates=${espnDate}`;

    try {
        const res = await fetch(url, {
            headers: { 'User-Agent': 'Mozilla/5.0 (compatible; TelegramBot/1.0)' },
            signal: AbortSignal.timeout(8000),
        });
        if (!res.ok) return [];

        const data = await res.json() as { events?: any[] };
        if (!data.events?.length) return [];

        const results: EventResult[] = [];
        for (const e of data.events) {
            const comps = e.competitions?.[0];
            const status = comps?.status?.type;
            if (!status?.completed) continue;

            const homeComp = comps?.competitors?.find((c: any) => c.homeAway === 'home');
            const awayComp = comps?.competitors?.find((c: any) => c.homeAway === 'away');
            const homeScore = parseInt(homeComp?.score || '0', 10);
            const awayScore = parseInt(awayComp?.score || '0', 10);

            let result: '1' | 'X' | '2';
            if (homeScore > awayScore) result = '1';
            else if (homeScore < awayScore) result = '2';
            else result = 'X';

            results.push({ eventId: String(e.id), completed: true, homeScore, awayScore, result });
        }
        return results;
    } catch {
        return [];
    }
}

/** Biten maçları tespit et, oyları değerlendir, sonuçları duyur */
export async function checkResults(bot: Bot<Context>): Promise<void> {
    const db = getDb();
    const now = Date.now();
    // 90 dk önce başlamış ama henüz bitmemiş maçlar (son 8 saat içinde)
    const cutoff = now - 90 * 60 * 1000;
    const oldestToCheck = now - 8 * 60 * 60 * 1000;

    const pendingMatches = db.prepare(`
        SELECT * FROM prediction_matches
        WHERE status != 'finished'
          AND start_time <= ?
          AND start_time >= ?
        ORDER BY start_time ASC
    `).all(cutoff, oldestToCheck) as PredictionMatch[];

    if (pendingMatches.length === 0) return;

    // Ligler ve tarihler bazında grupla (API çağrısını minimize et)
    const leagueDatePairs = new Set<string>();
    for (const m of pendingMatches) {
        const dateStr = istanbulDateOf(m.start_time);
        leagueDatePairs.add(`${m.espn_league_id}|${dateStr}`);
    }

    // Tüm sonuçları çek
    const allResults = new Map<string, EventResult>();
    await Promise.allSettled(
        Array.from(leagueDatePairs).map(async (key) => {
            const [league, date] = key.split('|');
            const events = await fetchCompletedFromScoreboard(league, date);
            for (const ev of events) {
                allResults.set(ev.eventId, ev);
            }
        })
    );

    // Her bekleyen maç için sonuç varsa işle
    for (const match of pendingMatches) {
        const result = allResults.get(match.espn_event_id);
        if (!result) continue;

        await processMatchResult(bot, match, result);
    }
}

async function processMatchResult(
    bot: Bot<Context>,
    match: PredictionMatch,
    result: EventResult
): Promise<void> {
    const db = getDb();

    // DB güncelle
    db.prepare(`
        UPDATE prediction_matches
        SET status = 'finished',
            home_score = ?,
            away_score = ?,
            result = ?,
            updated_at = datetime('now')
        WHERE id = ?
    `).run(result.homeScore, result.awayScore, result.result, match.id);

    // Oyları değerlendir
    const votes = db.prepare(`
        SELECT v.*, u.username, u.first_name
        FROM prediction_votes v
        LEFT JOIN prediction_users u ON u.user_id = v.user_id
        WHERE v.match_id = ? AND v.is_correct IS NULL
    `).all(match.id) as any[];

    const correctVoters: string[] = [];
    const wrongVoters: number[] = [];

    for (const vote of votes) {
        const totalGoals = result.homeScore + result.awayScore;
        const overUnderResult = totalGoals >= 3 ? 'OVER' : 'UNDER';
        const isOverUnder = vote.vote === 'OVER' || vote.vote === 'UNDER';
        const isCorrect = isOverUnder
            ? (vote.vote === overUnderResult ? 1 : 0)
            : (vote.vote === result.result ? 1 : 0);
        db.prepare(`
            UPDATE prediction_votes SET is_correct = ? WHERE id = ?
        `).run(isCorrect, vote.id);

        incrementPredictionCount(vote.user_id);

        if (isCorrect) {
            addPoints(vote.user_id, 3);
            const name = vote.username ? `@${vote.username}` : vote.first_name || `Kullanıcı`;
            correctVoters.push(name);
        } else {
            wrongVoters.push(vote.user_id);
        }
    }

    // Skor oylarını değerlendir (score_votes)
    const scoreVotes = db.prepare(`
        SELECT sv.*, u.username, u.first_name
        FROM score_votes sv
        LEFT JOIN prediction_users u ON u.user_id = sv.user_id
        WHERE sv.match_id = ? AND sv.is_correct IS NULL
    `).all(match.id) as any[];

    const correctScorers: string[] = [];
    for (const sv of scoreVotes) {
        const hit = sv.home_guess === result.homeScore && sv.away_guess === result.awayScore ? 1 : 0;
        db.prepare(`UPDATE score_votes SET is_correct = ? WHERE id = ?`).run(hit, sv.id);
        if (hit) {
            addPoints(sv.user_id, 20);
            incrementPredictionCount(sv.user_id);
            correctScorers.push(sv.username ? `@${sv.username}` : sv.first_name || 'Kullanıcı');
        }
    }

    // Duyuru henüz yapılmadıysa yap
    const matchRow = db.prepare('SELECT result_announced FROM prediction_matches WHERE id = ?').get(match.id) as any;
    if (matchRow?.result_announced) return;

    db.prepare(`
        UPDATE prediction_matches SET result_announced = 1 WHERE id = ?
    `).run(match.id);

    await announceResult(bot, match, result, correctVoters, correctScorers);
}

async function announceResult(
    bot: Bot<Context>,
    match: PredictionMatch,
    result: EventResult,
    correctVoters: string[],
    correctScorers: string[]
): Promise<void> {
    const groups = getPredictionGroups();
    if (groups.length === 0) return;

    const resultLabel = result.result === '1'
        ? `${match.home_team} kazandı`
        : result.result === '2'
            ? `${match.away_team} kazandı`
            : 'Berabere bitti';
    const totalGoals = result.homeScore + result.awayScore;
    const overUnderLabel = totalGoals >= 3 ? `⬆️ 2.5 ÜST (${totalGoals} gol)` : `⬇️ 2.5 ALT (${totalGoals} gol)`;

    let votersText = '';
    if (correctVoters.length === 0) {
        votersText = 'Kimse doğru tahmin yapamadı 😅';
    } else if (correctVoters.length <= 5) {
        votersText = `Tebrikler: ${correctVoters.join(', ')}`;
    } else {
        const shown = correctVoters.slice(0, 5).join(', ');
        votersText = `Tebrikler: ${shown} +${correctVoters.length - 5} kişi daha`;
    }

    let scorersText = '';
    if (correctScorers.length > 0) {
        const shown = correctScorers.slice(0, 5).join(', ');
        const extra = correctScorers.length > 5 ? ` +${correctScorers.length - 5} kişi daha` : '';
        scorersText = `\n🎯 Doğru Skor (${result.homeScore}-${result.awayScore}) bilenler (+20 puan): ${shown}${extra}`;
    }

    const text =
        `✅ *MAÇIN SONUCU*\n` +
        `⚽ ${match.home_team} ${result.homeScore} - ${result.awayScore} ${match.away_team}\n` +
        `📊 Sonuç: ${resultLabel} • ${overUnderLabel}\n\n` +
        `🎯 Doğru tahmin yapanlar (${correctVoters.length} kişi):\n${votersText}` +
        `${scorersText}\n\n` +
        `Puan tablonuz güncellendi!\n/siralama ile sıralamanı gör 👇`;

    for (const chatId of groups) {
        try {
            // Sonuç görseli gönder
            try {
                const imageUrl = buildResultImageUrl(match.home_team, match.away_team, result.homeScore, result.awayScore);
                const imgBuffer = await fetchImageBuffer(imageUrl);
                await bot.api.sendPhoto(chatId, new InputFile(imgBuffer, 'result.jpg'), {
                    caption: text,
                    parse_mode: 'Markdown',
                });
            } catch {
                await bot.api.sendMessage(chatId, text, { parse_mode: 'Markdown' });
            }
            console.log(`[ResultChecker] ✅ Sonuç duyuruldu: ${match.home_team} ${result.homeScore}-${result.awayScore} ${match.away_team} → ${chatId}`);
        } catch (err) {
            console.error(`[ResultChecker] Duyuru gönderilemedi (${chatId}):`, err);
        }
    }
}

function istanbulDateOf(timestamp: number): string {
    const d = new Date(timestamp + 3 * 60 * 60 * 1000);
    return d.toISOString().split('T')[0];
}
