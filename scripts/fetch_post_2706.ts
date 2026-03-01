
import { Bot } from 'grammy';
import { config } from '../src/config';
import { getDb } from '../src/database';

async function main() {
    console.log('Starting fetch...');
    const bot = new Bot(config.botToken);
    const db = getDb();
    const channelId = config.channelChatId;
    const adminId = config.adminIds[0];
    const msgId = 2706;

    console.log(`Fetching message ${msgId} from ${channelId} (admin: ${adminId})...`);

    if (!channelId || !adminId) {
        console.error('Missing CHANNEL_CHAT_ID or ADMIN_IDS');
        process.exit(1);
    }

    try {
        // 1. Forward to admin
        const forwarded = await bot.api.forwardMessage(adminId, channelId, msgId);
        console.log('Message forwarded successfully. Forward ID:', forwarded.message_id);

        // 2. Save to DB
        const stmt = db.prepare(`
            INSERT OR REPLACE INTO channel_posts (message_id, chat_id, text, has_photo, has_video, has_document, caption, date, raw_json)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        stmt.run(
            msgId,
            channelId,
            forwarded.text || null,
            (forwarded.photo || []).length > 0 ? 1 : 0,
            forwarded.video ? 1 : 0,
            forwarded.document ? 1 : 0,
            forwarded.caption || null,
            forwarded.date,
            JSON.stringify(forwarded),
        );
        console.log('Message saved to database.');

        // 3. Cleanup (delete forwarded copy)
        try {
            await bot.api.deleteMessage(adminId, forwarded.message_id);
            console.log('Cleanup successful (deleted forwarded copy).');
        } catch (delErr) {
            console.warn('Could not delete forwarded message:', delErr);
        }

    } catch (e) {
        console.error('Failed to fetch message:', e);
    }
}

main();
