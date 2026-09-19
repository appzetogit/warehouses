import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { startDb, stopDb } from './helpers/db.js';
import { removeFoodOnlyFeatures } from '../scripts/migrations/2026-09-remove-food-only-features.mjs';

before(startDb);
after(stopDb);
beforeEach(async () => {
    for (const c of await mongoose.connection.db.collections()) await c.drop();
});

const db = () => mongoose.connection.db;
const quiet = { log: () => {} };

test('drops the removed features and keeps everything else', async () => {
    await db().collection('food_dining_sellers').insertOne({ a: 1 });
    await db().collection('food_addons').insertOne({ a: 1 });
    await db().collection('food_sellers').insertOne({
        _id: 1, sellerName: 'Fresh Mart', pureVegSeller: true, cuisines: ['Indian'],
        diningSettings: { isEnabled: true }, menu: { sections: [] }
    });
    await db().collection('food_categories').insertOne({ _id: 1, name: 'Dairy', foodTypeScope: 'Veg' });
    await db().collection('food_items').insertOne({ _id: 1, name: 'Milk', foodType: 'Veg' });
    await db().collection('food_orders').insertMany([
        { _id: 1, sendCutlery: true, items: [{ name: 'Milk', addons: [{ name: 'x', price: 5 }] }, { name: 'Bread' }] },
        { _id: 2, orderStatus: 'created' }
    ]);
    await db().collection('food_explore_icons').insertMany([
        { _id: 1, type: 'gourmet' },
        { _id: 2, type: 'offers' }
    ]);

    const dry = await removeFoodOnlyFeatures(db(), quiet);
    assert.deepEqual(dry.dropped.sort(), ['food_addons', 'food_dining_sellers']);
    assert.ok(await db().collection('food_addons').findOne({}), 'dry run must not write');

    await removeFoodOnlyFeatures(db(), { apply: true, ...quiet });

    const names = (await db().listCollections().toArray()).map((c) => c.name);
    assert.ok(!names.includes('food_addons'));
    assert.ok(!names.includes('food_dining_sellers'));

    assert.deepEqual(await db().collection('food_sellers').findOne({ _id: 1 }), { _id: 1, sellerName: 'Fresh Mart' });
    assert.deepEqual(await db().collection('food_categories').findOne({ _id: 1 }), { _id: 1, name: 'Dairy' });
    assert.deepEqual(await db().collection('food_items').findOne({ _id: 1 }), { _id: 1, name: 'Milk', foodType: 'Veg' });
    assert.deepEqual(await db().collection('food_orders').findOne({ _id: 1 }), { _id: 1, items: [{ name: 'Milk' }, { name: 'Bread' }] });
    assert.deepEqual(await db().collection('food_orders').findOne({ _id: 2 }), { _id: 2, orderStatus: 'created' });
    assert.deepEqual(await db().collection('food_explore_icons').find().toArray(), [{ _id: 2, type: 'offers' }]);

    const again = await removeFoodOnlyFeatures(db(), { apply: true, ...quiet });
    assert.deepEqual(again, { dropped: [], unset: {}, exploreIconsRemoved: 0 });
});
