/**
 * Imports the old thewarehousess.com WooCommerce catalogue into a seller's
 * store: categories, products, size/colour variants, stock and photos.
 *
 * Input is the read-only export made from the shop's public Store API: a
 * folder holding products.json and images/ (the photos, kept at their
 * wp-content/uploads paths). Photos are converted to WebP under
 * <UPLOAD_STORAGE_ROOT>/imports/woo/.
 *
 * Re-runnable: products are matched on their WooCommerce ID, so a second run
 * updates price, stock and details instead of adding copies (use --only-new to
 * leave already-imported products alone). Everything it creates is tagged
 * `seedTag: 'woo-import-v1'`, which is what --wipe removes.
 *
 * Usage:
 *   node scripts/import-woocommerce.mjs --dir=/opt/warehouses/imports/woo --dry-run
 *   node scripts/import-woocommerce.mjs --dir=/opt/warehouses/imports/woo
 *   node scripts/import-woocommerce.mjs --dir=... --seller="The Warehousess" --only-new
 *   node scripts/import-woocommerce.mjs --wipe
 */

import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import mongoose from 'mongoose';
import sharp from 'sharp';

import { Category } from '../src/modules/commerce/admin/models/category.model.js';
import { Product } from '../src/modules/commerce/admin/models/product.model.js';
import { Attribute } from '../src/modules/commerce/admin/models/attribute.model.js';
import { Seller } from '../src/modules/commerce/seller/models/seller.model.js';
import { TARGET_CATEGORIES, mapProduct } from './lib/woo-import.mjs';

const SEED_TAG = 'woo-import-v1';

// `seedTag` and `legacy` (where a product came from, so old /product/<slug>/
// links can find it) are not schema fields, so they are read and written on
// the collections directly; Mongoose would drop them.

const arg = (name) => process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const flag = (name) => process.argv.includes(`--${name}`);

const DRY_RUN = flag('dry-run');
const ONLY_NEW = flag('only-new');
const SELLER_NAME = arg('seller') || 'The Warehousess';
const DIR = arg('dir');
const UPLOAD_ROOT = process.env.UPLOAD_STORAGE_ROOT || '/var/www/warehouses-uploads';
const MEDIA_DIR = path.join(UPLOAD_ROOT, 'imports', 'woo');

const COLOUR_HEX = {
    black: '#000000', white: '#ffffff', red: '#c62828', green: '#2e7d32', blue: '#1e4fa3', yellow: '#f2c230',
    pink: '#e88aa8', purple: '#6a3d9a', brown: '#795548', beige: '#f5f5dc', cream: '#fff8e1', maroon: '#800000',
    grey: '#9e9e9e', gray: '#9e9e9e', gold: '#c9a227', silver: '#c0c0c0', orange: '#ef6c00', mint: '#a8e6cf',
    lime: '#c0ca33', peach: '#ffcba4', rust: '#b7410e', navy: '#1f2a44', teal: '#008080',
};

function hexFor(colour) {
    const words = colour.toLowerCase().split(/\s+/).reverse();
    for (const w of words) if (COLOUR_HEX[w]) return COLOUR_HEX[w];
    return '';
}

/** Old-site photo URL -> converted copy under /uploads/imports/woo/, or '' when the file is missing. */
const converted = new Map();
async function importImage(url) {
    if (converted.has(url)) return converted.get(url);
    const rel = decodeURIComponent(new URL(url).pathname).replace(/^\/+/, '');
    const source = path.join(DIR, 'images', rel);
    const relOut = rel.replace(/^wp-content\/uploads\//, '').replace(/\.[a-z0-9]+$/i, '.webp');
    const target = path.join(MEDIA_DIR, relOut);
    const publicUrl = `/uploads/imports/woo/${relOut.split(path.sep).join('/')}`;
    let result = publicUrl;
    if (!fs.existsSync(source)) {
        console.warn(`  photo missing in export: ${rel}`);
        result = '';
    } else if (!DRY_RUN && !(fs.existsSync(target) && fs.statSync(target).size > 0)) {
        fs.mkdirSync(path.dirname(target), { recursive: true, mode: 0o755 });
        await sharp(source).rotate().resize({ width: 1400, height: 1400, fit: 'inside', withoutEnlargement: true }).webp({ quality: 82 }).toFile(target);
        fs.chmodSync(target, 0o644);
    }
    converted.set(url, result);
    return result;
}

/** The global top-level category with this name, preferring the one that has subcategories. */
async function findParent(name) {
    const roots = await Category.find({ name, sellerId: { $exists: false }, parentId: { $exists: false } }).sort({ createdAt: 1 }).lean();
    if (!roots.length) return null;
    for (const root of roots) {
        if (await Category.exists({ parentId: root._id })) return root;
    }
    return roots[0];
}

/** "Women > Kurtas" etc., creating any child (or parent) that is missing. */
async function ensureCategories() {
    const byKey = {};
    for (const [key, [parentName, childName]] of Object.entries(TARGET_CATEGORIES)) {
        let parent = await findParent(parentName);
        if (!parent) {
            if (DRY_RUN) { console.log(`  would create category ${parentName}`); byKey[key] = { _id: null, name: childName }; continue; }
            parent = (await Category.create({ name: parentName, approvalStatus: 'approved', isApproved: true, isActive: true })).toObject();
            await Category.collection.updateOne({ _id: parent._id }, { $set: { seedTag: SEED_TAG } });
            console.log(`  created category ${parentName}`);
        }
        let child = await Category.findOne({ name: childName, parentId: parent._id, sellerId: { $exists: false } }).sort({ createdAt: 1 }).lean();
        if (!child) {
            // A new subcategory takes its siblings' attribute set and commission.
            const sibling = await Category.findOne({ parentId: parent._id, sellerId: { $exists: false } }).sort({ createdAt: 1 }).lean();
            const fields = {
                name: childName,
                parentId: parent._id,
                attributeSetId: sibling?.attributeSetId ?? null,
                commissionPercent: sibling?.commissionPercent ?? null,
                approvalStatus: 'approved',
                isApproved: true,
                isActive: true,
                sortOrder: 50,
            };
            if (DRY_RUN) { console.log(`  would create category ${parentName} > ${childName}`); child = { ...fields, _id: null }; }
            else {
                child = (await Category.create(fields)).toObject();
                await Category.collection.updateOne({ _id: child._id }, { $set: { seedTag: SEED_TAG } });
                console.log(`  created category ${parentName} > ${childName}`);
            }
        }
        byKey[key] = child;
    }
    return byKey;
}

/** Adds sizes and colours the imported variants use to the filterable attributes. */
async function extendAttributes(products) {
    const seen = { size: new Set(), colour: new Set() };
    for (const p of products) for (const v of p.variants) for (const a of v.attributes) {
        if (a.name === 'Size') seen.size.add(a.value);
        if (a.name === 'Colour') seen.colour.add(a.value);
    }
    for (const key of ['size', 'colour']) {
        const attr = await Attribute.findOne({ key });
        if (!attr) continue;
        const have = new Set(attr.values.map((v) => v.value.toLowerCase()));
        const missing = [...seen[key]].filter((v) => !have.has(v.toLowerCase()));
        if (!missing.length) continue;
        console.log(`  ${DRY_RUN ? 'would add' : 'adding'} ${attr.name} values: ${missing.join(', ')}`);
        if (DRY_RUN) continue;
        let order = attr.values.length;
        for (const value of missing) attr.values.push({ value, hex: key === 'colour' ? hexFor(value) : '', sortOrder: order++ });
        await attr.save();
    }
}

async function wipe() {
    const products = await Product.collection.deleteMany({ seedTag: SEED_TAG });
    const created = await Category.collection.find({ seedTag: SEED_TAG }).toArray();
    let categories = 0;
    for (const c of created) {
        const inUse = await Product.exists({ categoryId: c._id }) || await Category.exists({ parentId: c._id });
        if (!inUse) { await Category.deleteOne({ _id: c._id }); categories += 1; }
    }
    console.log(`Removed ${products.deletedCount} imported products and ${categories} unused imported categories.`);
}

async function main() {
    const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI;
    if (!mongoUri) throw new Error('Missing MONGO_URI');
    await mongoose.connect(mongoUri, { serverSelectionTimeoutMS: 30000 });
    console.log(`Database: ${mongoose.connection.name}${DRY_RUN ? ' (dry run, nothing is written)' : ''}`);

    if (flag('wipe')) return wipe();
    if (!DIR || !fs.existsSync(path.join(DIR, 'products.json'))) throw new Error('--dir must point at the export folder holding products.json');

    const seller = await Seller.findOne({ sellerName: SELLER_NAME }).lean();
    if (!seller) throw new Error(`No seller named "${SELLER_NAME}"`);
    console.log(`Store: ${seller.sellerName} (${seller._id}), Shop channel: ${seller.channels?.shop?.status}`);

    const source = JSON.parse(fs.readFileSync(path.join(DIR, 'products.json'), 'utf8'));
    console.log(`\nCategories`);
    const categories = await ensureCategories();

    const mapped = [];
    for (const raw of source) {
        const urls = new Map();
        const collect = (list) => { for (const img of list ?? []) if (img?.src) urls.set(img.src, null); };
        collect(raw.images);
        for (const v of raw._variationDetails ?? []) collect(v.images);
        for (const url of urls.keys()) urls.set(url, await importImage(url));
        mapped.push(mapProduct(raw, { imageFor: (url) => urls.get(url) ?? '' }));
    }

    console.log(`\nAttributes`);
    await extendAttributes(mapped);

    console.log(`\nProducts`);
    const tally = { created: 0, updated: 0, skipped: 0, unavailable: 0, noCategory: 0 };
    for (const item of mapped) {
        const category = categories[item.categoryKey];
        if (!category) { tally.noCategory += 1; console.warn(`  no category for "${item.name}", skipped`); continue; }
        const filter = { sellerId: seller._id, 'legacy.source': 'woocommerce', 'legacy.id': item.legacy.id };
        const found = await Product.collection.findOne(filter, { projection: { _id: 1 } });
        const existing = found ? await Product.findById(found._id) : null;
        if (existing && ONLY_NEW) { tally.skipped += 1; continue; }

        const doc = existing ?? new Product({ sellerId: seller._id, name: item.name });
        Object.assign(doc, {
            name: item.name,
            description: item.description,
            categoryId: category._id,
            categoryName: category.name,
            brand: seller.sellerName,
            packSize: item.packSize,
            price: item.price,
            mrp: item.mrp,
            otherPrice: 0,
            sku: item.sku,
            image: item.image,
            images: item.images,
            variants: item.variants,
            channels: item.channels,
            stock: item.stock,
            foodType: null,
            approvalStatus: 'approved',
            approvedAt: doc.approvedAt ?? new Date(),
        });
        if (DRY_RUN) {
            await doc.validate();
        } else {
            await doc.save();
            await Product.collection.updateOne({ _id: doc._id }, { $set: { legacy: item.legacy, seedTag: SEED_TAG } });
        }
        tally[existing ? 'updated' : 'created'] += 1;
        if (!doc.availableIn?.shop) tally.unavailable += 1;
    }

    console.log(`\n${DRY_RUN ? 'Would import' : 'Imported'}: ${JSON.stringify(tally)}`);
    console.log(`Photos: ${[...converted.values()].filter(Boolean).length} of ${converted.size}`);
    if (seller.channels?.shop?.status !== 'approved') {
        console.log(`\nNote: ${seller.sellerName}'s Shop channel is "${seller.channels?.shop?.status}". The products show on the site once an admin approves it.`);
    }
}

main()
    .catch((err) => { console.error(err); process.exitCode = 1; })
    .finally(() => mongoose.disconnect());
