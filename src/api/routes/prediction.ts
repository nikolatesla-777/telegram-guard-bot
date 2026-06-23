import { Router, Request, Response } from 'express';
import { getDb } from '../../database';
import { getTodayMatches, getTomorrowMatches } from '../../modules/prediction/matchTracker';
import { getLeaderboard, getUserStats, upsertUser } from '../../modules/prediction/leaderboard';
import { createHmac } from 'crypto';

export function createPredictionRoutes(): Router {
    const router = Router();

    /** GET /api/prediction/matches — bugün ve yarınki maçlar */
    router.get('/matches', (_req: Request, res: Response): void => {
        try {
            const today = getTodayMatches();
            const tomorrow = getTomorrowMatches();
            res.json({ today, tomorrow });
        } catch (err: any) {
            res.status(500).json({ error: err.message });
        }
    });

    /** GET /api/prediction/leaderboard?period=week|month|all&limit=10 */
    router.get('/leaderboard', (req: Request, res: Response): void => {
        try {
            const period = typeof req.query.period === 'string' ? req.query.period : 'week';
            const limitRaw = typeof req.query.limit === 'string' ? req.query.limit : '10';
            const limit = parseInt(limitRaw, 10);

            if (!['week', 'month', 'all'].includes(period)) {
                res.status(400).json({ error: 'period must be week, month or all' });
                return;
            }

            const entries = getLeaderboard(period as any, limit);
            res.json({ period, entries });
        } catch (err: any) {
            res.status(500).json({ error: err.message });
        }
    });

    /** GET /api/prediction/user/:id — kullanıcı istatistikleri */
    router.get('/user/:id', (req: Request, res: Response): void => {
        try {
            const userId = parseInt(String(req.params.id), 10);
            if (isNaN(userId)) {
                res.status(400).json({ error: 'Geçersiz user_id' });
                return;
            }

            const stats = getUserStats(userId);
            if (!stats) {
                res.status(404).json({ error: 'Kullanıcı bulunamadı' });
                return;
            }

            const db = getDb();
            const recentVotes = db.prepare(`
                SELECT v.*, m.home_team, m.away_team, m.league, m.home_score, m.away_score, m.result as match_result
                FROM prediction_votes v
                INNER JOIN prediction_matches m ON m.id = v.match_id
                WHERE v.user_id = ?
                ORDER BY v.created_at DESC
                LIMIT 10
            `).all(userId);

            const recentScoreVotes = db.prepare(`
                SELECT sv.*, m.home_team, m.away_team, m.league, m.home_score, m.away_score, m.status
                FROM score_votes sv
                INNER JOIN prediction_matches m ON m.id = sv.match_id
                WHERE sv.user_id = ?
                ORDER BY sv.created_at DESC
                LIMIT 10
            `).all(userId);

            res.json({ ...stats, recent_votes: recentVotes, recent_score_votes: recentScoreVotes });
        } catch (err: any) {
            res.status(500).json({ error: err.message });
        }
    });

    /** POST /api/prediction/vote — Mini App'ten oy (Telegram WebApp auth ile) */
    router.post('/vote', (req: Request, res: Response): void => {
        try {
            const { init_data, match_id, vote } = req.body as {
                init_data: string;
                match_id: number;
                vote: '1' | 'X' | '2' | 'OVER' | 'UNDER';
            };

            if (!init_data || !match_id || !['1', 'X', '2', 'OVER', 'UNDER'].includes(vote)) {
                res.status(400).json({ error: 'Geçersiz istek parametreleri' });
                return;
            }

            // Telegram WebApp init_data doğrulaması
            const userId = validateTelegramInitData(init_data);
            if (!userId) {
                res.status(401).json({ error: 'Telegram kimlik doğrulaması başarısız' });
                return;
            }

            const db = getDb();

            // Maç var mı ve hâlâ oynanabilir mi?
            const match = db.prepare('SELECT * FROM prediction_matches WHERE id = ?').get(match_id) as any;
            if (!match) {
                res.status(404).json({ error: 'Maç bulunamadı' });
                return;
            }
            if (match.status !== 'scheduled') {
                res.status(409).json({ error: 'Bu maç için tahmin süresi doldu' });
                return;
            }
            if (match.start_time <= Date.now()) {
                res.status(409).json({ error: 'Maç başladı, tahmin yapılamaz' });
                return;
            }

            // Kullanıcıyı kaydet / güncelle
            const userData = parseInitDataUser(init_data);
            upsertUser(userId, userData?.username || null, userData?.first_name || null);

            // Oyu kaydet — INSERT ONLY, değiştirilemez
            try {
                db.prepare(`
                    INSERT INTO prediction_votes (user_id, match_id, vote)
                    VALUES (?, ?, ?)
                `).run(userId, match_id, vote);
            } catch (e: any) {
                if (e.code === 'SQLITE_CONSTRAINT_UNIQUE' || e.code === 'SQLITE_CONSTRAINT') {
                    res.status(409).json({ error: 'Tahmin zaten girilmiş, değiştirilemez.' });
                    return;
                }
                throw e;
            }

            res.json({ success: true, vote });
        } catch (err: any) {
            res.status(500).json({ error: err.message });
        }
    });

    /** GET /api/prediction/vote/:matchId — kullanıcının bu maçtaki oyu */
    router.get('/vote/:matchId', (req: Request, res: Response): void => {
        try {
            const init_data = typeof req.query.init_data === 'string' ? req.query.init_data : '';
            const matchId = parseInt(String(req.params.matchId), 10);

            const userId = validateTelegramInitData(init_data);
            if (!userId) {
                res.status(401).json({ error: 'Kimlik doğrulaması gerekli' });
                return;
            }

            const db = getDb();
            const vote = db.prepare(
                'SELECT vote FROM prediction_votes WHERE user_id = ? AND match_id = ?'
            ).get(userId, matchId) as any;

            res.json({ vote: vote?.vote || null });
        } catch (err: any) {
            res.status(500).json({ error: err.message });
        }
    });

    /** POST /api/prediction/score-vote — Mini App'ten skor tahmini */
    router.post('/score-vote', (req: Request, res: Response): void => {
        try {
            const { init_data, match_id, home_guess, away_guess } = req.body as {
                init_data: string;
                match_id: number;
                home_guess: number;
                away_guess: number;
            };

            if (!init_data || !match_id
                || !Number.isInteger(home_guess) || home_guess < 0 || home_guess > 20
                || !Number.isInteger(away_guess) || away_guess < 0 || away_guess > 20) {
                res.status(400).json({ error: 'Geçersiz istek parametreleri' });
                return;
            }

            const userId = validateTelegramInitData(init_data);
            if (!userId) {
                res.status(401).json({ error: 'Telegram kimlik doğrulaması başarısız' });
                return;
            }

            const db = getDb();
            const match = db.prepare('SELECT * FROM prediction_matches WHERE id = ?').get(match_id) as any;
            if (!match) {
                res.status(404).json({ error: 'Maç bulunamadı' });
                return;
            }
            if (match.status !== 'scheduled') {
                res.status(409).json({ error: 'Bu maç için tahmin süresi doldu' });
                return;
            }
            if (match.start_time <= Date.now()) {
                res.status(409).json({ error: 'Maç başladı, tahmin yapılamaz' });
                return;
            }

            const userData = parseInitDataUser(init_data);
            upsertUser(userId, userData?.username || null, userData?.first_name || null);

            try {
                db.prepare(`
                    INSERT INTO score_votes (user_id, match_id, home_guess, away_guess)
                    VALUES (?, ?, ?, ?)
                `).run(userId, match_id, home_guess, away_guess);
            } catch (e: any) {
                if (e.code === 'SQLITE_CONSTRAINT_UNIQUE' || e.code === 'SQLITE_CONSTRAINT') {
                    res.status(409).json({ error: 'Skor tahminin zaten girilmiş, değiştirilemez.' });
                    return;
                }
                throw e;
            }

            res.json({ success: true, home_guess, away_guess });
        } catch (err: any) {
            res.status(500).json({ error: err.message });
        }
    });

    /** GET /api/prediction/score-vote/:matchId — kullanıcının bu maçtaki skor tahmini */
    router.get('/score-vote/:matchId', (req: Request, res: Response): void => {
        try {
            const init_data = typeof req.query.init_data === 'string' ? req.query.init_data : '';
            const matchId = parseInt(String(req.params.matchId), 10);

            const userId = validateTelegramInitData(init_data);
            if (!userId) {
                res.status(401).json({ error: 'Kimlik doğrulaması gerekli' });
                return;
            }

            const db = getDb();
            const sv = db.prepare(
                'SELECT home_guess, away_guess, is_correct FROM score_votes WHERE user_id = ? AND match_id = ?'
            ).get(userId, matchId) as any;

            res.json({ score_vote: sv ? { home_guess: sv.home_guess, away_guess: sv.away_guess, is_correct: sv.is_correct } : null });
        } catch (err: any) {
            res.status(500).json({ error: err.message });
        }
    });

    return router;
}

/** Telegram WebApp initData imzasını doğrular, user_id döndürür */
function validateTelegramInitData(initData: string): number | null {
    try {
        const botToken = process.env.BOT_TOKEN || '';
        const params = new URLSearchParams(initData);
        const hash = params.get('hash');
        if (!hash) return null;

        params.delete('hash');
        const dataCheckString = Array.from(params.entries())
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([k, v]) => `${k}=${v}`)
            .join('\n');

        const secretKey = createHmac('sha256', 'WebAppData').update(botToken).digest();
        const expectedHash = createHmac('sha256', secretKey).update(dataCheckString).digest('hex');

        if (expectedHash !== hash) return null;

        const userStr = params.get('user');
        if (!userStr) return null;
        const user = JSON.parse(userStr);
        return user.id || null;
    } catch {
        return null;
    }
}

function parseInitDataUser(initData: string): { username?: string; first_name?: string } | null {
    try {
        const params = new URLSearchParams(initData);
        const userStr = params.get('user');
        if (!userStr) return null;
        return JSON.parse(userStr);
    } catch {
        return null;
    }
}
