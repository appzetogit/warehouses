import mongoose from 'mongoose';
import { connectDB, disconnectDB } from '../src/config/db.js';

async function scan() {
    await connectDB();
    const db = mongoose.connection.db;
    const cols = await db.listCollections().toArray();
    console.log('--- Scanning all collections for electronics & power banks ---');
    
    for (const c of cols) {
        const name = c.name;
        try {
            const docs = await db.collection(name).find({
                $or: [
                    { name: /power|bank|electronic|audio|headphone|phone|charger|gadget/i },
                    { title: /power|bank|electronic|audio|headphone|phone|charger|gadget/i },
                    { slug: /power|bank|electronic|audio|headphone|phone|charger|gadget/i },
                    { categoryName: /power|bank|electronic|audio|headphone|phone|charger|gadget/i },
                    { description: /power bank|electronics|smartphone/i }
                ]
            }).toArray();
            if (docs.length > 0) {
                console.log(`\n=== Found in [${name}] (count: ${docs.length}) ===`);
                for (const d of docs) {
                    console.log(`  - ID: ${d._id}, name: ${d.name || d.title || d.sectionTitle || 'unnamed'}, slug: ${d.slug || ''}, cat: ${d.categoryName || ''}, img: ${d.imageUrl || d.image || (d.images && d.images[0]) || ''}`);
                }
            }
        } catch (err) {}
    }
    await disconnectDB();
}

scan().catch(console.error);
