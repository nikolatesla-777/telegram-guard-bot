import express from 'express';
import cors from 'cors';
import path from 'path';
import { config } from '../config';
import { Bot, Context } from 'grammy';
import { createPostRoutes } from './routes/posts';
import { createTriggerRoutes } from './routes/triggers';
import { createStatsRoutes } from './routes/stats';
import { createChannelRoutes } from './routes/channel';
import { createSpamRoutes } from './routes/spam';

export function startApiServer(bot: Bot<Context>): void {
    const app = express();

    // Middleware
    app.use(cors());
    app.use(express.json({ limit: '10mb' }));

    // Serve dashboard static files
    const dashboardPath = path.join(__dirname, '..', '..', 'dashboard', 'dist');
    app.use(express.static(dashboardPath));

    // API key auth middleware
    const authMiddleware = (req: express.Request, res: express.Response, next: express.NextFunction): void => {
        // Public routes (images)
        if (req.method === 'GET' && req.originalUrl.startsWith('/api/channel/image')) {
            next();
            return;
        }

        const apiKey = req.headers['x-api-key'] as string;
        if (!apiKey || apiKey !== config.apiKey) {
            res.status(401).json({ error: 'Yetkisiz erişim' });
            return;
        }
        next();
    };

    // API routes
    app.use('/api/posts', authMiddleware, createPostRoutes(bot));
    app.use('/api/triggers', authMiddleware, createTriggerRoutes());
    app.use('/api/stats', authMiddleware, createStatsRoutes());
    app.use('/api/channel', authMiddleware, createChannelRoutes(bot));
    app.use('/api/spam', authMiddleware, createSpamRoutes());

    // SPA fallback
    app.get('/{*splat}', (_req, res) => {
        res.sendFile(path.join(dashboardPath, 'index.html'));
    });

    // Global Error Handler (JSON force)
    app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
        console.error('❌ API Error:', err);

        // Log to file
        try {
            const fs = require('fs');
            const path = require('path');
            const logPath = path.join(__dirname, '..', '..', 'api_errors.log');
            fs.appendFileSync(logPath, `[${new Date().toISOString()}] ${req.method} ${req.url}: ${err.message}\n${err.stack}\n\n`);
        } catch { }

        if (!res.headersSent) {
            res.status(500).json({ error: err.message || 'Internal Server Error' });
        }
    });

    app.listen(config.apiPort, () => {
        console.log(`🌐 Dashboard API: http://localhost:${config.apiPort}`);
    });
}
