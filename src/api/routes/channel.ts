import { Router, Request, Response } from 'express';
import { Buffer } from 'buffer';
import https from 'https';
import { Bot, Context } from 'grammy';
// ...
import { getDb } from '../../database';
import { config } from '../../config';



export function createChannelRoutes(bot: Bot<Context>): Router {
    const router = Router();

    // Fotoğraf proxy (token'ı gizlemek için)
    // Fotoğraf proxy (token'ı gizlemek için)
    // Query param kullanıyoruz: /api/channel/image?fileId=...
    router.get('/image', async (req: Request, res: Response): Promise<void> => {
        try {
            const fileId = req.query.fileId as string;
            if (!fileId) {
                res.status(400).send('fileId gerekli');
                return;
            }
            const file = await bot.api.getFile(fileId);
            if (!file.file_path) {
                res.status(404).send('File path not found');
                return;
            }

            const fileUrl = `https://api.telegram.org/file/bot${config.botToken}/${file.file_path}`;

            https.get(fileUrl, (stream) => {
                if (stream.statusCode !== 200) {
                    res.status(500).send('Failed to fetch image from Telegram');
                    return;
                }

                res.setHeader('Content-Type', stream.headers['content-type'] || 'image/jpeg');
                res.setHeader('Cache-Control', 'public, max-age=3600');

                stream.pipe(res);
            }).on('error', (err) => {
                console.error('HTTPS get error:', err);
                if (!res.headersSent) {
                    res.status(500).json({ error: 'HTTPS error', message: err.message, stack: err.stack, url: fileUrl });
                }
            });

        } catch (err: any) {
            console.error('Image proxy error:', err);
            if (!res.headersSent) {
                res.status(500).json({ error: 'Proxy handler error', message: err.message, stack: err.stack });
            }
        }
    });

    // Kanal gönderilerini listele (en yeniden en eskiye)
    router.get('/posts', (_req: Request, res: Response): void => {
        try {
            const db = getDb();
            const posts = db.prepare(`
                SELECT * FROM channel_posts
                WHERE chat_id = ?
                ORDER BY date DESC
                LIMIT 500
            `).all(config.channelChatId || '%') as any[];

            // channelChatId yoksa tüm kanallardan al
            let allPosts = config.channelChatId
                ? posts
                : db.prepare('SELECT * FROM channel_posts ORDER BY date DESC LIMIT 100').all() as any[];

            // raw_json'dan file_id'yi çıkar
            allPosts = allPosts.map(post => {
                let photoFileId = null;
                if (post.has_photo && post.raw_json) {
                    try {
                        const raw = JSON.parse(post.raw_json);
                        if (raw.photo && Array.isArray(raw.photo) && raw.photo.length > 0) {
                            // En büyük fotoğrafı al (sonuncusu)
                            photoFileId = raw.photo[raw.photo.length - 1].file_id;
                        }
                    } catch { }
                }
                return { ...post, photo_file_id: photoFileId };
            });

            res.json({ posts: allPosts });
        } catch (err: any) {
            res.status(500).json({ error: err.message });
        }
    });

    // Fotoğraf proxy (token'ı gizlemek için)
    // Fotoğraf proxy (token'ı gizlemek için)
    // Query param kullanıyoruz: /api/channel/image?fileId=...
    router.get('/image', async (req: Request, res: Response): Promise<void> => {
        try {
            const fileId = req.query.fileId as string;
            if (!fileId) {
                res.status(400).send('fileId gerekli');
                return;
            }
            const file = await bot.api.getFile(fileId);
            if (!file.file_path) {
                res.status(404).send('File path not found');
                return;
            }

            // Telegram'dan dosyayı indirip pipe et
            const fileUrl = `https://api.telegram.org/file/bot${config.botToken}/${file.file_path}`;
            const response = await fetch(fileUrl);

            if (!response.ok) {
                res.status(500).send('Failed to fetch image from Telegram');
                return;
            }

            // Headerları ayarla
            res.setHeader('Content-Type', response.headers.get('content-type') || 'image/jpeg');
            // Cache kontrolü (Telegram linkleri 1 saat geçerli ama file_path değişebilir)
            res.setHeader('Cache-Control', 'public, max-age=3600');



            // Express response'a pipe etmenin daha kolay yolu: arrayBuffer -> Buffer
            const arrayBuffer = await response.arrayBuffer();
            const buffer = Buffer.from(arrayBuffer);
            res.send(buffer);

        } catch (err: any) {
            console.error('Image proxy error:', err);
            res.status(500).send('Error fetching image: ' + err.message);
        }
    });

    // Bilinen grupları listele
    router.get('/groups', (_req: Request, res: Response): void => {
        try {
            const db = getDb();
            const groups = db.prepare('SELECT * FROM known_groups ORDER BY title ASC').all();
            res.json({ groups });
        } catch (err: any) {
            res.status(500).json({ error: err.message });
        }
    });

    // Mesajı gruplara ilet (forward)
    router.post('/forward', async (req: Request, res: Response): Promise<void> => {
        try {
            const { messageId, groupIds } = req.body;

            if (!messageId || !groupIds || !Array.isArray(groupIds) || groupIds.length === 0) {
                res.status(400).json({ error: 'messageId ve groupIds gerekli' });
                return;
            }

            // Kaynak chat_id'yi bul
            const db = getDb();
            const post = db.prepare('SELECT * FROM channel_posts WHERE message_id = ?').get(messageId) as any;
            if (!post) {
                res.status(404).json({ error: 'Gönderi bulunamadı' });
                return;
            }

            const results: { groupId: string; success: boolean; error?: string }[] = [];

            for (const groupId of groupIds) {
                try {
                    await bot.api.forwardMessage(groupId, post.chat_id, messageId);
                    results.push({ groupId, success: true });
                } catch (err: any) {
                    results.push({ groupId, success: false, error: err.message });
                }
            }

            const successCount = results.filter(r => r.success).length;
            res.json({
                success: true,
                message: `${successCount}/${groupIds.length} gruba iletildi`,
                results,
            });
        } catch (err: any) {
            res.status(500).json({ error: err.message });
        }
    });

    // Manuel grup ekle
    router.post('/groups', (req: Request, res: Response): void => {
        try {
            const { chatId, title } = req.body;
            if (!chatId || !title) {
                res.status(400).json({ error: 'chatId ve title gerekli' });
                return;
            }

            const db = getDb();
            db.prepare(`
                INSERT OR REPLACE INTO known_groups (chat_id, title, type, updated_at)
                VALUES (?, ?, 'supergroup', datetime('now'))
            `).run(String(chatId), title);

            res.json({ success: true, message: 'Grup eklendi' });
        } catch (err: any) {
            res.status(500).json({ error: err.message });
        }
    });

    // Grup sil
    router.delete('/groups/:chatId', (req: Request, res: Response): void => {
        try {
            const chatId = req.params.chatId as string;
            const db = getDb();
            db.prepare('DELETE FROM known_groups WHERE chat_id = ?').run(chatId);
            res.json({ success: true });
        } catch (err: any) {
            res.status(500).json({ error: err.message });
        }
    });

    // Geçmiş kanal mesajlarını çek (forward ile)
    router.post('/fetch-history', async (req: Request, res: Response): Promise<void> => {
        try {
            const channelChatId = config.channelChatId;
            if (!channelChatId) {
                res.status(400).json({ error: 'CHANNEL_CHAT_ID ayarlanmamış' });
                return;
            }

            const adminId = config.adminIds[0];
            if (!adminId) {
                res.status(400).json({ error: 'ADMIN_IDS ayarlanmamış — mesaj iletmek için admin ID gerekli' });
                return;
            }

            // Son mesaj ID'sini bul ve oradan devam et
            const db = getDb();
            const lastMsg = db.prepare('SELECT MAX(message_id) as maxRef FROM channel_posts WHERE chat_id = ?').get(channelChatId) as { maxRef: number } | undefined;
            const startId = (lastMsg?.maxRef || 0) + 1;
            const scanLimit = 5000;
            const absoluteMax = startId + scanLimit;

            console.log(`[FetchHistory] Başlangıç ID: ${startId}, Bitiş ID: ${absoluteMax}, Tarama Limiti: ${scanLimit}`);

            let fetched = 0;
            let errors = 0;
            let consecutiveFails = 0;

            // İlerlemeyi SSE değil, toplu olarak döndür. startId'den başlayıp +5000 kadar tara.
            for (let msgId = startId; msgId <= absoluteMax; msgId++) {
                // Zaten var mı kontrol et
                const existing = db.prepare(
                    'SELECT id FROM channel_posts WHERE chat_id = ? AND message_id = ?'
                ).get(channelChatId, msgId);
                if (existing) {
                    consecutiveFails = 0;
                    continue;
                }

                try {
                    // Forward ile mesaj içeriğini al
                    const forwarded = await bot.api.forwardMessage(adminId, channelChatId, msgId);

                    // DB'ye kaydet
                    db.prepare(`
                        INSERT OR REPLACE INTO channel_posts (message_id, chat_id, text, has_photo, has_video, has_document, caption, date, raw_json)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                    `).run(
                        msgId,
                        channelChatId,
                        forwarded.text || null,
                        forwarded.photo ? 1 : 0,
                        forwarded.video ? 1 : 0,
                        forwarded.document ? 1 : 0,
                        forwarded.caption || null,
                        forwarded.date,
                        JSON.stringify(forwarded),
                    );

                    // Forwarded mesajı admin chatinden sil
                    try {
                        await bot.api.deleteMessage(adminId, forwarded.message_id);
                    } catch { }

                    fetched++;
                    consecutiveFails = 0;

                    // Rate limit: 50ms bekleme (saniyede ~20 mesaj)
                    await new Promise(r => setTimeout(r, 50));
                } catch {
                    errors++;
                    consecutiveFails++;

                    // 3000 arka arkaya başarısız = muhtemelen son mesaja ulaştık veya büyük bir boşluk var
                    // 2706 - 500 = 2200 boşluk olabilir.
                    if (consecutiveFails >= 3000) {
                        break;
                    }

                    // Rate limit koruması
                    await new Promise(r => setTimeout(r, 30));
                }
            }

            res.json({
                success: true,
                message: `${fetched} mesaj çekildi (${errors} atlanan)`,
                fetched,
                errors,
            });
        } catch (err: any) {
            res.status(500).json({ error: err.message });
        }
    });


    // ═══════════════════════════════════════════
    // Otomatik İletim Ayarları
    // ═══════════════════════════════════════════

    // Listele
    router.get('/auto-forward', (_req: Request, res: Response): void => {
        try {
            const db = getDb();
            const configs = db.prepare('SELECT * FROM auto_forward_config').all();
            res.json({ configs });
        } catch (err: any) {
            res.status(500).json({ error: err.message });
        }
    });

    // Ekle / Güncelle
    router.post('/auto-forward', (req: Request, res: Response): void => {
        try {
            const { targetChatId, enable } = req.body;
            if (!targetChatId) {
                res.status(400).json({ error: 'targetChatId gerekli' });
                return;
            }

            const sourceChatId = config.channelChatId; // Tek kanal varsayımı
            if (!sourceChatId) {
                res.status(400).json({ error: 'Kanal ID ayarlanmamış' });
                return;
            }

            const db = getDb();
            if (enable) {
                db.prepare(`
                    INSERT OR IGNORE INTO auto_forward_config (source_chat_id, target_chat_id, created_at)
                    VALUES (?, ?, datetime('now'))
                `).run(sourceChatId, targetChatId);
                res.json({ success: true, message: 'Otomatik iletim açıldı' });
            } else {
                db.prepare(`
                    DELETE FROM auto_forward_config WHERE source_chat_id = ? AND target_chat_id = ?
                `).run(sourceChatId, targetChatId);
                res.json({ success: true, message: 'Otomatik iletim kapatıldı' });
            }
        } catch (err: any) {
            res.status(500).json({ error: err.message });
        }
    });

    return router;
}
