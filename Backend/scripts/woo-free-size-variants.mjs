/**
 * One-off: give imported products whose only size on the old shop was "Free
 * Size" that size back, as a single variant, so the product page shows
 * "Size: Free Size" as the old shop did. The first import made them plain
 * products. Their current stock moves onto the variant unchanged, so sales
 * since the import are kept.
 *
 * Usage:
 *   node scripts/woo-free-size-variants.mjs --dir=/opt/warehouses/imports/woo --dry-run
 *   node scripts/woo-free-size-variants.mjs --dir=/opt/warehouses/imports/woo
 */
import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import mongoose from 'mongoose';
import { Product } from '../src/modules/commerce/admin/models/product.model.js';
import { parseVariationLabel } from './lib/woo-import.mjs';

const arg = (name) => process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const DRY_RUN = process.argv.includes('--dry-run');
const DIR = arg('dir');
if (!DIR) throw new Error('--dir must point at the export folder holding products.json');

const source = JSON.parse(fs.readFileSync(path.join(DIR, 'products.json'), 'utf8'));
// WooCommerce id -> the variation's SKU, for products whose one variation is Free Size.
const freeSizeOnly = new Map();
for (const p of source) {
    const details = (p._variationDetails || []).filter((v) => v && !v.error);
    if (details.length !== 1) continue;
    const attrs = parseVariationLabel(details[0].variation);
    if (attrs.length && attrs.every((a) => a.value === 'Free Size')) freeSizeOnly.set(p.id, String(details[0].sku || '').trim());
}

await mongoose.connect(process.env.MONGO_URI || process.env.MONGODB_URI);
const rows = await Product.collection
    .find({ seedTag: 'woo-import-v1', 'legacy.id': { $in: [...freeSizeOnly.keys()] }, 'variants.0': { $exists: false } }, { projection: { _id: 1, 'legacy.id': 1 } })
    .toArray();

let updated = 0;
for (const row of rows) {
    const doc = await Product.findById(row._id);
    if (!doc || doc.variants.length) continue;
    doc.variants = [{
        name: 'Free Size',
        price: doc.price,
        mrp: doc.mrp,
        sku: freeSizeOnly.get(row.legacy.id) || doc.sku || '',
        attributes: [{ name: 'Size', value: 'Free Size' }],
        channels: { quick: null, shop: null },
        stock: { shop: doc.stock?.shop ?? null, quick: null },
        lowStockThreshold: { shop: null, quick: null },
        images: doc.image ? [doc.image] : [],
        isActive: true,
    }];
    doc.stock = { shop: null, quick: doc.stock?.quick ?? null };
    if (DRY_RUN) await doc.validate();
    else await doc.save();
    updated += 1;
}
console.log(JSON.stringify({ freeSizeOnlyInExport: freeSizeOnly.size, matched: rows.length, [DRY_RUN ? 'wouldUpdate' : 'updated']: updated }));
await mongoose.disconnect();
