import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { startDb, stopDb } from './helpers/db.js';
import { renameTokensInDb } from '../scripts/migrations/lib/renameTokens.mjs';
import { foodToProduct, foodCollectionName } from '../scripts/migrations/2026-09-rename-food.mjs';

before(startDb);
after(stopDb);
beforeEach(async () => {
    for (const c of await mongoose.connection.db.collections()) await c.drop();
});

const db = () => mongoose.connection.db;
const run = (apply) => renameTokensInDb(db(), foodToProduct, { apply, renameCollection: foodCollectionName, log: () => {} });

test('the name map', () => {
    const cases = {
        FoodOrder: 'Order',
        FoodSeller: 'Seller',
        FoodItem: 'Product',
        FoodTransaction: 'OrderTransaction',
        FoodSettings: 'DispatchSettings',
        FoodSellerWallet: 'SellerWallet',
        foodId: 'productId',
        foodIds: 'productIds',
        foods: 'products',
        food_management: 'product_management',
        food_approved: 'product_approved',
        foodType: 'foodType',
        food: 'food',
        openfoodfacts: 'openfoodfacts',
        seafood: 'seafood',
    };
    for (const [from, to] of Object.entries(cases)) assert.equal(foodToProduct(from), to, from);

    assert.equal(foodCollectionName('food_orders'), 'orders');
    assert.equal(foodCollectionName('food_items'), 'products');
    assert.equal(foodCollectionName('food_transactions'), 'order_transactions');
    assert.equal(foodCollectionName('food_seller_subscription_cycles'), 'seller_subscription_cycles');
    assert.equal(foodCollectionName('transactions'), 'transactions');
});

test('moves collections, fields and values, and leaves the rest alone', async () => {
    const productId = new mongoose.Types.ObjectId();
    await db().collection('food_items').insertOne({
        _id: productId, name: 'Seafood Mix', foodType: 'Non-Veg', image: 'uploads/food/sellers/a.png'
    });
    await db().collection('food_items').createIndex({ name: 'text' });
    await db().collection('food_user_favorites').insertOne({ foodId: productId, module: 'food' });
    await db().collection('food_notifications').insertOne({ type: 'food_approved', ownerModel: 'FoodSeller' });
    await db().collection('food_admins').insertOne({ permissions: ['food_management', 'orders'] });
    await db().collection('transactions').insertOne({ core: true });

    await run(true);

    const names = new Set((await db().listCollections().toArray()).map((c) => c.name));
    for (const n of ['products', 'user_favorites', 'notifications', 'admins', 'transactions']) assert.ok(names.has(n), n);
    for (const n of names) assert.ok(!n.startsWith('food_'), n);

    assert.deepEqual(await db().collection('products').findOne({ _id: productId }), {
        _id: productId, name: 'Seafood Mix', foodType: 'Non-Veg', image: 'uploads/food/sellers/a.png'
    });
    const fav = await db().collection('user_favorites').findOne({});
    assert.deepEqual(fav.productId, productId);
    assert.equal(fav.module, 'food');
    const note = await db().collection('notifications').findOne({});
    assert.equal(note.type, 'product_approved');
    assert.equal(note.ownerModel, 'Seller');
    assert.deepEqual((await db().collection('admins').findOne({})).permissions, ['product_management', 'orders']);
    assert.deepEqual(await db().collection('transactions').findOne({}, { projection: { _id: 0 } }), { core: true });

    const again = await run(true);
    assert.equal(again.documents, 0);
    assert.equal(again.collections.length, 0);
});

test('refuses to rename onto an existing collection', async () => {
    await db().collection('food_orders').insertOne({ a: 1 });
    await db().collection('orders').insertOne({ a: 2 });
    await assert.rejects(run(true), /already exists/);
});
