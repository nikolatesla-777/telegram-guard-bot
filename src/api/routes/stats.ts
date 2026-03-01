import { Router, Request, Response } from 'express';
import { getDb } from '../../database';
import { getActiveTaskCount } from '../../modules/scheduler';

export function createStatsRoutes(): Router {
    const router = Router();

    router.get('/', (_req: Request, res: Response): void => {
        try {
            const db = getDb();

            const totalPosts = (db.prepare(
                'SELECT COUNT(*) as count FROM scheduled_posts WHERE is_active = 1'
            ).get() as { count: number }).count;

            const totalWarnings = (db.prepare(
                'SELECT COUNT(*) as count FROM user_warnings'
            ).get() as { count: number }).count;

            const uniqueWarned = (db.prepare(
                'SELECT COUNT(DISTINCT user_id) as count FROM user_warnings'
            ).get() as { count: number }).count;

            const totalTriggers = (db.prepare(
                'SELECT COUNT(*) as count FROM triggers'
            ).get() as { count: number }).count;

            const activeJobs = getActiveTaskCount();

            res.json({
                stats: {
                    scheduledPosts: totalPosts,
                    activeJobs,
                    totalWarnings,
                    uniqueWarned,
                    totalTriggers,
                    serverTime: new Date().toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul' }),
                    uptime: process.uptime(),
                },
            });
        } catch (err: any) {
            res.status(500).json({ error: err.message });
        }
    });

    return router;
}
