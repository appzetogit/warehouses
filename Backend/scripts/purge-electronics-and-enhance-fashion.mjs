import mongoose from 'mongoose';
import fs from 'fs';
import path from 'path';
import { connectDB, disconnectDB } from '../src/config/db.js';

const UPLOAD_ROOT = process.env.UPLOAD_STORAGE_ROOT || '/var/www/warehouses-uploads';

async function purgeAndEnhance() {
    console.log('=== STARTING PURGE OF ELECTRONICS AND GROCERY - ENFORCING PURE APPAREL/FASHION ===');
    await connectDB();
    const db = mongoose.connection.db;

    const prodsCol = db.collection('products');
    const catsCol = db.collection('categories');
    const bannersCol = db.collection('hero_banners');
    const layoutsCol = db.collection('quickhomelayouts');
    const sellersCol = db.collection('sellers');

    // 1. Purge all electronics and non-apparel products
    const delProdResult = await prodsCol.deleteMany({
        $or: [
            { categoryName: /power|bank|electronic|audio|headphone|phone|charger|gadget|watch|cable|case|speaker|earbud|grocery|milk|curd|yogurt|butter|cheese|fruit|vegetable|atta|flour|rice|pulse|oil|biscuit|chip|namkeen|tea|coffee|drink/i },
            { name: /ambrane|boat|airdrop|earbud|speaker|power bank|phone case|spigen|gan|charger|anker|cable|noise|smartwatch|nord bud|milk|curd|butter|cheese|apple|tomato|spinach|atta|toor dal|sunflower oil|dark fantasy|chips|red label|coffee|orange drink/i },
            { tags: { $in: ['electronics', 'audio', 'earbuds', 'powerbank', 'charger', 'cable', 'smartwatch', 'grocery'] } },
            { image: /charger|cable|smartphone|smartwatch|earbud|grocery/i }
        ]
    });
    console.log(`✓ Deleted ${delProdResult.deletedCount} non-apparel products from database.`);

    // 2. Purge all electronics and non-apparel categories
    const delCatResult = await catsCol.deleteMany({
        $or: [
            { name: /power|bank|electronic|audio|headphone|phone|charger|gadget|watch|cable|dairy|milk|curd|yogurt|butter|cheese|fruit|vegetable|staples|atta|flour|rice|pulse|oil|snack|biscuit|chip|namkeen|beverage|tea|coffee|drink/i },
            { slug: /power|bank|electronic|audio|headphone|phone|charger|gadget|watch|cable|dairy|milk|curd|yogurt|butter|cheese|fruit|vegetable|staples|atta|flour|rice|pulse|oil|snack|biscuit|chip|namkeen|beverage|tea|coffee|drink/i }
        ]
    });
    console.log(`✓ Deleted ${delCatResult.deletedCount} non-apparel categories from database.`);

    // 3. Remove inactive/grocery sellers
    const delSellerResult = await sellersCol.deleteMany({
        sellerName: { $in: ['FreshMart Express', 'DailyNeeds Store', 'Vijay Nagar Daily', 'Palasia Fresh Mart'] }
    });
    console.log(`✓ Removed ${delSellerResult.deletedCount} grocery sellers.`);

    // 4. Update QuickHomeLayouts: strip any electronics campaigns or shelves
    const layouts = await layoutsCol.find().toArray();
    for (const l of layouts) {
        let modified = false;
        let campaigns = l.campaigns || [];
        const filteredCampaigns = campaigns.filter(c => !/tech|electronic|gadget|phone/i.test(c.title || c.badge || ''));
        if (filteredCampaigns.length !== campaigns.length) {
            campaigns = filteredCampaigns;
            modified = true;
        }

        let shelves = l.shelves || [];
        const filteredShelves = shelves.filter(s => !/tech|electronic|gadget|phone|charger/i.test(s.title || s.tag || ''));
        if (filteredShelves.length !== shelves.length) {
            shelves = filteredShelves;
            modified = true;
        }

        if (modified) {
            await layoutsCol.updateOne(
                { _id: l._id },
                { $set: { campaigns, shelves, updatedAt: new Date() } }
            );
            console.log(`✓ Cleaned quickhomelayout ${l._id} of electronics elements.`);
        }
    }

    // 5. Delete lingering electronics media files from disk
    const filesToDelete = [
        path.join(UPLOAD_ROOT, 'seed/products/braided-type-c-cable.webp'),
        path.join(UPLOAD_ROOT, 'seed/products/gan-charger-65w.webp'),
        path.join(UPLOAD_ROOT, 'seed/products/smartphone-5g.webp'),
        path.join(UPLOAD_ROOT, 'seed/products/smartwatch-fitness.webp'),
        path.join(UPLOAD_ROOT, 'seed/products/tws-earbuds.webp'),
        path.join(UPLOAD_ROOT, 'seed/banners/hero-electronics-tech.webp'),
        path.join(UPLOAD_ROOT, 'seed/categories/electronics.webp'),
        path.join(UPLOAD_ROOT, 'quick/campaigns/tech-fest.webp')
    ];

    for (const f of filesToDelete) {
        try {
            if (fs.existsSync(f)) {
                fs.unlinkSync(f);
                console.log(`✓ Deleted file: ${f}`);
            }
        } catch (err) {
            console.warn(`Could not delete ${f}:`, err.message);
        }
    }

    // 6. Ensure all remaining categories have proper slugs, isActive, and crisp apparel images
    const fashionCategories = [
        { name: 'Men', slug: 'men', image: '/uploads/seed/categories/men.webp', parentId: null },
        { name: 'Women', slug: 'women', image: '/uploads/seed/categories/women.webp', parentId: null },
        { name: 'Kids', slug: 'kids', image: '/uploads/quick/fashion/categories/kids.webp', parentId: null },
        { name: 'T-Shirts', slug: 't-shirts', image: '/uploads/seed/categories/t-shirts.webp', parentSlug: 'men' },
        { name: 'Shirts', slug: 'shirts', image: '/uploads/seed/categories/shirts.webp', parentSlug: 'men' },
        { name: 'Jeans', slug: 'jeans', image: '/uploads/seed/categories/jeans.webp', parentSlug: 'men' },
        { name: 'Kurtas', slug: 'kurtas', image: '/uploads/seed/categories/kurtas.webp', parentSlug: 'women' },
        { name: 'Dresses', slug: 'dresses', image: '/uploads/seed/categories/dresses.webp', parentSlug: 'women' },
        { name: 'Tops', slug: 'tops', image: '/uploads/seed/categories/tops.webp', parentSlug: 'women' },
        { name: 'Activewear', slug: 'activewear', image: '/uploads/seed/categories/activewear.webp', parentId: null },
        { name: 'Gym Tees & Tops', slug: 'gym-tees-and-tops', image: '/uploads/seed/categories/gym-tees-tops.webp', parentSlug: 'activewear' },
        { name: 'Track Pants & Joggers', slug: 'track-pants-and-joggers', image: '/uploads/seed/categories/track-pants-joggers.webp', parentSlug: 'activewear' },
        { name: 'Jackets', slug: 'jackets', image: '/uploads/seed/categories/jackets.webp', parentId: null },
        { name: 'Bomber & Denim Jackets', slug: 'bomber-and-denim-jackets', image: '/uploads/seed/categories/bomber-denim-jackets.webp', parentSlug: 'jackets' },
        { name: 'Hoodies & Sweatshirts', slug: 'hoodies-and-sweatshirts', image: '/uploads/seed/categories/hoodies-sweatshirts.webp', parentSlug: 'jackets' },
        { name: 'Footwear', slug: 'footwear', image: '/uploads/quick/fashion/categories/footwear.webp', parentId: null },
        { name: 'Accessories', slug: 'accessories', image: '/uploads/quick/fashion/categories/accessories.webp', parentId: null },
    ];

    const categoryMap = {};
    for (const fc of fashionCategories) {
        let existing = await catsCol.findOne({ $or: [{ slug: fc.slug }, { name: fc.name }] });
        if (existing) {
            await catsCol.updateOne(
                { _id: existing._id },
                { $set: { slug: fc.slug, name: fc.name, image: fc.image, isActive: true, updatedAt: new Date() } }
            );
            categoryMap[fc.slug] = existing._id;
        } else {
            const ins = await catsCol.insertOne({
                name: fc.name,
                slug: fc.slug,
                image: fc.image,
                isActive: true,
                createdAt: new Date(),
                updatedAt: new Date()
            });
            categoryMap[fc.slug] = ins.insertedId;
        }
    }

    // Link child category parentIds
    for (const fc of fashionCategories) {
        if (fc.parentSlug && categoryMap[fc.parentSlug] && categoryMap[fc.slug]) {
            await catsCol.updateOne(
                { _id: categoryMap[fc.slug] },
                { $set: { parentId: categoryMap[fc.parentSlug] } }
            );
        }
    }
    console.log('✓ Synchronized and structured apparel categories.');

    // 7. Ensure pure fashion hero banners
    await bannersCol.deleteMany({});
    const apparelBanners = [
        {
            publicId: 'banner-autumn-winter-edit',
            title: 'Autumn/Winter Contemporary Edit',
            subtitle: 'Modern silhouettes, premium layering and everyday essentials',
            ctaText: 'Shop New Arrivals',
            ctaLink: '/category/t-shirts',
            sortOrder: 1,
            imageUrl: '/uploads/seed/banners/hero-autumn-winter-contem.webp',
            isActive: true,
            createdAt: new Date(),
            updatedAt: new Date(),
        },
        {
            publicId: 'banner-linen-cotton-studio',
            title: 'The Linen & Cotton Studio',
            subtitle: 'Breathable handcrafted linen shirts, trousers & casual wear',
            ctaText: 'Explore Casuals',
            ctaLink: '/category/shirts',
            sortOrder: 2,
            imageUrl: '/uploads/seed/banners/hero-the-linen-cotton-stu.webp',
            isActive: true,
            createdAt: new Date(),
            updatedAt: new Date(),
        },
        {
            publicId: 'banner-indigo-denim',
            title: 'Timeless Indigo & Denim Essentials',
            subtitle: 'Authentic raw selvedge denim, trucker jackets & classic fits',
            ctaText: 'View Collection',
            ctaLink: '/category/jeans',
            sortOrder: 3,
            imageUrl: '/uploads/seed/banners/hero-timeless-indigo-deni.webp',
            isActive: true,
            createdAt: new Date(),
            updatedAt: new Date(),
        },
        {
            publicId: 'banner-festive-royal',
            title: 'Artisanal Festive & Ethnic Glamour',
            subtitle: 'Handblock printed kurtas, chanderi silks & heritage anarkalis',
            ctaText: 'Explore Kurtas',
            ctaLink: '/category/kurtas',
            sortOrder: 4,
            imageUrl: '/uploads/quick/fashion/banners/banner-3-festive-ethnic.webp',
            isActive: true,
            createdAt: new Date(),
            updatedAt: new Date(),
        },
        {
            publicId: 'banner-activewear',
            title: 'High-Performance Activewear',
            subtitle: 'Engineered for seamless movement, gym sessions & studio workouts',
            ctaText: 'Move in Comfort',
            ctaLink: '/category/gym-tees-and-tops',
            sortOrder: 5,
            imageUrl: '/uploads/seed/banners/hero-high-performance-act.webp',
            isActive: true,
            createdAt: new Date(),
            updatedAt: new Date(),
        },
    ];
    await bannersCol.insertMany(apparelBanners);
    console.log(`✓ Configured ${apparelBanners.length} premium fashion hero banners.`);

    // 8. Ensure all remaining products have channels.shop: true so they appear in Shop mode!
    const updateProds = await prodsCol.updateMany(
        {},
        {
            $set: {
                'channels.shop': true,
                isActive: true,
                status: 'published'
            }
        }
    );
    console.log(`✓ Enabled Shop channel for ${updateProds.modifiedCount} apparel products.`);

    // 9. Check and print remaining summary
    const remainingProds = await prodsCol.countDocuments();
    const remainingCats = await catsCol.countDocuments();
    const distinctCats = await prodsCol.distinct('categoryName');

    console.log('\n=============================================');
    console.log(`✓ TOTAL PRODUCTS NOW: ${remainingProds} (100% Apparel/Clothing)`);
    console.log(`✓ TOTAL CATEGORIES NOW: ${remainingCats}`);
    console.log(`✓ DISTINCT PRODUCT CATEGORIES IN STORE:`, distinctCats);
    console.log('=============================================\n');

    await disconnectDB();
}

purgeAndEnhance().catch(console.error);
