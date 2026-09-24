/**
 * Puts clothing on the Quick phone home: the header's theme tabs (All, Men,
 * Women, Kids, Ethnic, Denim, Formal, Party, Activewear, Winterwear,
 * Streetwear; the row scrolls), their promo tiles, rewards banner and offer
 * strip, the featured cards, campaign banners and category groups.
 *
 * Run it after seed-apparel-stores.mjs, which creates Skirts, Suits &
 * Blazers and the Kids categories this links to.
 *
 * The layout stored before this was a grocery one (Ganeshotsav, Dairy &
 * Breakfast, Fruits & Veggies) left over from the food/grocery days. It is
 * saved as JSON next to the uploads before being replaced, and --restore puts
 * it back.
 *
 * Every picture is a product photo already in the catalogue, and every link
 * opens a category (by id, so duplicate slugs cannot send it astray) that has
 * Quick stock. The tab icons are small line drawings written by this script.
 *
 * Usage (on the server, from Backend/):
 *   node scripts/seed-quick-fashion-layout.mjs
 *   node scripts/seed-quick-fashion-layout.mjs --restore
 */

import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import mongoose from 'mongoose';

import { QuickHomeLayout } from '../src/modules/commerce/landing/models/quickHomeLayout.model.js';
import { Category } from '../src/modules/commerce/admin/models/category.model.js';
import { saveQuickHomeLayout } from '../src/modules/commerce/landing/services/quickHomeLayout.service.js';

const UPLOAD_ROOT = process.env.UPLOAD_STORAGE_ROOT || '/var/www/warehouses-uploads';
const ICON_DIR = path.join(UPLOAD_ROOT, 'quick', 'icons');
const BACKUP = path.join(UPLOAD_ROOT, '..', 'warehouses-backups', 'quick-home-layout-before-fashion.json');

const CAT = {
    men: '6ab3738bf1e99f7c11f9f810',
    tshirts: '6ab3738bf1e99f7c11f9f811',
    shirts: '6ab3738bf1e99f7c11f9f812',
    jeans: '6ab373c6f1e99f7c11f9f813',
    women: '6ab373c7f1e99f7c11f9f814',
    dresses: '6ab373c7f1e99f7c11f9f815',
    kurtas: '6ab373c7f1e99f7c11f9f816',
    tops: '6ab373c7f1e99f7c11f9f817',
    activewear: '6ab373c7f1e99f7c11f9f818',
    gym: '6ab373c7f1e99f7c11f9f819',
    joggers: '6ab373c7f1e99f7c11f9f81a',
    jackets: '6ab373c7f1e99f7c11f9f81b',
    bomber: '6ab373c7f1e99f7c11f9f81c',
    hoodies: '6ab373c7f1e99f7c11f9f81d',
};
// Created by seed-apparel-stores.mjs; their ids are looked up by name (and parent) at run time.
const NAMED = {
    skirts: ['Skirts', 'Women'],
    suits: ['Suits & Blazers', 'Men'],
    kids: ['Kids', null],
    boys: ['Boys Clothing', 'Kids'],
    girls: ['Girls Clothing', 'Kids'],
    baby: ['Baby & Toddler', 'Kids'],
};
const rootJeans = '6ab4f682e6bb381f4c39a724';
const cat = (key) => `/quick/category/${CAT[key] || key}`;

const P = '/uploads/seed/products';
const S = '/uploads/seed/stores-v1';
const IMG = {
    tee: `${P}/${CAT.tshirts}/supima-classic-heavyweight-tee/1.webp`,
    graphicTee: `${P}/${CAT.tshirts}/oversized-typography-graphic-tee/1.webp`,
    whiteTee: `${S}/street-loom/essential-crew-neck-tee/1.webp`,
    shirt: `${P}/${CAT.shirts}/pure-european-linen-casual-shirt/1.webp`,
    jeans: `${P}/${CAT.jeans}/selvedge-raw-indigo-slim-tapered-jeans/1.webp`,
    dress: `${S}/dhaaga-house/flowing-chiffon-maxi-wrap-dress/1.webp`,
    midi: `${P}/${CAT.dresses}/tiered-linen-midi-wrap-dress/1.webp`,
    kurta: `${P}/${CAT.kurtas}/chanderi-silk-festive-a-line-kurta/1.webp`,
    anarkali: `${P}/${CAT.kurtas}/bandhani-print-pure-silk-anarkali-kurta/1.webp`,
    top: `${P}/${CAT.tops}/linen-blend-peplum-button-down-top/1.webp`,
    gymTee: `${P}/${CAT.gym}/aerodry-seamless-performance-tee/1.webp`,
    joggers: `${P}/${CAT.joggers}/performance-flex-tapered-joggers/1.webp`,
    coord: `${S}/dhaaga-house/cropped-hoodie-jogger-co-ord-set/1.webp`,
    hoodie: `${S}/street-loom/brushed-fleece-pullover-hoodie/1.webp`,
    frenchTerry: `${P}/${CAT.hoodies}/heavyweight-french-terry-pullover-hoodie/1.webp`,
    denimJacket: `${P}/${CAT.bomber}/vintage-trucker-denim-jacket/1.webp`,
    puffer: `${P}/${CAT.bomber}/quilted-ultralight-packable-puffer-vest/1.webp`,
    knit: `${S}/dhaaga-house/relaxed-knit-pullover/1.webp`,
    streetCover: `${S}/street-loom/cover.webp`,
    satinDress: `${S}/dhaaga-house/satin-wrap-midi-dress/1.webp`,
    sheath: `${S}/dhaaga-house/tailored-sheath-dress/1.webp`,
    denimDress: `${S}/dhaaga-house/denim-shirt-dress/1.webp`,
    tennisSkirt: `${S}/dhaaga-house/pleated-tennis-mini-skirt/1.webp`,
    midiSkirt: `${S}/dhaaga-house/pleated-satin-midi-skirt/1.webp`,
    denimShorts: '/uploads/quick/fashion/products/shorts.webp',
    blazer: `${S}/denim-den/windowpane-check-blazer/1.webp`,
    suit: `${S}/denim-den/three-piece-slim-suit/1.webp`,
    tuxedo: `${S}/denim-den/classic-black-tuxedo/1.webp`,
    formalShirt: `${S}/denim-den/slim-fit-formal-shirt/1.webp`,
    boysTee: `${S}/tiny-threads/boys-classic-crew-tee/1.webp`,
    partySet: `${S}/tiny-threads/bow-tie-cardigan-party-set/1.webp`,
    frock: `${S}/tiny-threads/girls-printed-frock/1.webp`,
    babySet: `${S}/tiny-threads/checked-shirt-denim-set/1.webp`,
    skeletonTee: '/uploads/quick/fashion/products/oversized.webp',
    kidsCover: `${S}/tiny-threads/cover.webp`,
};

// 24px line icons for the tabs; drawn in the header's text colour.
const svg = (body) =>
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#1F2937" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${body}</svg>\n`;
const ICONS = {
    'fashion-all': svg('<path d="M12 5a2 2 0 1 1 2 2c-1 0-2 .6-2 1.6V9"/><path d="M12 9 3 15.5c-.8.6-.4 1.9.6 1.9h16.8c1 0 1.4-1.3.6-1.9L12 9Z"/>'),
    'fashion-men': svg('<path d="M8.5 3.5 4 5.8 2.8 10l3 1V20.5h12.4V11l3-1L20 5.8l-4.5-2.3a3.5 3.5 0 0 1-7 0Z"/>'),
    'fashion-women': svg('<path d="M9.5 3h5l-1 4.5 5 13h-13l5-13-1-4.5Z"/><path d="M9.2 7.5h5.6"/>'),
    'fashion-active': svg('<path d="M3 16.5c0-1 .8-1.8 1.8-1.8h3.4l2.3-4.2 3 1.9c.9.6 1.9.9 3 .9H18c1.7 0 3 1.3 3 3v1.2H3v-1Z"/><path d="M3 17.5v2h18v-2"/><path d="M11.5 12.7 13 11"/>'),
    'fashion-kids': svg('<path d="M8 4.5 4.5 6.5 3.5 10l2.5.8V19.5h12V10.8l2.5-.8-1-3.5L16 4.5c-.3 1.4-1.9 2.5-4 2.5s-3.7-1.1-4-2.5Z"/><path d="M9.5 13.5h.01M14.5 13.5h.01"/><path d="M10 16c1.2.8 2.8.8 4 0"/>'),
    'fashion-ethnic': svg('<path d="M9.5 3h5l.8 2.5 2.7 1.5-.8 5.5-1.7-.5 1.5 8.5h-10l1.5-8.5-1.7.5-.8-5.5 2.7-1.5.8-2.5Z"/><path d="M12 3v6"/><path d="M8.3 17.5h7.4"/>'),
    'fashion-denim': svg('<path d="M6 3.5h12l.5 17h-4.5L12 10l-2 10.5H5.5L6 3.5Z"/><path d="M6 6.5h12"/><path d="M8.5 6.5c0 1.5.8 2.3 2 2.3M15.5 6.5c0 1.5-.8 2.3-2 2.3"/>'),
    'fashion-formal': svg('<path d="M8 3.5 12 7l4-3.5 4.5 3v14h-17v-14L8 3.5Z"/><path d="M12 7v13.5"/><path d="M10.8 9.5 12 7l1.2 2.5L12 17l-1.2-7.5Z"/>'),
    'fashion-party': svg('<path d="M10 3.5h4l-.8 4 4.8 13h-12l4.8-13-.8-4Z"/><path d="M18.5 3v3M17 4.5h3"/><path d="M5 8v2M4 9h2"/>'),
    'fashion-street': svg('<path d="M4 13.5c0-4.4 3.6-8 8-8s8 3.6 8 8"/><path d="M4 13.5h17.5c.8 0 .8 1.5 0 1.5H4"/><path d="M12 5.5v8"/><path d="M8 7.5c-.5 2-.5 4 0 6M16 7.5c.5 2 .5 4 0 6"/>'),
    'fashion-winter': svg('<path d="M9 3.5h6l1 2 4 2.5-1.5 5-2-.8V20.5h-9v-8.3l-2 .8L4 8l4-2.5 1-2Z"/><path d="M12 5.5v15"/><path d="M9.5 3.5c0 2 1 3 2.5 3s2.5-1 2.5-3"/>'),
};

const rewards = (thumbs) => ({
    title: 'Spin & win coins',
    subtitle: 'One free spin every day',
    thumbs,
    link: '/spin',
});
const nearby = { text: 'Delivered in minutes from stores near you →', link: '/quick/sellers' };

const LAYOUT = {
    themes: [
        {
            slug: 'all',
            label: 'All',
            iconUrl: '/uploads/quick/icons/fashion-all.svg',
            accent: '#C2410C',
            promoTiles: [
                { title: 'Everyday Tees', imageUrl: IMG.whiteTee, link: cat('tshirts') },
                { title: 'Dresses', imageUrl: IMG.dress, link: cat('dresses') },
                { title: 'Hoodies', imageUrl: IMG.hoodie, link: cat('hoodies') },
            ],
            rewards: rewards([IMG.tee, IMG.dress, IMG.hoodie]),
            offerStrip: nearby,
        },
        {
            slug: 'men',
            label: 'Men',
            iconUrl: '/uploads/quick/icons/fashion-men.svg',
            accent: '#1D4ED8',
            promoTiles: [
                { title: 'T-Shirts', imageUrl: IMG.tee, link: cat('tshirts') },
                { title: 'Shirts', imageUrl: IMG.shirt, link: cat('shirts') },
                { title: 'Jeans', imageUrl: IMG.jeans, link: cat('jeans') },
            ],
            rewards: rewards([IMG.graphicTee, IMG.shirt, IMG.jeans]),
            offerStrip: nearby,
        },
        {
            slug: 'women',
            label: 'Women',
            iconUrl: '/uploads/quick/icons/fashion-women.svg',
            accent: '#BE185D',
            promoTiles: [
                { title: 'Dresses', imageUrl: IMG.midi, link: cat('dresses') },
                { title: 'Tops', imageUrl: IMG.top, link: cat('tops') },
                { title: 'Kurtas', imageUrl: IMG.kurta, link: cat('kurtas') },
            ],
            rewards: rewards([IMG.dress, IMG.top, IMG.anarkali]),
            offerStrip: nearby,
        },
        {
            slug: 'kids',
            label: 'Kids',
            iconUrl: '/uploads/quick/icons/fashion-kids.svg',
            accent: '#EA580C',
            promoTiles: [
                { title: 'Boys', imageUrl: IMG.boysTee, link: cat('boys') },
                { title: 'Girls', imageUrl: IMG.frock, link: cat('girls') },
                { title: 'Baby & Toddler', imageUrl: IMG.babySet, link: cat('baby') },
            ],
            rewards: rewards([IMG.boysTee, IMG.partySet, IMG.frock]),
            offerStrip: nearby,
        },
        {
            slug: 'ethnic',
            label: 'Ethnic',
            iconUrl: '/uploads/quick/icons/fashion-ethnic.svg',
            accent: '#B45309',
            promoTiles: [
                { title: 'Kurtas', imageUrl: IMG.kurta, link: cat('kurtas') },
                { title: 'Anarkalis', imageUrl: IMG.anarkali, link: cat('kurtas') },
                { title: 'Festive Dresses', imageUrl: IMG.satinDress, link: cat('dresses') },
            ],
            rewards: rewards([IMG.kurta, IMG.anarkali, IMG.satinDress]),
            offerStrip: nearby,
        },
        {
            slug: 'denim',
            label: 'Denim',
            iconUrl: '/uploads/quick/icons/fashion-denim.svg',
            accent: '#1E40AF',
            promoTiles: [
                { title: 'Jeans', imageUrl: IMG.jeans, link: cat('jeans') },
                { title: 'Denim Shorts', imageUrl: IMG.denimShorts, link: cat(rootJeans) },
                { title: 'Denim Jackets', imageUrl: IMG.denimJacket, link: cat('bomber') },
            ],
            rewards: rewards([IMG.jeans, IMG.denimDress, IMG.denimJacket]),
            offerStrip: nearby,
        },
        {
            slug: 'formal',
            label: 'Formal',
            iconUrl: '/uploads/quick/icons/fashion-formal.svg',
            accent: '#334155',
            promoTiles: [
                { title: 'Suits & Blazers', imageUrl: IMG.blazer, link: cat('suits') },
                { title: 'Formal Shirts', imageUrl: IMG.formalShirt, link: cat('shirts') },
                { title: 'Work Dresses', imageUrl: IMG.sheath, link: cat('dresses') },
            ],
            rewards: rewards([IMG.suit, IMG.formalShirt, IMG.sheath]),
            offerStrip: nearby,
        },
        {
            slug: 'party',
            label: 'Party',
            iconUrl: '/uploads/quick/icons/fashion-party.svg',
            accent: '#9D174D',
            promoTiles: [
                { title: 'Party Dresses', imageUrl: IMG.satinDress, link: cat('dresses') },
                { title: 'Tuxedos & Suits', imageUrl: IMG.tuxedo, link: cat('suits') },
                { title: 'Skirts', imageUrl: IMG.midiSkirt, link: cat('skirts') },
            ],
            rewards: rewards([IMG.satinDress, IMG.tuxedo, IMG.tennisSkirt]),
            offerStrip: nearby,
        },
        {
            slug: 'activewear',
            label: 'Activewear',
            iconUrl: '/uploads/quick/icons/fashion-active.svg',
            accent: '#047857',
            promoTiles: [
                { title: 'Gym Tees', imageUrl: IMG.gymTee, link: cat('gym') },
                { title: 'Joggers', imageUrl: IMG.joggers, link: cat('joggers') },
                { title: 'Co-ord Sets', imageUrl: IMG.coord, link: cat('joggers') },
            ],
            rewards: rewards([IMG.gymTee, IMG.joggers, IMG.coord]),
            offerStrip: nearby,
        },
        {
            slug: 'winterwear',
            label: 'Winterwear',
            iconUrl: '/uploads/quick/icons/fashion-winter.svg',
            accent: '#475569',
            promoTiles: [
                { title: 'Hoodies', imageUrl: IMG.frenchTerry, link: cat('hoodies') },
                { title: 'Jackets', imageUrl: IMG.denimJacket, link: cat('bomber') },
                { title: 'Knitwear', imageUrl: IMG.knit, link: cat('tops') },
            ],
            rewards: rewards([IMG.hoodie, IMG.puffer, IMG.knit]),
            offerStrip: nearby,
        },
        {
            slug: 'streetwear',
            label: 'Streetwear',
            iconUrl: '/uploads/quick/icons/fashion-street.svg',
            accent: '#111827',
            promoTiles: [
                { title: 'Graphic Tees', imageUrl: IMG.skeletonTee, link: cat('tshirts') },
                { title: 'Hoodies', imageUrl: IMG.hoodie, link: cat('hoodies') },
                { title: 'Joggers', imageUrl: IMG.joggers, link: cat('joggers') },
            ],
            rewards: rewards([IMG.graphicTee, IMG.hoodie, IMG.joggers]),
            offerStrip: nearby,
        },
    ],
    featured: [
        { title: 'Fresh Drops', badge: 'New in', style: 'launch', artUrl: IMG.graphicTee, link: cat('tshirts') },
        { title: 'Streetwear', badge: 'Featured', style: 'featured', artUrl: IMG.hoodie, link: cat('hoodies') },
        { title: 'Summer Dresses', badge: 'Featured', style: 'featured', artUrl: IMG.dress, link: cat('dresses') },
        { title: 'Denim Edit', badge: 'Featured', style: 'featured', artUrl: IMG.jeans, link: cat('jeans') },
        { title: 'Ethnic Picks', badge: 'Featured', style: 'featured', artUrl: IMG.kurta, link: cat('kurtas') },
        { title: 'Suit Up', badge: 'Featured', style: 'featured', artUrl: IMG.suit, link: cat('suits') },
        { title: 'Little Ones', badge: 'New in', style: 'launch', artUrl: IMG.partySet, link: cat('kids') },
    ],
    campaigns: [
        {
            title: 'Layer up for winter',
            subtitle: 'Hoodies, sweatshirts and jackets in minutes',
            artUrl: IMG.streetCover,
            ctaText: 'Shop now',
            link: cat('hoodies'),
            tint: '#1F2937',
        },
        {
            title: 'Festive ethnic wear',
            subtitle: 'Kurtas and anarkalis from stores near you',
            artUrl: IMG.anarkali,
            ctaText: 'Explore',
            link: cat('kurtas'),
            tint: '#7C2D12',
        },
        {
            title: 'Dress the little ones',
            subtitle: 'Tees, frocks and party sets for kids',
            artUrl: IMG.kidsCover,
            ctaText: 'Shop kids',
            link: cat('kids'),
            tint: '#9A3412',
        },
    ],
    categoryGroups: [
        { title: 'Men', parentCategoryId: CAT.men },
        { title: 'Women', parentCategoryId: CAT.women },
        { title: 'Activewear', parentCategoryId: CAT.activewear },
        { title: 'Jackets & Winterwear', parentCategoryId: CAT.jackets },
        { title: 'Kids', parentCategoryId: 'kids' },
    ],
};

async function main() {
    const uri = process.env.MONGO_URI || process.env.MONGODB_URI;
    if (!uri) throw new Error('Missing MONGO_URI');
    await mongoose.connect(uri, { serverSelectionTimeoutMS: 30000 });

    if (process.argv.includes('--restore')) {
        const saved = JSON.parse(fs.readFileSync(BACKUP, 'utf8'));
        for (const doc of saved) {
            const { _id, ...rest } = doc;
            await QuickHomeLayout.collection.replaceOne(
                { _id: new mongoose.Types.ObjectId(_id) },
                { ...rest, zoneId: rest.zoneId ? new mongoose.Types.ObjectId(rest.zoneId) : null },
                { upsert: true },
            );
        }
        console.log(`Restored ${saved.length} layout(s) from ${BACKUP}`);
        await mongoose.disconnect();
        return;
    }

    // Keep what is there now, once; a re-run must not overwrite the grocery original.
    const existing = await QuickHomeLayout.find({}).lean();
    fs.mkdirSync(path.dirname(BACKUP), { recursive: true });
    if (!fs.existsSync(BACKUP)) {
        fs.writeFileSync(BACKUP, JSON.stringify(existing, null, 2));
        console.log(`Backed up ${existing.length} layout(s) to ${BACKUP}`);
    } else {
        console.log(`Backup already at ${BACKUP}; left as is`);
    }

    fs.mkdirSync(ICON_DIR, { recursive: true, mode: 0o755 });
    for (const [name, body] of Object.entries(ICONS)) {
        const file = path.join(ICON_DIR, `${name}.svg`);
        fs.writeFileSync(file, body);
        fs.chmodSync(file, 0o644);
    }
    console.log(`Wrote ${Object.keys(ICONS).length} tab icons`);

    // Categories made by seed-apparel-stores.mjs.
    const ids = {};
    for (const [key, [name, parentName]] of Object.entries(NAMED)) {
        let parentId = null;
        if (parentName) {
            const parent =
                (await Category.findOne({ name: parentName, parentId: null, seedTag: 'apparel-seed-v1' })) ||
                (await Category.findOne({ name: parentName, parentId: null, seedTag: 'apparel-stores-v1' }));
            if (!parent) throw new Error(`Category ${parentName} not found; run seed-apparel-stores.mjs first`);
            parentId = parent._id;
        }
        const found = await Category.findOne({ name, parentId, isActive: true });
        if (!found) throw new Error(`Category ${name} not found; run seed-apparel-stores.mjs first`);
        ids[key] = String(found._id);
    }
    Object.assign(CAT, ids);
    const resolve = (link) => link.replace(/\/quick\/category\/([a-z]+)$/, (m, key) => (CAT[key] ? `/quick/category/${CAT[key]}` : m));
    for (const t of LAYOUT.themes) for (const tile of t.promoTiles) tile.link = resolve(tile.link);
    for (const f of LAYOUT.featured) f.link = resolve(f.link);
    for (const c of LAYOUT.campaigns) c.link = resolve(c.link);
    for (const g of LAYOUT.categoryGroups) g.parentCategoryId = CAT[g.parentCategoryId] || g.parentCategoryId;

    // Every picture must exist, or the home would show gaps.
    const missing = [...new Set(Object.values(IMG))].filter((u) => !fs.existsSync(path.join(UPLOAD_ROOT, u.replace(/^\/uploads\//, ''))));
    if (missing.length) throw new Error(`Missing images:\n${missing.join('\n')}`);

    // The same layout for every stored zone, or the global one when none is stored.
    const zones = existing.length ? existing.map((d) => d.zoneId || null) : [null];
    for (const zoneId of zones) {
        const saved = await saveQuickHomeLayout(zoneId ? String(zoneId) : null, LAYOUT);
        console.log(`Saved layout for ${zoneId ? `zone ${zoneId}` : 'all zones'}: ${saved.themes.map((t) => t.label).join(', ')}`);
    }
    await mongoose.disconnect();
}

main().catch(async (err) => {
    console.error(err.message || err);
    await mongoose.disconnect().catch(() => {});
    process.exit(1);
});
