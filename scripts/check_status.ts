import { getDb } from '../src/database';
import { defaults } from '../src/modules/antispam/wordFilter';

async function main() {
    const db = getDb();

    console.log('Gruplar ve Koruma Durumları:');

    const groups = db.prepare('SELECT chat_id, title FROM known_groups').all() as { chat_id: string, title: string }[];
    const configs = db.prepare('SELECT chat_id, blacklisted_words FROM spam_config').all() as { chat_id: string, blacklisted_words: string }[];

    for (const group of groups) {
        const config = configs.find(c => c.chat_id === group.chat_id);
        const hasCustomConfig = !!config;

        let words = [];
        if (hasCustomConfig && config.blacklisted_words) {
            words = config.blacklisted_words.split(',').map(w => w.trim());
        } else {
            words = defaults;
        }

        const protectsBcGame = words.some(w => w.includes('bcgame') || w.includes('bc.game'));

        console.log(`- ${group.title} (ID: ${group.chat_id})`);
        console.log(`  Durum: ${hasCustomConfig ? 'Özel Ayar' : 'Varsayılan Ayar'}`);
        console.log(`  Koruma: ${protectsBcGame ? '✅ AKTİF (bcgame engelleniyor)' : '❌ AKTİF DEĞİL'}`);
        if (!protectsBcGame) {
            console.log('  Eksik Kelimeler var!');
        }
    }
}

main().catch(console.error);
