import { Router, Request, Response } from 'express';
import { addTrigger, listTriggers, removeTrigger } from '../../modules/triggers';
import { config } from '../../config';

export function createTriggerRoutes(): Router {
    const router = Router();

    // Trigger'ları listele
    router.get('/', (_req: Request, res: Response): void => {
        try {
            // Tüm chat'lerdeki trigger'ları al (channelChatId veya tüm gruplar)
            const triggers = config.channelChatId
                ? listTriggers(config.channelChatId)
                : [];

            // Ayrıca grup trigger'larını da al
            const { getDb } = require('../../database');
            const db = getDb();
            const allTriggers = db.prepare('SELECT * FROM triggers ORDER BY trigger_word').all() as any[];

            res.json({ triggers: allTriggers });
        } catch (err: any) {
            res.status(500).json({ error: err.message });
        }
    });

    // Trigger ekle
    router.post('/', (req: Request, res: Response): void => {
        try {
            const { triggerWord, response, chatId } = req.body;

            if (!triggerWord || !response) {
                res.status(400).json({ error: 'Tetikleyici ve cevap gerekli' });
                return;
            }

            const targetChat = chatId || config.channelChatId;
            if (!targetChat) {
                res.status(400).json({ error: 'Chat ID belirtilmedi' });
                return;
            }

            let word = triggerWord.toLowerCase().trim();
            if (!word.startsWith('!')) {
                word = '!' + word;
            }

            const trigger = addTrigger(targetChat, word, response, 0);
            if (trigger) {
                res.json({ success: true, trigger });
            } else {
                res.status(500).json({ error: 'Trigger oluşturulamadı' });
            }
        } catch (err: any) {
            res.status(500).json({ error: err.message });
        }
    });

    // Trigger sil
    router.delete('/:chatId/:word', (req: Request, res: Response): void => {
        try {
            const { chatId, word } = req.params;
            let triggerWord = decodeURIComponent(word).toLowerCase();
            if (!triggerWord.startsWith('!')) {
                triggerWord = '!' + triggerWord;
            }

            const removed = removeTrigger(chatId, triggerWord);
            if (removed) {
                res.json({ success: true, message: `${triggerWord} silindi` });
            } else {
                res.status(404).json({ error: `${triggerWord} bulunamadı` });
            }
        } catch (err: any) {
            res.status(500).json({ error: err.message });
        }
    });

    return router;
}
