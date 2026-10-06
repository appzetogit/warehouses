/**
 * What the seller app sends: a Quick registration with only the store pin (no
 * zoneId), an address whose pincode is only in the text, and products that
 * name their category instead of giving its id, where two categories share
 * the name.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import {
    startApp, stopApp, call, ok, tokenFor, createAdmin, createZone, STORE_AT, FAR_AWAY,
} from './lib/harness.js';

let db;
let admin;
let zoneId;
let phone = 9500077000;

before(async () => {
    db = await startApp();
    admin = await createAdmin(db);
    zoneId = await createZone(admin);
});
after(stopApp);

const register = (body) => call('POST', '/seller/register', {
    body: {
        sellerName: `App Store ${phone}`, ownerName: 'Owner', ownerPhone: String(phone++),
        addressLine1: '12 MG Road', city: 'Bengaluru', state: 'KA',
        ...body,
    },
});

test('Quick without a zoneId: the zone comes from the store pin', async () => {
    const reg = ok(await register({
        channels: 'quick,shop', pincode: '560001',
        latitude: String(STORE_AT.lat), longitude: String(STORE_AT.lng),
    }), 'register', 201);
    const doc = await db.collection('sellers').findOne({ _id: new mongoose.Types.ObjectId(String(reg._id)) });
    assert.equal(String(doc.zoneId), String(zoneId));
});

test('Quick with a pin outside every zone is refused with a clear message', async () => {
    const res = await register({
        channels: 'quick', latitude: String(FAR_AWAY.lat), longitude: String(FAR_AWAY.lng),
    });
    assert.equal(res.status, 400);
    assert.match(res.body.message, /Quick isn't available at your store's location/);
});

test('Shop without a pincode field: taken from the address text', async () => {
    const reg = ok(await register({
        channels: 'shop',
        formattedAddress: '12 MG Road, Bengaluru, Karnataka 560001, India',
        latitude: String(STORE_AT.lat), longitude: String(STORE_AT.lng),
    }), 'register', 201);
    const doc = await db.collection('sellers').findOne({ _id: new mongoose.Types.ObjectId(String(reg._id)) });
    assert.equal(doc.location.pincode, '560001');

    const none = await register({ channels: 'shop', formattedAddress: 'Somewhere without a code' });
    assert.equal(none.status, 400, 'still refused when no pincode can be found');
});

test('a product naming a duplicated category goes into the sub-category', async () => {
    const reg = ok(await register({
        channels: 'shop', pincode: '560001', latitude: String(STORE_AT.lat), longitude: String(STORE_AT.lng),
    }), 'register', 201);
    const sellerId = reg._id;
    ok(await call('PATCH', `/admin/sellers/${sellerId}/approve`, { as: admin.as, body: {} }), 'approve account');
    ok(await call('PATCH', `/admin/sellers/${sellerId}/channels/shop`, { as: admin.as, body: { action: 'approve' } }), 'approve shop');

    const cats = db.collection('categories');
    const base = { approvalStatus: 'approved', isApproved: true, isActive: true, createdAt: new Date() };
    const men = await cats.insertOne({ ...base, name: 'Men' });
    await cats.insertOne({ ...base, name: 'Tees', createdAt: new Date(Date.now() - 60000) });
    const child = await cats.insertOne({ ...base, name: 'Tees', parentId: men.insertedId });

    const product = ok(await call('POST', '/seller/products', {
        as: tokenFor('SELLER', sellerId),
        body: {
            name: 'Plain Tee', categoryName: 'Tees', price: 499,
            channels: { quick: false, shop: true }, stock: { quick: null, shop: 10 },
        },
    }), 'create by category name', 201).product;
    assert.equal(String(product.categoryId), String(child.insertedId));
});
