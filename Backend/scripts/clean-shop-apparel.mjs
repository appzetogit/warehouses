import mongoose from 'mongoose';
import { connectDB, disconnectDB } from '../src/config/db.js';

async function cleanAndRestoreShop() {
    console.log('--- Cleaning Shop and Restoring Apparel Banners ---');
    await connectDB();
    const db = mongoose.connection.db;

    const bannersCol = db.collection('hero_banners');
    const catsCol = db.collection('categories');
    const prodsCol = db.collection('products');
    const topBannersCol = db.collection('top_banners');

    // 1. Remove all electronics products
    const delProds = await prodsCol.deleteMany({
        $or: [
            { categoryName: /electronics/i },
            { name: /earbuds/i },
            { name: /smartphone/i },
            { name: /charger/i },
            { name: /smartwatch/i },
            { name: /type-c cable/i },
            { description: /electronics/i }
        ]
    });
    console.log(`✓ Deleted ${delProds.deletedCount} electronics products`);

    // 2. Remove all electronics categories
    const delCats = await catsCol.deleteMany({
        $or: [
            { slug: 'electronics' },
            { slug: 'audio-and-headphones' },
            { slug: 'chargers-and-cables' },
            { slug: 'smart-watches' },
            { slug: 'power-banks-and-mobile' },
            { name: /electronics/i }
        ]
    });
    console.log(`✓ Deleted ${delCats.deletedCount} electronics categories`);

    // 3. Clear all old hero_banners to remove duplicates, electronics, and grocery banners
    await bannersCol.deleteMany({});
    console.log('✓ Cleared old hero_banners collection');

    // 4. Configure the classic Apparel Banners for Shop section
    const apparelBanners = [
        {
            publicId: 'banner-autumn-winter-edit',
            title: 'Autumn/Winter Contemporary Edit',
            ctaText: 'Shop New Arrivals',
            ctaLink: '/category/t-shirts',
            sortOrder: 1,
            imageUrl: '/uploads/seed/banners/hero-autumn-winter-contem.webp',
            isActive: true,
        },
        {
            publicId: 'banner-linen-cotton-studio',
            title: 'The Linen & Cotton Studio',
            ctaText: 'Explore Casuals',
            ctaLink: '/category/shirts',
            sortOrder: 2,
            imageUrl: '/uploads/seed/banners/hero-the-linen-cotton-stu.webp',
            isActive: true,
        },
        {
            publicId: 'banner-indigo-denim',
            title: 'Timeless Indigo & Denim Essentials',
            ctaText: 'View Collection',
            ctaLink: '/category/jeans',
            sortOrder: 3,
            imageUrl: '/uploads/seed/banners/hero-timeless-indigo-deni.webp',
            isActive: true,
        },
        {
            publicId: 'banner-activewear',
            title: 'High-Performance Activewear',
            ctaText: 'Move in Comfort',
            ctaLink: '/category/gym-tees-and-tops',
            sortOrder: 4,
            imageUrl: '/uploads/seed/banners/hero-high-performance-act.webp',
            isActive: true,
        },
        {
            publicId: 'banner-festive-royal',
            title: 'Artisanal Festive & Ethnic Glamour',
            ctaText: 'Explore Kurtas',
            ctaLink: '/category/kurtas',
            sortOrder: 5,
            imageUrl: '/uploads/quick/fashion/banners/banner-3-festive-ethnic.webp',
            isActive: true,
        },
    ];

    for (const b of apparelBanners) {
        await bannersCol.updateOne(
            { publicId: b.publicId },
            {
                $set: {
                    ...b,
                    updatedAt: new Date()
                },
                $setOnInsert: { createdAt: new Date() }
            },
            { upsert: true }
        );
        console.log(`✓ Configured Shop banner: ${b.title}`);
    }

    // 5. Check remaining hero_banners
    const allBanners = await bannersCol.find({ isActive: true }).toArray();
    console.log(`--- Total Active Shop Hero Banners: ${allBanners.length} ---`);
    for (const b of allBanners) {
        console.log(`  [${b.sortOrder}] ${b.title} (${b.imageUrl})`);
    }

    await disconnectDB();
    console.log('=== Shop Cleaned and Classic Apparel Banners Restored! ===');
}

cleanAndRestoreShop().catch(console.error);
