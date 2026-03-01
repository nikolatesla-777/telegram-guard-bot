import dotenv from 'dotenv';

dotenv.config();

interface Config {
    botToken: string;
    adminIds: number[];
    // API
    apiKey: string;
    apiPort: number;
    channelChatId: string;
    // Anti-spam defaults
    rateLimitWindow: number;
    rateLimitMax: number;
    captchaTimeout: number;
    duplicateThreshold: number;
    warnLimit: number;
}

function getEnvOrThrow(key: string): string {
    const value = process.env[key];
    if (!value) {
        throw new Error(`❌ Ortam değişkeni eksik: ${key}. Lütfen .env dosyasını kontrol edin.`);
    }
    return value;
}

function getEnvNumber(key: string, defaultValue: number): number {
    const value = process.env[key];
    if (!value) return defaultValue;
    const parsed = parseInt(value, 10);
    if (isNaN(parsed)) return defaultValue;
    return parsed;
}

export const config: Config = {
    botToken: getEnvOrThrow('BOT_TOKEN'),
    adminIds: (process.env.ADMIN_IDS || '')
        .split(',')
        .map((id) => parseInt(id.trim(), 10))
        .filter((id) => !isNaN(id)),

    apiKey: process.env.API_KEY || 'oc-guard-2024-secret',
    apiPort: getEnvNumber('API_PORT', 3001),
    channelChatId: process.env.CHANNEL_CHAT_ID || '',

    rateLimitWindow: getEnvNumber('RATE_LIMIT_WINDOW', 10),
    rateLimitMax: getEnvNumber('RATE_LIMIT_MAX', 5),
    captchaTimeout: getEnvNumber('CAPTCHA_TIMEOUT', 60),
    duplicateThreshold: getEnvNumber('DUPLICATE_THRESHOLD', 3),
    warnLimit: getEnvNumber('WARN_LIMIT', 3),
};

export function isAdmin(userId: number): boolean {
    return config.adminIds.includes(userId);
}

