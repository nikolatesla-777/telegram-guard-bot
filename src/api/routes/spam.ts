import { Router, Request, Response } from 'express';
import { getDb } from '../../database';
import { SpamConfig } from '../../database/models';
import { defaults as defaultBlacklist } from '../../modules/antispam/wordFilter';

export function createSpamRoutes(): Router {
    const router = Router();

    // GET /api/spam
    router.get('/', (req: Request, res: Response): void => {
        try {
            const db = getDb();
            // Varsayılan olarak tüm chat'ler için veya belirli bir chat için config
            // Şimdilik tek bir config varsayalım (veya query param ile chat_id alabiliriz)
            // Admin panelinde genellikle genel bir ayar veya belirli bir ana grup ayarı istenir.
            // Database şeması chat_id bazlı.

            // config.ts dosyasından ana kanal ID'sini alabiliriz ama dashboard'da hangi chat yönetiliyor?
            // Şimdilik veritabanındaki ilk config'i veya varsayılanı döndürelim.
            // Veya frontend text input ile chat_id isteyebilir.
            // Ancak kullanıcı kolaylığı için, bilinen gruplardan birini seçtirmek daha iyi.

            // Basitlik için: Eğer query'de chatId varsa onu, yoksa ilk bulunanı getir.
            let chatId = req.query.chatId as string;

            if (!chatId) {
                const group = db.prepare('SELECT chat_id FROM known_groups LIMIT 1').get() as { chat_id: string } | undefined;
                if (group) chatId = group.chat_id;
            }

            if (!chatId) {
                res.json({
                    config: {
                        chat_id: '',
                        rate_limit_enabled: 1,
                        captcha_enabled: 1,
                        link_filter_enabled: 1,
                        word_filter_enabled: 1,
                        duplicate_filter_enabled: 1,
                        whitelisted_domains: '',
                        blacklisted_words: '',
                    },
                    groups: []
                });
                return;
            }

            const configRow = db.prepare('SELECT * FROM spam_config WHERE chat_id = ?').get(chatId) as SpamConfig | undefined;
            const groups = db.prepare('SELECT chat_id, title FROM known_groups').all();

            const defaultConfig: SpamConfig = {
                chat_id: chatId,
                rate_limit_enabled: 1,
                captcha_enabled: 1,
                link_filter_enabled: 1,
                word_filter_enabled: 1,
                duplicate_filter_enabled: 1,
                whitelisted_domains: '',
                blacklisted_words: defaultBlacklist.join(', '),
                updated_at: new Date().toISOString()
            };

            res.json({ config: configRow || defaultConfig, groups });
        } catch (err: any) {
            res.status(500).json({ error: err.message });
        }
    });

    // POST /api/spam
    router.post('/', (req: Request, res: Response): void => {
        try {
            const {
                chat_id,
                rate_limit_enabled,
                captcha_enabled,
                link_filter_enabled,
                word_filter_enabled,
                duplicate_filter_enabled,
                whitelisted_domains,
                blacklisted_words
            } = req.body;

            if (!chat_id) {
                res.status(400).json({ error: 'Chat ID gerekli' });
                return;
            }

            const db = getDb();
            const now = new Date().toISOString();

            db.prepare(`
                INSERT INTO spam_config (
                    chat_id, rate_limit_enabled, captcha_enabled, link_filter_enabled,
                    word_filter_enabled, duplicate_filter_enabled, whitelisted_domains, blacklisted_words, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(chat_id) DO UPDATE SET
                    rate_limit_enabled = excluded.rate_limit_enabled,
                    captcha_enabled = excluded.captcha_enabled,
                    link_filter_enabled = excluded.link_filter_enabled,
                    word_filter_enabled = excluded.word_filter_enabled,
                    duplicate_filter_enabled = excluded.duplicate_filter_enabled,
                    whitelisted_domains = excluded.whitelisted_domains,
                    blacklisted_words = excluded.blacklisted_words,
                    updated_at = excluded.updated_at
            `).run(
                chat_id,
                rate_limit_enabled ? 1 : 0,
                captcha_enabled ? 1 : 0,
                link_filter_enabled ? 1 : 0,
                word_filter_enabled ? 1 : 0,
                duplicate_filter_enabled ? 1 : 0,
                whitelisted_domains || '',
                blacklisted_words || '',
                now
            );

            res.json({ message: 'Ayarlar kaydedildi' });
        } catch (err: any) {
            res.status(500).json({ error: err.message });
        }
    });

    return router;
}
