export interface ScheduledPost {
    id: number;
    chat_id: string;
    content: string;
    cron_expression: string;
    is_active: number; // 0 or 1 (SQLite boolean)
    image_path: string | null;
    media_file_id?: string | null;
    buttons_json: string | null; // JSON array of {text, url}
    created_by: number;
    created_at: string;
    updated_at: string;
}

export interface UserWarning {
    id: number;
    user_id: number;
    chat_id: string;
    reason: string;
    warned_by: number;
    created_at: string;
}

export interface SpamConfig {
    chat_id: string;
    rate_limit_enabled: number;
    captcha_enabled: number;
    link_filter_enabled: number;
    word_filter_enabled: number;
    duplicate_filter_enabled: number;
    whitelisted_domains: string; // comma-separated
    blacklisted_words: string; // comma-separated
    updated_at: string;
}
