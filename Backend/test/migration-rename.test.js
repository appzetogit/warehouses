import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { startDb, stopDb, clearDb } from './helpers/db.js';
import { renameTokensInDb } from '../scripts/migrations/lib/renameTokens.mjs';
import { restaurantToSeller } from '../scripts/migrations/2026-09-rename-restaurant-to-seller.mjs';

before(startDb);
after(stopDb);
beforeEach(async () => {
    await clearDb();
    for (const c of await mongoose.connection.db.collections()) await c.drop();
});

const db = () => mongoose.connection.db;
const quiet = { log: () => {} };

test('renames collections, nested keys, identifier values and indexes', async () => {
    const sellerId = new mongoose.Types.ObjectId();
    const orderId = new mongoose.Types.ObjectId();

    await db().collection('food_restaurants').insertOne({
        _id: sellerId,
        restaurantName: 'Restaurant Corner',
        profileImage: 'https://cdn.example.com/restaurants/covers/a.jpg',
        uploadPath: 'uploads/restaurant/a-restaurant-logo.png',
        location: { type: 'Point', coordinates: [77.2, 28.6] }
    });
    await db().collection('food_restaurants').createIndex({ restaurantName: 'text' });
    await db().collection('food_orders').insertOne({
        _id: orderId,
        restaurantId: sellerId,
        orderStatus: 'cancelled_by_restaurant',
        createdAt: new Date('2026-01-01'),
        pricing: { restaurantDiscountShare: 12.5 },
        items: [{ name: 'Milk', restaurantPrice: 30 }]
    });
    await db().collection('food_orders').createIndex({ restaurantId: 1, createdAt: -1 });
    await db().collection('food_notifications').insertOne({
        ownerType: 'RESTAURANT',
        ownerModel: 'FoodRestaurant',
        permissions: ['restaurant_management', 'orders'],
        metadata: { note: 'Your restaurant order was cancelled' }
    });
    await db().collection('food_notifications').createIndex(
        { ownerType: 1 },
        { partialFilterExpression: { ownerType: 'RESTAURANT' } }
    );

    const dry = await renameTokensInDb(db(), restaurantToSeller, quiet);
    assert.ok(dry.documents >= 3);
    assert.ok(await db().collection('food_restaurants').findOne({ _id: sellerId }), 'dry run must not write');

    await renameTokensInDb(db(), restaurantToSeller, { apply: true, ...quiet });

    const names = (await db().listCollections().toArray()).map((c) => c.name);
    assert.ok(names.includes('food_sellers'));
    assert.ok(!names.includes('food_restaurants'));

    const seller = await db().collection('food_sellers').findOne({ _id: sellerId });
    assert.equal(seller.sellerName, 'Restaurant Corner', 'free text is kept');
    assert.equal(seller.profileImage, 'https://cdn.example.com/restaurants/covers/a.jpg', 'URLs are kept');
    assert.equal(seller.uploadPath, 'uploads/restaurant/a-restaurant-logo.png', 'file paths are kept');
    assert.equal(seller.restaurantName, undefined);

    const order = await db().collection('food_orders').findOne({ _id: orderId });
    assert.deepEqual(order.sellerId, sellerId, 'ObjectIds survive untouched');
    assert.equal(order.orderStatus, 'cancelled_by_seller');
    assert.deepEqual(order.createdAt, new Date('2026-01-01'), 'Dates survive untouched');
    assert.equal(order.pricing.sellerDiscountShare, 12.5);
    assert.equal(order.items[0].sellerPrice, 30);

    const note = await db().collection('food_notifications').findOne({});
    assert.equal(note.ownerType, 'SELLER');
    assert.equal(note.ownerModel, 'FoodSeller');
    assert.deepEqual(note.permissions, ['seller_management', 'orders']);
    assert.equal(note.metadata.note, 'Your restaurant order was cancelled');

    const orderIndexes = await db().collection('food_orders').indexes();
    assert.ok(orderIndexes.some((ix) => ix.key.sellerId === 1 && ix.name === 'sellerId_1_createdAt_-1'));
    assert.ok(!orderIndexes.some((ix) => 'restaurantId' in ix.key));

    const textIx = (await db().collection('food_sellers').indexes()).find((ix) => ix.weights);
    assert.deepEqual(Object.keys(textIx.weights), ['sellerName']);

    const partial = (await db().collection('food_notifications').indexes()).find((ix) => ix.partialFilterExpression);
    assert.deepEqual(partial.partialFilterExpression, { ownerType: 'SELLER' });

    const again = await renameTokensInDb(db(), restaurantToSeller, { apply: true, ...quiet });
    assert.equal(again.documents, 0, 'running twice changes nothing');
    assert.equal(again.collections.length, 0);
});

test('refuses to overwrite an existing field or collection', async () => {
    await db().collection('food_orders').insertOne({ restaurantId: 1, sellerId: 2 });
    await assert.rejects(renameTokensInDb(db(), restaurantToSeller, { apply: true, ...quiet }), /would overwrite/);

    await clearDb();
    await db().collection('food_restaurants').insertOne({ a: 1 });
    await db().collection('food_sellers').insertOne({ a: 2 });
    await assert.rejects(renameTokensInDb(db(), restaurantToSeller, { apply: true, ...quiet }), /already exists/);
});
