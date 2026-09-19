import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { startDb, stopDb, clearDb } from './helpers/db.js';
import { Product } from '../src/modules/commerce/admin/models/product.model.js';
import { Order } from '../src/modules/commerce/orders/models/order.model.js';
import {
    reserveStockForItems,
    restoreOrderStock
} from '../src/modules/commerce/orders/services/inventory.service.js';

// These are the operations QUICK_COMMERCE_CHANGES.md lists as never having run
// against a database: the conditional decrement, the partial rollback and the
// restock claim.

before(startDb);
after(stopDb);
beforeEach(clearDb);

// Raw inserts: only the fields inventory touches, without the catalogue's
// required-field validation.
const product = async (fields) => {
    const _id = new mongoose.Types.ObjectId();
    await Product.collection.insertOne({ _id, name: `item-${_id}`, isAvailable: true, stockOffMode: null, ...fields });
    return _id;
};
const stockOf = async (id) => Product.findById(id).select('stockQty isAvailable').lean();
const line = (itemId, quantity) => ({ itemId: String(itemId), quantity });

test('two buyers racing for the last unit: exactly one gets it', async () => {
    const id = await product({ stockQty: 1 });

    const results = await Promise.allSettled(
        Array.from({ length: 8 }, () => reserveStockForItems([line(id, 1)]))
    );

    assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
    assert.match(results.find((r) => r.status === 'rejected').reason.message, /just went out of stock/);
    assert.deepEqual(await stockOf(id), { _id: id, stockQty: 0, isAvailable: false });
});

test('many concurrent orders never oversell', async () => {
    const id = await product({ stockQty: 10 });

    const results = await Promise.allSettled(
        Array.from({ length: 25 }, () => reserveStockForItems([line(id, 3)]))
    );

    assert.equal(results.filter((r) => r.status === 'fulfilled').length, 3);
    assert.equal((await stockOf(id)).stockQty, 1);
});

test('a short line puts back what the earlier lines took', async () => {
    const plenty = await product({ stockQty: 5 });
    const scarce = await product({ stockQty: 1 });

    await assert.rejects(
        reserveStockForItems([line(plenty, 2), line(scarce, 3)]),
        /Only 1 left of/
    );
    assert.equal((await stockOf(plenty)).stockQty, 5);
    assert.equal((await stockOf(scarce)).stockQty, 1);
});

test('lines for the same product are summed against the shelf', async () => {
    const id = await product({ stockQty: 3 });
    await assert.rejects(reserveStockForItems([line(id, 2), line(id, 2)]), /Only 3 left of/);
    assert.equal((await stockOf(id)).stockQty, 3);
});

test('untracked products pass through and are never decremented', async () => {
    const id = await product({ stockQty: null });
    const taken = await reserveStockForItems([line(id, 50)]);
    assert.deepEqual(taken, []);
    assert.deepEqual(await stockOf(id), { _id: id, stockQty: null, isAvailable: true });
});

test('restocking a sold-out product brings it back, unless the seller switched it off', async () => {
    const soldOut = await product({ stockQty: 1 });
    const switchedOff = await product({ stockQty: 1 });

    const orderFor = async (itemId) => {
        await reserveStockForItems([line(itemId, 1)]);
        const _id = new mongoose.Types.ObjectId();
        await Order.collection.insertOne({ _id, items: [line(itemId, 1)], stockReservedAt: new Date(), stockRestoredAt: null });
        return { _id, stockReservedAt: new Date() };
    };
    const a = await orderFor(soldOut);
    const b = await orderFor(switchedOff);
    await Product.updateOne({ _id: switchedOff }, { $set: { stockOffMode: 'manual' } });

    await restoreOrderStock(a);
    await restoreOrderStock(b);

    assert.deepEqual(await stockOf(soldOut), { _id: soldOut, stockQty: 1, isAvailable: true });
    assert.deepEqual(await stockOf(switchedOff), { _id: switchedOff, stockQty: 1, isAvailable: false });
});

test('an order dying on several paths at once is restocked once', async () => {
    const id = await product({ stockQty: 4 });
    await reserveStockForItems([line(id, 4)]);
    const _id = new mongoose.Types.ObjectId();
    await Order.collection.insertOne({ _id, items: [line(id, 4)], stockReservedAt: new Date(), stockRestoredAt: null });

    const claims = await Promise.all(
        Array.from({ length: 6 }, () => restoreOrderStock({ _id, stockReservedAt: new Date() }))
    );

    assert.equal(claims.filter(Boolean).length, 1);
    assert.equal((await stockOf(id)).stockQty, 4);
});
