/**
 * Imports the old thewarehousess.com orders and their customers as history:
 * a customer account per phone number (reused when one exists), and each
 * order as a finished Shop order of the given store, with the same number
 * (WH-<old id>), items, sizes, prices, payment and dates.
 *
 * Written straight to the collections after validation, so none of the
 * order-placing side effects run: no notifications, no stock change, no
 * dispatch, no payout.
 *
 * Input: woo-orders.json from scripts/woo-orders-extract.py.
 * Re-runnable (matched on the old order id). Everything created is tagged
 * `seedTag: 'woo-orders-v1'`; --wipe removes the orders and any imported
 * account that has no other orders.
 *
 *   node scripts/import-woocommerce-orders.mjs --file=/opt/warehouses/imports/woo/woo-orders.json --dry-run
 *   node scripts/import-woocommerce-orders.mjs --file=... [--seller="The Warehousess"]
 *   node scripts/import-woocommerce-orders.mjs --wipe
 */
import 'dotenv/config';
import fs from 'fs';
import mongoose from 'mongoose';
import { Order } from '../src/modules/commerce/orders/models/order.model.js';
import { Product } from '../src/modules/commerce/admin/models/product.model.js';
import { Seller } from '../src/modules/commerce/seller/models/seller.model.js';
import { User } from '../src/core/users/user.model.js';
import { customersFromOrders, mapOrder, phone10 } from './lib/woo-orders-import.mjs';

const SEED_TAG = 'woo-orders-v1';
const arg = (name) => process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const DRY_RUN = process.argv.includes('--dry-run');
const SELLER_NAME = arg('seller') || 'The Warehousess';

async function wipe() {
    const orders = await Order.collection.deleteMany({ seedTag: SEED_TAG });
    let users = 0;
    for (const u of await User.collection.find({ seedTag: SEED_TAG }).toArray()) {
        if (await Order.exists({ userId: u._id })) continue;
        await User.collection.deleteOne({ _id: u._id });
        users += 1;
    }
    console.log(`Removed ${orders.deletedCount} imported orders and ${users} imported accounts without other orders.`);
}

async function main() {
    await mongoose.connect(process.env.MONGO_URI || process.env.MONGODB_URI, { serverSelectionTimeoutMS: 30000 });
    console.log(`Database: ${mongoose.connection.name}${DRY_RUN ? ' (dry run, nothing is written)' : ''}`);
    if (process.argv.includes('--wipe')) return wipe();

    const file = arg('file');
    if (!file || !fs.existsSync(file)) throw new Error('--file must point at woo-orders.json');
    const source = JSON.parse(fs.readFileSync(file, 'utf8'));

    const seller = await Seller.findOne({ sellerName: SELLER_NAME }).select('_id sellerName').lean();
    if (!seller) throw new Error(`No seller named "${SELLER_NAME}"`);

    // Old product id -> the imported product (for its photo, category and size ids).
    const products = await Product.collection
        .find({ 'legacy.source': 'woocommerce' }, { projection: { _id: 1, image: 1, categoryId: 1, categoryName: 1, variants: 1, 'legacy.id': 1 } })
        .toArray();
    const byWooId = new Map(products.map((p) => [String(p.legacy.id), p]));

    // Accounts, one per phone.
    const tally = { accountsCreated: 0, accountsReused: 0, ordersCreated: 0, ordersUpdated: 0, ordersSkipped: 0, linesWithoutProduct: 0 };
    const userIdByPhone = new Map();
    const customers = customersFromOrders(source.orders);
    // An order without a usable phone joins the account of another order with its email.
    const phoneByEmail = new Map(customers.filter((c) => c.email).map((c) => [c.email, c.phone]));
    for (const c of customers) {
        const existing = await User.collection.findOne({ phone: { $in: [c.phone, `+91${c.phone}`, `91${c.phone}`] } }, { projection: { _id: 1 } });
        if (existing) {
            tally.accountsReused += 1;
            userIdByPhone.set(c.phone, existing._id);
            continue;
        }
        const doc = new User({ phone: c.phone, name: c.name, ...(c.email ? { email: c.email } : {}), isActive: true });
        await doc.validate();
        if (!DRY_RUN) {
            await User.collection.insertOne({ ...doc.toObject(), createdAt: new Date(`${String(c.firstOrderAt).replace(' ', 'T')}Z`), updatedAt: new Date(), seedTag: SEED_TAG, legacy: { source: 'woocommerce' } });
        }
        tally.accountsCreated += 1;
        userIdByPhone.set(c.phone, doc._id);
    }

    for (const wooOrder of source.orders) {
        const email = String(wooOrder.billing?.email || wooOrder.email || '').trim().toLowerCase();
        const phone = phone10(wooOrder.billing?.phone || wooOrder.shipping?.phone) || phoneByEmail.get(email) || '';
        const userId = userIdByPhone.get(phone);
        if (!userId) {
            tally.ordersSkipped += 1;
            console.warn(`  order ${wooOrder.id}: no phone number, skipped`);
            continue;
        }
        const mapped = mapOrder(wooOrder, { userId, sellerId: seller._id, productFor: (id) => byWooId.get(String(id)) || null });
        tally.linesWithoutProduct += mapped.items.filter((i) => i.itemId.startsWith('woo-')).length;

        const { legacy, createdAt, updatedAt, ...fields } = mapped;
        const doc = new Order(fields);
        await doc.validate();
        const record = { ...doc.toObject(), createdAt, updatedAt, legacy, seedTag: SEED_TAG };
        // The old shop kept no map location; an empty one trips the geo index.
        if (!record.deliveryAddress?.location?.coordinates) delete record.deliveryAddress.location;
        const existing = await Order.collection.findOne({ 'legacy.source': 'woocommerce', 'legacy.orderId': legacy.orderId }, { projection: { _id: 1 } });
        if (DRY_RUN) {
            tally[existing ? 'ordersUpdated' : 'ordersCreated'] += 1;
            continue;
        }
        if (existing) {
            delete record._id;
            await Order.collection.updateOne({ _id: existing._id }, { $set: record });
            tally.ordersUpdated += 1;
        } else {
            await Order.collection.insertOne(record);
            tally.ordersCreated += 1;
        }
    }

    console.log(`${DRY_RUN ? 'Would import' : 'Imported'} into ${seller.sellerName}: ${JSON.stringify(tally)}`);
}

main()
    .catch((err) => { console.error(err); process.exitCode = 1; })
    .finally(() => mongoose.disconnect());
