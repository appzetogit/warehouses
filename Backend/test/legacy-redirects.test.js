/**
 * Old thewarehousess.com links redirect (301) to the same product or category
 * here, and to search when the product is gone.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';

const { startApp, stopApp } = await import('./helpers/app.js');
let app;
let productId;

before(async () => {
    await startApp();
    ({ default: app } = await import('../src/app.js'));
    const { Product } = await import('../src/modules/commerce/admin/models/product.model.js');
    const p = await Product.create({ sellerId: new mongoose.Types.ObjectId(), name: 'Yellow Kurta Sets for Women', price: 1699, approvalStatus: 'approved' });
    await Product.collection.updateOne({ _id: p._id }, { $set: { legacy: { source: 'woocommerce', id: 1, slug: 'yellow-kurta-sets-for-women' } } });
    productId = String(p._id);
});

after(stopApp);

/** GET without following redirects; returns [status, location]. */
async function get(path) {
    const server = app.listen(0);
    try {
        const { port } = server.address();
        const res = await fetch(`http://127.0.0.1:${port}/api/v1/legacy${path}`, { redirect: 'manual' });
        return [res.status, res.headers.get('location')];
    } finally {
        server.close();
    }
}

test('an old product link goes to the same product', async () => {
    assert.deepEqual(await get('/product/yellow-kurta-sets-for-women'), [301, `/product/${productId}`]);
});

test('an unknown old product link goes to a search for its words', async () => {
    assert.deepEqual(await get('/product/blue-silk-saree-the-warehousess'), [301, '/search?q=blue%20silk%20saree']);
});

test('old category links go to the matching category', async () => {
    assert.deepEqual(await get('/product-category/kurta-set/'), [301, '/category/kurtas']);
    assert.deepEqual(await get('/product-category/accessories/earrings/'), [301, '/category/earrings']);
    assert.deepEqual(await get('/product-category/western-tops-for-women'), [301, '/category/tops']);
    assert.deepEqual(await get('/product-category/sold-out/'), [301, '/categories']);
});
