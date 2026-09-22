import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import ExcelJS from 'exceljs';
import { startApp, stopApp, tokenFor, call, ok, oid } from './helpers/app.js';

// Admin gaps: create-store channels, category tree fields, scoped bulk
// approve, colour attribute values, low stock, first-order claim release,
// bulk-upload channel columns, admin password strength.

let db;
let adminToken;
let adminId;
let zoneId;

// A square around (12.9, 77.6).
const ZONE_SQUARE = [
    { latitude: 12.8, longitude: 77.5 },
    { latitude: 12.8, longitude: 77.7 },
    { latitude: 13.0, longitude: 77.7 },
    { latitude: 13.0, longitude: 77.5 },
];

before(async () => {
    db = await startApp();
    adminId = new mongoose.Types.ObjectId();
    await db.collection('admins').insertOne({
        _id: adminId,
        email: 'admin_gaps@example.com',
        role: 'ADMIN',
        adminType: 'super_admin',
        isActive: true,
    });
    adminToken = tokenFor('ADMIN', adminId, { adminType: 'super_admin' });

    zoneId = new mongoose.Types.ObjectId();
    await db.collection('zones').insertOne({
        _id: zoneId,
        name: 'Gaps zone',
        zoneName: 'Gaps zone',
        isActive: true,
        coordinates: ZONE_SQUARE,
    });
});

after(stopApp);

let phoneSeq = 9000000000;
const storeBody = (extra = {}) => {
    phoneSeq += 1;
    return {
        sellerName: `Store ${phoneSeq}`,
        ownerName: 'Owner',
        ownerEmail: `o${phoneSeq}@example.com`,
        ownerPhone: String(phoneSeq),
        primaryContactNumber: String(phoneSeq),
        ...extra,
    };
};

/* ---------------------------------------------------------- 1. Add Seller */

test('admin-created store: choosing no channel is refused', async () => {
    const res = await call('POST', '/admin/sellers', { as: adminToken, body: storeBody() });
    assert.equal(res.status, 400);
    assert.match(res.body.message, /Quick, Shop or both/);
});

test('admin-created store: missing channel requirements are listed', async () => {
    const res = await call('POST', '/admin/sellers', {
        as: adminToken,
        body: storeBody({ sellIn: ['quick', 'shop'], location: { addressLine1: '1 Road', pincode: '12' } }),
    });
    assert.equal(res.status, 400, JSON.stringify(res.body));
    assert.match(res.body.message, /Quick needs a service zone/);
    assert.match(res.body.message, /Shop needs a 6-digit pincode/);
    assert.deepEqual(Object.keys(res.body.data.missing).sort(), ['quick', 'shop']);
});

test('admin-created store: a location outside the zone blocks Quick', async () => {
    const res = await call('POST', '/admin/sellers', {
        as: adminToken,
        body: storeBody({ sellIn: ['quick'], zoneId: String(zoneId), location: { latitude: 20, longitude: 70 } }),
    });
    assert.equal(res.status, 400);
    assert.match(res.body.message, /inside its service zone/);
});

test('admin-created store is approved for the chosen channels only', async () => {
    const shopOnly = ok(
        await call('POST', '/admin/sellers', {
            as: adminToken,
            body: storeBody({ sellIn: ['shop'], location: { addressLine1: '1 Road', pincode: '560001' } }),
        }),
        'shop store',
        201,
    );
    assert.equal(shopOnly.channels.shop.status, 'approved');
    assert.equal(shopOnly.channels.quick.status, 'none');

    const both = ok(
        await call('POST', '/admin/sellers', {
            as: adminToken,
            body: storeBody({
                sellIn: ['quick', 'shop'],
                zoneId: String(zoneId),
                location: { addressLine1: '2 Road', pincode: '560002', latitude: 12.9, longitude: 77.6 },
            }),
        }),
        'both store',
        201,
    );
    assert.equal(both.channels.quick.status, 'approved');
    assert.equal(both.channels.shop.status, 'approved');
    const stored = await db.collection('sellers').findOne({ _id: oid(both._id) });
    assert.equal(stored.channels.quick.status, 'approved');
    assert.equal(stored.status, 'approved');
});

test('channel approve works from status none (admin grants a channel directly)', async () => {
    const created = ok(
        await call('POST', '/admin/sellers', {
            as: adminToken,
            body: storeBody({ sellIn: ['shop'], zoneId: String(zoneId), location: { addressLine1: '3 Road', pincode: '560003', latitude: 12.9, longitude: 77.6 } }),
        }),
        'store',
        201,
    );
    assert.equal(created.channels.quick.status, 'none');
    const res = ok(
        await call('PATCH', `/admin/sellers/${created._id}/channels/quick`, { as: adminToken, body: { action: 'approve' } }),
        'approve quick',
    );
    assert.equal(res.channels.quick.status, 'approved');
});

/* ------------------------------------------------------- 2. Category form */

test('category list shows parent, attribute set and FSSAI flag', async () => {
    const set = ok(
        await call('POST', '/admin/attribute-sets', { as: adminToken, body: { name: 'Gaps set', attributeIds: [] } }),
        'set',
        201,
    );
    const setId = String(set.attributeSet?._id || set._id);
    const parent = ok(await call('POST', '/admin/categories', { as: adminToken, body: { name: 'Gaps Parent' } }), 'parent', 201);
    const parentId = String(parent.category?._id || parent._id);
    const child = ok(
        await call('POST', '/admin/categories', {
            as: adminToken,
            body: { name: 'Gaps Child', parentId, attributeSetId: setId, requiresFssai: true },
        }),
        'child',
        201,
    );
    const childId = String(child.category?._id || child._id);

    const list = ok(await call('GET', '/admin/categories?search=Gaps', { as: adminToken }), 'list');
    const row = list.categories.find((c) => String(c._id) === childId);
    assert.equal(String(row.parentId), parentId);
    assert.equal(String(row.attributeSetId), setId);
    assert.equal(row.requiresFssai, true);

    // Two levels only: the child cannot be a parent.
    const deeper = await call('POST', '/admin/categories', { as: adminToken, body: { name: 'Gaps Grandchild', parentId: childId } });
    assert.equal(deeper.status, 400);
});

/* ------------------------------------------------------ 3. Bulk approve */

test('bulk approve needs ids or a channel, and stays inside them', async () => {
    const sellerId = new mongoose.Types.ObjectId();
    const mk = (name, channels) => ({ _id: new mongoose.Types.ObjectId(), name, sellerId, approvalStatus: 'pending', channels, createdAt: new Date() });
    const quickOnly = mk('BA quick', { quick: true, shop: false });
    const shopOnly = mk('BA shop', { quick: false, shop: true });
    const both = mk('BA both', { quick: true, shop: true });
    const other = mk('BA other', { quick: true, shop: true });
    await db.collection('products').insertMany([quickOnly, shopOnly, both, other]);

    const none = await call('POST', '/admin/products/bulk-approve', { as: adminToken, body: {} });
    assert.equal(none.status, 400);
    const sellerOnly = await call('POST', '/admin/products/bulk-approve', { as: adminToken, body: { sellerId: String(sellerId) } });
    assert.equal(sellerOnly.status, 400);

    const tooMany = Array.from({ length: 501 }, () => String(new mongoose.Types.ObjectId()));
    assert.equal((await call('POST', '/admin/products/bulk-approve', { as: adminToken, body: { productIds: tooMany } })).status, 400);

    // Ids + channel: only the listed ids enabled for shop.
    const res = ok(
        await call('POST', '/admin/products/bulk-approve', {
            as: adminToken,
            body: { productIds: [quickOnly._id, shopOnly._id, both._id].map(String), channel: 'shop' },
        }),
        'bulk approve',
    );
    assert.equal(res.modifiedCount, 2);
    const status = async (p) => (await db.collection('products').findOne({ _id: p._id })).approvalStatus;
    assert.equal(await status(quickOnly), 'pending');
    assert.equal(await status(shopOnly), 'approved');
    assert.equal(await status(both), 'approved');
    assert.equal(await status(other), 'pending');

    // The pending list is scoped by channel too.
    const pendingQuick = ok(await call('GET', '/admin/products/pending-approvals?channel=quick', { as: adminToken }), 'pending');
    const names = pendingQuick.requests.map((r) => r.itemName);
    assert.ok(names.includes('BA quick'));
    assert.ok(!names.includes('BA shop'));
});

/* -------------------------------------------------- 4. Colour attributes */

test('colour attribute values keep their hex (object and "Name:#hex" forms)', async () => {
    const created = ok(
        await call('POST', '/admin/attributes', {
            as: adminToken,
            body: { name: 'Gaps Colour', type: 'color', values: [{ value: 'Red', hex: '#FF0000' }, 'Navy:#1a237e', 'White'] },
        }),
        'create colour',
        201,
    );
    const id = String(created.attribute?._id || created._id);
    const list = ok(await call('GET', '/admin/attributes', { as: adminToken }), 'attributes');
    const attr = list.attributes.find((a) => String(a._id) === id);
    const byName = Object.fromEntries(attr.values.map((v) => [v.value, v.hex]));
    assert.deepEqual(byName, { Red: '#ff0000', Navy: '#1a237e', White: '' });
});

/* ------------------------------------------------------------ 7. Low stock */

test('admin low stock lists products and variants at or below their alert, per channel', async () => {
    const sellerA = new mongoose.Types.ObjectId();
    const sellerB = new mongoose.Types.ObjectId();
    await db.collection('sellers').insertMany([
        { _id: sellerA, sellerName: 'Low A', status: 'approved' },
        { _id: sellerB, sellerName: 'Low B', status: 'approved' },
    ]);
    const variantLow = new mongoose.Types.ObjectId();
    await db.collection('products').insertMany([
        { name: 'LS low quick', sellerId: sellerA, channels: { quick: true, shop: true }, stock: { quick: 2, shop: 50 }, lowStockThreshold: { quick: 5, shop: 5 } },
        { name: 'LS fine', sellerId: sellerA, channels: { quick: true, shop: true }, stock: { quick: 20, shop: 1 }, lowStockThreshold: { quick: 5, shop: null } },
        { name: 'LS not counted', sellerId: sellerA, channels: { quick: true, shop: true }, stock: { quick: null, shop: null }, lowStockThreshold: { quick: 5, shop: 5 } },
        { name: 'LS quick off', sellerId: sellerA, channels: { quick: false, shop: true }, stock: { quick: 0, shop: 9 }, lowStockThreshold: { quick: 5, shop: 3 } },
        {
            name: 'LS variants', sellerId: sellerB, channels: { quick: true, shop: true },
            stock: { quick: null, shop: null }, lowStockThreshold: { quick: null, shop: null },
            variants: [
                { _id: variantLow, name: '1 kg', price: 10, stock: { quick: 0, shop: 10 }, lowStockThreshold: { quick: 1, shop: 1 } },
                { _id: new mongoose.Types.ObjectId(), name: '5 kg', price: 40, stock: { quick: 30 }, lowStockThreshold: { quick: 1 } },
            ],
        },
    ]);

    const quick = ok(await call('GET', '/admin/inventory/low-stock?channel=quick', { as: adminToken }), 'quick low');
    const quickNames = quick.items.map((r) => r.name).filter((n) => n.startsWith('LS'));
    assert.deepEqual(quickNames.sort(), ['LS low quick', 'LS variants (1 kg)']);
    const variantRow = quick.items.find((r) => r.variantId === String(variantLow));
    assert.equal(variantRow.qty, 0);
    assert.equal(variantRow.threshold, 1);
    assert.equal(variantRow.sellerName, 'Low B');

    const shop = ok(await call('GET', '/admin/inventory/low-stock?channel=shop', { as: adminToken }), 'shop low');
    assert.deepEqual(shop.items.map((r) => r.name).filter((n) => n.startsWith('LS')), []);

    const bySeller = ok(
        await call('GET', `/admin/inventory/low-stock?channel=quick&sellerId=${sellerB}`, { as: adminToken }),
        'seller low',
    );
    assert.deepEqual(bySeller.items.map((r) => r.name), ['LS variants (1 kg)']);

    assert.equal((await call('GET', '/admin/inventory/low-stock', { as: adminToken })).status, 400);
});

/* -------------------------------------------------- 8. First-order claims */

test('a first-order claim is released only when its order is cancelled or gone', async () => {
    const liveOrderId = new mongoose.Types.ObjectId();
    const cancelledOrderId = new mongoose.Types.ObjectId();
    await db.collection('orders').insertMany([
        { _id: liveOrderId, orderId: 'FO-LIVE', orderStatus: 'delivered', createdAt: new Date() },
        { _id: cancelledOrderId, orderId: 'FO-CANCEL', orderStatus: 'cancelled_by_admin', createdAt: new Date() },
    ]);
    const claim = (orderId) => ({
        _id: new mongoose.Types.ObjectId(),
        ownerUserId: new mongoose.Types.ObjectId(),
        orderId,
        checkoutId: null,
        flagged: false,
        createdAt: new Date(),
        updatedAt: new Date(),
    });
    const live = claim(liveOrderId);
    const cancelled = claim(cancelledOrderId);
    const orphan = claim(new mongoose.Types.ObjectId());
    await db.collection('first_order_claims').insertMany([live, cancelled, orphan]);

    const refused = await call('POST', `/admin/first-order-guard/claims/${live._id}/release`, { as: adminToken });
    assert.equal(refused.status, 400);
    assert.match(refused.body.message, /FO-LIVE/);
    assert.ok(await db.collection('first_order_claims').findOne({ _id: live._id }));

    ok(await call('POST', `/admin/first-order-guard/claims/${cancelled._id}/release`, { as: adminToken }), 'release cancelled');
    ok(await call('POST', `/admin/first-order-guard/claims/${orphan._id}/release`, { as: adminToken }), 'release orphan');
    assert.equal(await db.collection('first_order_claims').countDocuments({ _id: { $in: [cancelled._id, orphan._id] } }), 0);

    const missing = await call('POST', `/admin/first-order-guard/claims/${new mongoose.Types.ObjectId()}/release`, { as: adminToken });
    assert.equal(missing.status, 404);
});

/* -------------------------------------------------- 9. Bulk upload columns */

const BASE_HEADERS = [
    'Category*', 'Item Name*', 'Description', 'Base Price*', 'Veg/Non-Veg (optional)', 'Recommended (Yes/No)',
    'Preparation Time*', 'Image URL', 'Variant 1 Name', 'Variant 1 Price', 'Variant 2 Name', 'Variant 2 Price',
    'Variant 3 Name', 'Variant 3 Price',
];
const CHANNEL_HEADERS = ['Sell in Quick (Yes/No)', 'Sell in Shop (Yes/No)', 'Quick stock', 'Shop stock'];

async function sheetBuffer(rows) {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Menu Template');
    ws.addRow([...BASE_HEADERS, ...CHANNEL_HEADERS]);
    for (const r of rows) {
        ws.addRow([r.category, r.name, '', r.price, '', '', '', '', '', '', '', '', '', '', r.sellQuick ?? '', r.sellShop ?? '', r.quickStock ?? '', r.shopStock ?? '']);
    }
    return Buffer.from(await wb.xlsx.writeBuffer());
}

test('bulk upload channel columns: validated against approved channels, blank keeps current', async () => {
    const { processBulkMenuUpload, generateBulkMenuTemplate } = await import('../src/modules/commerce/seller/services/bulkUpload.service.js');

    const template = await generateBulkMenuTemplate();
    const headers = template.getWorksheet(1).getRow(1).values.slice(1);
    for (const h of CHANNEL_HEADERS) assert.ok(headers.includes(h), `template has ${h}`);

    const sellerId = new mongoose.Types.ObjectId();
    await db.collection('sellers').insertOne({
        _id: sellerId,
        sellerName: 'Bulk Seller',
        status: 'approved',
        channels: { quick: { status: 'approved' }, shop: { status: 'none' } },
    });

    const first = await processBulkMenuUpload(sellerId, await sheetBuffer([
        { category: 'Staples', name: 'BU Rice', price: 50, quickStock: 12 },
        { category: 'Staples', name: 'BU Dal', price: 60, sellShop: 'Yes' },
        { category: 'Staples', name: 'BU Salt', price: 20, shopStock: 5 },
        { category: 'Staples', name: 'BU Oil', price: 90, quickStock: 'lots' },
        { category: 'Staples', name: 'BU None', price: 10, sellQuick: 'No', sellShop: 'No' },
    ]), { approvalStatus: 'approved' });

    assert.equal(first.success, 1, JSON.stringify(first.details));
    const errors = Object.fromEntries(first.details.map((d) => [d.item, d.error]));
    assert.match(errors['BU Dal'], /not approved to sell in Shop/);
    assert.match(errors['BU Salt'], /Shop stock given/);
    assert.match(errors['BU Oil'], /whole number/);
    assert.match(errors['BU None'], /at least one/);

    const rice = await db.collection('products').findOne({ sellerId, name: 'BU Rice' });
    assert.equal(rice.stock.quick, 12);
    assert.equal(rice.channels.quick, true);
    assert.equal(rice.channels.shop, false);

    // Re-upload with blanks keeps stock and channels; an explicit value changes them.
    await db.collection('products').updateOne({ _id: rice._id }, { $set: { stock: { quick: 12, shop: null } } });
    const second = await processBulkMenuUpload(sellerId, await sheetBuffer([
        { category: 'Staples', name: 'BU Rice', price: 55 },
    ]), { approvalStatus: 'approved' });
    assert.equal(second.success, 1, JSON.stringify(second.details));
    let again = await db.collection('products').findOne({ _id: rice._id });
    assert.equal(again.stock.quick, 12);
    assert.equal(again.price, 55);
    assert.equal(again.channels.quick, true);

    const third = await processBulkMenuUpload(sellerId, await sheetBuffer([
        { category: 'Staples', name: 'BU Rice', price: 55, quickStock: 0, sellQuick: 'Yes' },
    ]), { approvalStatus: 'approved' });
    assert.equal(third.success, 1, JSON.stringify(third.details));
    again = await db.collection('products').findOne({ _id: rice._id });
    assert.equal(again.stock.quick, 0);

    // A sheet without the new columns still works (old templates).
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Menu Template');
    ws.addRow(BASE_HEADERS);
    ws.addRow(['Staples', 'BU Sugar', '', 40]);
    const legacy = await processBulkMenuUpload(sellerId, Buffer.from(await wb.xlsx.writeBuffer()), { approvalStatus: 'approved' });
    assert.equal(legacy.success, 1, JSON.stringify(legacy.details));
    const sugar = await db.collection('products').findOne({ sellerId, name: 'BU Sugar' });
    assert.deepEqual({ quick: sugar.channels.quick, shop: sugar.channels.shop }, { quick: true, shop: false });
});

/* ---------------------------------------------- 12. Admin password rule */

test('sub-admin create refuses a weak password with a 400', async () => {
    const weak = await call('POST', '/admin/sub-admins', {
        as: adminToken,
        body: { email: 'weak_sub@example.com', password: 'password1', name: 'Weak' },
    });
    assert.equal(weak.status, 400);
    assert.match(weak.body.message, /upper-case/);
    assert.match(weak.body.message, /special character/);

    ok(
        await call('POST', '/admin/sub-admins', {
            as: adminToken,
            body: { email: 'strong_sub@example.com', password: 'Str0ng!Pass', name: 'Strong' },
        }),
        'strong sub-admin',
        201,
    );
});

test('admin change-password enforces the same rule', async () => {
    const { Admin } = await import('../src/core/admin/admin.model.js');
    const admin = await Admin.create({
        email: 'pw_change@example.com',
        password: 'Old!Pass1',
        role: 'ADMIN',
        adminType: 'super_admin',
        isActive: true,
    });
    const token = tokenFor('ADMIN', admin._id, { adminType: 'super_admin' });

    const weak = await call('POST', '/auth/admin/change-password', {
        as: token,
        body: { currentPassword: 'Old!Pass1', newPassword: 'short' },
    });
    assert.equal(weak.status, 400, JSON.stringify(weak.body));
    assert.match(weak.body.message, /at least 8 characters/);

    const strong = await call('POST', '/auth/admin/change-password', {
        as: token,
        body: { currentPassword: 'Old!Pass1', newPassword: 'New!Pass22' },
    });
    assert.equal(strong.status, 200, JSON.stringify(strong.body));
});
