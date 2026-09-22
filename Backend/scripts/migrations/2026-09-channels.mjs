/**
 * Moves products and sellers to per-channel fields (Quick / Shop). See
 * CHANNELS_CONTRACT.md.
 *
 * Products (and each variant):
 *   stockQty, quickEligible, scalar lowStockThreshold / lowStockNotifiedAt
 *   -> channels { quick, shop }, stock { quick, shop },
 *      lowStockThreshold { quick, shop }, lowStockNotifiedAt { quick, shop }
 *   - quickEligible !== false: listed in both; the old count becomes the Quick
 *     count and Shop is left uncounted (null).
 *   - quickEligible === false: channels.quick = false; the old count becomes
 *     the Shop count.
 *   - a variant with quickEligible false is closed to Quick; a variant that
 *     opted in (true) on a Shop-only product keeps Quick for that variant only
 *     (the product opens Quick and its other variants are closed to it).
 *   - a product that was switched off by hand (isAvailable false while it
 *     still had stock) keeps that as stockOffMode 'manual'.
 *   availableIn / isAvailable are then recomputed from the new fields.
 *
 * Sellers without `channels`: approved sellers get both channels approved;
 * everyone else gets both 'none' (they apply per channel).
 *
 * Idempotent: only documents still in the old shape are touched.
 *
 *   node scripts/migrations/2026-09-channels.mjs           # dry run
 *   node scripts/migrations/2026-09-channels.mjs --apply   # write
 *
 * Take a mongodump first; restoring it is the undo.
 */
import mongoose from 'mongoose';
import { availableInPipeline, computeAvailableIn } from '../../src/modules/commerce/shared/channels.js';

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const numOrNull = (v) => (isNum(v) ? v : null);
const isPerChannel = (v) => v !== null && typeof v === 'object' && !Array.isArray(v) && !(v instanceof Date);

/** One channel's value in a {quick, shop} object, the other null. */
const inChannel = (channel, value) => ({ quick: channel === 'quick' ? value : null, shop: channel === 'shop' ? value : null });

const OLD_PRODUCT_SHAPE = {
    $or: [
        { stockQty: { $exists: true } },
        { quickEligible: { $exists: true } },
        { stock: { $exists: false } },
        { channels: { $exists: false } },
        { lowStockThreshold: { $not: { $type: 'object' } } },
        { 'variants.stockQty': { $exists: true } },
        { 'variants.quickEligible': { $exists: true } },
    ],
};

/** The new fields for one old-shape product. Pure, so it can be tested. */
export function convertProduct(doc) {
    const shopOnly = doc.quickEligible === false;
    const home = shopOnly ? 'shop' : 'quick';
    const variants = Array.isArray(doc.variants) ? doc.variants : [];
    const optIn = shopOnly && variants.some((v) => v?.quickEligible === true);

    const channels = isPerChannel(doc.channels) && doc.stockQty === undefined && doc.quickEligible === undefined
        ? { quick: doc.channels.quick !== false, shop: doc.channels.shop !== false }
        : { quick: !shopOnly || optIn, shop: true };

    const stock = isPerChannel(doc.stock) ? doc.stock : inChannel(home, numOrNull(doc.stockQty));
    const lowStockThreshold = isPerChannel(doc.lowStockThreshold)
        ? doc.lowStockThreshold
        : inChannel(home, numOrNull(doc.lowStockThreshold));
    const lowStockNotifiedAt = isPerChannel(doc.lowStockNotifiedAt)
        ? doc.lowStockNotifiedAt
        : inChannel(home, doc.lowStockNotifiedAt instanceof Date ? doc.lowStockNotifiedAt : null);

    const newVariants = variants.map((v) => {
        const { stockQty, quickEligible, ...rest } = v;
        let vChannels = isPerChannel(v.channels) ? v.channels : { quick: null, shop: null };
        if (quickEligible === false) vChannels = { ...vChannels, quick: false };
        if (optIn && quickEligible !== true) vChannels = { ...vChannels, quick: false };
        return {
            ...rest,
            channels: vChannels,
            stock: isPerChannel(v.stock) ? v.stock : inChannel(home, numOrNull(stockQty)),
            lowStockThreshold: isPerChannel(v.lowStockThreshold) ? v.lowStockThreshold : inChannel(home, numOrNull(v.lowStockThreshold)),
            lowStockNotifiedAt: isPerChannel(v.lowStockNotifiedAt)
                ? v.lowStockNotifiedAt
                : inChannel(home, v.lowStockNotifiedAt instanceof Date ? v.lowStockNotifiedAt : null),
        };
    });

    const next = { channels, stock, lowStockThreshold, lowStockNotifiedAt, variants: newVariants };

    // Switched off by hand, not sold out: keep it off through restocks.
    let stockOffMode = doc.stockOffMode ?? null;
    if (doc.isAvailable === false && !stockOffMode) {
        const sellable = computeAvailableIn({ ...doc, ...next, stockOffMode: null });
        if (sellable.quick || sellable.shop) stockOffMode = 'manual';
    }
    if (stockOffMode !== (doc.stockOffMode ?? null)) next.stockOffMode = stockOffMode;
    return next;
}

/**
 * @param {import('mongodb').Db} db
 * @param {{ apply?: boolean, log?: (msg: string) => void }} [opts]
 */
export async function migrateChannels(db, { apply = false, log = console.log } = {}) {
    const summary = { products: 0, shopOnlyProducts: 0, sellersApproved: 0, sellersNone: 0 };
    const products = db.collection('products');
    const sellers = db.collection('sellers');

    const touched = [];
    for await (const doc of products.find(OLD_PRODUCT_SHAPE)) {
        const next = convertProduct(doc);
        summary.products += 1;
        if (doc.quickEligible === false) summary.shopOnlyProducts += 1;
        touched.push(doc._id);
        if (!apply) continue;
        await products.updateOne(
            { _id: doc._id },
            { $set: next, $unset: { stockQty: '', quickEligible: '' } },
        );
    }
    if (apply && touched.length) {
        await products.updateMany({ _id: { $in: touched } }, availableInPipeline());
    }
    log(`products: ${summary.products} to convert (${summary.shopOnlyProducts} Shop-only)`);

    const noChannels = { $or: [{ channels: { $exists: false } }, { 'channels.quick.status': { $exists: false } }] };
    const now = new Date();
    for await (const s of sellers.find(noChannels, { projection: { status: 1, approvedAt: 1 } })) {
        const approved = s.status === 'approved';
        const entry = approved
            ? { status: 'approved', rejectionReason: null, appliedAt: null, decidedAt: s.approvedAt || now }
            : { status: 'none', rejectionReason: null, appliedAt: null, decidedAt: null };
        if (approved) summary.sellersApproved += 1;
        else summary.sellersNone += 1;
        if (!apply) continue;
        await sellers.updateOne({ _id: s._id }, { $set: { channels: { quick: entry, shop: { ...entry } } } });
    }
    log(`sellers: ${summary.sellersApproved} approved for both channels, ${summary.sellersNone} set to none`);
    return summary;
}

const isMain = import.meta.url === `file:///${process.argv[1]?.replace(/\\/g, '/')}`
    || import.meta.url === `file://${process.argv[1]}`;

if (isMain) {
    const { config } = await import('../../src/config/env.js');
    const apply = process.argv.includes('--apply');
    if (!config.mongodbUri) {
        console.error('MONGO_URI is not set');
        process.exit(1);
    }
    await mongoose.connect(config.mongodbUri);
    console.log(apply ? 'Applying.' : 'Dry run — nothing will be written. Pass --apply to write.');
    const summary = await migrateChannels(mongoose.connection.db, { apply });
    console.log(summary);
    await mongoose.disconnect();
}
