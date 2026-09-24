import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import mongoose from 'mongoose';
import { connectDB, disconnectDB } from '../src/config/db.js';

const UPLOADS_DIR = '/var/www/warehouses-uploads';
const BANNERS_DIR = path.join(UPLOADS_DIR, 'seed/banners');
const PRODUCTS_DIR = path.join(UPLOADS_DIR, 'seed/products');
const CATEGORIES_DIR = path.join(UPLOADS_DIR, 'seed/categories');
const QUICK_UPLOADS = path.join(UPLOADS_DIR, 'quick');

async function processImages() {
    console.log('--- Processing Images for Electronics & Banners ---');
    await fs.mkdir(BANNERS_DIR, { recursive: true });
    await fs.mkdir(PRODUCTS_DIR, { recursive: true });
    await fs.mkdir(CATEGORIES_DIR, { recursive: true });

    const bannerSrc = '/tmp/banner_electronics_tech.jpg';
    const meta = await sharp(bannerSrc).metadata();
    const W = meta.width;
    const H = meta.height;
    console.log(`Source banner size: ${W}x${H}`);

    // 1. Create WebP Hero Banners
    await sharp(bannerSrc)
        .resize(1600, 640, { fit: 'cover' })
        .webp({ quality: 88 })
        .toFile(path.join(BANNERS_DIR, 'hero-electronics-tech.webp'));
    console.log('✓ Created hero-electronics-tech.webp');

    // Also copy to quick campaigns
    await sharp(bannerSrc)
        .resize(1360, 680, { fit: 'cover', position: 'center' })
        .webp({ quality: 85 })
        .toFile(path.join(QUICK_UPLOADS, 'campaigns/tech-fest.webp'));
    console.log('✓ Created quick campaign tech-fest.webp');

    // 2. Crop individual product images
    // Earbuds
    await sharp(bannerSrc)
        .extract({
            left: Math.round(W * 0.05),
            top: Math.round(H * 0.15),
            width: Math.round(W * 0.28),
            height: Math.round(H * 0.70),
        })
        .resize(600, 600, { fit: 'contain', background: { r: 10, g: 17, b: 40, alpha: 1 } })
        .webp({ quality: 90 })
        .toFile(path.join(PRODUCTS_DIR, 'tws-earbuds.webp'));

    // Smartphone
    await sharp(bannerSrc)
        .extract({
            left: Math.round(W * 0.28),
            top: Math.round(H * 0.08),
            width: Math.round(W * 0.25),
            height: Math.round(H * 0.85),
        })
        .resize(600, 600, { fit: 'contain', background: { r: 10, g: 17, b: 40, alpha: 1 } })
        .webp({ quality: 90 })
        .toFile(path.join(PRODUCTS_DIR, 'smartphone-5g.webp'));

    // 65W GaN Charger
    await sharp(bannerSrc)
        .extract({
            left: Math.round(W * 0.52),
            top: Math.round(H * 0.18),
            width: Math.round(W * 0.22),
            height: Math.round(H * 0.65),
        })
        .resize(600, 600, { fit: 'contain', background: { r: 10, g: 17, b: 40, alpha: 1 } })
        .webp({ quality: 90 })
        .toFile(path.join(PRODUCTS_DIR, 'gan-charger-65w.webp'));

    // Smartwatch
    await sharp(bannerSrc)
        .extract({
            left: Math.round(W * 0.72),
            top: Math.round(H * 0.20),
            width: Math.round(W * 0.26),
            height: Math.round(H * 0.70),
        })
        .resize(600, 600, { fit: 'contain', background: { r: 10, g: 17, b: 40, alpha: 1 } })
        .webp({ quality: 90 })
        .toFile(path.join(PRODUCTS_DIR, 'smartwatch-fitness.webp'));

    // Braided Cable
    await sharp(bannerSrc)
        .extract({
            left: Math.round(W * 0.48),
            top: Math.round(H * 0.18),
            width: Math.round(W * 0.32),
            height: Math.round(H * 0.65),
        })
        .resize(600, 600, { fit: 'contain', background: { r: 10, g: 17, b: 40, alpha: 1 } })
        .webp({ quality: 90 })
        .toFile(path.join(PRODUCTS_DIR, 'braided-type-c-cable.webp'));

    // Electronics category tile
    await sharp(bannerSrc)
        .extract({
            left: Math.round(W * 0.05),
            top: Math.round(H * 0.15),
            width: Math.round(W * 0.48),
            height: Math.round(H * 0.75),
        })
        .resize(400, 400, { fit: 'cover' })
        .webp({ quality: 90 })
        .toFile(path.join(CATEGORIES_DIR, 'electronics.webp'));

    console.log('✓ Product & category images generated successfully!');
}

async function seedDatabase() {
    console.log('--- Seeding Categories, Products & Banners in MongoDB ---');
    await connectDB();
    const db = mongoose.connection.db;

    const sellersCol = db.collection('sellers');
    const catsCol = db.collection('categories');
    const prodsCol = db.collection('products');
    const bannersCol = db.collection('hero_banners');
    const layoutCol = db.collection('quickhomelayouts');

    // Get active sellers
    const sellers = await sellersCol.find({}).toArray();
    if (!sellers.length) {
        console.error('No sellers found in database!');
        return;
    }
    const defaultSeller = sellers[0];
    const sellerIds = sellers.map(s => s._id);

    // 1. Categories
    let electronicsCat = await catsCol.findOne({ slug: 'electronics' });
    if (!electronicsCat) {
        const res = await catsCol.insertOne({
            name: 'Electronics',
            slug: 'electronics',
            description: 'Smartphones, audio, fast chargers & mobile accessories',
            image: '/uploads/seed/categories/electronics.webp',
            parentId: null,
            isActive: true,
            createdAt: new Date(),
            updatedAt: new Date(),
        });
        electronicsCat = { _id: res.insertedId, name: 'Electronics', slug: 'electronics' };
        console.log('✓ Created Electronics root category');
    }

    const subcats = [
        { name: 'Audio & Headphones', slug: 'audio-and-headphones' },
        { name: 'Chargers & Cables', slug: 'chargers-and-cables' },
        { name: 'Smart Watches', slug: 'smart-watches' },
        { name: 'Power Banks & Mobile', slug: 'power-banks-and-mobile' },
    ];

    const subcatMap = {};
    for (const sub of subcats) {
        let existing = await catsCol.findOne({ slug: sub.slug });
        if (!existing) {
            const res = await catsCol.insertOne({
                name: sub.name,
                slug: sub.slug,
                parentId: electronicsCat._id,
                image: '/uploads/seed/categories/electronics.webp',
                isActive: true,
                createdAt: new Date(),
                updatedAt: new Date(),
            });
            subcatMap[sub.slug] = res.insertedId;
        } else {
            subcatMap[sub.slug] = existing._id;
        }
    }
    console.log('✓ Subcategories configured');

    // 2. Products Definition
    const productsData = [
        {
            name: 'boAt Airdopes 141 ANC Wireless TWS Earbuds',
            brand: 'boAt',
            packSize: '1 unit',
            categoryName: 'Audio & Headphones',
            categoryId: subcatMap['audio-and-headphones'],
            price: 1299,
            mrp: 3990,
            image: '/uploads/seed/products/tws-earbuds.webp',
            description: 'Up to 42 hours total playback, Beast Mode 50ms low latency for gaming, ENx Technology for crystal-clear calls, ASAP Charge: 10 mins charge = 75 mins playtime, IPX5 water resistance.',
            tags: ['audio', 'earbuds', 'wireless', 'electronics', 'tws', 'boat'],
            vegNonVeg: null,
        },
        {
            name: 'Portronics 65W GaN Dual Type-C Fast Charger',
            brand: 'Portronics',
            packSize: '65W Adapter',
            categoryName: 'Chargers & Cables',
            categoryId: subcatMap['chargers-and-cables'],
            price: 1499,
            mrp: 2999,
            image: '/uploads/seed/products/gan-charger-65w.webp',
            description: 'Ultra-compact GaN technology charger for Laptops, MacBooks, iPhones & Android devices. Dual USB-C PD output with multi-layer smart temperature protection.',
            tags: ['charger', 'adapter', 'fast-charging', 'gan', 'electronics', 'type-c'],
            vegNonVeg: null,
        },
        {
            name: 'Anker PowerLine 100W Braided Type-C to Type-C Cable',
            brand: 'Anker',
            packSize: '1.2 meter',
            categoryName: 'Chargers & Cables',
            categoryId: subcatMap['chargers-and-cables'],
            price: 499,
            mrp: 999,
            image: '/uploads/seed/products/braided-type-c-cable.webp',
            description: 'Military-grade double nylon braided 100W Power Delivery cable. Fast data sync up to 480 Mbps, bend tested 25,000+ times.',
            tags: ['cable', 'type-c', 'fast-charging', 'braided', 'electronics'],
            vegNonVeg: null,
        },
        {
            name: 'Noise ColorFit Pulse 3 Bluetooth Calling Smartwatch',
            brand: 'Noise',
            packSize: '1.96" HD Display',
            categoryName: 'Smart Watches',
            categoryId: subcatMap['smart-watches'],
            price: 1799,
            mrp: 4999,
            image: '/uploads/seed/products/smartwatch-fitness.webp',
            description: '1.96 inch TFT display with 550 nits brightness, advanced Tru Sync Bluetooth calling, 100+ sports modes, 24x7 heart rate and SpO2 health tracking, up to 7-day battery life.',
            tags: ['smartwatch', 'fitness', 'noise', 'bluetooth-calling', 'electronics', 'wearables'],
            vegNonVeg: null,
        },
        {
            name: 'OnePlus Nord Buds 2 TWS Earbuds with BassWave',
            brand: 'OnePlus',
            packSize: '1 Pair',
            categoryName: 'Audio & Headphones',
            categoryId: subcatMap['audio-and-headphones'],
            price: 2499,
            mrp: 3299,
            image: '/uploads/seed/products/tws-earbuds.webp',
            description: 'Active Noise Cancellation up to 25dB, 12.4mm dynamic drivers with BassWave enhancement, Dolby Atmos support, dual mic for clear calls.',
            tags: ['oneplus', 'earbuds', 'anc', 'audio', 'electronics'],
            vegNonVeg: null,
        },
        {
            name: 'Ambrane 20000mAh 22.5W Fast Charging Power Bank',
            brand: 'Ambrane',
            packSize: '20000 mAh',
            categoryName: 'Power Banks & Mobile',
            categoryId: subcatMap['power-banks-and-mobile'],
            price: 1699,
            mrp: 2999,
            image: '/uploads/seed/products/gan-charger-65w.webp',
            description: 'High capacity 20,000mAh lithium polymer battery. 22.5W Power Delivery and Quick Charge 3.0 output, triple device simultaneous charging.',
            tags: ['powerbank', 'battery', 'fast-charging', 'ambrane', 'electronics'],
            vegNonVeg: null,
        },
        {
            name: 'Ultra-Slim Clear Magnetic Phone Case',
            brand: 'Spigen',
            packSize: '1 piece',
            categoryName: 'Power Banks & Mobile',
            categoryId: subcatMap['power-banks-and-mobile'],
            price: 399,
            mrp: 899,
            image: '/uploads/seed/products/smartphone-5g.webp',
            description: 'Military-grade shockproof bumper protection with built-in magnetic ring for wireless magnetic chargers and car mounts.',
            tags: ['case', 'cover', 'magnetic', 'mobile-accessories', 'electronics'],
            vegNonVeg: null,
        },
        {
            name: 'boAt Stone 350 10W Wireless Bluetooth Speaker',
            brand: 'boAt',
            packSize: '10W RMS',
            categoryName: 'Audio & Headphones',
            categoryId: subcatMap['audio-and-headphones'],
            price: 1399,
            mrp: 3490,
            image: '/uploads/seed/products/tws-earbuds.webp',
            description: '10W stereo sound with punchy bass, 12 hours playback on single charge, IPX7 water and splash resistance, TWS true wireless pairing.',
            tags: ['speaker', 'bluetooth', 'boat', 'wireless', 'audio', 'electronics'],
            vegNonVeg: null,
        }
    ];

    for (const p of productsData) {
        for (const seller of sellers) {
            await prodsCol.updateOne(
                { name: p.name, sellerId: seller._id },
                {
                    $set: {
                        name: p.name,
                        brand: p.brand,
                        packSize: p.packSize,
                        categoryId: p.categoryId,
                        categoryName: p.categoryName,
                        sellerId: seller._id,
                        price: p.price,
                        mrp: p.mrp,
                        image: p.image,
                        images: [p.image],
                        description: p.description,
                        tags: p.tags,
                        rating: 4.6,
                        totalRatings: 128,
                        channels: {
                            quick: { enabled: true, stock: 50 },
                            shop: { enabled: true, stock: 200 },
                        },
                        channelsStock: {
                            quick: 50,
                            shop: 200,
                        },
                        variants: [
                            {
                                name: 'Default',
                                price: p.price,
                                mrp: p.mrp,
                                stock: 250,
                                sku: `SKU-${slug(p.name)}-${seller._id.toString().slice(-4)}`,
                                channels: {
                                    quick: { enabled: true, stock: 50 },
                                    shop: { enabled: true, stock: 200 },
                                },
                            }
                        ],
                        isActive: true,
                        approvalStatus: 'approved',
                        updatedAt: new Date(),
                    },
                    $setOnInsert: {
                        createdAt: new Date(),
                    }
                },
                { upsert: true }
            );
        }
    }
    console.log(`✓ Seeded ${productsData.length} electronic products across ${sellers.length} sellers!`);

    // 3. Hero Banners Configuration
    const banners = [
        {
            title: 'Next-Gen Tech & Electronics in 10 Mins',
            imageUrl: '/uploads/seed/banners/hero-electronics-tech.webp',
            publicId: 'banner-electronics-tech',
            ctaText: 'Shop Electronics',
            ctaLink: '/category/electronics',
            sortOrder: 0,
            isActive: true,
        },
        {
            title: 'Festive Mega Savings — Up to 50% OFF',
            imageUrl: '/uploads/seed/banners/hero-the-linen-cotton-stu.webp',
            publicId: 'banner-festive-deals',
            ctaText: 'Explore Deals',
            ctaLink: '/offers',
            sortOrder: 1,
            isActive: true,
        },
        {
            title: 'Superfast Fresh Harvest & Daily Groceries',
            imageUrl: '/uploads/seed/banners/hero-high-performance-act.webp',
            publicId: 'banner-fresh-mart',
            ctaText: 'Order Quick',
            ctaLink: '/quick',
            sortOrder: 2,
            isActive: true,
        },
        {
            title: 'Autumn & Winter Designer Wardrobe',
            imageUrl: '/uploads/seed/banners/hero-autumn-winter-contem.webp',
            publicId: 'banner-autumn-fashion',
            ctaText: 'Browse Collection',
            ctaLink: '/category/shirts',
            sortOrder: 3,
            isActive: true,
        },
    ];

    for (const b of banners) {
        await bannersCol.updateOne(
            { publicId: b.publicId },
            { $set: { ...b, updatedAt: new Date() }, $setOnInsert: { createdAt: new Date() } },
            { upsert: true }
        );
    }
    console.log('✓ Hero banners updated in MongoDB!');

    // 4. Update QuickHomeLayout campaigns with tech fest
    await layoutCol.updateOne(
        { zoneId: null },
        {
            $push: {
                campaigns: {
                    $each: [
                        {
                            title: '⚡ 10-Minute Electronics Hub',
                            subtitle: 'Genuine chargers, cables, earbuds & gadgets delivered fast',
                            artUrl: '/uploads/quick/campaigns/tech-fest.webp',
                            ctaText: 'Shop Tech',
                            link: '/quick/category/electronics',
                            tint: '#0F172A',
                            startsAt: null,
                            endsAt: null,
                            sortOrder: 0,
                            isActive: true,
                            poweredBy: [],
                        }
                    ],
                    $position: 0
                }
            }
        }
    );
    console.log('✓ QuickHomeLayout campaigns updated with Tech Fest!');

    await disconnectDB();
}

function slug(s) {
    return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 20);
}

async function main() {
    await processImages();
    await seedDatabase();
    console.log('=== All Electronics Products, Categories & Banners Seeded! ===');
}

main().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});
