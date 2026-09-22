/**
 * Quick and Shop channels (CHANNELS_CONTRACT.md): seller registration and
 * per-channel approval, product channels within the seller's approvals,
 * per-channel stock (reservation, restock, low stock), catalogue filtering,
 * checkout rejections, the seller/admin API shapes, and the migration.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { startApp, stopApp, tokenFor, call, ok } from './helpers/app.js';

const ids = {};
const tokens = {};
let M; // models and services, loaded after the app

const ZONE = [
    { latitude: 12.90, longitude: 77.55 },
    { latitude: 12.90, longitude: 77.65 },
    { latitude: 13.00, longitude: 77.65 },
    { latitude: 13.00, longitude: 77.55 },
];
const IN_ZONE = { lat: 12.9716, lng: 77.5946 };
const OUT_OF_ZONE = { lat: 19.07, lng: 72.87 };
const CUSTOMER_AT = { lat: 12.9352, lng: 77.6245 };
const address = {
    label: 'Home', street: '1 Test Road', city: 'Bengaluru', state: 'KA', zipCode: '560001', phone: '9111100009',
    latitude: CUSTOMER_AT.lat, longitude: CUSTOMER_AT.lng,
    location: { type: 'Point', coordinates: [CUSTOMER_AT.lng, CUSTOMER_AT.lat] },
};

const approved = { status: 'approved' };
const none = { status: 'none' };
let phoneSeq = 0;
const phone = () => `93${String(++phoneSeq).padStart(8, '0')}`;
const oid = (v) => new mongoose.Types.ObjectId(String(v));

const makeSeller = (name, { channels, at = IN_ZONE, pincode = '560001', ...extra } = {}) => M.Seller.create({
    sellerName: name, ownerName: 'Owner', ownerPhone: phone(), status: 'approved', isAcceptingOrders: true,
    zoneId: ids.zone, pincode, addressLine1: 'MG Road',
    location: { type: 'Point', coordinates: [at.lng, at.lat], latitude: at.lat, longitude: at.lng, addressLine1: 'MG Road', pincode },
    channels,
    ...extra,
});

before(async () => {
    const db = await startApp();
    const { Zone } = await import('../src/modules/commerce/admin/models/zone.model.js');
    const { Seller } = await import('../src/modules/commerce/seller/models/seller.model.js');
    const { Product } = await import('../src/modules/commerce/admin/models/product.model.js');
    const { Order } = await import('../src/modules/commerce/orders/models/order.model.js');
    const { User } = await import('../src/core/users/user.model.js');
    const { Category } = await import('../src/modules/commerce/admin/models/category.model.js');
    const inventory = await import('../src/modules/commerce/orders/services/inventory.service.js');
    const migration = await import('../scripts/migrations/2026-09-channels.mjs');
    await Promise.all([Product.init(), Seller.init()]);
    M = { db, Zone, Seller, Product, Order, User, inventory, migration };

    ids.category = (await Category.create({ name: 'Channel Things' }))._id;
    ids.zone = (await Zone.create({ name: 'Channel Zone', country: 'India', coordinates: ZONE, isActive: true }))._id;
    ids.admin = new mongoose.Types.ObjectId();
    await db.collection('admins').insertOne({ _id: ids.admin, email: 'ch@example.com', role: 'ADMIN', adminType: 'super_admin', isActive: true });
    tokens.admin = tokenFor('ADMIN', ids.admin, { adminType: 'super_admin' });

    // Both channels; Quick only; Shop only.
    ids.both = (await makeSeller('Both Store', { channels: { quick: approved, shop: approved } }))._id;
    ids.quickOnly = (await makeSeller('Quick Store', { channels: { quick: approved, shop: none } }))._id;
    ids.shopOnly = (await makeSeller('Shop Store', { channels: { quick: none, shop: approved } }))._id;

    const user = await User.create({ name: 'Buyer', phone: '9111100009', isActive: true });
    tokens.customer = tokenFor('USER', user._id);
});

after(stopApp);

const product = (sellerId, fields) => M.Product.create({ sellerId, approvalStatus: 'approved', price: 10, ...fields });

// ---- Seller registration and channel approval ------------------------------

const register = (fields) => call('POST', '/seller/register', {
    body: { sellerName: `Reg ${phoneSeq}`, ownerName: 'Owner', ownerPhone: phone(), ...fields },
});

test('registration: picked channels start pending, the others none; requirements per pick', async () => {
    const both = ok(await register({ channels: 'quick,shop', zoneId: String(ids.zone), pincode: '560001' }), 'both', 201);
    assert.equal(both.channels.quick.status, 'pending');
    assert.equal(both.channels.shop.status, 'pending');
    assert.ok(both.channels.quick.appliedAt);

    const shop = ok(await register({ channels: 'shop', zoneId: '', pincode: '400001' }), 'shop only, no zone', 201);
    assert.equal(shop.channels.shop.status, 'pending');
    assert.equal(shop.channels.quick.status, 'none');

    const noZone = await register({ channels: 'quick' });
    assert.equal(noZone.status, 400);
    assert.match(noZone.body.message, /zone/);

    const badPin = await register({ channels: 'shop', pincode: '5600' });
    assert.equal(badPin.status, 400);
    assert.match(badPin.body.message, /6-digit pincode/);

    assert.equal((await register({})).status, 400, 'at least one channel');
    assert.equal((await register({ channels: 'teleport' })).status, 400);

    const current = ok(await call('GET', '/seller/current', { as: tokenFor('SELLER', shop._id) }), 'current');
    assert.equal(current.seller.channels.shop.status, 'pending');
    assert.equal(current.seller.channels.quick.status, 'none');
});

test('apply: none/rejected -> pending, only when the channel requirements are met', async () => {
    const seller = await makeSeller('Applicant', { channels: { quick: approved, shop: none }, pincode: '' });
    const as = tokenFor('SELLER', seller._id);

    const missing = await call('POST', '/seller/channels/shop/apply', { as });
    assert.equal(missing.status, 400);
    assert.match(missing.body.message, /6-digit pincode/);

    await M.Seller.updateOne({ _id: seller._id }, { $set: { pincode: '560001', 'location.pincode': '560001' } });
    const applied = ok(await call('POST', '/seller/channels/shop/apply', { as }), 'apply shop');
    assert.equal(applied.channels.shop.status, 'pending');

    assert.equal((await call('POST', '/seller/channels/quick/apply', { as })).status, 400, 'already approved');
    assert.equal((await call('POST', '/seller/channels/bike/apply', { as })).status, 400);

    // Quick needs the store inside its zone.
    const far = await makeSeller('Far Away', { channels: { quick: none, shop: approved }, at: OUT_OF_ZONE });
    const farApply = await call('POST', '/seller/channels/quick/apply', { as: tokenFor('SELLER', far._id) });
    assert.equal(farApply.status, 400);
    assert.match(farApply.body.message, /inside its service zone/);

    // Rejected can apply again.
    await M.Seller.updateOne({ _id: seller._id }, { $set: { 'channels.shop.status': 'rejected', 'channels.shop.rejectionReason': 'x' } });
    const again = ok(await call('POST', '/seller/channels/shop/apply', { as }), 'reapply');
    assert.equal(again.channels.shop.status, 'pending');
    assert.equal(again.channels.shop.rejectionReason, null);
    ids.applicant = seller._id;
});

test('admin: approve/reject a channel, list filters and join requests', async () => {
    const as = tokens.admin;
    const path = (id, c) => `/admin/sellers/${id}/channels/${c}`;

    const pending = ok(await call('GET', '/admin/sellers/pending', { as }), 'pending');
    const row = (Array.isArray(pending) ? pending : pending.sellers || []).find((s) => String(s._id) === String(ids.applicant));
    assert.ok(row, 'a channel request shows as a join request');
    assert.deepEqual(row.channelRequests, ['shop']);

    const listed = ok(await call('GET', '/admin/sellers?channel=shop&channelStatus=pending', { as }), 'list pending shop');
    assert.ok(listed.sellers.some((s) => String(s._id) === String(ids.applicant)));
    assert.ok(listed.sellers.every((s) => s.channels.shop.status === 'pending'));
    const withShop = ok(await call('GET', '/admin/sellers?channel=shop&limit=500', { as }), 'has shop');
    assert.ok(withShop.sellers.every((s) => s.channels.shop.status !== 'none'));
    assert.ok(!withShop.sellers.some((s) => String(s._id) === String(ids.quickOnly)));
    assert.equal((await call('GET', '/admin/sellers?channelStatus=maybe', { as })).status, 400);

    const noReason = await call('PATCH', path(ids.applicant, 'shop'), { as, body: { action: 'reject' } });
    assert.equal(noReason.status, 400);
    const rejected = ok(await call('PATCH', path(ids.applicant, 'shop'), { as, body: { action: 'reject', reason: 'No GST' } }), 'reject');
    assert.equal(rejected.channels.shop.status, 'rejected');
    assert.equal(rejected.channels.shop.rejectionReason, 'No GST');
    assert.ok(rejected.channels.shop.decidedAt);

    const approvedRes = ok(await call('PATCH', path(ids.applicant, 'shop'), { as, body: { action: 'approve' } }), 'approve');
    assert.equal(approvedRes.channels.shop.status, 'approved');
    assert.equal(approvedRes.channels.shop.rejectionReason, null);
    assert.equal(String(approvedRes._id), String(ids.applicant), 'returns the updated seller');

    // Approve checks the requirements too.
    const far = await makeSeller('Far Again', { channels: { quick: { status: 'pending' }, shop: approved }, at: OUT_OF_ZONE });
    assert.equal((await call('PATCH', path(far._id, 'quick'), { as, body: { action: 'approve' } })).status, 400);
    assert.equal((await call('PATCH', path(far._id, 'quick'), { as, body: { action: 'maybe' } })).status, 400);

    const detail = ok(await call('GET', `/admin/sellers/${ids.applicant}`, { as }), 'detail');
    const seller = detail.seller || detail;
    assert.equal(seller.channels.shop.status, 'approved');
});

// ---- Products: channels within the seller's approvals ----------------------

test('a product can only be listed in channels its seller is approved for', async () => {
    const as = tokenFor('SELLER', ids.quickOnly);
    const bad = await call('POST', '/seller/products', { as, body: { name: 'Bad Shop Item', price: 10, channels: { quick: true, shop: true } } });
    assert.equal(bad.status, 400);
    assert.match(bad.body.message, /Shop/);

    const created = ok(await call('POST', '/seller/products', {
        as, body: { name: 'Default Channels', price: 10, stock: { quick: 4 }, lowStockThreshold: { quick: 1 } },
    }), 'create', 201).product;
    assert.deepEqual(created.channels, { quick: true, shop: false }, 'defaults to where the seller is approved');
    assert.equal(created.stock.quick, 4);
    assert.deepEqual(created.availableIn, { quick: true, shop: false });

    const toShop = await call('PATCH', `/seller/products/${created._id}`, { as, body: { channels: { shop: true } } });
    assert.equal(toShop.status, 400);
    const none = await call('PATCH', `/seller/products/${created._id}`, { as, body: { channels: { quick: false } } });
    assert.equal(none.status, 400, 'at least one channel');

    // Admin is held to the same rule.
    const adminBad = await call('POST', '/admin/products', {
        as: tokens.admin, body: { sellerId: String(ids.shopOnly), categoryId: String(ids.category), name: 'Admin Quick', price: 5, channels: 'quick' },
    });
    assert.equal(adminBad.status, 400);
    const adminOk = ok(await call('POST', '/admin/products', {
        as: tokens.admin, body: { sellerId: String(ids.shopOnly), categoryId: String(ids.category), name: 'Admin Shop Item', price: 5, stock: { shop: 3 } },
    }), 'admin create', 201);
    const adminProduct = adminOk.product || adminOk;
    assert.deepEqual(adminProduct.channels, { quick: false, shop: true });
    assert.equal(adminProduct.stock.shop, 3);
});

test('admin product lists filter by channel', async () => {
    const as = tokens.admin;
    const names = (res) => res.products.map((p) => p.name);
    const shop = ok(await call('GET', '/admin/products?channel=shop&limit=1000', { as }), 'shop');
    assert.ok(names(shop).includes('Admin Shop Item'));
    assert.ok(!names(shop).includes('Default Channels'));
    assert.ok(shop.products.every((p) => p.channels.shop === true));
    const quick = ok(await call('GET', '/admin/products?fulfilmentMode=quick&limit=1000', { as }), 'quick panel');
    assert.ok(names(quick).includes('Default Channels'));
    assert.ok(!names(quick).includes('Admin Shop Item'));
    assert.equal((await call('GET', '/admin/products?channel=bike', { as })).status, 400);
});

// ---- Inventory per channel -------------------------------------------------

const line = (itemId, quantity, variantId) => ({ itemId: String(itemId), quantity, ...(variantId ? { variantId: String(variantId) } : {}) });
const stockOf = async (id) => (await M.Product.findById(id).lean()).stock;

test('a quick order leaves shop stock alone, and a shop order leaves quick stock alone', async () => {
    const p = await product(ids.both, { name: 'Split Stock', stock: { quick: 5, shop: 20 } });
    const { reserveStockForItems } = M.inventory;

    const q = await reserveStockForItems([line(p._id, 2)], { channel: 'quick' });
    assert.deepEqual(q, [{ itemId: String(p._id), variantId: '', channel: 'quick', qty: 2 }]);
    assert.deepEqual(await stockOf(p._id), { quick: 3, shop: 20 });

    await reserveStockForItems([line(p._id, 7)], { channel: 'shop' });
    assert.deepEqual(await stockOf(p._id), { quick: 3, shop: 13 });

    await assert.rejects(reserveStockForItems([line(p._id, 4)], { channel: 'quick' }), /Only 3 left/);
    assert.deepEqual(await stockOf(p._id), { quick: 3, shop: 13 }, 'nothing taken on a failed line');

    // Variants counted per channel on their own.
    const m = { _id: new mongoose.Types.ObjectId(), name: 'M', price: 10, stock: { quick: 1, shop: null } };
    const v = await product(ids.both, { name: 'Split Tee', stock: { quick: null, shop: 9 }, variants: [m] });
    await reserveStockForItems([line(v._id, 2, m._id)], { channel: 'shop' });
    const doc = await M.Product.findById(v._id).lean();
    assert.equal(doc.variants[0].stock.quick, 1, 'quick variant count untouched');
    assert.equal(doc.stock.shop, 7, 'shop falls back to the shared count');
});

test('racing for the last unit is per channel: one winner in each', async () => {
    const p = await product(ids.both, { name: 'Last Unit', stock: { quick: 1, shop: 1 } });
    const race = (channel) => Promise.allSettled(
        Array.from({ length: 6 }, () => M.inventory.reserveStockForItems([line(p._id, 1)], { channel })),
    );
    const [quick, shop] = await Promise.all([race('quick'), race('shop')]);
    assert.equal(quick.filter((r) => r.status === 'fulfilled').length, 1);
    assert.equal(shop.filter((r) => r.status === 'fulfilled').length, 1);
    const doc = await M.Product.findById(p._id).lean();
    assert.deepEqual(doc.stock, { quick: 0, shop: 0 });
    assert.deepEqual(doc.availableIn, { quick: false, shop: false });
    assert.equal(doc.isAvailable, false);
});

test('restock goes back to the channel it came from, including older orders and returns', async () => {
    const p = await product(ids.both, { name: 'Restock Me', stock: { quick: 5, shop: 5 } });
    const taken = await M.inventory.reserveStockForItems([line(p._id, 2)], { channel: 'shop' });
    const order = await M.Order.collection.insertOne({
        items: [line(p._id, 2)], fulfilmentMode: 'standard', stockReservations: taken, stockReservedAt: new Date(), stockRestoredAt: null,
    });
    assert.equal(await M.inventory.restoreOrderStock({ _id: order.insertedId, stockReservedAt: new Date() }), true);
    assert.deepEqual(await stockOf(p._id), { quick: 5, shop: 5 });

    // A reservation stored without a channel restocks to the order's channel.
    await M.Product.updateOne({ _id: p._id }, { $set: { 'stock.shop': 3 } });
    const legacy = await M.Order.collection.insertOne({
        items: [line(p._id, 2)], fulfilmentMode: 'standard',
        stockReservations: [{ itemId: String(p._id), variantId: '', qty: 2 }], stockReservedAt: new Date(), stockRestoredAt: null,
    });
    await M.inventory.restoreOrderStock({ _id: legacy.insertedId, stockReservedAt: new Date() });
    assert.deepEqual(await stockOf(p._id), { quick: 5, shop: 5 });

    // Returned units go to the Shop shelf.
    await M.inventory.restockReturnedItems([line(p._id, 1)], 'shop');
    assert.deepEqual(await stockOf(p._id), { quick: 5, shop: 6 });
});

test('low stock is per channel: once per crossing, and a restock in one channel does not reset the other', async () => {
    const p = await product(ids.both, {
        name: 'Low Both', stock: { quick: 3, shop: 3 }, lowStockThreshold: { quick: 2, shop: 2 },
    });
    const flags = async () => (await M.Product.findById(p._id).lean()).lowStockNotifiedAt;
    const { reserveStockForItems, notifyLowStock } = M.inventory;

    await reserveStockForItems([line(p._id, 1)], { channel: 'quick' }); // quick 2: crosses
    let f = await flags();
    assert.ok(f.quick);
    assert.equal(f.shop, null, 'shop not told');
    assert.equal(await notifyLowStock(p._id, '', 'quick'), false, 'already told');

    await reserveStockForItems([line(p._id, 1)], { channel: 'shop' }); // shop 2: crosses
    f = await flags();
    assert.ok(f.shop);

    // A seller restock of quick clears only quick.
    ok(await call('PATCH', '/seller/products/stock', {
        as: tokenFor('SELLER', ids.both), body: { items: [{ itemId: String(p._id), channel: 'quick', qty: 10 }] },
    }), 'restock quick');
    f = await flags();
    assert.equal(f.quick, null);
    assert.ok(f.shop);
    await reserveStockForItems([line(p._id, 8)], { channel: 'quick' }); // quick 2 again: crosses again
    assert.ok((await flags()).quick);
});

// ---- Seller stock API and menu shapes ---------------------------------------

test('seller stock update sets one channel, and the low-stock list says its channel', async () => {
    const as = tokenFor('SELLER', ids.both);
    const v = { _id: new mongoose.Types.ObjectId(), name: 'L', price: 10, stock: { quick: 5, shop: 5 }, lowStockThreshold: { quick: 2, shop: 2 } };
    const p = await product(ids.both, {
        name: 'Stock Api', stock: { quick: 10, shop: 10 }, lowStockThreshold: { quick: 3, shop: 3 }, variants: [v],
    });

    const res = ok(await call('PATCH', '/seller/products/stock', {
        as, body: { items: [
            { itemId: String(p._id), channel: 'shop', qty: 1 },
            { itemId: String(p._id), variantId: String(v._id), channel: 'quick', qty: 0 },
            { itemId: String(p._id), qty: 4 },
        ] },
    }), 'stock update');
    assert.equal(res.updatedCount, 2);
    assert.match(res.failed[0].reason, /channel is required/);
    assert.deepEqual(
        res.updated.map((r) => ({ itemId: r.itemId, variantId: r.variantId, channel: r.channel, qty: r.qty })),
        [
            { itemId: String(p._id), variantId: null, channel: 'shop', qty: 1 },
            { itemId: String(p._id), variantId: String(v._id), channel: 'quick', qty: 0 },
        ],
    );
    const doc = await M.Product.findById(p._id).lean();
    assert.deepEqual(doc.stock, { quick: 10, shop: 1 });
    assert.deepEqual(doc.variants[0].stock, { quick: 0, shop: 5 });

    const low = ok(await call('GET', '/seller/products/low-stock?channel=shop', { as }), 'low shop');
    const mine = low.items.filter((r) => r.itemId === String(p._id));
    assert.deepEqual(mine.map(({ itemId, variantId, channel, qty, threshold }) => ({ itemId, variantId, channel, qty, threshold })), [
        { itemId: String(p._id), variantId: null, channel: 'shop', qty: 1, threshold: 3 },
    ]);
    const lowQuick = ok(await call('GET', '/seller/products/low-stock?channel=quick', { as }), 'low quick');
    assert.deepEqual(
        lowQuick.items.filter((r) => r.itemId === String(p._id)).map((r) => [r.variantId, r.channel, r.qty, r.threshold, r.name]),
        [[String(v._id), 'quick', 0, 2, 'Stock Api (L)']],
    );
    const all = ok(await call('GET', '/seller/products/low-stock', { as }), 'low all');
    assert.equal(all.items.filter((r) => r.itemId === String(p._id)).length, 2);
    assert.equal((await call('GET', '/seller/products/low-stock?channel=air', { as })).status, 400);

    const menu = ok(await call('GET', '/seller/menu', { as }), 'seller menu');
    const item = menu.menu.sections.flatMap((s) => s.items).find((i) => i.name === 'Stock Api');
    assert.deepEqual(item.channels, { quick: true, shop: true });
    assert.deepEqual(item.stock, { quick: 10, shop: 1 });
    assert.deepEqual(item.lowStockThreshold, { quick: 3, shop: 3 });
    // Its only variant is out in Quick, so the product is too.
    assert.deepEqual(item.availableIn, { quick: false, shop: true });
    assert.deepEqual(item.variants[0].stock, { quick: 0, shop: 5 });
    assert.deepEqual(item.variants[0].channels, { quick: null, shop: null });
    assert.deepEqual(item.variants[0].lowStockThreshold, { quick: 2, shop: 2 });
    assert.deepEqual(item.variants[0].availableIn, { quick: false, shop: true });
});

// ---- Catalogue ---------------------------------------------------------------

test('catalogue: a product appears in a channel only when the seller, the product and the stock all allow it', async () => {
    // Both Store: in both; quick sold out; shop-only; a variant closed to quick.
    await product(ids.both, { name: 'Cat Everywhere', stock: { quick: 2, shop: 9 } });
    await product(ids.both, { name: 'Cat QuickGone', stock: { quick: 0, shop: 9 } });
    await product(ids.both, { name: 'Cat ShopOnly', channels: { quick: false, shop: true } });
    await product(ids.both, {
        name: 'Cat Rug',
        variants: [
            { _id: new mongoose.Types.ObjectId(), name: 'Small', price: 10 },
            { _id: new mongoose.Types.ObjectId(), name: 'Large', price: 20, channels: { quick: false } },
        ],
    });
    // Quick Store is not approved for Shop, even though its product is listed there.
    await M.Product.collection.insertOne({
        sellerId: ids.quickOnly, name: 'Cat Stray', price: 10, approvalStatus: 'approved', isAvailable: true,
        channels: { quick: true, shop: true }, stock: { quick: null, shop: null }, availableIn: { quick: true, shop: true },
    });

    const cat = (names) => names.filter((n) => n.startsWith('Cat ')).sort();
    const list = async (mode) => ok(await call('GET', `/catalog/products?fulfilmentMode=${mode}&limit=1000`), `list ${mode}`).products;
    const quick = await list('quick');
    const shop = await list('standard');
    assert.deepEqual(cat(quick.map((p) => p.name)), ['Cat Everywhere', 'Cat Rug', 'Cat Stray']);
    assert.deepEqual(cat(shop.map((p) => p.name)), ['Cat Everywhere', 'Cat QuickGone', 'Cat Rug', 'Cat ShopOnly']);

    const everywhere = quick.find((p) => p.name === 'Cat Everywhere');
    assert.equal(everywhere.stockForChannel, 2);
    assert.deepEqual(everywhere.availableIn, { quick: true, shop: true });
    assert.equal(shop.find((p) => p.name === 'Cat Everywhere').stockForChannel, 9);
    assert.deepEqual(quick.find((p) => p.name === 'Cat Rug').variants.map((v) => v.name), ['Small'], 'variant closed to quick is dropped');
    assert.equal(shop.find((p) => p.name === 'Cat Rug').variants.length, 2);
    assert.deepEqual(quick.find((p) => p.name === 'Cat Stray').availableIn, { quick: true, shop: false }, 'seller not approved for shop');

    const search = async (mode) => ok(await call('GET', `/catalog/search/products?q=cat&limit=50&fulfilmentMode=${mode}`), `search ${mode}`).products;
    assert.deepEqual(cat((await search('quick')).map((p) => p.name)), ['Cat Everywhere', 'Cat Rug', 'Cat Stray']);
    assert.deepEqual(cat((await search('standard')).map((p) => p.name)), ['Cat Everywhere', 'Cat QuickGone', 'Cat Rug', 'Cat ShopOnly']);

    const menu = async (id, mode) => ok(await call('GET', `/catalog/stores/${id}/products?fulfilmentMode=${mode}`), `menu ${mode}`)
        .menu.sections.flatMap((s) => s.items).map((i) => i.name);
    assert.deepEqual(cat(await menu(ids.both, 'quick')), ['Cat Everywhere', 'Cat Rug']);
    assert.deepEqual(await menu(ids.quickOnly, 'standard'), [], 'store not approved for shop shows nothing there');

    const stores = async (mode) => ok(await call('GET', `/catalog/stores?limit=500&fulfilmentMode=${mode}`), `stores ${mode}`)
        .sellers.map((s) => s.sellerName);
    assert.ok(!(await stores('standard')).includes('Quick Store'));
    assert.ok((await stores('quick')).includes('Quick Store'));
    assert.ok(!(await stores('quick')).includes('Shop Store'));
});

test('product detail without fulfilmentMode returns every channel\'s stock, for linking to the other store', async () => {
    const v = { _id: new mongoose.Types.ObjectId(), name: 'Big', price: 30, channels: { quick: false }, stock: { quick: null, shop: 4 } };
    const p = await product(ids.both, { name: 'Detail Item', stock: { quick: 0, shop: 12 }, variants: [v] });
    const detail = ok(await call('GET', `/catalog/products/${p._id}`), 'detail').product;
    assert.deepEqual(detail.channels, { quick: true, shop: true });
    assert.deepEqual(detail.stock, { quick: 0, shop: 12 });
    assert.deepEqual(detail.availableIn, { quick: false, shop: true });
    assert.equal(detail.stockForChannel, undefined);
    assert.deepEqual(detail.variants[0].channels, { quick: false, shop: null });
    assert.deepEqual(detail.variants[0].stock, { quick: null, shop: 4 });

    const shopDetail = ok(await call('GET', `/catalog/products/${p._id}?fulfilmentMode=standard`), 'detail shop').product;
    assert.equal(shopDetail.stockForChannel, 12);
    assert.deepEqual(shopDetail.stock, { quick: 0, shop: 12 }, 'full stock still there');
});

// ---- Checkout rejections -----------------------------------------------------

test('checkout rejects lines not sellable in the order\'s channel, with machine-readable details', async () => {
    const shopOnlyItem = await product(ids.both, { name: 'Chk Sofa', channels: { quick: false, shop: true } });
    const big = { _id: new mongoose.Types.ObjectId(), name: 'Big', price: 20, channels: { quick: false } };
    const withVariant = await product(ids.both, { name: 'Chk Rug', variants: [{ _id: new mongoose.Types.ObjectId(), name: 'Small', price: 10 }, big] });
    const scarce = await product(ids.both, { name: 'Chk Scarce', stock: { quick: 50, shop: 1 } });
    const strayQuick = await product(ids.quickOnly, { name: 'Chk Stray', channels: { quick: true, shop: false } });

    const quote = (sellerId, items, fulfilmentMode) => call('POST', '/orders/checkout/calculate', {
        as: tokens.customer,
        body: { items: items.map((i) => ({ ...i, sellerId: String(sellerId), name: 'x', price: 10 })), deliveryAddress: address, fulfilmentMode },
    });
    const expect400 = (res, reason, extra = {}) => {
        assert.equal(res.status, 400, JSON.stringify(res.body));
        assert.equal(res.body.data.reason, reason);
        for (const [k, v] of Object.entries(extra)) assert.equal(res.body.data[k], v);
    };

    expect400(await quote(ids.both, [line(shopOnlyItem._id, 1)], 'quick'), 'not_in_channel', { productId: String(shopOnlyItem._id), channel: 'quick', variantId: null });
    expect400(await quote(ids.both, [line(withVariant._id, 1, big._id)], 'quick'), 'variant_not_in_channel', { variantId: String(big._id) });
    expect400(await quote(ids.both, [line(scarce._id, 2)], 'standard'), 'out_of_stock', { channel: 'shop' });
    expect400(await quote(ids.quickOnly, [line(strayQuick._id, 1)], 'standard'), 'seller_not_approved', { channel: 'shop' });

    // The single-store paths refuse the same way.
    const calc = await call('POST', '/orders/calculate', {
        as: tokens.customer,
        body: { sellerId: String(ids.both), items: [{ itemId: String(shopOnlyItem._id), name: 'x', price: 10, quantity: 1 }], zoneId: String(ids.zone), fulfilmentMode: 'quick' },
    });
    expect400(calc, 'not_in_channel');
    const place = await call('POST', '/orders', {
        as: tokens.customer,
        body: {
            sellerId: String(ids.both), items: [{ itemId: String(shopOnlyItem._id), name: 'x', price: 10, quantity: 1 }],
            address, pricing: { subtotal: 10, total: 10 }, paymentMethod: 'cash', fulfilmentMode: 'quick',
        },
    });
    expect400(place, 'not_in_channel');

    // The right channel goes through, and takes that channel's stock.
    const good = await quote(ids.both, [line(scarce._id, 1)], 'standard');
    assert.equal(good.status, 200, JSON.stringify(good.body));
});

test('a quick order placed through the API takes Quick stock only', async () => {
    const p = await product(ids.both, { name: 'Order Split', stock: { quick: 5, shop: 5 } });
    const placed = ok(await call('POST', '/orders', {
        as: tokens.customer,
        body: {
            sellerId: String(ids.both), items: [{ itemId: String(p._id), name: 'Order Split', price: 10, quantity: 2 }],
            address, pricing: { subtotal: 20, total: 20 }, paymentMethod: 'cash', fulfilmentMode: 'quick',
        },
    }), 'place', 201);
    assert.deepEqual(await stockOf(p._id), { quick: 3, shop: 5 });
    const order = await M.Order.findById(placed.order._id || placed.order.id).lean();
    assert.equal(order.stockReservations[0].channel, 'quick');
});

// ---- Migration ---------------------------------------------------------------

test('migration: old stock fields move to the right channel; approved sellers get both; idempotent, dry run by default', async () => {
    const db = M.db;
    const quickish = new mongoose.Types.ObjectId();
    const shopOnly = new mongoose.Types.ObjectId();
    const manualOff = new mongoose.Types.ObjectId();
    const optIn = new mongoose.Types.ObjectId();
    const vOpt = new mongoose.Types.ObjectId();
    const vOther = new mongoose.Types.ObjectId();
    const seller = new mongoose.Types.ObjectId();
    const pendingSeller = new mongoose.Types.ObjectId();
    await db.collection('products').insertMany([
        { _id: quickish, name: 'Old Milk', stockQty: 7, lowStockThreshold: 2, quickEligible: true, isAvailable: true,
            variants: [{ _id: new mongoose.Types.ObjectId(), name: '1L', price: 5, stockQty: 3, lowStockThreshold: 1, quickEligible: null }] },
        { _id: shopOnly, name: 'Old Sofa', stockQty: 4, lowStockThreshold: null, quickEligible: false, isAvailable: true, variants: [] },
        { _id: manualOff, name: 'Old Off', stockQty: 5, quickEligible: true, isAvailable: false, variants: [] },
        { _id: optIn, name: 'Old Rug', stockQty: null, quickEligible: false, isAvailable: true,
            variants: [{ _id: vOpt, name: 'S', price: 1, quickEligible: true }, { _id: vOther, name: 'L', price: 2, quickEligible: null }] },
    ]);
    await db.collection('sellers').insertMany([
        { _id: seller, sellerName: 'Old Approved', status: 'approved' },
        { _id: pendingSeller, sellerName: 'Old Pending', status: 'pending' },
    ]);
    const log = () => {};

    const dry = await M.migration.migrateChannels(db, { log });
    assert.ok(dry.products >= 4);
    assert.equal(dry.sellersApproved >= 1, true);
    assert.equal((await db.collection('products').findOne({ _id: quickish })).stockQty, 7, 'dry run writes nothing');

    await M.migration.migrateChannels(db, { apply: true, log });
    const get = (id) => db.collection('products').findOne({ _id: id });

    const milk = await get(quickish);
    assert.equal(milk.stockQty, undefined);
    assert.equal(milk.quickEligible, undefined);
    assert.deepEqual(milk.channels, { quick: true, shop: true });
    assert.deepEqual(milk.stock, { quick: 7, shop: null });
    assert.deepEqual(milk.lowStockThreshold, { quick: 2, shop: null });
    assert.deepEqual(milk.variants[0].stock, { quick: 3, shop: null });
    assert.deepEqual(milk.variants[0].lowStockThreshold, { quick: 1, shop: null });
    assert.deepEqual(milk.availableIn, { quick: true, shop: true });

    const sofa = await get(shopOnly);
    assert.deepEqual(sofa.channels, { quick: false, shop: true });
    assert.deepEqual(sofa.stock, { quick: null, shop: 4 });
    assert.deepEqual(sofa.availableIn, { quick: false, shop: true });

    const off = await get(manualOff);
    assert.equal(off.stockOffMode, 'manual', 'switched off by hand stays off');
    assert.equal(off.isAvailable, false);

    const rug = await get(optIn);
    assert.deepEqual(rug.channels, { quick: true, shop: true }, 'a variant that opted in keeps Quick');
    assert.equal(rug.variants.find((v) => String(v._id) === String(vOther)).channels.quick, false);
    assert.equal(rug.variants.find((v) => String(v._id) === String(vOpt)).channels.quick, null);

    const s = await db.collection('sellers').findOne({ _id: seller });
    assert.equal(s.channels.quick.status, 'approved');
    assert.equal(s.channels.shop.status, 'approved');
    assert.equal((await db.collection('sellers').findOne({ _id: pendingSeller })).channels.quick.status, 'none');

    const again = await M.migration.migrateChannels(db, { apply: true, log });
    assert.equal(again.products, 0, 'idempotent');
    assert.equal(again.sellersApproved + again.sellersNone, 0);
});
