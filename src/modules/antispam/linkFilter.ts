import { Context } from 'grammy';
import { isAdmin } from '../../config';
import { getDb } from '../../database';
import { SpamConfig } from '../../database/models';

const URL_REGEX = /https?:\/\/[^\s]+|www\.[^\s]+|[a-zA-Z0-9-]+\.(com|net|org|io|me|co|xyz|info|biz|ru|cn|tk|ml|ga|cf|gq|top)\b/gi;

function getWhitelistedDomains(chatId: string): string[] {
    const db = getDb();
    const row = db.prepare('SELECT whitelisted_domains FROM spam_config WHERE chat_id = ?').get(chatId) as SpamConfig | undefined;
    if (!row || !row.whitelisted_domains) return [];
    return row.whitelisted_domains.split(',').map((d) => d.trim().toLowerCase()).filter(Boolean);
}

function isDomainWhitelisted(url: string, whitelist: string[]): boolean {
    if (whitelist.length === 0) return false;
    const lowerUrl = url.toLowerCase();
    return whitelist.some((domain) => lowerUrl.includes(domain));
}

export async function checkLinks(ctx: Context): Promise<boolean> {
    const userId = ctx.from?.id;
    const chatId = ctx.chat?.id;
    if (!userId || !chatId) return false;
    if (isAdmin(userId)) return false;

    const text = ctx.message?.text || ctx.message?.caption || '';
    if (!text) return false;

    const matches = text.match(URL_REGEX);
    if (!matches || matches.length === 0) return false;

    const whitelist = getWhitelistedDomains(String(chatId));

    // Tüm linkler whitelist'te mi kontrol et
    const hasBlockedLink = matches.some((url) => !isDomainWhitelisted(url, whitelist));

    if (hasBlockedLink) {
        try {
            await ctx.deleteMessage();
        } catch (err) {
            console.error('Link filtreleme sırasında hata:', err);
        }
        return true;
    }

    return false;
}
