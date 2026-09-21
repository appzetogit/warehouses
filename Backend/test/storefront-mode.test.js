import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { startApp, stopApp, call, ok } from './helpers/app.js';

// The shop storefront ("/", fulfilmentMode=standard) and the quick store
// ("/quick", fulfilmentMode=quick) list different things from the same catalogue.
const ids = {};

before(async () => {
    await startApp();
    const { Seller } = await import('../src/modules/commerce/seller/models/seller.model.js');
    const { Product } = await import('../src/modules/commerce/admin/models/product.model.js');
    await Promise.all([Product.init(), Seller.init()]);

    ids.zone = new mongoose.Types.ObjectId();
    ids.otherZone = new mongoose.Types.ObjectId();
    const store = (name, zoneId) => Seller.create({
        sellerName: name, ownerName: 'O', ownerPhone: `9${Math.floor(Math.random() * 1e9)}`, status: 'approved', zoneId,
        location: { type: 'Point', coordinates: [77.59, 12.97], latitude: 12.97, longitude: 77.59 },
    });
    const local = await store('Local Store', ids.zone);
    const faraway = await store('Faraway Store', ids.otherZone);
    ids.local = local._id;

    const product = (sellerId, fields) => Product.create({ sellerId, approvalStatus: 'approved', price: 10, ...fields });
    await product(local._id, { name: 'Mode Milk' });
    await product(local._id, { name: 'Mode Sofa', quickEligible: false });
    await product(local._id, {
        name: 'Mode Rug', quickEligible: false,
        variants: [
            { _id: new mongoose.Types.ObjectId(), name: 'Small', price: 10, quickEligible: true, attributes: [{ name: 'Size', value: 'S' }] },
            { _id: new mongoose.Types.ObjectId(), name: 'Large', price: 20, attributes: [{ name: 'Size', value: 'L' }] },
        ],
    });
    await product(faraway._id, { name: 'Mode Lamp' });
});

after(stopApp);

const names = (res) => res.products.map((p) => p.name).sort();
const search = async (params) => {
    const qs = new URLSearchParams({ q: 'mode', limit: '50', ...params }).toString();
    return ok(await call('GET', `/catalog/search/products?${qs}`), `search ${qs}`);
};
const list = async (params) => {
    const qs = new URLSearchParams(params).toString();
    const res = ok(await call('GET', `/catalog/products?${qs}`), `products ${qs}`);
    return { products: res.products.filter((p) => p.name.startsWith('Mode ')) };
};

test('search: quick lists only quick-deliverable products in the zone', async () => {
    assert.deepEqual(names(await search({ zoneId: String(ids.zone), fulfilmentMode: 'quick' })), ['Mode Milk', 'Mode Rug']);
});

test('search: standard lists everything shippable and ignores the zone', async () => {
    assert.deepEqual(
        names(await search({ zoneId: String(ids.zone), fulfilmentMode: 'standard' })),
        ['Mode Lamp', 'Mode Milk', 'Mode Rug', 'Mode Sofa'],
    );
});

test('search: without fulfilmentMode nothing changes', async () => {
    assert.deepEqual(names(await search({ zoneId: String(ids.zone) })), ['Mode Milk', 'Mode Rug', 'Mode Sofa']);
});

test('search: an unknown fulfilmentMode is a 400', async () => {
    const res = await call('GET', '/catalog/search/products?q=mode&fulfilmentMode=teleport');
    assert.equal(res.status, 400);
});

test('products list: quick and standard filters, and sellerId', async () => {
    assert.deepEqual(names(await list({ zoneId: String(ids.zone), fulfilmentMode: 'quick' })), ['Mode Milk', 'Mode Rug']);
    assert.deepEqual(names(await list({ zoneId: String(ids.zone), fulfilmentMode: 'standard' })), ['Mode Lamp', 'Mode Milk', 'Mode Rug', 'Mode Sofa']);
    assert.deepEqual(names(await list({ sellerId: String(ids.local), fulfilmentMode: 'quick' })), ['Mode Milk', 'Mode Rug']);
    const bad = await call('GET', '/catalog/products?fulfilmentMode=teleport');
    assert.equal(bad.status, 400);
});

test('unified search: quick only matches sellers through quick products; standard ignores the zone', async () => {
    const unified = async (params) => {
        const qs = new URLSearchParams(params).toString();
        return ok(await call('GET', `/catalog/search/unified?${qs}`), `unified ${qs}`);
    };
    const sellers = (res) => res.sellers.map((s) => s.sellerName).sort();
    assert.deepEqual(sellers(await unified({ q: 'sofa', zoneId: String(ids.zone), fulfilmentMode: 'quick' })), []);
    assert.deepEqual(sellers(await unified({ q: 'sofa', zoneId: String(ids.zone), fulfilmentMode: 'standard' })), ['Local Store']);
    assert.deepEqual(sellers(await unified({ q: 'lamp', zoneId: String(ids.zone), fulfilmentMode: 'standard' })), ['Faraway Store']);
});

const menuItems = (menu) => {
    const out = [];
    const walk = (node) => {
        if (Array.isArray(node)) return node.forEach(walk);
        if (!node || typeof node !== 'object') return;
        if (typeof node.name === 'string' && node.name.startsWith('Mode ') && Array.isArray(node.variants)) out.push(node);
        else Object.values(node).forEach(walk);
    };
    walk(menu);
    return out;
};

test('store menu: quick drops non-quick products and variants; standard lists everything', async () => {
    const menu = async (mode) => {
        const qs = mode ? `?fulfilmentMode=${mode}` : '';
        return menuItems(ok(await call('GET', `/catalog/stores/${ids.local}/products${qs}`), `menu ${mode}`).menu);
    };
    const quick = await menu('quick');
    assert.deepEqual(quick.map((p) => p.name).sort(), ['Mode Milk', 'Mode Rug']);
    assert.deepEqual(quick.find((p) => p.name === 'Mode Rug').variants.map((v) => v.name), ['Small']);
    const standard = await menu('standard');
    assert.deepEqual(standard.map((p) => p.name).sort(), ['Mode Milk', 'Mode Rug', 'Mode Sofa']);
    assert.equal(standard.find((p) => p.name === 'Mode Rug').variants.length, 2);
    assert.equal((await menu('')).length, 3);
    const bad = await call('GET', `/catalog/stores/${ids.local}/products?fulfilmentMode=teleport`);
    assert.equal(bad.status, 400);
});

test('store listing: quick hides stores without quick products and keeps the zone; standard ignores the zone', async () => {
    const { Seller } = await import('../src/modules/commerce/seller/models/seller.model.js');
    const { Product } = await import('../src/modules/commerce/admin/models/product.model.js');
    const bulky = await Seller.create({
        sellerName: 'Bulky Store', ownerName: 'O', ownerPhone: `9${Math.floor(Math.random() * 1e9)}`, status: 'approved', zoneId: ids.zone,
        location: { type: 'Point', coordinates: [77.59, 12.97], latitude: 12.97, longitude: 77.59 },
    });
    await Product.create({ sellerId: bulky._id, approvalStatus: 'approved', price: 10, name: 'Mode Wardrobe', quickEligible: false });
    const stores = async (params) => {
        const qs = new URLSearchParams({ limit: '100', ...params }).toString();
        const data = ok(await call('GET', `/catalog/stores?${qs}`), `stores ${qs}`);
        return data.sellers.map((s) => s.sellerName).filter((n) => /Store$/.test(n)).sort();
    };
    assert.deepEqual(await stores({ zoneId: String(ids.zone), fulfilmentMode: 'quick' }), ['Local Store']);
    assert.deepEqual(await stores({ zoneId: String(ids.zone), fulfilmentMode: 'standard' }), ['Bulky Store', 'Faraway Store', 'Local Store']);
    assert.deepEqual(await stores({ zoneId: String(ids.zone) }), ['Bulky Store', 'Local Store']);
});
