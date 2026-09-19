import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { startDb, stopDb } from './helpers/db.js';
import { renameFoodValues } from '../scripts/migrations/2026-09-rename-food-values.mjs';

before(startDb);
after(stopDb);
beforeEach(async () => {
    for (const c of await mongoose.connection.db.collections()) await c.drop();
});

const db = () => mongoose.connection.db;
const quiet = { log: () => {} };

test('replaces the bare food values and leaves the rest', async () => {
    await db().collection('admins').insertMany([
        { _id: 1, servicesAccess: ['food', 'taxi'] },
        { _id: 2, servicesAccess: ['quickCommerce'] },
    ]);
    await db().collection('payments').insertOne({ _id: 1, module: 'food' });
    await db().collection('transactions').insertMany([{ _id: 1, module: 'food' }, { _id: 2, module: 'wallet' }]);
    await db().collection('user_favorites').insertMany([
        { _id: 1, entityType: 'food' },
        { _id: 2, entityType: 'seller' },
    ]);

    const dry = await renameFoodValues(db(), quiet);
    assert.equal(dry['admins.servicesAccess'], 1);
    assert.equal((await db().collection('payments').findOne({ _id: 1 })).module, 'food', 'dry run must not write');

    await renameFoodValues(db(), { apply: true, ...quiet });

    assert.deepEqual((await db().collection('admins').findOne({ _id: 1 })).servicesAccess, ['commerce', 'taxi']);
    assert.deepEqual((await db().collection('admins').findOne({ _id: 2 })).servicesAccess, ['quickCommerce']);
    assert.equal((await db().collection('payments').findOne({ _id: 1 })).module, 'commerce');
    assert.equal((await db().collection('transactions').findOne({ _id: 2 })).module, 'wallet');
    assert.equal((await db().collection('user_favorites').findOne({ _id: 1 })).entityType, 'product');
    assert.equal((await db().collection('user_favorites').findOne({ _id: 2 })).entityType, 'seller');

    const again = await renameFoodValues(db(), { apply: true, ...quiet });
    assert.ok(Object.values(again).every((n) => n === 0), 'a second run finds nothing');
});
