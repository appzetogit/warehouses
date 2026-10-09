/**
 * Shop (courier) orders wait on the store without a deadline: the acceptance
 * timeout never cancels them, the store is reminded at 2h and 24h instead, a
 * rejection needs a reason the customer is told, and support can list the ones
 * left waiting. Quick orders keep their deadline exactly as before.
 */
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';

const { startApp, stopApp, tokenFor, call, ok } = await import('./helpers/app.js');

const M = {};
const ids = {};
const tokens = {};

before(async () => {
    const db = await startApp();
    ({ Order: M.Order } = await import('../src/modules/commerce/orders/models/order.model.js'));
    M.service = await import('../src/modules/commerce/orders/services/order.service.js');
    M.reminders = await import('../src/modules/commerce/orders/services/shopOrderReminders.service.js');
    M.copy = await import('../src/modules/commerce/shared/notificationCopy.js');
    const { Seller } = await import('../src/modules/commerce/seller/models/seller.model.js');
    const { User } = await import('../src/core/users/user.model.js');

    const seller = await Seller.create({
        channels: { quick: { status: 'approved' }, shop: { status: 'approved' } },
        sellerName: 'The Warehousess', ownerName: 'Owner', ownerPhone: '9300000301', phone: '9300000301', status: 'approved',
        location: { type: 'Point', coordinates: [75.87, 22.71] },
    });
    ids.seller = seller._id;
    ids.user = (await User.create({ name: 'Buyer', phone: '9300000302', isActive: true }))._id;
    tokens.seller = tokenFor('SELLER', ids.seller);

    const adminId = new mongoose.Types.ObjectId();
    await db.collection('admins').insertOne({ _id: adminId, email: 'shop_admin@example.com', role: 'ADMIN', adminType: 'super_admin', isActive: true });
    tokens.admin = tokenFor('ADMIN', adminId, { adminType: 'super_admin' });
});

after(stopApp);

beforeEach(async () => {
    await M.Order.deleteMany({});
});

const ADDRESS = { name: 'Buyer', street: '12 Scheme 54', city: 'Indore', state: 'MP', zipCode: '452010', phone: '9300000302', location: { type: 'Point', coordinates: [75.9, 22.76] } };
const HOUR = 60 * 60 * 1000;

let seq = 5000;
const order = (extra = {}) => M.Order.create({
    order_id: `ORD-${seq++}`,
    userId: ids.user, sellerId: ids.seller, fulfilmentMode: 'standard',
    items: [{ itemId: 'KURTA', name: 'Kurta Set', price: 899, quantity: 1 }],
    deliveryAddress: ADDRESS, customerName: 'Buyer', customerPhone: '9300000302',
    pricing: { subtotal: 899, discount: 0, deliveryFee: 0, tax: 0, total: 899 },
    payment: { method: 'cash', status: 'cod_pending' },
    orderStatus: 'created',
    ...extra,
});

test('only Quick orders get an acceptance deadline', () => {
    assert.equal(M.service.hasAcceptanceDeadline('quick'), true);
    assert.equal(M.service.hasAcceptanceDeadline(undefined), true);
    assert.equal(M.service.hasAcceptanceDeadline('standard'), false);
});

test('the acceptance timeout cancels a late Quick order but never a Shop order', async () => {
    const past = new Date(Date.now() - 60 * 1000);
    const shop = await order({ acceptanceDeadlineAt: past });
    const quick = await order({ fulfilmentMode: 'quick', acceptanceDeadlineAt: past });

    assert.equal(await M.service.expireUnacceptedOrderById(shop._id), 0);
    assert.equal(await M.service.expireUnacceptedOrderById(quick._id), 1);

    assert.equal((await M.Order.findById(shop._id).lean()).orderStatus, 'created');
    assert.equal((await M.Order.findById(quick._id).lean()).orderStatus, 'cancelled_by_seller');
});

test('a Shop order waiting for days can still be accepted', async () => {
    const shop = await order({ awaitingSellerSince: new Date(Date.now() - 3 * 24 * HOUR) });
    const res = ok(await call('PATCH', `/seller/orders/${shop._id}/status`, { as: tokens.seller, body: { orderStatus: 'confirmed' } }), 'accept');
    assert.equal(res.order.orderStatus, 'confirmed');
});

test('rejecting a Shop order needs a reason, which is kept for the customer', async () => {
    const shop = await order();

    const missing = await call('PATCH', `/seller/orders/${shop._id}/status`, { as: tokens.seller, body: { orderStatus: 'cancelled_by_seller' } });
    assert.equal(missing.status, 400);
    const otherWithoutText = await call('PATCH', `/seller/orders/${shop._id}/status`, { as: tokens.seller, body: { orderStatus: 'cancelled_by_seller', reason: 'other' } });
    assert.equal(otherWithoutText.status, 400);
    const unknown = await call('PATCH', `/seller/orders/${shop._id}/status`, { as: tokens.seller, body: { orderStatus: 'cancelled_by_seller', reason: 'too_busy' } });
    assert.equal(unknown.status, 400);
    assert.equal((await M.Order.findById(shop._id).lean()).orderStatus, 'created');

    ok(await call('PATCH', `/seller/orders/${shop._id}/status`, {
        as: tokens.seller,
        body: { orderStatus: 'cancelled_by_seller', reason: 'size_unavailable', note: 'Only S left' },
    }), 'reject');
    const saved = await M.Order.findById(shop._id).lean();
    assert.equal(saved.orderStatus, 'cancelled_by_seller');
    assert.equal(saved.cancellationReason, 'Size not available: Only S left');
    assert.equal(saved.cancelledBy, 'seller');
});

test('a Quick order can still be rejected without a reason', async () => {
    const quick = await order({ fulfilmentMode: 'quick', acceptanceDeadlineAt: new Date(Date.now() + 60 * 1000) });
    ok(await call('PATCH', `/seller/orders/${quick._id}/status`, { as: tokens.seller, body: { orderStatus: 'cancelled_by_seller' } }), 'reject quick');
});

test('the customer is told the store could not accept, and why', () => {
    const copy = M.copy.statusForCustomer(
        { order_id: 'ORD-1', fulfilmentMode: 'standard', sellerName: 'The Warehousess' },
        'cancelled_by_seller',
        { note: 'Out of stock', storeRejected: true },
    );
    assert.match(copy.title, /couldn't accept order/);
    assert.equal(copy.body, 'Reason: Out of stock.');
});

test('stores are reminded at 2h and 24h, once each, and only about Shop orders still waiting', async () => {
    const now = new Date();
    const fresh = await order({ awaitingSellerSince: new Date(now - 1 * HOUR) });
    const threeHours = await order({ awaitingSellerSince: new Date(now - 3 * HOUR) });
    const twoDays = await order({ awaitingSellerSince: null, createdAt: new Date(now - 48 * HOUR) });
    const accepted = await order({ orderStatus: 'confirmed', awaitingSellerSince: new Date(now - 48 * HOUR) });
    const quick = await order({ fulfilmentMode: 'quick', awaitingSellerSince: new Date(now - 48 * HOUR) });

    assert.deepEqual(await M.reminders.remindStoresOfWaitingShopOrders(now), { first: 2, second: 1 });
    assert.deepEqual(await M.reminders.remindStoresOfWaitingShopOrders(now), { first: 0, second: 0 });

    const get = async (o) => (await M.Order.findById(o._id).lean()).sellerReminders || {};
    assert.equal((await get(fresh)).firstAt, null);
    assert.ok((await get(threeHours)).firstAt);
    assert.equal((await get(threeHours)).secondAt, null);
    assert.ok((await get(twoDays)).secondAt);
    assert.equal((await get(accepted)).firstAt, null);
    assert.equal((await get(quick)).firstAt, null);
});

test('admin lists Shop orders waiting on a store longer than the chosen hours', async () => {
    const now = Date.now();
    await order({ awaitingSellerSince: new Date(now - 30 * HOUR) });
    await order({ awaitingSellerSince: new Date(now - 5 * HOUR) });
    await order({ fulfilmentMode: 'quick', awaitingSellerSince: new Date(now - 30 * HOUR) });

    const day = ok(await call('GET', '/admin/orders/awaiting-store', { as: tokens.admin }), 'list 24h');
    assert.equal(day.hours, 24);
    assert.equal(day.orders.length, 1);
    assert.equal(day.orders[0].sellerName, 'The Warehousess');
    assert.equal(day.orders[0].hoursWaiting, 30);
    assert.equal(day.orders[0].total, 899);

    const four = ok(await call('GET', '/admin/orders/awaiting-store?hours=4', { as: tokens.admin }), 'list 4h');
    assert.equal(four.orders.length, 2);
});

test('a courier parcel in transit for days is not auto-closed as delivered; a stale rider trip is', async () => {
    const old = new Date(Date.now() - 30 * HOUR);
    const parcel = await order({ orderStatus: 'picked_up', shipment: { awb: 'DLV1', courierName: 'Delhivery' }, deliveryState: { pickedUpAt: old } });
    const trip = await order({ fulfilmentMode: 'quick', orderStatus: 'picked_up', deliveryState: { pickedUpAt: old } });

    assert.equal(await M.service.autoDeliverStaleOrders(), 1);
    assert.equal((await M.Order.findById(parcel._id).lean()).orderStatus, 'picked_up');
    assert.equal((await M.Order.findById(trip._id).lean()).orderStatus, 'delivered');
});

test('admin can accept a waiting Shop order, or reject one with a reason the customer sees', async () => {
    const a = await order();
    const accepted = ok(await call('PATCH', `/admin/orders/${a._id}/accept`, { as: tokens.admin }), 'admin accept');
    assert.equal(accepted.order.orderStatus, 'confirmed');

    const b = await order();
    ok(await call('PATCH', `/admin/orders/${b._id}/reject`, { as: tokens.admin, body: { reason: 'Store closed for Diwali' } }), 'admin reject');
    const saved = await M.Order.findById(b._id).lean();
    assert.equal(saved.orderStatus, 'cancelled_by_admin');
    assert.equal(saved.cancellationReason, 'Store closed for Diwali');
    assert.equal(saved.cancelledBy, 'admin');
});
