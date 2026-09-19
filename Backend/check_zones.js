import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const sellerSchema = new mongoose.Schema({
    sellerName: String,
    zoneId: mongoose.Schema.Types.ObjectId,
    status: String
}, { collection: 'sellers' });

const Seller = mongoose.model('Seller', sellerSchema);

async function checkSellers() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected to MongoDB');

        const sellers = await Seller.find({ status: 'approved' }).limit(5).lean();
        console.log('Approved sellers sample:');
        sellers.forEach(r => {
            console.log(`Name: ${r.sellerName}, ZoneId: ${r.zoneId}`);
        });

        const withZone = await Seller.countDocuments({ zoneId: { $exists: true, $ne: null } });
        const total = await Seller.countDocuments({});
        console.log(`Total sellers: ${total}`);
        console.log(`Sellers with zoneId: ${withZone}`);

        await mongoose.disconnect();
    } catch (error) {
        console.error('Error:', error);
    }
}

checkSellers();
