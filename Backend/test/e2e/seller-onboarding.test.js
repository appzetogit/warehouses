/**
 * Journey: a seller joins both channels and lists a shirt.
 *
 * Seller registers picking Quick and Shop -> admin approves the account, then
 * Quick (needs the zone) and Shop (needs the pincode) -> seller creates a shirt
 * with size x colour variants, separate Quick/Shop stock and a photo per
 * variant, plus a Shop-only product -> admin approves -> each shows in the
 * right storefront with that channel's stock, and nowhere before approval.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import {
    startApp, stopApp, call, ok, tokenFor, oid, createAdmin, createZone, STORE_AT,
} from './lib/harness.js';

let db;
let admin;
let zoneId;
const w = {};

before(async () => {
    db = await startApp();
    admin = await createAdmin(db);
    zoneId = await createZone(admin);
});
after(stopApp);

const SIZES = ['S', 'M', 'L'];
const COLOURS = ['Blue', 'White'];
const photo = (s, c) => `https://cdn.example.com/oxford/${s}-${c}.jpg`;
// Quick keeps a few of each on the shelf; Shop has the warehouse.
const quickQty = (i, j) => 2 + i + j;
const shopQty = (i, j) => 20 + 10 * i + j;

const catalog = async (mode) => ok(await call('GET', `/catalog/products?fulfilmentMode=${mode}&limit=500`), `catalog ${mode}`).products;
const search = async (mode, q) => ok(await call('GET', `/catalog/search/products?q=${q}&limit=50&fulfilmentMode=${mode}`), `search ${mode}`).products;
const storeMenu = async (id, mode) => ok(await call('GET', `/catalog/stores/${id}/products?fulfilmentMode=${mode}`), `menu ${mode}`)
    .menu.sections.flatMap((s) => s.items);

test('register with both channels: each starts pending, the admin sees the join requests', async () => {
    const reg = ok(await call('POST', '/seller/register', {
        body: {
            sellerName: 'Oxford Threads', ownerName: 'Asha', ownerPhone: '9500011111',
            channels: 'quick,shop', zoneId: String(zoneId), pincode: '560001',
            addressLine1: '12 MG Road', city: 'Bengaluru', state: 'KA',
            latitude: String(STORE_AT.lat), longitude: String(STORE_AT.lng),
        },
    }), 'register', 201);
    w.sellerId = reg._id;
    w.seller = tokenFor('SELLER', reg._id);
    assert.equal(reg.status, 'pending');
    assert.equal(reg.channels.quick.status, 'pending');
    assert.equal(reg.channels.shop.status, 'pending');

    // The same phone cannot register a second store.
    const dup = await call('POST', '/seller/register', {
        body: { sellerName: 'Oxford Two', ownerName: 'Asha', ownerPhone: '9500011111', channels: 'shop', pincode: '560001' },
    });
    assert.equal(dup.status, 400);

    const listed = ok(await call('GET', '/admin/sellers?channel=quick&channelStatus=pending', { as: admin.as }), 'pending quick');
    assert.ok(listed.sellers.some((s) => String(s._id) === String(w.sellerId)));

    // Not approved: the store is not in either storefront.
    const stores = ok(await call('GET', '/catalog/stores?limit=500&fulfilmentMode=quick'), 'stores').sellers;
    assert.ok(!stores.some((s) => String(s._id) === String(w.sellerId)));
});

test('admin approves the account and each channel; the requirements are enforced', async () => {
    const as = admin.as;
    const acct = ok(await call('PATCH', `/admin/sellers/${w.sellerId}/approve`, { as, body: {} }), 'approve account');
    assert.equal(acct.status, 'approved');

    // Quick needs the store inside a zone: take the zone away and approval is refused.
    await db.collection('sellers').updateOne({ _id: oid(w.sellerId) }, { $unset: { zoneId: 1 } });
    const noZone = await call('PATCH', `/admin/sellers/${w.sellerId}/channels/quick`, { as, body: { action: 'approve' } });
    assert.equal(noZone.status, 400, 'quick without a zone is refused');
    await db.collection('sellers').updateOne({ _id: oid(w.sellerId) }, { $set: { zoneId: oid(zoneId) } });

    const quick = ok(await call('PATCH', `/admin/sellers/${w.sellerId}/channels/quick`, { as, body: { action: 'approve' } }), 'approve quick');
    assert.equal(quick.channels.quick.status, 'approved');
    assert.ok(quick.channels.quick.decidedAt);

    // Shop needs a 6-digit pickup pincode.
    await db.collection('sellers').updateOne({ _id: oid(w.sellerId) }, { $set: { pincode: '5600', 'location.pincode': '5600' } });
    const badPin = await call('PATCH', `/admin/sellers/${w.sellerId}/channels/shop`, { as, body: { action: 'approve' } });
    assert.equal(badPin.status, 400, 'shop without a pincode is refused');
    assert.match(badPin.body.message, /pincode/);
    await db.collection('sellers').updateOne({ _id: oid(w.sellerId) }, { $set: { pincode: '560001', 'location.pincode': '560001' } });
    const shop = ok(await call('PATCH', `/admin/sellers/${w.sellerId}/channels/shop`, { as, body: { action: 'approve' } }), 'approve shop');
    assert.equal(shop.channels.shop.status, 'approved');

    const me = ok(await call('GET', '/seller/current', { as: w.seller }), 'seller current').seller;
    assert.equal(me.status, 'approved');
    assert.deepEqual([me.channels.quick.status, me.channels.shop.status], ['approved', 'approved']);
});

test('the seller lists a shirt (size x colour, per-channel stock, a photo per variant) and a Shop-only saree', async () => {
    const variants = SIZES.flatMap((size, i) => COLOURS.map((colour, j) => ({
        attributes: [{ name: 'Size', value: size }, { name: 'Colour', value: colour }],
        sku: `OXF-${size}-${colour.toUpperCase()}`,
        price: 899 + 50 * i,
        mrp: 1299,
        stock: { quick: quickQty(i, j), shop: shopQty(i, j) },
        lowStockThreshold: { quick: 1, shop: 5 },
        images: [photo(size, colour)],
    })));
    const shirt = ok(await call('POST', '/seller/products', {
        as: w.seller,
        body: {
            name: 'Oxford Shirt', description: 'Cotton oxford', channels: { quick: true, shop: true },
            images: ['https://cdn.example.com/oxford/cover.jpg'], variants,
        },
    }), 'create shirt', 201).product;
    w.shirt = shirt;
    assert.equal(shirt.variants.length, 6);
    assert.equal(shirt.approvalStatus, 'pending', 'a seller\'s product waits for the admin');
    const mWhite = shirt.variants.find((v) => v.name === 'M / White');
    assert.deepEqual(mWhite.stock, { quick: quickQty(1, 1), shop: shopQty(1, 1) });
    assert.deepEqual(mWhite.images, [photo('M', 'White')]);

    w.saree = ok(await call('POST', '/seller/products', {
        as: w.seller,
        body: { name: 'Silk Saree', price: 4999, channels: { quick: false, shop: true }, stock: { shop: 7 } },
    }), 'create saree', 201).product;
    assert.deepEqual(w.saree.channels, { quick: false, shop: true });

    // Not approved yet: in neither storefront.
    for (const mode of ['quick', 'standard']) {
        const names = (await catalog(mode)).map((p) => p.name);
        assert.ok(!names.includes('Oxford Shirt') && !names.includes('Silk Saree'), `nothing in ${mode} before approval`);
    }

    const pending = ok(await call('GET', '/admin/products/pending-approvals', { as: admin.as }), 'pending approvals');
    const rows = pending.items || pending.products || pending.data || pending;
    assert.ok(JSON.stringify(rows).includes(String(shirt._id)), 'the shirt is in the approval queue');
});

test('admin approves; each product appears in the right storefront with that channel\'s stock and photos', async () => {
    for (const p of [w.shirt, w.saree]) {
        ok(await call('PATCH', `/admin/products/${p._id}/approve`, { as: admin.as, body: {} }), `approve ${p.name}`);
    }

    const quick = await catalog('quick');
    const shop = await catalog('standard');
    const q = quick.find((p) => p.name === 'Oxford Shirt');
    const s = shop.find((p) => p.name === 'Oxford Shirt');
    assert.ok(q, 'shirt in Quick');
    assert.ok(s, 'shirt in Shop');
    assert.ok(!quick.some((p) => p.name === 'Silk Saree'), 'saree is Shop only');
    assert.ok(shop.some((p) => p.name === 'Silk Saree'), 'saree in Shop');
    assert.equal(shop.find((p) => p.name === 'Silk Saree').stockForChannel, 7);
    assert.deepEqual(q.availableIn, { quick: true, shop: true });

    // Store menu per channel, with each variant's photo and stock.
    const menuQuick = (await storeMenu(w.sellerId, 'quick')).map((i) => i.name);
    assert.deepEqual(menuQuick.sort(), ['Oxford Shirt']);
    const menuShop = (await storeMenu(w.sellerId, 'standard')).map((i) => i.name);
    assert.deepEqual(menuShop.sort(), ['Oxford Shirt', 'Silk Saree']);

    const detail = ok(await call('GET', `/catalog/products/${w.shirt._id}`), 'detail').product;
    assert.equal(detail.variants.length, 6);
    SIZES.forEach((size, i) => COLOURS.forEach((colour, j) => {
        const v = detail.variants.find((x) => x.name === `${size} / ${colour}`);
        assert.ok(v, `${size} / ${colour} listed`);
        assert.deepEqual(v.images, [photo(size, colour)]);
        assert.deepEqual(v.stock, { quick: quickQty(i, j), shop: shopQty(i, j) });
    }));

    // Search finds it in both channels, the saree only in Shop.
    assert.ok((await search('quick', 'oxford')).some((p) => p.name === 'Oxford Shirt'));
    assert.ok(!(await search('quick', 'saree')).some((p) => p.name === 'Silk Saree'));
    assert.ok((await search('standard', 'saree')).some((p) => p.name === 'Silk Saree'));

    const stores = async (mode) => ok(await call('GET', `/catalog/stores?limit=500&fulfilmentMode=${mode}`), `stores ${mode}`).sellers;
    assert.ok((await stores('quick')).some((x) => String(x._id) === String(w.sellerId)), 'store listed in Quick');
    assert.ok((await stores('standard')).some((x) => String(x._id) === String(w.sellerId)), 'store listed in Shop');
});
