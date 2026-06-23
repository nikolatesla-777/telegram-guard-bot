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

// ═══════════════════════════════════════════
// Tahmin Oyunu modelleri
// ═══════════════════════════════════════════

export interface PredictionUser {
    user_id: number;
    username: string | null;
    first_name: string | null;
    total_points: number;
    total_predictions: number;
    correct_predictions: number;
    created_at: string;
    updated_at: string;
}

export interface PredictionMatch {
    id: number;
    espn_event_id: string;
    espn_league_id: string;
    home_team: string;
    away_team: string;
    league: string;
    start_time: number; // Unix ms
    status: 'scheduled' | 'live' | 'finished';
    home_score: number | null;
    away_score: number | null;
    result: '1' | 'X' | '2' | null; // 1=ev sahibi, X=beraberlik, 2=deplasman
    result_announced: number; // 0 or 1
    created_at: string;
    updated_at: string;
}

export interface PredictionPoll {
    id: number;
    match_id: number;
    chat_id: string;
    poll_message_id: number;
    telegram_poll_id: string;
    sent_at: string;
}

export interface PredictionVote {
    id: number;
    user_id: number;
    match_id: number;
    vote: '1' | 'X' | '2';
    is_correct: number | null; // null=pending, 0=yanlış, 1=doğru
    created_at: string;
}

export interface LeaderboardEntry {
    user_id: number;
    username: string | null;
    first_name: string | null;
    total_points: number;
    total_predictions: number;
    correct_predictions: number;
}
