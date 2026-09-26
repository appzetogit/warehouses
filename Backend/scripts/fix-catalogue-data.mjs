/**
 * Fixes found in the storefront audit of 2026-09-26:
 * - ten products whose photo showed something else (a backpack for a gym
 *   tank, a face for jeans, a sewing machine for a top…) get a matching,
 *   brand-free Unsplash photo;
 * - Bags and Footwear shared one sneaker photo; each gets its own;
 * - categories get a sortOrder, so lists read Men and its subcategories,
 *   then Women…, instead of the newest subcategory first;
 * - the stray top-level "Jeans" (it only holds denim shorts, next to
 *   Men > Jeans) is renamed "Shorts".
 *
 * Everything it changes is saved first; --restore puts it back.
 *
 * Usage (on the server, from Backend/):
 *   node scripts/fix-catalogue-data.mjs
 *   node scripts/fix-catalogue-data.mjs --restore
 */

import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import https from 'https';
import mongoose from 'mongoose';

const UPLOAD_ROOT = process.env.UPLOAD_STORAGE_ROOT || '/var/www/warehouses-uploads';
const MEDIA_DIR = path.join(UPLOAD_ROOT, 'seed', 'fixes-v1');
const BACKUP = path.join(UPLOAD_ROOT, '..', 'warehouses-backups', 'catalogue-fix-2026-09-26.json');

const oid = (id) => new mongoose.Types.ObjectId(id);

// Product name -> new photo (Unsplash id), or { useImage: index } to promote one it already has.
const PRODUCT_PHOTOS = {
    'Muscle-Fit Dry-Tech Workout Tank': '1761706755002-0d89292232a7',
    'Racerback Athletic Training Tank': { useImage: 1 },
    'Selvedge Raw Indigo Slim-Tapered Jeans': '1624378441864-6eda7eac51cb',
    'Oversized Typography Graphic Tee': '1627225793904-a2f900a6e4cf',
    'Linen Blend Peplum Button-Down Top': '1610904260476-2d708aa12eb0',
    'Linen Tie-Up Wrap Crop Blouse': '1589563830842-1f786856ce6b',
    'Smocked Square-Neck Puff Sleeve Blouse': '1618085219724-c59ba48e08cd',
    'Oversized Boyfriend Poplin Shirt Top': '1753395298699-cb9dcd9f9e96',
    'Ribbed High-Neck Sleeveless Knit Top': '1572375608144-5b122c67528e',
    'Lightweight Studio Lounge Joggers': '1552902865-b72c031ac5ea',
};

const CATEGORY_IMAGES = {
    '6ab4f683e6bb381f4c39a729': '1594223274512-ad4803739b7c', // Bags: a handbag, not a sneaker
    '6ab4f683e6bb381f4c39a725': '/uploads/quick/fashion/products/sliders.webp', // Footwear: plain sneakers
};

// Parents first, then each parent's children.
const SORT = {
    '6ab3738bf1e99f7c11f9f810': 1, // Men
    '6ab3738bf1e99f7c11f9f811': 1, // Men > T-Shirts
    '6ab3738bf1e99f7c11f9f812': 2, // Men > Shirts
    '6ab373c6f1e99f7c11f9f813': 3, // Men > Jeans
    '6ab52d38f1e99f7c11f9f8f7': 4, // Men > Suits & Blazers
    '6ab373c7f1e99f7c11f9f814': 2, // Women
    '6ab373c7f1e99f7c11f9f815': 1, // Women > Dresses
    '6ab373c7f1e99f7c11f9f816': 2, // Women > Kurtas
    '6ab373c7f1e99f7c11f9f817': 3, // Women > Tops
    '6ab52d38f1e99f7c11f9f8f6': 4, // Women > Skirts
    '6ab4f682e6bb381f4c39a722': 3, // Kids
    '6ab52d38f1e99f7c11f9f8f8': 1, // Kids > Boys Clothing
    '6ab52d38f1e99f7c11f9f8f9': 2, // Kids > Girls Clothing
    '6ab52d38f1e99f7c11f9f8fa': 3, // Kids > Baby & Toddler
    '6ab373c7f1e99f7c11f9f818': 4, // Activewear
    '6ab373c7f1e99f7c11f9f819': 1, // Activewear > Gym Tees & Tops
    '6ab373c7f1e99f7c11f9f81a': 2, // Activewear > Track Pants & Joggers
    '6ab373c7f1e99f7c11f9f81b': 5, // Jackets
    '6ab373c7f1e99f7c11f9f81c': 1, // Jackets > Bomber & Denim Jackets
    '6ab373c7f1e99f7c11f9f81d': 2, // Jackets > Hoodies & Sweatshirts
    '6ab4f683e6bb381f4c39a725': 6, // Footwear
    '6ab4f683e6bb381f4c39a729': 7, // Bags
    '6ab4ff3dca9c503fd53de80b': 8, // Accessories
    '6ab4f682e6bb381f4c39a724': 9, // Shorts (was the stray "Jeans")
};
const RENAME = { '6ab4f682e6bb381f4c39a724': 'Shorts' };

function download(url, fullPath) {
    return new Promise((resolve, reject) => {
        https
            .get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
                if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                    res.resume();
                    return download(res.headers.location, fullPath).then(resolve, reject);
                }
                if (res.statusCode !== 200) {
                    res.resume();
                    return reject(new Error(`HTTP ${res.statusCode} for ${url}`));
                }
                const out = fs.createWriteStream(fullPath);
                res.pipe(out);
                out.on('finish', () => {
                    out.close();
                    try { fs.chmodSync(fullPath, 0o644); } catch { /* best effort */ }
                    resolve();
                });
                out.on('error', reject);
            })
            .on('error', reject);
    });
}

async function media(source, name) {
    if (source.startsWith('/uploads/')) return source;
    const rel = `${name}.webp`;
    const full = path.join(MEDIA_DIR, rel);
    fs.mkdirSync(MEDIA_DIR, { recursive: true, mode: 0o755 });
    if (!(fs.existsSync(full) && fs.statSync(full).size > 1000)) {
        await download(`https://images.unsplash.com/photo-${source}?w=1000&auto=format&fit=crop&q=80`, full);
    }
    return `/uploads/seed/fixes-v1/${rel}`;
}

const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

async function main() {
    const uri = process.env.MONGO_URI || process.env.MONGODB_URI;
    if (!uri) throw new Error('Missing MONGO_URI');
    await mongoose.connect(uri, { serverSelectionTimeoutMS: 30000 });
    const db = mongoose.connection.db;
    const products = db.collection('products');
    const categories = db.collection('categories');

    if (process.argv.includes('--restore')) {
        const saved = JSON.parse(fs.readFileSync(BACKUP, 'utf8'));
        for (const p of saved.products) {
            await products.updateOne({ _id: oid(p._id) }, { $set: { image: p.image, images: p.images, variants: p.variants } });
        }
        for (const c of saved.categories) {
            await categories.updateOne({ _id: oid(c._id) }, { $set: { name: c.name, image: c.image, sortOrder: c.sortOrder ?? 0, ...(c.slug ? { slug: c.slug } : {}) } });
        }
        console.log(`Restored ${saved.products.length} products and ${saved.categories.length} categories`);
        await mongoose.disconnect();
        return;
    }

    const targets = await products.find({ name: { $in: Object.keys(PRODUCT_PHOTOS) } }).toArray();
    const catIds = [...new Set([...Object.keys(SORT), ...Object.keys(CATEGORY_IMAGES)])].map(oid);
    const cats = await categories.find({ _id: { $in: catIds } }).toArray();

    fs.mkdirSync(path.dirname(BACKUP), { recursive: true });
    if (!fs.existsSync(BACKUP)) {
        fs.writeFileSync(
            BACKUP,
            JSON.stringify(
                {
                    products: targets.map((p) => ({ _id: String(p._id), name: p.name, image: p.image, images: p.images, variants: p.variants })),
                    categories: cats.map((c) => ({ _id: String(c._id), name: c.name, slug: c.slug, image: c.image, sortOrder: c.sortOrder })),
                },
                null,
                2,
            ),
        );
        console.log(`Backed up ${targets.length} products and ${cats.length} categories to ${BACKUP}`);
    } else {
        console.log(`Backup already at ${BACKUP}; left as is`);
    }

    for (const p of targets) {
        const spec = PRODUCT_PHOTOS[p.name];
        let photo;
        if (typeof spec === 'object') photo = (p.images || [])[spec.useImage];
        else photo = await media(spec, slug(p.name));
        if (!photo) {
            console.warn(`  ${p.name}: no photo to use`);
            continue;
        }
        const variants = (p.variants || []).map((v) => ({ ...v, images: [photo] }));
        await products.updateOne({ _id: p._id }, { $set: { image: photo, images: [photo], variants } });
        console.log(`  photo: ${p.name} -> ${photo}`);
    }

    for (const [id, source] of Object.entries(CATEGORY_IMAGES)) {
        const image = await media(source, `category-${id}`);
        await categories.updateOne({ _id: oid(id) }, { $set: { image } });
        console.log(`  category image: ${id} -> ${image}`);
    }
    for (const [id, sortOrder] of Object.entries(SORT)) {
        await categories.updateOne({ _id: oid(id) }, { $set: { sortOrder, ...(RENAME[id] ? { name: RENAME[id], slug: slug(RENAME[id]) } : {}) } });
    }
    console.log(`  sort order set on ${Object.keys(SORT).length} categories; renamed ${Object.values(RENAME).join(', ')}`);

    await mongoose.disconnect();
}

main().catch(async (err) => {
    console.error(err.message || err);
    await mongoose.disconnect().catch(() => {});
    process.exit(1);
});
