/**
 * Seeds a quick-commerce catalog: a zone, two sellers, grocery categories with
 * subcategories, and products with real stock counts per channel.
 *
 * Channels: the first seller sells in Quick and Shop, the second in Quick
 * only. The first seller's products rotate between Quick-only, Shop-only and
 * both (with a different count in each channel); the second seller's are
 * Quick-only.
 *
 * Idempotent — re-running updates the same documents rather than duplicating
 * them, so it is safe to run against a database that already has this data.
 *
 *   node scripts/seed-quick-commerce.js
 *   node scripts/seed-quick-commerce.js --city=indore
 *   node scripts/seed-quick-commerce.js --wipe   (removes only what this seeds)
 *
 * --city picks the zone and its stores (see CITIES). Seeding a second city adds
 * its zone and stores next to the first; the shared catalogue is reused.
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import { Zone } from '../src/modules/commerce/admin/models/zone.model.js';
import { Category } from '../src/modules/commerce/admin/models/category.model.js';
import { Product } from '../src/modules/commerce/admin/models/product.model.js';
import { Seller } from '../src/modules/commerce/seller/models/seller.model.js';
import { availableInPipeline } from '../src/modules/commerce/shared/channels.js';

const SEED_TAG = 'seed:quick-commerce';

/**
 * A city preset: the zone ring (plain lat/lng, not GeoJSON), its Quick delivery
 * promise, and the stores inside it. Pick one with --city=<key>; boxes are wide
 * enough that any address in the city falls inside.
 */
const CITIES = {
    bengaluru: {
        zoneName: 'Bengaluru Central',
        etaMinutes: 12,
        ring: [
            { latitude: 12.80, longitude: 77.40 },
            { latitude: 13.20, longitude: 77.40 },
            { latitude: 13.20, longitude: 77.80 },
            { latitude: 12.80, longitude: 77.80 },
        ],
        sellers: [
            { sellerName: 'FreshMart Express', ownerName: 'Ravi Kumar', ownerEmail: 'freshmart@example.com', ownerPhone: '9000000101', latitude: 12.9716, longitude: 77.5946, estimatedDeliveryTime: '10-15 mins', city: 'Bengaluru', state: 'Karnataka', pincode: '560001' },
            { sellerName: 'DailyNeeds Store', ownerName: 'Anita Sharma', ownerEmail: 'dailyneeds@example.com', ownerPhone: '9000000102', latitude: 12.9352, longitude: 77.6245, estimatedDeliveryTime: '15-20 mins', city: 'Bengaluru', state: 'Karnataka', pincode: '560034' },
        ],
    },
    indore: {
        zoneName: 'Indore City',
        etaMinutes: 10,
        ring: [
            { latitude: 22.62, longitude: 75.75 },
            { latitude: 22.82, longitude: 75.75 },
            { latitude: 22.82, longitude: 76.00 },
            { latitude: 22.62, longitude: 76.00 },
        ],
        sellers: [
            { sellerName: 'Vijay Nagar Daily', ownerName: 'Rahul Verma', ownerEmail: 'vijaynagar@example.com', ownerPhone: '9000000201', latitude: 22.7533, longitude: 75.8937, estimatedDeliveryTime: '10-15 mins', city: 'Indore', state: 'Madhya Pradesh', pincode: '452010' },
            { sellerName: 'Palasia Fresh Mart', ownerName: 'Neha Jain', ownerEmail: 'palasia@example.com', ownerPhone: '9000000202', latitude: 22.7244, longitude: 75.8839, estimatedDeliveryTime: '15-20 mins', city: 'Indore', state: 'Madhya Pradesh', pincode: '452001' },
        ],
    },
};

const cityArg = (process.argv.find((a) => a.startsWith('--city=')) || '').split('=')[1] || 'bengaluru';
const CITY = CITIES[cityArg.toLowerCase()];
if (!CITY) {
    console.error(`Unknown --city=${cityArg}. Use one of: ${Object.keys(CITIES).join(', ')}`);
    process.exit(1);
}
const ZONE_RING = CITY.ring;
const SELLERS = CITY.sellers;

// parent -> children. Two levels, which is the ceiling the model enforces.
const CATEGORIES = {
    Dairy: ['Milk', 'Curd & Yogurt', 'Butter & Cheese'],
    'Fruits & Vegetables': ['Fresh Fruits', 'Fresh Vegetables'],
    Staples: ['Atta & Flour', 'Rice & Pulses', 'Oils'],
    Snacks: ['Biscuits', 'Chips & Namkeen'],
    Beverages: ['Tea & Coffee', 'Soft Drinks'],
};

/**
 * GST is per product on purpose: fresh produce and milk are exempt, packaged
 * staples are 5%, biscuits and soft drinks are much higher. A single basket
 * rate would be wrong for almost every real cart.
 */
const PRODUCTS = [
    // sub, name, brand, pack, price, mrp, gst, stock, veg
    ['Milk', 'Toned Milk Pouch', 'Amul', '500 ml', 27, 28, 0, 120, 'Veg'],
    ['Milk', 'Full Cream Milk', 'Nandini', '1 L', 66, 70, 0, 80, 'Veg'],
    ['Curd & Yogurt', 'Fresh Curd Cup', 'Amul', '400 g', 40, 45, 0, 60, 'Veg'],
    ['Curd & Yogurt', 'Greek Yogurt Blueberry', 'Epigamia', '90 g', 55, 60, 12, 35, 'Veg'],
    ['Butter & Cheese', 'Salted Butter', 'Amul', '500 g', 285, 295, 12, 24, 'Veg'],
    ['Butter & Cheese', 'Cheese Slices', 'Go', '200 g', 145, 155, 12, 18, 'Veg'],

    ['Fresh Fruits', 'Banana Robusta', '', '1 kg', 54, 60, 0, 45, 'Veg'],
    ['Fresh Fruits', 'Royal Gala Apple', '', '4 pcs', 189, 210, 0, 30, 'Veg'],
    ['Fresh Vegetables', 'Tomato Local', '', '1 kg', 32, 40, 0, 70, 'Veg'],
    ['Fresh Vegetables', 'Onion', '', '1 kg', 38, 45, 0, 65, 'Veg'],
    ['Fresh Vegetables', 'Baby Spinach', '', '250 g', 29, 35, 0, 20, 'Veg'],

    ['Atta & Flour', 'Whole Wheat Atta', 'Aashirvaad', '5 kg', 285, 310, 5, 40, 'Veg'],
    ['Rice & Pulses', 'Basmati Rice', 'India Gate', '1 kg', 132, 145, 5, 50, 'Veg'],
    ['Rice & Pulses', 'Toor Dal', 'Tata Sampann', '1 kg', 178, 195, 5, 38, 'Veg'],
    ['Oils', 'Sunflower Oil', 'Fortune', '1 L', 148, 165, 5, 42, 'Veg'],

    ['Biscuits', 'Marie Gold', 'Britannia', '250 g', 35, 40, 18, 90, 'Veg'],
    ['Biscuits', 'Dark Fantasy Choco Fills', 'Sunfeast', '300 g', 145, 160, 18, 25, 'Veg'],
    ['Chips & Namkeen', 'Classic Salted Chips', 'Lays', '52 g', 20, 20, 18, 110, 'Veg'],
    ['Chips & Namkeen', 'Aloo Bhujia', 'Haldiram', '400 g', 105, 115, 12, 33, 'Veg'],

    ['Tea & Coffee', 'Red Label Tea', 'Brooke Bond', '500 g', 265, 285, 5, 28, 'Veg'],
    ['Tea & Coffee', 'Instant Coffee', 'Nescafe', '50 g', 190, 205, 18, 22, 'Veg'],
    ['Soft Drinks', 'Cola Bottle', 'Coca-Cola', '750 ml', 40, 45, 28, 75, 'Veg'],
    // Deliberately zero, so the out-of-stock rendering has something to show.
    ['Soft Drinks', 'Orange Drink', 'Mirinda', '600 ml', 40, 40, 28, 0, 'Veg'],
];

async function main() {
    const wipe = process.argv.includes('--wipe');

    await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 30000 });
    console.log(`connected -> ${mongoose.connection.name}`);

    if (wipe) {
        const sellerIds = (await Seller.find({ website: SEED_TAG }).select('_id').lean())
            .map((s) => s._id);
        const removed = await Promise.all([
            Product.deleteMany({ sellerId: { $in: sellerIds } }),
            Seller.deleteMany({ website: SEED_TAG }),
            Category.deleteMany({ type: SEED_TAG }),
            Zone.deleteMany({ serviceLocation: SEED_TAG }),
        ]);
        console.log('wiped:', removed.map((r) => r.deletedCount).join(', '));
        await mongoose.disconnect();
        return;
    }

    // --- zone ---
    const zone = await Zone.findOneAndUpdate(
        { name: CITY.zoneName },
        {
            $set: {
                name: CITY.zoneName,
                zoneName: CITY.zoneName,
                etaMinutes: CITY.etaMinutes,
                country: 'India',
                serviceLocation: SEED_TAG,
                unit: 'kilometer',
                isActive: true,
                coordinates: ZONE_RING,
            },
        },
        { upsert: true, new: true },
    );
    console.log(`zone: ${zone.name}`);

    // --- sellers ---
    const sellers = [];
    const approvedChannel = { status: 'approved', rejectionReason: null, appliedAt: new Date(), decidedAt: new Date() };
    const noChannel = { status: 'none', rejectionReason: null, appliedAt: null, decidedAt: null };
    for (const [sellerIndex, s] of SELLERS.entries()) {
        const doc = await Seller.findOneAndUpdate(
            { ownerPhone: s.ownerPhone },
            {
                $set: {
                    ...s,
                    zoneId: zone._id,
                    status: 'approved',
                    approvedAt: new Date(),
                    // First seller: both channels; second: Quick only.
                    channels: {
                        quick: approvedChannel,
                        shop: sellerIndex === 0 ? approvedChannel : noChannel,
                    },
                    isAcceptingOrders: true,
                    // Open around the clock so a test order is never refused for
                    // being outside trading hours.
                    openingTime: '12:00 AM',
                    closingTime: '11:59 PM',
                    openDays: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
                    addressLine1: s.addressLine1 || 'Main Road',
                    area: s.area || 'Central',
                    // The Shop channel needs a real 6-digit pickup pincode.
                    city: s.city,
                    state: s.state,
                    pincode: s.pincode,
                    location: { type: 'Point', coordinates: [s.longitude, s.latitude] },
                    rating: 4.4,
                    totalRatings: 120,
                    // Marker for --wipe; sellers have no dedicated tag field.
                    website: SEED_TAG,
                },
            },
            { upsert: true, new: true, setDefaultsOnInsert: true },
        );
        sellers.push(doc);
        console.log(`seller: ${doc.sellerName}`);
    }

    // --- categories (parent then children) ---
    const subByName = new Map();
    let order = 0;
    for (const [parentName, children] of Object.entries(CATEGORIES)) {
        const parent = await Category.findOneAndUpdate(
            { name: parentName, sellerId: { $exists: false } },
            {
                $set: {
                    name: parentName,
                    type: SEED_TAG,
                    approvalStatus: 'approved',
                    isApproved: true,
                    isActive: true,
                    sortOrder: order++,
                },
                $unset: { parentId: 1 },
            },
            { upsert: true, new: true },
        );

        for (const childName of children) {
            const child = await Category.findOneAndUpdate(
                { name: childName, sellerId: { $exists: false } },
                {
                    $set: {
                        name: childName,
                        type: SEED_TAG,
                        parentId: parent._id,
                        approvalStatus: 'approved',
                        isApproved: true,
                        isActive: true,
                        sortOrder: order++,
                    },
                },
                { upsert: true, new: true },
            );
            subByName.set(childName, child);
        }
    }
    console.log(`categories: ${Object.keys(CATEGORIES).length} parents, ${subByName.size} subcategories`);

    // --- products, spread across both sellers ---
    let created = 0;
    for (const [productIndex, [subName, name, brand, packSize, price, mrp, gstRate, stockQty, foodType]] of PRODUCTS.entries()) {
        const category = subByName.get(subName);
        if (!category) continue;

        for (const [index, seller] of sellers.entries()) {
            // The second seller stocks a subset and prices slightly higher, so
            // the same product genuinely appears from two sellers at two prices.
            if (index === 1 && created % 3 === 0) continue;
            const sellerPrice = index === 1 ? Math.min(Math.round(price * 1.05), mrp || Infinity) : price;

            // Which channels this listing is in, and its count in each.
            const count = index === 1 ? Math.ceil(stockQty / 2) : stockQty;
            const kind = index === 1 ? 'quick' : ['quick', 'shop', 'both'][productIndex % 3];
            const channels = { quick: kind !== 'shop', shop: kind !== 'quick' };
            const stock = {
                quick: channels.quick ? count : null,
                // Shop keeps its own, larger warehouse count.
                shop: channels.shop ? (kind === 'both' ? count * 3 : count) : null,
            };

            const doc = await Product.findOneAndUpdate(
                { sellerId: seller._id, name },
                {
                    $set: {
                        sellerId: seller._id,
                        categoryId: category._id,
                        categoryName: category.name,
                        name,
                        brand,
                        packSize,
                        description: `${brand ? brand + ' ' : ''}${name}${packSize ? ' - ' + packSize : ''}`,
                        price: sellerPrice,
                        mrp: mrp || null,
                        otherPrice: 0,
                        gstRate,
                        channels,
                        stock,
                        lowStockThreshold: { quick: channels.quick ? 10 : null, shop: channels.shop ? 10 : null },
                        maxQtyPerOrder: 10,
                        foodType,
                        approvalStatus: 'approved',
                        approvedAt: new Date(),
                    },
                },
                { upsert: true, new: true, setDefaultsOnInsert: true },
            );
            // availableIn / isAvailable follow the counts, as every listing expects.
            await Product.collection.updateOne({ _id: doc._id }, availableInPipeline());
            created++;
        }
    }
    console.log(`products: ${created} listings across ${sellers.length} sellers`);

    const outOfStock = await Product.countDocuments({
        sellerId: { $in: sellers.map((s) => s._id) },
        $or: [{ 'stock.quick': 0 }, { 'stock.shop': 0 }],
    });
    console.log(`   (${outOfStock} deliberately out of stock)`);

    await mongoose.disconnect();
    console.log('done');
}

main().catch((err) => {
    console.error('seed failed:', err.message);
    process.exit(1);
});
