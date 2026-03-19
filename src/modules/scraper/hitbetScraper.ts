import cron from 'node-cron';
import { Bot, Context } from 'grammy';
import { getDb } from '../../database';

const SOURCE_URL = 'https://t.me/s/Hitbetresmi';
const HITBET_CHANNEL_ID = -1001181924039;
const TARGET_CHAT = '@cerrahvip';
const MAX_DAILY = 4;

const KEYWORDS = [
    'happy hour', 'happyhour',
    'freespin', 'free spin',
    'freebet', 'free bet',
    'süper oran', 'özel oran',
];

function isRelevant(text: string): boolean {
    const lower = text.toLowerCase();
    return KEYWORDS.some(kw => lower.includes(kw));
}

function getDailyCount(): number {
    const db = getDb();
    const today = new Date().toISOString().split('T')[0];
    const row = db.prepare('SELECT count FROM hitbet_daily_count WHERE date = ?').get(today) as { count: number } | undefined;
    return row?.count || 0;
}

function incrementDailyCount(): void {
    const db = getDb();
    const today = new Date().toISOString().split('T')[0];
    db.prepare('INSERT INTO hitbet_daily_count (date, count) VALUES (?, 1) ON CONFLICT(date) DO UPDATE SET count = count + 1').run(today);
}

function hasBeenSeen(postId: string): boolean {
    const db = getDb();
    return !!(db.prepare('SELECT 1 FROM hitbet_seen_posts WHERE post_id = ?').get(postId));
}

function markAsSeen(postId: string): void {
    const db = getDb();
    db.prepare('INSERT OR IGNORE INTO hitbet_seen_posts (post_id) VALUES (?)').run(postId);
}

function decodeHtml(html: string): string {
    return html
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<[^>]+>/g, '')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&nbsp;/g, ' ')
        .trim();
}

interface ScrapedPost {
    id: string;
    text: string;
    imageUrl?: string;
}

async function scrapePosts(): Promise<ScrapedPost[]> {
    const res = await fetch(SOURCE_URL, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
    });
    const html = await res.text();
    const posts: ScrapedPost[] = [];

    // Her mesajı data-post ile ayır
    const parts = html.split(/data-post="Hitbetresmi\//);

    for (let i = 1; i < parts.length; i++) {
        const part = parts[i];

        const idMatch = part.match(/^(\d+)"/);
        if (!idMatch) continue;
        const id = idMatch[1];

        // Metin çıkar
        const textMatch = part.match(/class="tgme_widget_message_text[^"]*"[^>]*>([\s\S]*?)<\/div>/);
        const text = textMatch ? decodeHtml(textMatch[1]) : '';

        // Görsel URL çıkar (emoji URL'lerini atla)
        const imgMatch = part.match(/tgme_widget_message_photo_wrap[^>]*style="[^"]*background-image:url\('([^']+)'\)/);
        const rawImgUrl = imgMatch ? imgMatch[1] : undefined;
        const imageUrl = rawImgUrl && !rawImgUrl.includes('telegram.org/img/emoji')
            ? (rawImgUrl.startsWith('//') ? 'https:' + rawImgUrl : rawImgUrl)
            : undefined;

        if (text) {
            posts.push({ id, text, imageUrl });
        }
    }

    return posts; // En yeni en sonda
}

async function runScraper(bot: Bot<Context>): Promise<void> {
    const dailyCount = getDailyCount();
    if (dailyCount >= MAX_DAILY) {
        console.log(`[HitbetScraper] Günlük limit (${MAX_DAILY}) doldu.`);
        return;
    }

    let posts: ScrapedPost[];
    try {
        posts = await scrapePosts();
    } catch (err: any) {
        console.error('[HitbetScraper] Scrape hatası:', err.message);
        return;
    }

    let forwarded = 0;

    for (const post of posts) {
        if (getDailyCount() >= MAX_DAILY) break;
        if (hasBeenSeen(post.id)) continue;

        if (!isRelevant(post.text)) {
            markAsSeen(post.id);
            continue;
        }

        try {
            // Gerçek iletim (forward) yap
            await bot.api.forwardMessage(TARGET_CHAT, HITBET_CHANNEL_ID, Number(post.id));

            markAsSeen(post.id);
            incrementDailyCount();
            forwarded++;
            console.log(`[HitbetScraper] ✅ Post #${post.id} iletildi. Günlük: ${getDailyCount()}/${MAX_DAILY}`);

            // Gönderimler arası kısa bekleme
            await new Promise(resolve => setTimeout(resolve, 3000));
        } catch (err: any) {
            console.error(`[HitbetScraper] ❌ Post #${post.id} gönderilemedi:`, err.message);
            markAsSeen(post.id);
        }
    }

    if (forwarded > 0) {
        console.log(`[HitbetScraper] Toplam ${forwarded} gönderi iletildi.`);
    }
}

export function initHitbetScraper(bot: Bot<Context>): void {
    // Her 30 dakikada bir çalıştır
    cron.schedule('*/30 * * * *', async () => {
        try {
            await runScraper(bot);
        } catch (err) {
            console.error('[HitbetScraper] Hata:', err);
        }
    }, { timezone: 'Europe/Istanbul' });

    console.log('🔍 Hitbet scraper başlatıldı (30 dk\'da bir).');
}
