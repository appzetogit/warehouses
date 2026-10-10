import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startDb, stopDb } from './helpers/db.js';
import { quantityByProduct, resolveOrderCartItems } from '../src/modules/commerce/orders/helpers/order-cart-items.helper.js';

// maxQtyPerOrder is a limit per product: two sizes of one product are two
// cart lines, and together they must not get past it.

let Product;
let sellerId;
let product;

before(async () => {
    await startDb();
    ({ Product } = await import('../src/modules/commerce/admin/models/product.model.js'));
    const mongoose = (await import('mongoose')).default;
    sellerId = new mongoose.Types.ObjectId();
    product = await Product.create({
        sellerId,
        name: 'Linen Shirt',
        price: 900,
        maxQtyPerOrder: 3,
        stock: { quick: 50, shop: 50 },
        isAvailable: true,
        approvalStatus: 'approved',
        variants: [
            { name: 'M', price: 900, attributes: [{ name: 'Size', value: 'M' }] },
            { name: 'L', price: 950, attributes: [{ name: 'Size', value: 'L' }] },
        ],
    });
});

after(async () => {
    await stopDb();
});

test('quantities are added up per product across its lines', () => {
    const totals = quantityByProduct([
        { itemId: 'a', quantity: 2 },
        { itemId: 'a', quantity: 2 },
        { itemId: 'b', quantity: 1 },
        { itemId: 'c' },
    ]);
    assert.equal(totals.get('a'), 4);
    assert.equal(totals.get('b'), 1);
    assert.equal(totals.get('c'), 1);
});

test('two sizes of one product together past maxQtyPerOrder are refused', async () => {
    const [m, l] = product.variants;
    await assert.rejects(
        resolveOrderCartItems(sellerId, [
            { itemId: String(product._id), variantId: String(m._id), quantity: 2 },
            { itemId: String(product._id), variantId: String(l._id), quantity: 2 },
        ], { channel: 'shop' }),
        (err) => {
            assert.match(err.message, /at most 3/);
            assert.equal(err.data?.reason, 'max_per_order');
            assert.equal(err.data?.available, 3);
            return true;
        },
    );
});

test('two sizes within maxQtyPerOrder go through', async () => {
    const [m, l] = product.variants;
    const items = await resolveOrderCartItems(sellerId, [
        { itemId: String(product._id), variantId: String(m._id), quantity: 1 },
        { itemId: String(product._id), variantId: String(l._id), quantity: 2 },
    ], { channel: 'shop' });
    assert.equal(items.length, 2);
});
