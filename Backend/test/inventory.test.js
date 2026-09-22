import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { startDb, stopDb, clearDb } from './helpers/db.js';
import { Product } from '../src/modules/commerce/admin/models/product.model.js';
import { Order } from '../src/modules/commerce/orders/models/order.model.js';
import {
    reserveStockForItems,
    notifyLowStock,
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
    // Quick-only unless a test says otherwise, so "sold out" means sold out everywhere.
    await Product.collection.insertOne({ _id, name: `item-${_id}`, isAvailable: true, stockOffMode: null, channels: { quick: true, shop: false }, ...fields });
    return _id;
};
// The quick count and availability, shaped like the old single-count fields
// so the assertions below read the same.
const stockOf = async (id) => {
    const p = await Product.findById(id).select('stock isAvailable').lean();
    return { _id: p._id, stockQty: p.stock?.quick ?? null, isAvailable: p.isAvailable };
};
const line = (itemId, quantity) => ({ itemId: String(itemId), quantity });

test('two buyers racing for the last unit: exactly one gets it', async () => {
    const id = await product({ stock: { quick: 1 } });

    const results = await Promise.allSettled(
        Array.from({ length: 8 }, () => reserveStockForItems([line(id, 1)]))
    );

    assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
    assert.match(results.find((r) => r.status === 'rejected').reason.message, /just went out of stock/);
    assert.deepEqual(await stockOf(id), { _id: id, stockQty: 0, isAvailable: false });
});

test('many concurrent orders never oversell', async () => {
    const id = await product({ stock: { quick: 10 } });

    const results = await Promise.allSettled(
        Array.from({ length: 25 }, () => reserveStockForItems([line(id, 3)]))
    );

    assert.equal(results.filter((r) => r.status === 'fulfilled').length, 3);
    assert.equal((await stockOf(id)).stockQty, 1);
});

test('a short line puts back what the earlier lines took', async () => {
    const plenty = await product({ stock: { quick: 5 } });
    const scarce = await product({ stock: { quick: 1 } });

    await assert.rejects(
        reserveStockForItems([line(plenty, 2), line(scarce, 3)]),
        /Only 1 left of/
    );
    assert.equal((await stockOf(plenty)).stockQty, 5);
    assert.equal((await stockOf(scarce)).stockQty, 1);
});

test('lines for the same product are summed against the shelf', async () => {
    const id = await product({ stock: { quick: 3 } });
    await assert.rejects(reserveStockForItems([line(id, 2), line(id, 2)]), /Only 3 left of/);
    assert.equal((await stockOf(id)).stockQty, 3);
});

test('untracked products pass through and are never decremented', async () => {
    const id = await product({ stock: { quick: null } });
    const taken = await reserveStockForItems([line(id, 50)]);
    assert.deepEqual(taken, []);
    assert.deepEqual(await stockOf(id), { _id: id, stockQty: null, isAvailable: true });
});

test('restocking a sold-out product brings it back, unless the seller switched it off', async () => {
    const soldOut = await product({ stock: { quick: 1 } });
    const switchedOff = await product({ stock: { quick: 1 } });

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
    const id = await product({ stock: { quick: 4 } });
    await reserveStockForItems([line(id, 4)]);
    const _id = new mongoose.Types.ObjectId();
    await Order.collection.insertOne({ _id, items: [line(id, 4)], stockReservedAt: new Date(), stockRestoredAt: null });

    const claims = await Promise.all(
        Array.from({ length: 6 }, () => restoreOrderStock({ _id, stockReservedAt: new Date() }))
    );

    assert.equal(claims.filter(Boolean).length, 1);
    assert.equal((await stockOf(id)).stockQty, 4);
});

// ---- Variants -------------------------------------------------------------

const variant = (name, fields = {}) => ({ _id: new mongoose.Types.ObjectId(), name, price: 100, ...fields });
const vline = (itemId, variantId, quantity) => ({ itemId: String(itemId), variantId: String(variantId), quantity });
const variantsOf = async (id) => {
    const p = await Product.findById(id).select('variants stock isAvailable').lean();
    return {
        ...p,
        stockQty: p.stock?.quick ?? null,
        variants: p.variants.map((v) => ({ ...v, stockQty: v.stock?.quick ?? null })),
    };
};

test('a variant with its own count is decremented there, not on the product', async () => {
    const m = variant('M', { stock: { quick: 5 } });
    const l = variant('L', { stock: { quick: 2 } });
    const id = await product({ stock: { quick: 50 }, variants: [m, l] });

    const taken = await reserveStockForItems([vline(id, m._id, 3)]);

    assert.deepEqual(taken, [{ itemId: String(id), variantId: String(m._id), channel: 'quick', qty: 3 }]);
    const doc = await variantsOf(id);
    assert.equal(doc.variants[0].stockQty, 2);
    assert.equal(doc.variants[1].stockQty, 2);
    assert.equal(doc.stockQty, 50, 'product count untouched');
});

test('two buyers racing for the last unit of a variant: exactly one gets it', async () => {
    const m = variant('M', { stock: { quick: 1 } });
    const l = variant('L', { stock: { quick: 4 } });
    const id = await product({ variants: [m, l], stock: { quick: null } });

    const results = await Promise.allSettled(
        Array.from({ length: 8 }, () => reserveStockForItems([vline(id, m._id, 1)]))
    );

    assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
    assert.match(results.find((r) => r.status === 'rejected').reason.message, /\(M\) just went out of stock/);
    const doc = await variantsOf(id);
    assert.equal(doc.variants[0].stockQty, 0);
    assert.equal(doc.isAvailable, true, 'L is still for sale');
});

test('variants without their own count share the product count, summed across lines', async () => {
    const half = variant('500 g');
    const kilo = variant('1 kg');
    const id = await product({ stock: { quick: 3 }, variants: [half, kilo] });

    await assert.rejects(
        reserveStockForItems([vline(id, half._id, 2), vline(id, kilo._id, 2)]),
        /Only 3 left/
    );
    assert.equal((await variantsOf(id)).stockQty, 3, 'nothing taken');

    const taken = await reserveStockForItems([vline(id, half._id, 1), vline(id, kilo._id, 2)]);
    assert.deepEqual(taken, [{ itemId: String(id), variantId: '', channel: 'quick', qty: 3 }]);
    const doc = await variantsOf(id);
    assert.equal(doc.stockQty, 0);
    assert.equal(doc.isAvailable, false, 'hidden once the shared count is gone');
});

test('a product hides when its last counted variant sells out, and returns on restock', async () => {
    const m = variant('M', { stock: { quick: 1 } });
    const l = variant('L', { stock: { quick: 0 } });
    const off = variant('XL', { stock: { quick: 9 }, isActive: false });
    const id = await product({ stock: { quick: null }, variants: [m, l, off] });

    const taken = await reserveStockForItems([vline(id, m._id, 1)]);
    assert.equal((await variantsOf(id)).isAvailable, false, 'an inactive variant does not keep it listed');

    const _id = new mongoose.Types.ObjectId();
    await Order.collection.insertOne({
        _id, items: [vline(id, m._id, 1)], stockReservations: taken, stockReservedAt: new Date(), stockRestoredAt: null,
    });
    await restoreOrderStock({ _id, stockReservedAt: new Date() });

    const doc = await variantsOf(id);
    assert.equal(doc.variants[0].stockQty, 1);
    assert.equal(doc.isAvailable, true);
});

test('a restock returns units to where they were taken from, even if the variant changed since', async () => {
    const m = variant('M');
    const id = await product({ stock: { quick: 5 }, variants: [m] });

    const taken = await reserveStockForItems([vline(id, m._id, 2)]);
    assert.deepEqual(taken, [{ itemId: String(id), variantId: '', channel: 'quick', qty: 2 }], 'from the shared count');

    // The seller starts counting M separately before the order is cancelled.
    await Product.updateOne({ _id: id, 'variants._id': m._id }, { $set: { 'variants.$.stock.quick': 10 } });

    const _id = new mongoose.Types.ObjectId();
    await Order.collection.insertOne({
        _id, items: [vline(id, m._id, 2)], stockReservations: taken, stockReservedAt: new Date(), stockRestoredAt: null,
    });
    await restoreOrderStock({ _id, stockReservedAt: new Date() });

    const doc = await variantsOf(id);
    assert.equal(doc.stockQty, 5, 'the shared count got its 2 back');
    assert.equal(doc.variants[0].stockQty, 10, 'the new variant count was not inflated');
});

test('low stock: the seller hears once per crossing, and again after a restock', async () => {
    const id = await product({ stock: { quick: 5 }, lowStockThreshold: { quick: 2 }, sellerId: new mongoose.Types.ObjectId() });
    const flag = async () => (await Product.findById(id).select('lowStockNotifiedAt').lean()).lowStockNotifiedAt?.quick;

    await reserveStockForItems([line(id, 2)]); // 3 left, above threshold
    assert.equal(await flag(), undefined);

    await reserveStockForItems([line(id, 1)]); // 2 left: crosses
    assert.ok(await flag());
    assert.equal(await notifyLowStock(id), false, 'already told');

    await Product.updateOne({ _id: id }, { $inc: { 'stock.quick': 1 }, $set: { 'lowStockNotifiedAt.quick': null } });
    assert.equal(await flag(), null);
    await reserveStockForItems([line(id, 2)]); // 1 left: crosses again
    assert.ok(await flag());
});
