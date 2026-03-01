import { getDb } from '../../database';
import { ScheduledPost } from '../../database/models';

export function addPost(
    chatId: string,
    content: string,
    cronExpression: string,
    createdBy: number,
    imagePath?: string | null,
    buttonsJson?: string | null,
    mediaFileId?: string | null,
): ScheduledPost {
    const db = getDb();
    const stmt = db.prepare(`
    INSERT INTO scheduled_posts (chat_id, content, cron_expression, is_active, image_path, media_file_id, buttons_json, created_by)
    VALUES (?, ?, ?, 1, ?, ?, ?, ?)
  `);
    const result = stmt.run(chatId, content, cronExpression, imagePath || null, mediaFileId || null, buttonsJson || null, createdBy);

    return db.prepare('SELECT * FROM scheduled_posts WHERE id = ?').get(result.lastInsertRowid) as ScheduledPost;
}

export function listPosts(chatId?: string): ScheduledPost[] {
    const db = getDb();
    if (chatId) {
        return db.prepare('SELECT * FROM scheduled_posts WHERE chat_id = ? AND is_active = 1 ORDER BY id DESC').all(chatId) as ScheduledPost[];
    }
    return db.prepare('SELECT * FROM scheduled_posts WHERE is_active = 1 ORDER BY id DESC').all() as ScheduledPost[];
}

export function getPostById(id: number): ScheduledPost | undefined {
    const db = getDb();
    return db.prepare('SELECT * FROM scheduled_posts WHERE id = ?').get(id) as ScheduledPost | undefined;
}

export function removePost(id: number): boolean {
    const db = getDb();
    const result = db.prepare('UPDATE scheduled_posts SET is_active = 0, updated_at = datetime("now") WHERE id = ?').run(id);
    return result.changes > 0;
}

export function togglePost(id: number, active: boolean): boolean {
    const db = getDb();
    const result = db.prepare('UPDATE scheduled_posts SET is_active = ?, updated_at = datetime("now") WHERE id = ?').run(active ? 1 : 0, id);
    return result.changes > 0;
}
