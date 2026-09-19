/**
 * Moves the database from "restaurant" to "seller", matching the code rename.
 *
 *   node scripts/migrations/2026-09-rename-restaurant-to-seller.mjs           # dry run
 *   node scripts/migrations/2026-09-rename-restaurant-to-seller.mjs --apply   # write
 *
 * Take a mongodump first; restoring it is the undo. Sellers must sign in again
 * afterwards, because their access tokens carry the old role name.
 */
import mongoose from 'mongoose';
import { config } from '../../src/config/env.js';
import { renameTokensInDb } from './lib/renameTokens.mjs';

export const restaurantToSeller = (s) =>
    s.replace(/restaurant/gi, (m) => (m === 'RESTAURANT' ? 'SELLER' : m[0] === 'R' ? 'Seller' : 'seller'));

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
    const summary = await renameTokensInDb(mongoose.connection.db, restaurantToSeller, { apply });
    console.log(`${summary.collections.length} collections, ${summary.documents} documents, ${summary.indexes} indexes`);
    await mongoose.disconnect();
}
