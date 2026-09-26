/**
 * Customer cancellation midway (with a reason, until the order leaves the
 * store; the rider is released) and returns resolved by replacement (same
 * item or another size), falling back to a refund when it can't be sent.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';

const { startApp, stopApp, tokenFor, call, ok } = await import('./helpers/app.js');

const DAY = 24 * 60 * 60 * 1000;
const M = {};
let userToken;
let adminToken;
const ids = {};

before(async () => {
    const db = await startApp();
    ({ Order: M.Order } = await import('../src/modules/commerce/orders/models/order.model.js'));
    ({ ReturnRequest: M.ReturnRequest } = await import('../src/modules/commerce/orders/models/returnRequest.model.js'));
    ({ Product: M.Product } = await import('../src/modules/commerce/admin/models/product.model.js'));
    await M.ReturnRequest.init();
    const { Seller } = await import('../src/modules/commerce/seller/models/seller.model.js');
    const { User } = await import('../src/core/users/user.model.js');

    const seller = await Seller.create({
        channels: { quick: { status: 'approved' }, shop: { status: 'approved' } },
        sellerName: 'Tee Store', ownerName: 'Owner', ownerPhone: '9200000001', phone: '9200000001', status: 'approved',
        location: { type: 'Point', coordinates: [77.59, 12.97] },
    });
    ids.seller = seller._id;
    const user = await User.create({ name: 'Buyer', phone: '9200000002', isActive: true });
    ids.user = user._id;
    ids.rider = new mongoose.Types.ObjectId();
    const adminId = new mongoose.Types.ObjectId();
    await db.collection('admins').insertOne({ _id: adminId, email: 'cr_admin@example.com', role: 'ADMIN', adminType: 'super_admin', isActive: true });
    userToken = tokenFor('USER', user._id);
    adminToken = tokenFor('ADMIN', adminId, { adminType: 'super_admin' });
});

after(stopApp);

const ADDRESS = { name: 'Buyer', street: '1 MG Road', city: 'Bengaluru', state: 'KA', zipCode: '560001', phone: '9200000002', location: { type: 'Point', coordinates: [77.62, 12.93] } };

async function tee({ m = 5, l = 5 } = {}) {
    const M_ = { _id: new mongoose.Types.ObjectId(), name: 'M / Black', price: 500, attributes: [{ name: 'Size', value: 'M' }], stock: { quick: null, shop: m } };
    const L_ = { _id: new mongoose.Types.ObjectId(), name: 'L / Black', price: 500, attributes: [{ name: 'Size', value: 'L' }], stock: { quick: null, shop: l } };
    const p = await M.Product.create({
        sellerId: ids.seller, name: 'Plain Tee', approvalStatus: 'approved', price: 500, isAvailable: true,
        channels: { shop: true, quick: false }, stock: { shop: null, quick: null }, variants: [M_, L_],
    });
    return { p, M: M_, L: L_ };
}

async function order({ status = 'delivered', mode = 'standard', items, extra = {} }) {
    return M.Order.create({
        userId: ids.user, sellerId: ids.seller, fulfilmentMode: mode, items, deliveryAddress: ADDRESS,
        customerName: 'Buyer', customerPhone: '9200000002',
        pricing: { subtotal: 1000, discount: 0, deliveryFee: 0, tax: 0, total: 1000 },
        payment: { method: 'cash', status: status === 'delivered' ? 'paid' : 'cod_pending' },
        orderStatus: status,
        deliveryState: status === 'delivered' ? { deliveredAt: new Date(Date.now() - DAY) } : undefined,
        ...extra,
    });
}

const cancel = (o, body) => call('PATCH', `/orders/${o._id}/cancel`, { as: userToken, body });

// ---- cancellation ------------------------------------------------------------

test('cancel needs a reason, works midway (confirmed, packing, ready) and records why', async () => {
    const o = await order({ status: 'preparing', items: [{ itemId: 'X', name: 'Tee', price: 500, quantity: 2 }] });
    const noReason = await cancel(o, {});
    assert.equal(noReason.status, 400, 'no reason is refused');

    ok(await cancel(o, { reason: 'Ordered by mistake' }), 'cancel while packing');
    const doc = await M.Order.findById(o._id).lean();
    assert.equal(doc.orderStatus, 'cancelled_by_user');
    assert.equal(doc.cancellationReason, 'Ordered by mistake');
    assert.equal(doc.cancelledBy, 'user');
    assert.equal(doc.statusHistory.at(-1).note, 'Ordered by mistake');

    const again = await cancel(o, { reason: 'twice' });
    assert.equal(again.status, 400);
    assert.match(again.body.message, /already cancelled/);
});

test('a rider already on the way is released', async () => {
    const o = await order({
        status: 'ready_for_pickup', mode: 'quick',
        items: [{ itemId: 'X', name: 'Tee', price: 500, quantity: 1 }],
        extra: { dispatch: { status: 'accepted', deliveryPartnerId: ids.rider } },
    });
    ok(await cancel(o, { reason: 'Changed my mind' }), 'cancel before pickup');
    const doc = await M.Order.findById(o._id).lean();
    assert.equal(doc.dispatch.status, 'cancelled');
});

test('no cancelling once it has left the store, is with the courier, or was delivered', async () => {
    const items = [{ itemId: 'X', name: 'Tee', price: 500, quantity: 1 }];
    const picked = await order({ status: 'picked_up', mode: 'quick', items });
    const r1 = await cancel(picked, { reason: 'late' });
    assert.equal(r1.status, 400);
    assert.match(r1.body.message, /left the store/);

    const booked = await order({ status: 'ready_for_pickup', items, extra: { shipment: { awb: 'AWB123', status: 'booked' } } });
    const r2 = await cancel(booked, { reason: 'late' });
    assert.equal(r2.status, 400);
    assert.match(r2.body.message, /courier/);

    const delivered = await order({ status: 'delivered', items });
    const r3 = await cancel(delivered, { reason: 'late' });
    assert.equal(r3.status, 400);
    assert.match(r3.body.message, /return/);
});

// ---- replacement -------------------------------------------------------------

test('return one of two units for another size: a free replacement order, stock moved, no refund', async () => {
    const t = await tee({ m: 5, l: 3 });
    const o = await order({ items: [{ itemId: String(t.p._id), variantId: String(t.M._id), variantName: 'M / Black', name: 'Plain Tee', price: 500, quantity: 2 }] });

    const view = ok(await call('GET', `/orders/${o._id}/returns`, { as: userToken }), 'returns view');
    const opts = view.items[0].replacementOptions;
    assert.equal(opts[0].variantId, String(t.M._id), 'the same size comes first');
    assert.ok(opts.some((x) => x.variantId === String(t.L._id) && x.inStock));

    const req = ok(await call('POST', `/orders/${o._id}/returns`, {
        as: userToken,
        body: { resolution: 'replacement', reason: 'Too small', items: [{ itemId: String(t.p._id), variantId: String(t.M._id), quantity: 1, replacementVariantId: String(t.L._id) }] },
    }), 'request', 201);
    const retId = req._id || req.return?._id;
    const ret = await M.ReturnRequest.findById(retId).lean();
    assert.equal(ret.resolution, 'replacement');
    assert.equal(ret.items[0].replacementVariantId, String(t.L._id));

    ok(await call('POST', `/admin/returns/${retId}/approve`, { as: adminToken, body: {} }), 'approve');
    ok(await call('POST', `/admin/returns/${retId}/receive`, { as: adminToken, body: {} }), 'receive');

    const done = await M.ReturnRequest.findById(retId).lean();
    assert.equal(done.status, 'replaced');
    assert.equal(done.refund.status, 'not_applicable');
    const repl = await M.Order.findById(done.replacementOrder.orderId).lean();
    assert.equal(repl.pricing.total, 0);
    assert.equal(repl.items[0].variantId, String(t.L._id));
    assert.equal(repl.items[0].quantity, 1);
    assert.equal(String(repl.replacementOf.orderId), String(o._id));
    assert.equal(repl.fulfilmentMode, 'standard');

    const p = await M.Product.findById(t.p._id).lean();
    assert.equal(p.variants.find((v) => String(v._id) === String(t.M._id)).stock.shop, 6, 'the returned M is back on the shelf');
    assert.equal(p.variants.find((v) => String(v._id) === String(t.L._id)).stock.shop, 2, 'the L went out');
});

test('an out-of-stock choice is refused; one that sells out before receipt is refunded instead', async () => {
    const t = await tee({ m: 5, l: 0 });
    const o = await order({ items: [{ itemId: String(t.p._id), variantId: String(t.M._id), name: 'Plain Tee', price: 500, quantity: 1 }] });
    const refused = await call('POST', `/orders/${o._id}/returns`, {
        as: userToken,
        body: { resolution: 'replacement', reason: 'Too small', items: [{ itemId: String(t.p._id), variantId: String(t.M._id), quantity: 1, replacementVariantId: String(t.L._id) }] },
    });
    assert.equal(refused.status, 400);
    assert.match(refused.body.message, /out of stock/);

    await M.Product.updateOne({ _id: t.p._id, 'variants._id': t.L._id }, { $set: { 'variants.$.stock.shop': 1 } });
    const req = ok(await call('POST', `/orders/${o._id}/returns`, {
        as: userToken,
        body: { resolution: 'replacement', reason: 'Too small', items: [{ itemId: String(t.p._id), variantId: String(t.M._id), quantity: 1, replacementVariantId: String(t.L._id) }] },
    }), 'request', 201);
    const retId = req._id || req.return?._id;
    ok(await call('POST', `/admin/returns/${retId}/approve`, { as: adminToken, body: {} }), 'approve');
    // Someone buys the last L before the parcel arrives.
    await M.Product.updateOne({ _id: t.p._id, 'variants._id': t.L._id }, { $set: { 'variants.$.stock.shop': 0 } });
    ok(await call('POST', `/admin/returns/${retId}/receive`, { as: adminToken, body: {} }), 'receive');

    const done = await M.ReturnRequest.findById(retId).lean();
    assert.equal(done.status, 'refunded', 'refunded instead');
    assert.ok(!done.replacementOrder?.orderId);
    assert.ok(done.history.some((h) => /refunded instead/.test(h.note || '')));
});
