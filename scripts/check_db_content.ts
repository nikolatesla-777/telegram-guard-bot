import { getDb } from '../src/database';

async function main() {
    console.log('Veritabanı kontrolü...');
    const db = getDb();

    const configs = db.prepare('SELECT * FROM auto_forward_config').all();
    console.log('Mevcut Auto-Forward Kuralları:', JSON.stringify(configs, null, 2));

    const groups = db.prepare('SELECT * FROM known_groups').all();
    console.log('Bilinen Gruplar:', JSON.stringify(groups, null, 2));
}

main();
