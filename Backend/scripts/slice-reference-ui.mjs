import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

async function slice() {
    const src = '/tmp/reference_ui.png';
    const outDir = '/var/www/warehouses-uploads/quick/fashion';
    await fs.mkdir(outDir, { recursive: true });
    await fs.mkdir(path.join(outDir, 'categories'), { recursive: true });
    await fs.mkdir(path.join(outDir, 'products'), { recursive: true });
    await fs.mkdir(path.join(outDir, 'stores'), { recursive: true });
    await fs.mkdir(path.join(outDir, 'collections'), { recursive: true });
    await fs.mkdir(path.join(outDir, 'banners'), { recursive: true });

    // 1. Hero Banner
    await sharp(src)
        .extract({ left: 12, top: 152, width: 436, height: 168 })
        .resize(872, 336, { fit: 'cover' })
        .webp({ quality: 95 })
        .toFile(path.join(outDir, 'banners/hero-fashion-in-minutes.webp'));
    console.log('✓ Extracted hero-fashion-in-minutes.webp');

    // 2. Categories
    const categories = [
        { name: 'men', left: 15, width: 62 },
        { name: 'women', left: 83, width: 62 },
        { name: 'kids', left: 150, width: 62 },
        { name: 'tshirts', left: 218, width: 62 },
        { name: 'jeans', left: 285, width: 62 },
        { name: 'footwear', left: 353, width: 62 },
    ];
    for (const cat of categories) {
        await sharp(src)
            .extract({ left: cat.left, top: 412, width: cat.width, height: 75 })
            .resize(200, 240, { fit: 'cover' })
            .webp({ quality: 92 })
            .toFile(path.join(outDir, `categories/${cat.name}.webp`));
    }
    console.log('✓ Extracted category images');

    // 3. Products
    const products = [
        { name: 'polo', left: 18 },
        { name: 'oversized', left: 130 },
        { name: 'jeans', left: 242 },
        { name: 'sneakers', left: 354 },
    ];
    for (const prod of products) {
        await sharp(src)
            .extract({ left: prod.left, top: 546, width: 100, height: 90 })
            .resize(300, 270, { fit: 'contain', background: '#FFFFFF' })
            .webp({ quality: 95 })
            .toFile(path.join(outDir, `products/${prod.name}.webp`));
    }
    console.log('✓ Extracted product images');

    // 4. Stores
    const stores = [
        { name: 'trends', left: 18 },
        { name: 'zudio', left: 138 },
        { name: 'max', left: 248 },
        { name: 'pantaloons', left: 354 },
    ];
    for (const store of stores) {
        await sharp(src)
            .extract({ left: store.left, top: 738, width: 40, height: 40 })
            .resize(100, 100, { fit: 'contain' })
            .webp({ quality: 95 })
            .toFile(path.join(outDir, `stores/${store.name}.webp`));
    }
    console.log('✓ Extracted store logos');

    // 5. Collections
    const collections = [
        { name: 'festive', left: 15 },
        { name: 'casual', left: 102 },
        { name: 'winter', left: 189 },
        { name: 'active', left: 276 },
        { name: 'footwear', left: 363 },
    ];
    for (const col of collections) {
        await sharp(src)
            .extract({ left: col.left, top: 832, width: 82, height: 82 })
            .resize(250, 250, { fit: 'cover' })
            .webp({ quality: 95 })
            .toFile(path.join(outDir, `collections/${col.name}.webp`));
    }
    console.log('✓ Extracted collection images');

    // Also copy hero banner to /var/www/warehouses-uploads/seed/banners/hero-fashion-in-minutes.webp
    await sharp(src)
        .extract({ left: 12, top: 152, width: 436, height: 168 })
        .resize(1200, 460, { fit: 'cover' })
        .webp({ quality: 95 })
        .toFile('/var/www/warehouses-uploads/seed/banners/hero-fashion-in-minutes.webp');

    console.log('✓ All assets extracted and saved to /var/www/warehouses-uploads/quick/fashion/');
}

slice().catch(console.error);
