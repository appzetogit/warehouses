/**
 * One-time backfill script: ensures all existing Seller documents have
 * `sessionVersions` populated with their current `tokenVersion`.
 *
 * This guarantees that older seller accounts created before multi-device session
 * versioning was shipped do not fall back to single-device session validation.
 *
 * Usage:
 *   node scripts/backfill-seller-session-versions.js
 */
import mongoose from 'mongoose';
import { config } from '../src/config/env.js';
import { Seller } from '../src/modules/commerce/seller/models/seller.model.js';
import { logger } from '../src/utils/logger.js';

async function run() {
    try {
        const uri = config.mongodbUri;
        if (!uri) {
            console.error('MONGO_URI is not configured.');
            process.exit(1);
        }

        console.log('Connecting to database...');
        await mongoose.connect(uri);
        console.log('Connected to MongoDB.');

        // Find sellers where sessionVersions is null, undefined, or empty array
        const candidates = await Seller.find({
            $or: [
                { sessionVersions: { $exists: false } },
                { sessionVersions: null },
                { sessionVersions: { $size: 0 } },
            ],
        }).select('_id sellerName tokenVersion sessionVersions');

        console.log(`Found ${candidates.length} seller(s) needing sessionVersions initialization.`);

        let updatedCount = 0;
        for (const seller of candidates) {
            const currentVersion = Number(seller.tokenVersion) || 0;
            await Seller.updateOne(
                { _id: seller._id },
                { $set: { sessionVersions: [currentVersion] } }
            );
            updatedCount += 1;
        }

        console.log(`Successfully backfilled sessionVersions for ${updatedCount} seller account(s).`);
        await mongoose.disconnect();
        console.log('Done.');
        process.exit(0);
    } catch (err) {
        console.error('Migration failed:', err);
        process.exit(1);
    }
}

run();
