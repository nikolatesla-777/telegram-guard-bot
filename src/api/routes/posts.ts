import { Router, Request, Response } from 'express';
import { Bot, Context, InputFile } from 'grammy';
import { InlineKeyboard } from 'grammy';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import { config } from '../../config';
import { getDb } from '../../database';
import {
    addPost,
    listPosts,
    removePost,
    schedulePost,
    unschedulePost,
} from '../../modules/scheduler';
import { cronToHuman } from '../../utils/helpers';
import cron from 'node-cron';

// Multer konfigürasyonu
const uploadDir = path.join(__dirname, '..', '..', '..', 'uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, uploadDir),
    filename: (_req, file, cb) => {
        const ext = path.extname(file.originalname);
        cb(null, `${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`);
    },
});

const upload = multer({
    storage,
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
    fileFilter: (_req, file, cb) => {
        if (file.mimetype.startsWith('image/')) {
            cb(null, true);
        } else {
            cb(new Error('Sadece resim dosyaları kabul edilir'));
        }
    },
});

// Inline keyboard oluştur
function buildInlineKeyboard(buttons: { text: string; url: string }[]): InlineKeyboard | undefined {
    if (!buttons || buttons.length === 0) return undefined;
    const keyboard = new InlineKeyboard();
    for (const btn of buttons) {
        if (btn.text && btn.url) {
            keyboard.url(btn.text, btn.url).row();
        }
    }
    return keyboard;
}

export function createPostRoutes(bot: Bot<Context>): Router {
    const router = Router();

    // Kanala anında gönderi gönder (metin + görsel + buton)
    router.post('/send', upload.single('image'), async (req: Request, res: Response): Promise<void> => {
        try {
            const { message, chatId, parseMode } = req.body;
            let buttons: { text: string; url: string }[] = [];

            try {
                buttons = JSON.parse(req.body.buttons || '[]');
            } catch { buttons = []; }

            const targetChat = chatId || config.channelChatId;
            if (!targetChat) {
                res.status(400).json({ error: 'Hedef chat ID belirtilmedi' });
                return;
            }

            const keyboard = buildInlineKeyboard(buttons);
            const file = req.file;

            let sentMessage;

            if (file) {
                // Görsel gönder (caption ile)
                const inputFile = new InputFile(file.path);
                try {
                    sentMessage = await bot.api.sendPhoto(targetChat, inputFile, {
                        caption: message || '',
                        parse_mode: parseMode || 'Markdown',
                        reply_markup: keyboard,
                    });
                } catch (err) {
                    // Markdown hatası ise düz metin
                    sentMessage = await bot.api.sendPhoto(targetChat, new InputFile(file.path), {
                        caption: message || '',
                        reply_markup: keyboard,
                    });
                }

                // Dosya temizle
                try { fs.unlinkSync(file.path); } catch { }

            } else {
                // Sadece metin gönder
                if (!message) {
                    res.status(400).json({ error: 'Mesaj veya görsel gerekli' });
                    return;
                }

                try {
                    sentMessage = await bot.api.sendMessage(targetChat, message, {
                        parse_mode: parseMode || 'Markdown',
                        reply_markup: keyboard,
                    });
                } catch (err) {
                    sentMessage = await bot.api.sendMessage(targetChat, message, {
                        reply_markup: keyboard,
                    });
                }
            }

            // ════════════════════════════════════════════════════════════
            // VERİTABANINA KAYDET VE OTOMATİK İLET (AUTO-FORWARD)
            // ════════════════════════════════════════════════════════════
            if (sentMessage) {
                try {
                    const db = getDb();
                    // Casting to any to avoid TS errors with Union types (Message)
                    const msgAny = sentMessage as any; // <--- FIX

                    // Dashboard @username ile sorguladığı için, varsa username'i kaydet
                    const dbChatId = msgAny.chat.username ? `@${msgAny.chat.username}` : String(msgAny.chat.id);

                    db.prepare(`
                        INSERT OR REPLACE INTO channel_posts (message_id, chat_id, text, has_photo, has_video, has_document, caption, date, raw_json)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                    `).run(
                        msgAny.message_id,
                        dbChatId,
                        msgAny.text || null,
                        msgAny.photo ? 1 : 0,
                        msgAny.video ? 1 : 0,
                        msgAny.document ? 1 : 0,
                        msgAny.caption || null,
                        msgAny.date,
                        JSON.stringify(msgAny),
                    );

                    // Auto-Forward
                    const sourceId = String(msgAny.chat.id);
                    const sourceUsername = msgAny.chat.username ? `@${msgAny.chat.username}` : null;

                    let targets: { target_chat_id: string }[] = [];
                    if (sourceUsername) {
                        targets = db.prepare('SELECT target_chat_id FROM auto_forward_config WHERE source_chat_id = ? OR source_chat_id = ?').all(sourceId, sourceUsername) as { target_chat_id: string }[];
                    } else {
                        targets = db.prepare('SELECT target_chat_id FROM auto_forward_config WHERE source_chat_id = ?').all(sourceId) as { target_chat_id: string }[];
                    }

                    if (targets.length > 0) {
                        const results = await Promise.allSettled(targets.map(t =>
                            bot.api.forwardMessage(t.target_chat_id, msgAny.chat.id, msgAny.message_id)
                        ));
                        console.log(`[Dashboard Post] ${results.filter(r => r.status === 'fulfilled').length}/${targets.length} gruba iletildi.`);
                    }

                } catch (dbErr) {
                    console.error('Dashboard post save/forward error:', dbErr);
                }
            }

            res.json({ success: true, message: 'Gönderi başarıyla gönderildi (ve iletildi)' });
        } catch (err: any) {
            console.error('Gönderi gönderme hatası:', err);
            res.status(500).json({ error: err.message || 'Gönderi gönderilemedi' });
        }
    });

    // Zamanlanmış gönderi ekle (görsel + buton destekli)
    router.post('/schedule', upload.single('image'), async (req: Request, res: Response): Promise<void> => {
        try {
            const { message, cronExpression, chatId, mediaFileId } = req.body;
            let buttons: { text: string; url: string }[] = [];
            try { buttons = JSON.parse(req.body.buttons || '[]'); } catch { buttons = []; }

            if (!message && !req.file && !mediaFileId) {
                res.status(400).json({ error: 'Mesaj veya görsel gerekli' });
                return;
            }

            if (!cronExpression) {
                res.status(400).json({ error: 'Cron ifadesi gerekli' });
                return;
            }

            if (!cron.validate(cronExpression)) {
                res.status(400).json({ error: 'Geçersiz cron ifadesi' });
                return;
            }

            const targetChat = chatId || config.channelChatId;
            if (!targetChat) {
                res.status(400).json({ error: 'Hedef chat ID belirtilmedi' });
                return;
            }

            // Görsel varsa kalıcı olarak sakla (zamanlanmış gönderi için)
            const imagePath = req.file ? req.file.path : null;
            const validButtons = buttons.filter(b => b.text?.trim() && b.url?.trim());
            const buttonsJson = validButtons.length > 0 ? JSON.stringify(validButtons) : null;

            const post = addPost(targetChat, message || '', cronExpression, 0, imagePath, buttonsJson, mediaFileId);
            const scheduled = schedulePost(bot, post);

            res.json({
                success: true,
                post: {
                    ...post,
                    humanCron: cronToHuman(cronExpression),
                },
                scheduled,
            });
        } catch (err: any) {
            res.status(500).json({ error: err.message || 'Gönderi zamanlanamadı' });
        }
    });

    // Zamanlanmış gönderileri listele
    router.get('/scheduled', (_req: Request, res: Response): void => {
        try {
            const targetChat = config.channelChatId;
            const db = getDb();

            const posts = targetChat
                ? listPosts(targetChat)
                : (db.prepare('SELECT * FROM scheduled_posts WHERE is_active = 1 ORDER BY created_at DESC').all() as any[]);

            const enriched = posts.map((p: any) => ({
                ...p,
                humanCron: cronToHuman(p.cron_expression),
            }));

            res.json({ posts: enriched });
        } catch (err: any) {
            res.status(500).json({ error: err.message });
        }
    });

    // Zamanlanmış gönderi sil
    router.delete('/scheduled/:id', (req: Request, res: Response): void => {
        try {
            const id = parseInt(req.params.id as string, 10);
            if (isNaN(id)) {
                res.status(400).json({ error: 'Geçersiz gönderi ID' });
                return;
            }

            const removed = removePost(id);
            if (removed) {
                unschedulePost(id);
                res.json({ success: true, message: `Gönderi #${id} silindi` });
            } else {
                res.status(404).json({ error: `Gönderi #${id} bulunamadı` });
            }
        } catch (err: any) {
            res.status(500).json({ error: err.message });
        }
    });

    return router;
}
