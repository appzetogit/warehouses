/**
 * Removes the data of the food-only features deleted from the code: dining and
 * table booking, the gourmet / under-250 promotions, add-ons, the saved menu
 * layout, cutlery, cuisines, pure-veg stores and veg-scoped categories.
 *
 * Run after 2026-09-rename-restaurant-to-seller.mjs.
 *
 *   node scripts/migrations/2026-09-remove-food-only-features.mjs           # dry run
 *   node scripts/migrations/2026-09-remove-food-only-features.mjs --apply   # write
 *
 * Take a mongodump first; restoring it is the undo.
 *
 * Products keep their veg / non-veg mark, which is now optional. Existing
 * products are left as they are: many were saved as 'Non-Veg' only because that
 * was the default, but nothing records which, so a seller or admin has to
 * correct those by hand (set them to "not applicable").
 */
import mongoose from 'mongoose';
import { config } from '../../src/config/env.js';

const DROPPED_COLLECTIONS = [
    'food_dining_categories',
    'food_dining_sellers',
    'food_dining_banners',
    'food_gourmet_sellers',
    'food_under250_banners',
    'food_addons',
    'food_seller_menus',
];

const UNSET_FIELDS = [
    ['food_sellers', {}, { diningSettings: '', menu: '', pureVegSeller: '', cuisines: '' }],
    ['food_categories', {}, { foodTypeScope: '' }],
    ['food_landing_settings', {}, { showUnder250: '', showDining: '', showGourmet: '' }],
    ['food_orders', {}, { sendCutlery: '', 'items.$[].addons': '' }],
];

/**
 * @param {import('mongodb').Db} db
 * @param {{ apply?: boolean, log?: (msg: string) => void }} [opts]
 */
export async function removeFoodOnlyFeatures(db, { apply = false, log = console.log } = {}) {
    const existing = new Set((await db.listCollections({}, { nameOnly: true }).toArray()).map((c) => c.name));
    const summary = { dropped: [], unset: {}, exploreIconsRemoved: 0 };

    for (const name of DROPPED_COLLECTIONS) {
        if (!existing.has(name)) continue;
        const count = await db.collection(name).countDocuments();
        log(`drop ${name} (${count} documents)`);
        summary.dropped.push(name);
        if (apply) await db.collection(name).drop();
    }

    for (const [name, filter, fields] of UNSET_FIELDS) {
        if (!existing.has(name)) continue;
        const coll = db.collection(name);
        // Only documents that actually carry one of the fields.
        const topLevel = Object.keys(fields).map((f) => f.replace('.$[]', ''));
        const match = { ...filter, $or: topLevel.map((f) => ({ [f]: { $exists: true } })) };
        const count = await coll.countDocuments(match);
        if (!count) continue;
        log(`${name}: unset ${Object.keys(fields).join(', ')} on ${count} documents`);
        summary.unset[name] = count;
        if (apply) {
            // `items.$[].addons` fails on an order with no items array, so the
            // array path runs only where one exists.
            const scalar = Object.fromEntries(Object.entries(fields).filter(([f]) => !f.includes('$[]')));
            const arrayPaths = Object.fromEntries(Object.entries(fields).filter(([f]) => f.includes('$[]')));
            if (Object.keys(scalar).length) await coll.updateMany(match, { $unset: scalar });
            if (Object.keys(arrayPaths).length) {
                await coll.updateMany({ ...filter, 'items.0': { $exists: true } }, { $unset: arrayPaths });
            }
        }
    }

    // Explore icons pointing at the deleted gourmet page would link nowhere.
    if (existing.has('food_explore_icons')) {
        const coll = db.collection('food_explore_icons');
        const count = await coll.countDocuments({ type: 'gourmet' });
        if (count) {
            log(`food_explore_icons: remove ${count} gourmet icons`);
            summary.exploreIconsRemoved = count;
            if (apply) await coll.deleteMany({ type: 'gourmet' });
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
    await removeFoodOnlyFeatures(mongoose.connection.db, { apply });
    await mongoose.disconnect();
}
