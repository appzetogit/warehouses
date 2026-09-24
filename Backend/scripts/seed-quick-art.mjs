import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import mongoose from 'mongoose';

const QUICK_UPLOADS = '/var/www/warehouses-uploads/quick';
const TMP_DIR = '/tmp';

// Helper to remove solid white or near-white background and make it transparent
async function makeWhiteTransparent(inputPath, outputPath, width = 420, height = 420) {
    const img = sharp(inputPath);
    const { data, info } = await img
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });

    // Process pixels: if R, G, B are all close to white (>= 240), blend alpha to 0
    for (let i = 0; i < data.length; i += 4) {
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        const minVal = Math.min(r, g, b);
        
        if (minVal >= 250) {
            data[i + 3] = 0;
        } else if (minVal >= 235) {
            // Feather the edge smoothly
            const factor = (250 - minVal) / 15;
            data[i + 3] = Math.round(data[i + 3] * factor);
        }
    }

    await sharp(data, {
        raw: {
            width: info.width,
            height: info.height,
            channels: 4,
        },
    })
        .resize(width, height, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
        .webp({ quality: 90, alphaQuality: 100 })
        .toFile(outputPath);
}

// 1. Generate SVG Icons (48x48, 2px stroke, currentColor)
async function generateIcons() {
    const iconDir = path.join(QUICK_UPLOADS, 'icons');
    await fs.mkdir(iconDir, { recursive: true });

    const icons = {
        'all.svg': `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <rect x="6" y="6" width="15" height="15" rx="3"/>
  <rect x="27" y="6" width="15" height="15" rx="3"/>
  <rect x="6" y="27" width="15" height="15" rx="3"/>
  <rect x="27" y="27" width="15" height="15" rx="3"/>
</svg>`,
        'festive.svg': `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <path d="M24 6c-3 5-5 8-5 12a5 5 0 0 0 10 0c0-4-2-7-5-12z"/>
  <path d="M10 24c0 7 6 12 14 12s14-5 14-12H10z"/>
  <path d="M18 36v6h12v-6"/>
  <line x1="14" y1="42" x2="34" y2="42"/>
</svg>`,
        'electronics.svg': `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <rect x="12" y="6" width="24" height="36" rx="4"/>
  <line x1="21" y1="36" x2="27" y2="36"/>
  <circle cx="24" cy="11" r="1"/>
</svg>`,
        'beauty.svg': `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <path d="M20 10h8v4h-8z"/>
  <path d="M14 14h20v24a4 4 0 0 1-4 4H18a4 4 0 0 1-4-4V14z"/>
  <path d="M24 22v10"/>
  <path d="M19 27h10"/>
</svg>`,
        'gifting.svg': `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <rect x="8" y="16" width="32" height="24" rx="3"/>
  <path d="M6 10h36v6H6z"/>
  <line x1="24" y1="10" x2="24" y2="40"/>
  <path d="M24 10c-3-4-8-4-8 0 0 3 5 4 8 0z"/>
  <path d="M24 10c3-4 8-4 8 0 0 3-5 4-8 0z"/>
</svg>`,
        'decor.svg': `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <path d="M16 28h16l-3 12H19l-3-12z"/>
  <path d="M24 28V16"/>
  <path d="M24 18c-4-4-10-2-10 4 3 1 7-1 10-4z"/>
  <path d="M24 22c4-4 10-2 10 4-3 1-7-1-10-4z"/>
  <path d="M24 16c0-6 4-8 4-8s0 4-4 8z"/>
</svg>`,
    };

    for (const [filename, svg] of Object.entries(icons)) {
        await fs.writeFile(path.join(iconDir, filename), svg, 'utf8');
        console.log(`✓ Icon created: ${filename}`);
    }
}

// 2. Generate Themes Backgrounds (1080x960 WebP)
async function generateThemeBackgrounds() {
    const allBgDst = path.join(QUICK_UPLOADS, 'themes/all/bg.webp');
    const festiveBgDst = path.join(QUICK_UPLOADS, 'themes/festive/bg.webp');

    await sharp('/tmp/theme_all_bg_1790232459396.jpg')
        .resize(1080, 960, { fit: 'cover', position: 'top' })
        .webp({ quality: 85 })
        .toFile(allBgDst);
    console.log(`✓ Theme All background created: 1080x960`);

    await sharp('/tmp/theme_festive_bg_1790232478323.jpg')
        .resize(1080, 960, { fit: 'cover', position: 'top' })
        .webp({ quality: 85 })
        .toFile(festiveBgDst);
    console.log(`✓ Theme Festive background created: 1080x960`);
}

// 3. Generate Promo Tiles (420x420 transparent, bottom weighted)
async function generatePromoTiles() {
    const tiles = [
        { src: '/tmp/tile_all_1_1790232515128.jpg', dst: path.join(QUICK_UPLOADS, 'themes/all/tile-1.webp') },
        { src: '/tmp/tile_all_2_1790232550442.jpg', dst: path.join(QUICK_UPLOADS, 'themes/all/tile-2.webp') },
        { src: '/tmp/tile_all_3_1790232577827.jpg', dst: path.join(QUICK_UPLOADS, 'themes/all/tile-3.webp') },
        { src: '/tmp/tile_festive_1_1790232609827.jpg', dst: path.join(QUICK_UPLOADS, 'themes/festive/tile-1.webp') },
        { src: '/tmp/tile_festive_2_1790232644538.jpg', dst: path.join(QUICK_UPLOADS, 'themes/festive/tile-2.webp') },
        { src: '/tmp/tile_festive_3_1790232664823.jpg', dst: path.join(QUICK_UPLOADS, 'themes/festive/tile-3.webp') },
    ];

    for (const t of tiles) {
        await makeWhiteTransparent(t.src, t.dst, 420, 420);
        console.log(`✓ Promo tile created: ${t.dst}`);
    }
}

// 4. Generate Rewards Thumbs (160x160 centred)
async function generateRewardsThumbs() {
    // All theme rewards
    await sharp('/var/www/warehouses-uploads/seed/products/grocery/salted-butter/1.webp')
        .resize(160, 160, { fit: 'cover' })
        .webp({ quality: 90 })
        .toFile(path.join(QUICK_UPLOADS, 'themes/all/rewards-1.webp'));

    await sharp('/var/www/warehouses-uploads/seed/products/grocery/greek-yogurt-blueberry/1.webp')
        .resize(160, 160, { fit: 'cover' })
        .webp({ quality: 90 })
        .toFile(path.join(QUICK_UPLOADS, 'themes/all/rewards-2.webp'));

    await sharp('/var/www/warehouses-uploads/seed/products/grocery/instant-coffee/1.webp')
        .resize(160, 160, { fit: 'cover' })
        .webp({ quality: 90 })
        .toFile(path.join(QUICK_UPLOADS, 'themes/all/rewards-3.webp'));

    // Festive theme rewards (extract from festive promo clusters)
    await sharp('/tmp/tile_festive_1_1790232609827.jpg')
        .extract({ left: 300, top: 450, width: 420, height: 420 })
        .resize(160, 160, { fit: 'cover' })
        .webp({ quality: 90 })
        .toFile(path.join(QUICK_UPLOADS, 'themes/festive/rewards-1.webp'));

    await sharp('/tmp/tile_festive_2_1790232644538.jpg')
        .extract({ left: 320, top: 450, width: 420, height: 420 })
        .resize(160, 160, { fit: 'cover' })
        .webp({ quality: 90 })
        .toFile(path.join(QUICK_UPLOADS, 'themes/festive/rewards-2.webp'));

    await sharp('/tmp/tile_festive_3_1790232664823.jpg')
        .extract({ left: 300, top: 450, width: 420, height: 420 })
        .resize(160, 160, { fit: 'cover' })
        .webp({ quality: 90 })
        .toFile(path.join(QUICK_UPLOADS, 'themes/festive/rewards-3.webp'));

    console.log(`✓ Rewards thumbnails created (160x160)`);
}

// 5. Generate Featured Cards (600x750, 4:5, top 30% clear)
async function generateFeaturedCards() {
    const featuredDir = path.join(QUICK_UPLOADS, 'featured');
    await fs.mkdir(featuredDir, { recursive: true });

    const cards = [
        { src: '/tmp/featured_for_you.jpg', dst: path.join(featuredDir, 'for-you.webp') },
        { src: '/tmp/featured_chai_bites.jpg', dst: path.join(featuredDir, 'monsoon-munchies.webp') },
        { src: '/tmp/featured_dairy_delights_1790231969948.jpg', dst: path.join(featuredDir, 'dairy-delights.webp') },
        { src: '/tmp/featured_healthy_habits_1790232195575.jpg', dst: path.join(featuredDir, 'healthy-habits.webp') },
    ];

    for (const c of cards) {
        await sharp(c.src)
            .resize(600, 750, { fit: 'cover', position: 'bottom' })
            .webp({ quality: 85 })
            .toFile(c.dst);
        console.log(`✓ Featured card created: ${c.dst} (600x750)`);
    }
}

// 6. Generate Campaigns (1360x680, 2:1, art on right, left 55% clear)
async function generateCampaigns() {
    const campDir = path.join(QUICK_UPLOADS, 'campaigns');
    await fs.mkdir(campDir, { recursive: true });

    await sharp('/tmp/campaign_organic_harvest_1790232397659.jpg')
        .resize(1360, 680, { fit: 'cover', position: 'right' })
        .webp({ quality: 85 })
        .toFile(path.join(campDir, 'organic-harvest.webp'));

    await sharp('/tmp/campaign_snack_fest_1790232424685.jpg')
        .resize(1360, 680, { fit: 'cover', position: 'right' })
        .webp({ quality: 85 })
        .toFile(path.join(campDir, 'snack-fest.webp'));

    console.log(`✓ Campaigns created: 1360x680`);
}

// 7. Generate Categories Cutouts (400x400 transparent)
async function generateCategoryCutouts() {
    const catDir = path.join(QUICK_UPLOADS, 'categories');
    await fs.mkdir(catDir, { recursive: true });

    const cats = [
        'milk', 'curd-and-yogurt', 'butter-and-cheese', 'dairy',
        'fresh-fruits', 'fresh-vegetables', 'fruits-and-vegetables',
        'atta-and-flour', 'rice-and-pulses', 'oils', 'staples',
        'biscuits', 'chips-and-namkeen', 'snacks',
        'tea-and-coffee', 'soft-drinks', 'beverages'
    ];

    for (const slug of cats) {
        const seedCatPath = `/var/www/warehouses-uploads/seed/categories/${slug}.webp`;
        const dstPath = path.join(catDir, `${slug}.webp`);
        try {
            await sharp(seedCatPath)
                .resize(400, 400, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
                .webp({ quality: 90 })
                .toFile(dstPath);
            console.log(`✓ Category tile cutout created: ${slug}.webp (400x400)`);
        } catch (e) {
            console.warn(`! Skipped category cutout ${slug}: ${e.message}`);
        }
    }
}

// 8. Seed QuickHomeLayout in MongoDB
import { connectDB, disconnectDB } from '../src/config/db.js';

async function seedLayoutInMongo() {
    console.log('Connecting to Mongo database via connectDB...');
    await connectDB();

    const db = mongoose.connection.db;
    const col = db.collection('quickhomelayouts');

    const globalLayout = {
        zoneId: null,
        themes: [
            {
                slug: 'all',
                label: 'All',
                iconUrl: '/uploads/quick/icons/all.svg',
                backgroundUrl: '/uploads/quick/themes/all/bg.webp',
                accent: '#0C831F',
                poweredBy: [],
                promoTiles: [
                    { title: 'Buy 2 Get 1 Free', imageUrl: '/uploads/quick/themes/all/tile-1.webp', link: '/quick/search?minDiscount=10' },
                    { title: 'Everything Organic', imageUrl: '/uploads/quick/themes/all/tile-2.webp', link: '/quick/search?q=organic' },
                    { title: 'Minimum 35% OFF', imageUrl: '/uploads/quick/themes/all/tile-3.webp', link: '/quick/search?minDiscount=35' },
                ],
                rewards: {
                    title: 'Win assured rewards',
                    subtitle: 'Shop for ₹249 or more to avail',
                    thumbs: [
                        '/uploads/quick/themes/all/rewards-1.webp',
                        '/uploads/quick/themes/all/rewards-2.webp',
                        '/uploads/quick/themes/all/rewards-3.webp',
                    ],
                    link: '/spin',
                },
                offerStrip: {
                    text: 'Extra 5% OFF on first organic order above ₹249 →',
                    link: '/quick/search?q=organic',
                },
                startsAt: null,
                endsAt: null,
                sortOrder: 0,
                isActive: true,
            },
            {
                slug: 'festive',
                label: 'Ganeshotsav',
                iconUrl: '/uploads/quick/icons/festive.svg',
                backgroundUrl: '/uploads/quick/themes/festive/bg.webp',
                accent: '#D97706',
                poweredBy: [],
                promoTiles: [
                    { title: 'Festive Sweets & Modaks', imageUrl: '/uploads/quick/themes/festive/tile-1.webp', link: '/quick/category/biscuits' },
                    { title: 'Dry Fruits & Gifting', imageUrl: '/uploads/quick/themes/festive/tile-2.webp', link: '/quick/category/snacks' },
                    { title: 'Pooja Essentials', imageUrl: '/uploads/quick/themes/festive/tile-3.webp', link: '/quick/category/oils' },
                ],
                rewards: {
                    title: 'Festive Jackpot Rewards',
                    subtitle: 'Win up to 500 gold coins on every festive order',
                    thumbs: [
                        '/uploads/quick/themes/festive/rewards-1.webp',
                        '/uploads/quick/themes/festive/rewards-2.webp',
                        '/uploads/quick/themes/festive/rewards-3.webp',
                    ],
                    link: '/spin',
                },
                offerStrip: {
                    text: 'Special festive discount: Extra ₹50 off on orders above ₹499 →',
                    link: '/coins',
                },
                startsAt: null,
                endsAt: null,
                sortOrder: 1,
                isActive: true,
            },
        ],
        featured: [
            {
                title: '✦ For You ✦',
                badge: 'Newly launched',
                style: 'launch',
                artUrl: '/uploads/quick/featured/for-you.webp',
                link: '/quick/search?q=gourmet',
                sortOrder: 0,
                isActive: true,
            },
            {
                title: 'Chai & Bites',
                badge: 'Featured',
                style: 'featured',
                artUrl: '/uploads/quick/featured/monsoon-munchies.webp',
                link: '/quick/category/tea-and-coffee',
                sortOrder: 1,
                isActive: true,
            },
            {
                title: 'Dairy Delights',
                badge: 'Featured',
                style: 'featured',
                artUrl: '/uploads/quick/featured/dairy-delights.webp',
                link: '/quick/category/dairy',
                sortOrder: 2,
                isActive: true,
            },
            {
                title: 'Fresh & Fit',
                badge: 'Featured',
                style: 'featured',
                artUrl: '/uploads/quick/featured/healthy-habits.webp',
                link: '/quick/category/fresh-fruits',
                sortOrder: 3,
                isActive: true,
            },
        ],
        campaigns: [
            {
                title: 'Farm to Table Organic',
                subtitle: 'Fresh, pesticide-free harvest delivered in 10 mins',
                artUrl: '/uploads/quick/campaigns/organic-harvest.webp',
                ctaText: 'Shop now',
                link: '/quick/category/fresh-vegetables',
                tint: '#F5F0E6',
                startsAt: null,
                endsAt: null,
                sortOrder: 0,
                isActive: true,
                poweredBy: [],
            },
            {
                title: 'Evening Munchies Fest',
                subtitle: 'Up to 40% off on premium chips, dips & drinks',
                artUrl: '/uploads/quick/campaigns/snack-fest.webp',
                ctaText: 'Explore deals',
                link: '/quick/category/chips-and-namkeen',
                tint: '#0A1128',
                startsAt: null,
                endsAt: null,
                sortOrder: 1,
                isActive: true,
                poweredBy: [],
            },
        ],
        categoryGroups: [],
        updatedAt: new Date(),
    };

    await col.updateOne(
        { zoneId: null },
        { $set: globalLayout },
        { upsert: true }
    );
    console.log('✓ QuickHomeLayout updated in MongoDB with full art configuration!');
    await disconnectDB();
}

async function main() {
    console.log('=== Building Quick Storefront Art & Seeding Layout ===');
    await generateIcons();
    await generateThemeBackgrounds();
    await generatePromoTiles();
    await generateRewardsThumbs();
    await generateFeaturedCards();
    await generateCampaigns();
    await generateCategoryCutouts();
    await seedLayoutInMongo();
    console.log('=== All Quick Art Generated and Seeded Successfully! ===');
}

main().catch((err) => {
    console.error('Fatal error:', err);
    process.exit(1);
});
