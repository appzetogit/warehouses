import mongoose from 'mongoose';
import { connectDB, disconnectDB } from '../src/config/db.js';

async function check() {
    await connectDB();
    const db = mongoose.connection.db;
    const cats = await db.collection('categories').find({}).project({ name: 1, slug: 1, parentId: 1 }).toArray();
    const prods = await db.collection('products').countDocuments();
    const banners = await db.collection('hero_banners').find({}).toArray();
    const sellers = await db.collection('sellers').find({}).project({ sellerName: 1, _id: 1, fulfilmentModes: 1 }).toArray();
    console.log('Categories count:', cats.length);
    console.log('Top level categories:', cats.filter(c => !c.parentId).map(c => c.name));
    console.log('Total products count:', prods);
    console.log('Hero banners count:', banners.length, banners.map(b => ({ title: b.title, img: b.imageUrl, link: b.ctaLink })));
    console.log('Sellers count:', sellers.length, sellers.map(s => s.sellerName));
    await disconnectDB();
}

check().catch(console.error);
