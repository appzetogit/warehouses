/**
 * Replaces the bare value "food" that 2026-09-rename-food.mjs deliberately
 * left alone, now that the code no longer writes it:
 *
 *   admins.servicesAccess        'food' -> 'commerce'
 *   payments.module              'food' -> 'commerce'
 *   transactions.module          'food' -> 'commerce'
 *   user_favorites.entityType    'food' -> 'product'
 *
 * Uploaded files are not moved. New uploads go to folders without the food/
 * prefix, but the old files stay where they are and the full URLs stored for
 * them keep working.
 *
 * Run after 2026-09-rename-food.mjs.
 *
 *   node scripts/migrations/2026-09-rename-food-values.mjs           # dry run
 *   node scripts/migrations/2026-09-rename-food-values.mjs --apply   # write
 *
 * Take a mongodump first; restoring it is the undo.
 */
import mongoose from 'mongoose';
import { config } from '../../src/config/env.js';

/** [collection, field, from, to]. An array field is rewritten element by element. */
const RENAMES = [
    ['admins', 'servicesAccess', 'food', 'commerce'],
    ['payments', 'module', 'food', 'commerce'],
    ['transactions', 'module', 'food', 'commerce'],
    ['user_favorites', 'entityType', 'food', 'product'],
];

/**
 * @param {import('mongodb').Db} db
 * @param {{ apply?: boolean, log?: (msg: string) => void }} [opts]
 */
export async function renameFoodValues(db, { apply = false, log = console.log } = {}) {
    const existing = new Set((await db.listCollections({}, { nameOnly: true }).toArray()).map((c) => c.name));
    const summary = {};
    for (const [name, field, from, to] of RENAMES) {
        if (!existing.has(name)) continue;
        const coll = db.collection(name);
        const filter = { [field]: from };
        const count = await coll.countDocuments(filter);
        summary[`${name}.${field}`] = count;
        if (!count) continue;
        log(`${name}.${field}: ${count} documents '${from}' -> '${to}'`);
        if (!apply) continue;
        // $[el] handles an array field; for a scalar field a plain $set is enough.
        const sample = await coll.findOne(filter, { projection: { [field]: 1 } });
        if (Array.isArray(sample?.[field])) {
            await coll.updateMany(filter, { $set: { [`${field}.$[el]`]: to } }, { arrayFilters: [{ el: from }] });
        } else {
            await coll.updateMany(filter, { $set: { [field]: to } });
        }
    }
    return summary;
}

const isMain = import.meta.url === `file:///${process.argv[1]?.replace(/\\/g, '/')}`
    || import.meta.url === `file://${process.argv[1]}`;

if (isMain) {
    const apply = process.argv.includes('--apply');
    if (!config.mongodbUri) {
        console.error('MONGO_URI is not set');
        process.exit(1);
    }
    await mongoose.connect(config.mongodbUri);
    console.log(apply ? 'Applying.' : 'Dry run — nothing will be written. Pass --apply to write.');
    const summary = await renameFoodValues(mongoose.connection.db, { apply });
    console.log(summary);
    await mongoose.disconnect();
}
