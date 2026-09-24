import mongoose from 'mongoose';
import { connectDB, disconnectDB } from '../src/config/db.js';

async function seed() {
    console.log('Connecting to database...');
    await connectDB();
    const db = mongoose.connection.db;

    const sellersCol = db.collection('sellers');
    const catsCol = db.collection('categories');
    const prodsCol = db.collection('products');
    const bannersCol = db.collection('hero_banners');

    // 1. Seed the 4 Stores if not existing
    const stores = [
        {
            sellerName: 'Trends Fashion',
            ownerName: 'Reliance Trends',
            ownerEmail: 'trends@thewarehouses.in',
            ownerPhone: '9826011111',
            logo: '/uploads/quick/fashion/stores/trends.webp',
            estimatedDeliveryTime: '30-40 min',
            city: 'Indore',
            state: 'Madhya Pradesh',
            pincode: '452001',
            status: 'approved',
            isActive: true,
            fulfilmentModes: ['quick', 'shop'],
            distanceKm: 1.2,
        },
        {
            sellerName: 'Zudio',
            ownerName: 'Tata Zudio',
            ownerEmail: 'zudio@thewarehouses.in',
            ownerPhone: '9826022222',
            logo: '/uploads/quick/fashion/stores/zudio.webp',
            estimatedDeliveryTime: '35-45 min',
            city: 'Indore',
            state: 'Madhya Pradesh',
            pincode: '452010',
            status: 'approved',
            isActive: true,
            fulfilmentModes: ['quick', 'shop'],
            distanceKm: 2.1,
        },
        {
            sellerName: 'Max',
            ownerName: 'Max Fashion',
            ownerEmail: 'max@thewarehouses.in',
            ownerPhone: '9826033333',
            logo: '/uploads/quick/fashion/stores/max.webp',
            estimatedDeliveryTime: '30-40 min',
            city: 'Indore',
            state: 'Madhya Pradesh',
            pincode: '452001',
            status: 'approved',
            isActive: true,
            fulfilmentModes: ['quick', 'shop'],
            distanceKm: 2.3,
        },
        {
            sellerName: 'Pantaloons',
            ownerName: 'Aditya Birla Pantaloons',
            ownerEmail: 'pantaloons@thewarehouses.in',
            ownerPhone: '9826044444',
            logo: '/uploads/quick/fashion/stores/pantaloons.webp',
            estimatedDeliveryTime: '40-50 min',
            city: 'Indore',
            state: 'Madhya Pradesh',
            pincode: '452010',
            status: 'approved',
            isActive: true,
            fulfilmentModes: ['quick', 'shop'],
            distanceKm: 2.8,
        },
    ];

    const storeDocs = {};
    for (const s of stores) {
        let doc = await sellersCol.findOne({ sellerName: s.sellerName });
        if (!doc) {
            const res = await sellersCol.insertOne({
                ...s,
                createdAt: new Date(),
                updatedAt: new Date(),
            });
            doc = { _id: res.insertedId, ...s };
        } else {
            await sellersCol.updateOne({ _id: doc._id }, { $set: { logo: s.logo, distanceKm: s.distanceKm, estimatedDeliveryTime: s.estimatedDeliveryTime, isActive: true, status: 'approved' } });
        }
        storeDocs[s.sellerName] = doc;
        console.log(`✓ Store configured: ${s.sellerName}`);
    }

    // 2. Categories
    const categoriesData = [
        { name: 'Men', slug: 'men', image: '/uploads/quick/fashion/categories/men.webp' },
        { name: 'Women', slug: 'women', image: '/uploads/quick/fashion/categories/women.webp' },
        { name: 'Kids', slug: 'kids', image: '/uploads/quick/fashion/categories/kids.webp' },
        { name: 'T-Shirts', slug: 't-shirts', image: '/uploads/quick/fashion/categories/tshirts.webp' },
        { name: 'Jeans', slug: 'jeans', image: '/uploads/quick/fashion/categories/jeans.webp' },
        { name: 'Footwear', slug: 'footwear', image: '/uploads/quick/fashion/categories/footwear.webp' },
        { name: 'Jackets', slug: 'jackets', image: '/uploads/quick/fashion/categories/men.webp' },
        { name: 'Kurtas', slug: 'kurtas', image: '/uploads/quick/fashion/categories/women.webp' },
        { name: 'Dresses', slug: 'dresses', image: '/uploads/quick/fashion/categories/women.webp' },
        { name: 'Bags', slug: 'bags', image: '/uploads/quick/fashion/categories/footwear.webp' },
        { name: 'Accessories', slug: 'accessories', image: '/uploads/quick/fashion/categories/accessories.webp' },
    ];

    const catDocs = {};
    for (const c of categoriesData) {
        let cat = await catsCol.findOne({ slug: c.slug });
        if (!cat) {
            const res = await catsCol.insertOne({
                name: c.name,
                slug: c.slug,
                image: c.image,
                parentId: null,
                isActive: true,
                createdAt: new Date(),
                updatedAt: new Date(),
            });
            catDocs[c.slug] = { _id: res.insertedId, ...c };
        } else {
            await catsCol.updateOne({ _id: cat._id }, { $set: { image: c.image, isActive: true } });
            catDocs[c.slug] = cat;
        }
        console.log(`✓ Category configured: ${c.name}`);
    }

    // 3. Trending Products
    const productsData = [
        {
            name: 'Men Polo T-Shirt',
            brand: 'Trends Fashion',
            sellerId: storeDocs['Trends Fashion']._id,
            sellerName: 'Trends Fashion',
            categoryId: catDocs['t-shirts']._id,
            categoryName: 'T-Shirts',
            price: 599,
            mrp: 999,
            image: '/uploads/quick/fashion/products/polo.webp',
            etaMins: 32,
            options: [{ name: 'Size', values: ['S', 'M', 'L', 'XL'] }],
            description: 'Classic pique cotton regular fit polo collar t-shirt with ribbed cuffs and contrast tipping.',
        },
        {
            name: 'Oversized T-Shirt',
            brand: 'Zudio',
            sellerId: storeDocs['Zudio']._id,
            sellerName: 'Zudio',
            categoryId: catDocs['t-shirts']._id,
            categoryName: 'T-Shirts',
            price: 699,
            mrp: 1199,
            image: '/uploads/quick/fashion/products/oversized.webp',
            etaMins: 28,
            options: [{ name: 'Size', values: ['S', 'M', 'L', 'XL'] }],
            description: 'Heavyweight 240 GSM drop shoulder graphic back-printed oversized streetwear tee.',
        },
        {
            name: 'Regular Fit Jeans',
            brand: 'Max',
            sellerId: storeDocs['Max']._id,
            sellerName: 'Max',
            categoryId: catDocs['jeans']._id,
            categoryName: 'Jeans',
            price: 999,
            mrp: 1699,
            image: '/uploads/quick/fashion/products/jeans.webp',
            etaMins: 35,
            options: [{ name: 'Size', values: ['28', '30', '32', '34'] }],
            description: 'Premium light wash comfort-stretch denim with 5-pocket styling and clean hems.',
        },
        {
            name: 'Casual Sneakers',
            brand: 'Pantaloons',
            sellerId: storeDocs['Pantaloons']._id,
            sellerName: 'Pantaloons',
            categoryId: catDocs['footwear']._id,
            categoryName: 'Footwear',
            price: 1499,
            mrp: 2499,
            image: '/uploads/quick/fashion/products/sneakers.webp',
            etaMins: 22,
            options: [{ name: 'Size', values: ['6', '7', '8', '9'] }],
            description: 'Triple white low-top street sneakers with cushioned memory foam insole and rubber outsole.',
        },
        {
            name: 'Graphic Cotton Tee',
            brand: 'Zudio',
            sellerId: storeDocs['Zudio']._id,
            sellerName: 'Zudio',
            categoryId: catDocs['t-shirts']._id,
            categoryName: 'T-Shirts',
            price: 299,
            mrp: 699,
            image: '/uploads/quick/fashion/products/graphic-tee.webp',
            etaMins: 25,
            options: [{ name: 'Size', values: ['S', 'M', 'L', 'XL'] }],
            description: '100% combed breathable cotton graphic t-shirt with durable print.',
        },
        {
            name: 'Streetwear Sliders',
            brand: 'Trends Fashion',
            sellerId: storeDocs['Trends Fashion']._id,
            sellerName: 'Trends Fashion',
            categoryId: catDocs['footwear']._id,
            categoryName: 'Footwear',
            price: 399,
            mrp: 899,
            image: '/uploads/quick/fashion/products/sliders.webp',
            etaMins: 28,
            options: [{ name: 'Size', values: ['6', '7', '8', '9', '10'] }],
            description: 'Ultra-cushioned EVA cloud sliders with anti-skid grip pattern.',
        },
        {
            name: 'Cotton Cargo Shorts',
            brand: 'Max',
            sellerId: storeDocs['Max']._id,
            sellerName: 'Max',
            categoryId: catDocs['jeans']._id,
            categoryName: 'Jeans',
            price: 349,
            mrp: 799,
            image: '/uploads/quick/fashion/products/shorts.webp',
            etaMins: 30,
            options: [{ name: 'Size', values: ['30', '32', '34', '36'] }],
            description: 'Multi-pocket breathable cotton twill relaxed fit shorts.',
        },
        {
            name: 'Classic Baseball Cap',
            brand: 'Pantaloons',
            sellerId: storeDocs['Pantaloons']._id,
            sellerName: 'Pantaloons',
            categoryId: catDocs['accessories']._id,
            categoryName: 'Accessories',
            price: 199,
            mrp: 499,
            image: '/uploads/quick/fashion/products/cap.webp',
            etaMins: 20,
            options: [{ name: 'Size', values: ['Free Size'] }],
            description: 'Structured 6-panel adjustable cotton twill strapback cap.',
        },
    ];

    for (const p of productsData) {
        await prodsCol.updateOne(
            { name: p.name },
            {
                $set: {
                    ...p,
                    images: [p.image],
                    rating: 4.8,
                    totalRatings: 184,
                    channels: {
                        quick: { enabled: true, stock: 40 },
                        shop: { enabled: true, stock: 120 },
                    },
                    channelsStock: {
                        quick: 40,
                        shop: 120,
                    },
                    variants: p.options[0].values.map((v) => ({
                        name: v,
                        price: p.price,
                        mrp: p.mrp,
                        stock: 40,
                        attributes: { Size: v },
                        channels: {
                            quick: { enabled: true, stock: 10 },
                            shop: { enabled: true, stock: 30 },
                        },
                    })),
                    isActive: true,
                    approvalStatus: 'approved',
                    updatedAt: new Date(),
                },
                $setOnInsert: {
                    createdAt: new Date(),
                },
            },
            { upsert: true }
        );
        console.log(`✓ Product configured: ${p.name}`);
    }

    // 4. Update Hero Banner in DB
    await bannersCol.updateOne(
        { publicId: 'banner-fashion-in-minutes' },
        {
            $set: {
                title: 'Fashion In Minutes',
                subtitle: 'Trendy styles. Everyday comfort. From trusted local stores.',
                imageUrl: '/uploads/quick/fashion/banners/hero-fashion-in-minutes.webp',
                publicId: 'banner-fashion-in-minutes',
                ctaText: 'Shop Now',
                ctaLink: '/quick/category/t-shirts',
                sortOrder: 0,
                isActive: true,
                updatedAt: new Date(),
            },
            $setOnInsert: { createdAt: new Date() },
        },
        { upsert: true }
    );
    console.log('✓ Hero Banner configured in DB');

    await disconnectDB();
    console.log('=== All Fashion Quick Data Seeded! ===');
}

seed().catch(console.error);
