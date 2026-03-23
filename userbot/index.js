const { TelegramClient } = require('telegram');
const { StringSession } = require('telegram/sessions');
const { NewMessage } = require('telegram/events');
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const API_ID = 30178332;
const API_HASH = '0d79283a1ebf92153650db33a8c833bf';
const SESSION_FILE = path.join(__dirname, 'session.txt');
const DB_PATH = path.join(__dirname, '..', 'guard-bot.db');

const SOURCE_CHANNEL = 'Hitbetresmi';
const TARGET_CHANNEL = '@cerrahvip';
const MAX_DAILY = 4;

const KEYWORDS = [
    'happy hour', 'happyhour',
    'freespin', 'free spin',
    'freebet', 'free bet',
    'süper oran', 'özel oran',
];

function isRelevant(text) {
    const lower = (text || '').toLowerCase();
    return KEYWORDS.some(kw => lower.includes(kw));
}

function getDailyCount() {
    const db = new Database(DB_PATH);
    const today = new Date().toISOString().split('T')[0];
    const row = db.prepare('SELECT count FROM hitbet_daily_count WHERE date = ?').get(today);
    db.close();
    return row?.count || 0;
}

function incrementDailyCount() {
    const db = new Database(DB_PATH);
    const today = new Date().toISOString().split('T')[0];
    db.prepare('INSERT INTO hitbet_daily_count (date, count) VALUES (?, 1) ON CONFLICT(date) DO UPDATE SET count = count + 1').run(today);
    db.close();
}

function hasBeenSeen(msgId) {
    const db = new Database(DB_PATH);
    const exists = !!db.prepare('SELECT 1 FROM hitbet_seen_posts WHERE post_id = ?').get(String(msgId));
    db.close();
    return exists;
}

function markAsSeen(msgId) {
    const db = new Database(DB_PATH);
    db.prepare('INSERT OR IGNORE INTO hitbet_seen_posts (post_id) VALUES (?)').run(String(msgId));
    db.close();
}

async function main() {
    const sessionString = fs.existsSync(SESSION_FILE)
        ? fs.readFileSync(SESSION_FILE, 'utf8').trim()
        : '';

    const session = new StringSession(sessionString);
    const client = new TelegramClient(session, API_ID, API_HASH, {
        connectionRetries: 5,
    });

    await client.start({
        phoneNumber: async () => {
            process.stdout.write('Telefon numaranız (+905xxxxxxxxx): ');
            return await new Promise(resolve => {
                process.stdin.once('data', d => resolve(d.toString().trim()));
            });
        },
        password: async () => {
            process.stdout.write('2FA şifreniz (varsa): ');
            return await new Promise(resolve => {
                process.stdin.once('data', d => resolve(d.toString().trim()));
            });
        },
        phoneCode: async () => {
            process.stdout.write('Telegram\'dan gelen kod: ');
            return await new Promise(resolve => {
                process.stdin.once('data', d => resolve(d.toString().trim()));
            });
        },
        onError: (err) => console.error('Auth hatası:', err),
    });

    // Session kaydet
    const newSession = client.session.save();
    fs.writeFileSync(SESSION_FILE, newSession);
    console.log('✅ Giriş başarılı, session kaydedildi.');

    // @Hitbetresmi kanalını dinle
    client.addEventHandler(async (event) => {
        const msg = event.message;
        if (!msg) return;

        const text = msg.text || msg.caption || '';
        const msgId = msg.id;

        if (hasBeenSeen(msgId)) return;
        markAsSeen(msgId);

        if (!isRelevant(text)) return;

        const daily = getDailyCount();
        if (daily >= MAX_DAILY) {
            console.log(`[Userbot] Günlük limit (${MAX_DAILY}) doldu.`);
            return;
        }

        try {
            await client.forwardMessages(TARGET_CHANNEL, {
                messages: [msgId],
                fromPeer: SOURCE_CHANNEL,
            });
            incrementDailyCount();
            console.log(`[Userbot] ✅ Mesaj #${msgId} iletildi. Günlük: ${daily + 1}/${MAX_DAILY}`);
        } catch (err) {
            console.error(`[Userbot] ❌ Mesaj #${msgId} iletilemedi:`, err.message);
        }
    }, new NewMessage({ chats: [SOURCE_CHANNEL] }));

    console.log(`🤖 Userbot aktif — @${SOURCE_CHANNEL} dinleniyor...`);

    // Bağlantıyı canlı tut
    await new Promise(() => {});
}

main().catch(console.error);
