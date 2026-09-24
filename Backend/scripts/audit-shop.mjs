import mongoose from 'mongoose';
import { connectDB, disconnectDB } from '../src/config/db.js';

async function audit() {
    await connectDB();
    const db = mongoose.connection.db;

    console.log('=== AUDITING PRODUCTS IN SHOP MODE ===');
    const prods = await db.collection('products').find({
        $or: [
            { 'channels.shop': true },
            { fulfilmentModes: 'standard' },
            { fulfilmentMode: 'standard' }
        ]
    }).project({ name: 1, categoryName: 1, price: 1, channels: 1, fulfilmentModes: 1 }).toArray();

    console.log(`Found ${prods.length} total products available in Shop:`);
    const byCategory = {};
    for (const p of prods) {
        const cat = p.categoryName || 'Unknown';
        if (!byCategory[cat]) byCategory[cat] = [];
        byCategory[cat].push(p.name);
    }

    for (const [cat, items] of Object.entries(byCategory)) {
        console.log(`\nCategory: "${cat}" (${items.length} items):`);
        console.log(`  Sample:`, items.slice(0, 5));
    }

    console.log('\n=== AUDITING HERO BANNERS ===');
    const banners = await db.collection('hero_banners').find().toArray();
    for (const b of banners) {
        console.log(`  - Banner: "${b.title}", link: ${b.ctaLink}, img: ${b.imageUrl || b.image}`);
    }

    console.log('\n=== AUDITING CATEGORIES ===');
    const cats = await db.collection('categories').find().project({ name: 1, slug: 1, parentId: 1, image: 1 }).toArray();
    for (const c of cats) {
        console.log(`  - Cat: "${c.name}", slug: "${c.slug}", parent: ${c.parentId ? c.parentId : 'ROOT'}, img: ${c.image}`);
    }

    await disconnectDB();
}

audit().catch(console.error);
