import { getDb } from '../src/database';
import { defaults } from '../src/modules/antispam/wordFilter';

async function main() {
    const db = getDb();

    console.log('Spam yapılandırmaları güncelleniyor...');

    const configs = db.prepare('SELECT chat_id, blacklisted_words FROM spam_config').all() as { chat_id: string, blacklisted_words: string }[];

    for (const config of configs) {
        let currentWords = config.blacklisted_words ? config.blacklisted_words.split(',').map(w => w.trim()) : [];
        let updated = false;

        for (const word of defaults) {
            if (!currentWords.includes(word)) {
                currentWords.push(word);
                updated = true;
            }
        }

        if (updated) {
            const newString = currentWords.join(', ');
            db.prepare('UPDATE spam_config SET blacklisted_words = ? WHERE chat_id = ?')
                .run(newString, config.chat_id);
            console.log(`✅ Chat ID ${config.chat_id} için blacklist güncellendi.`);
        } else {
            console.log(`ℹ️ Chat ID ${config.chat_id} zaten güncel.`);
        }
    }

    console.log('İşlem tamamlandı.');
}

main().catch(console.error);
