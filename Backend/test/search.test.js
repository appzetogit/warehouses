import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { startApp, stopApp, call, ok } from './helpers/app.js';

const ids = {};

const v = (Size, Color, price, extra = {}) => ({
    _id: new mongoose.Types.ObjectId(),
    name: `${Size} / ${Color}`,
    price,
    attributes: [{ name: 'Size', value: Size }, { name: 'Color', value: Color }],
    ...extra,
});

before(async () => {
    await startApp();
    const { Seller } = await import('../src/modules/commerce/seller/models/seller.model.js');
    const { Product } = await import('../src/modules/commerce/admin/models/product.model.js');
    // $text and $geoNear need their indexes built, which autoIndex does in the background.
    await Promise.all([Product.init(), Seller.init()]);

    const zone = new mongoose.Types.ObjectId();
    ids.zone = zone;
    const store = (name, lat, lng, extra = {}) => Seller.create({
        sellerName: name, ownerName: 'O', ownerPhone: `9${Math.floor(Math.random() * 1e9)}`, status: 'approved', zoneId: zone,
        location: { type: 'Point', coordinates: [lng, lat], latitude: lat, longitude: lng }, ...extra,
    });
    const near = await store('Near Store', 12.9716, 77.5946);
    const mid = await store('Mid Store', 12.9900, 77.5946);
    await store('Far Store', 13.3000, 77.5946);
    await store('Pending Store', 12.9717, 77.5947, { status: 'pending' });
    ids.near = near._id;
    ids.mid = mid._id;

    const product = (fields) => Product.create({ sellerId: near._id, approvalStatus: 'approved', price: 1, ...fields });
    await product({ name: 'Cotton Tee', brand: 'Acme', tags: ['tshirt'], price: 300, variants: [v('M', 'Red', 300), v('L', 'Blue', 350)] });
    await product({ name: 'Linen Shirt', brand: 'Bolt', price: 900, variants: [v('M', 'Blue', 900), v('L', 'Red', 950)] });
    await product({ name: 'Wool Scarf', brand: 'Acme', price: 500, quickEligible: false });
    await product({ name: 'Red Apple', brand: 'Farm', price: 40, categoryName: 'Fruits' });
    await product({ name: 'Cheap Tee', brand: 'Bolt', price: 100, variants: [v('M', 'Red', 100, { isActive: false }), v('S', 'Red', 1200)] });
    await Product.create({ sellerId: mid._id, name: 'Hidden Tee', approvalStatus: 'pending', price: 10 });
});

after(stopApp);

const search = async (params) => {
    const qs = new URLSearchParams({ zoneId: String(ids.zone), ...params }).toString();
    return ok(await call('GET', `/catalog/search/products?${qs}`), `search ${qs}`);
};
const names = (res) => res.products.map((p) => p.name);

test('every typed word has to match, as a prefix or inside a word', async () => {
    assert.deepEqual(names(await search({ q: 'tee' })).sort(), ['Cheap Tee', 'Cotton Tee']);
    assert.deepEqual(names(await search({ q: 'cot te' })), ['Cotton Tee'], 'prefixes of two words');
    assert.deepEqual(names(await search({ q: 'acme scarf' })), ['Wool Scarf'], 'brand plus name');
    assert.deepEqual(names(await search({ q: 'fruit' })), ['Red Apple'], 'category name');
    assert.deepEqual(names(await search({ q: 'tshirt' })), ['Cotton Tee'], 'tags');
});

test('when no product has every word, the text index finds word forms', async () => {
    const res = await search({ q: 'shirts' });
    assert.equal(res.matchedBy, 'text');
    assert.deepEqual(names(res), ['Linen Shirt']);
});

test('price filters use what can be bought: an active variant\'s price', async () => {
    assert.deepEqual(names(await search({ minPrice: 320, maxPrice: 400 })), ['Cotton Tee'], 'its L / Blue is 350');
    // Cheap Tee's 100 is on an inactive variant, so it only matches from 1200.
    assert.deepEqual(names(await search({ maxPrice: 150 })), ['Red Apple']);
});

test('attribute filters must hold on one variant', async () => {
    const redM = await search({ 'attr[Size]': 'M', 'attr[Color]': 'red' });
    assert.deepEqual(names(redM), ['Cotton Tee'], 'Linen Shirt has M and Red, but not on one variant');
    assert.deepEqual(names(await search({ 'attr[Size]': 'S,L', 'attr[Color]': 'Red' })).sort(), ['Cheap Tee', 'Linen Shirt']);
});

test('brand, quick-only and sorting', async () => {
    assert.deepEqual(names(await search({ brand: 'acme', sort: 'price_asc' })), ['Cotton Tee', 'Wool Scarf']);
    assert.ok(!names(await search({ quickOnly: 'true' })).includes('Wool Scarf'));

    const asc = await search({ sort: 'price_asc' });
    assert.deepEqual(asc.products.map((p) => p.displayPrice), [40, 300, 500, 900, 1200]);
    const desc = await search({ sort: 'price_desc' });
    assert.equal(desc.products[0].name, 'Cheap Tee', 'priced from its cheapest active variant');
    assert.equal(desc.sort, 'price_desc');
    assert.ok(!names(asc).includes('Hidden Tee'), 'unapproved products never show');
});

test('facets count what the current search and filters match', async () => {
    const res = await search({ q: 'tee', facets: 'true' });
    assert.deepEqual(res.facets.brands, [{ value: 'Acme', count: 1 }, { value: 'Bolt', count: 1 }]);
    assert.deepEqual(res.facets.priceRange, { min: 300, max: 1200 });
    const color = res.facets.attributes.find((a) => a.name === 'Color');
    assert.deepEqual(color.values, [{ value: 'Red', count: 2 }, { value: 'Blue', count: 1 }], 'per product; inactive variants skipped');
});

test('nearby stores come back nearest first, inside the radius, approved only', async () => {
    const res = ok(await call('GET', '/catalog/stores/nearby?lat=12.9716&lng=77.5946&radiusKm=5'), 'nearby');
    assert.deepEqual(res.stores.map((s) => s.sellerName), ['Near Store', 'Mid Store']);
    assert.equal(res.stores[0].distanceKm, 0);
    assert.ok(res.stores[1].distanceKm > 1 && res.stores[1].distanceKm < 3);

    const missing = await call('GET', '/catalog/stores/nearby');
    assert.equal(missing.status, 400);
});
