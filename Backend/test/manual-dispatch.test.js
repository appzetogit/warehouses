/**
 * Manual dispatch: the automatic/manual setting, admins assigning one or more
 * Quick orders to a rider (capped per rider, online and cash checks, one
 * winner when two admins race), moving and unassigning before pickup, and the
 * rider's current trip listing every order.
 */
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';

const { startApp, stopApp, tokenFor, call, ok } = await import('./helpers/app.js');

const M = {};
const ids = {};
let adminToken;

before(async () => {
    const db = await startApp();
    ({ Order: M.Order, DispatchSettings: M.DispatchSettings } = await import('../src/modules/commerce/orders/models/order.model.js'));
    ({ DeliveryPartner: M.Rider } = await import('../src/modules/commerce/delivery/models/deliveryPartner.model.js'));
    ({ DeliveryWallet: M.Wallet } = await import('../src/modules/commerce/delivery/models/deliveryWallet.model.js'));
    ({ DeliveryCashLimit: M.CashLimit } = await import('../src/modules/commerce/admin/models/deliveryCashLimit.model.js'));
    M.dispatch = await import('../src/modules/commerce/orders/services/order-dispatch.service.js');
    const { Seller } = await import('../src/modules/commerce/seller/models/seller.model.js');
    const { User } = await import('../src/core/users/user.model.js');

    const seller = await Seller.create({
        channels: { quick: { status: 'approved' }, shop: { status: 'approved' } },
        sellerName: 'Trends Vijay Nagar', ownerName: 'Owner', ownerPhone: '9300000101', phone: '9300000101', status: 'approved',
        location: { type: 'Point', coordinates: [75.89, 22.75] },
    });
    ids.seller = seller._id;
    const user = await User.create({ name: 'Buyer', phone: '9300000102', isActive: true });
    ids.user = user._id;

    const rider = (name, phone, extra = {}) => M.Rider.create({
        name, phone, status: 'approved', availabilityStatus: 'online', lastLat: 22.751, lastLng: 75.891, lastLocationAt: new Date(), ...extra,
    });
    ids.rahul = (await rider('Rahul', '9300000201'))._id;
    ids.imran = (await rider('Imran', '9300000202'))._id;
    ids.offline = (await rider('Sonu', '9300000203', { availabilityStatus: 'offline' }))._id;

    const adminId = new mongoose.Types.ObjectId();
    await db.collection('admins').insertOne({ _id: adminId, email: 'md_admin@example.com', role: 'ADMIN', adminType: 'super_admin', isActive: true });
    adminToken = tokenFor('ADMIN', adminId, { adminType: 'super_admin' });
});

after(stopApp);

beforeEach(async () => {
    await M.Order.deleteMany({});
    await M.DispatchSettings.deleteMany({});
    await M.CashLimit.deleteMany({});
    await M.Wallet.deleteMany({});
});

const ADDRESS = { name: 'Buyer', street: '12 Scheme 54', city: 'Indore', state: 'MP', zipCode: '452010', phone: '9300000102', location: { type: 'Point', coordinates: [75.9, 22.76] } };

let seq = 1000;
const quickOrder = (extra = {}) => M.Order.create({
    orderId: `WH${seq++}`,
    userId: ids.user, sellerId: ids.seller, fulfilmentMode: 'quick',
    items: [{ itemId: 'TEE', name: 'Tee', price: 500, quantity: 1 }],
    deliveryAddress: ADDRESS, customerName: 'Buyer', customerPhone: '9300000102',
    pricing: { subtotal: 500, discount: 0, deliveryFee: 0, tax: 0, total: 500 },
    payment: { method: 'razorpay', status: 'paid' },
    orderStatus: 'preparing',
    dispatch: { status: 'unassigned' },
    ...extra,
});

const settings = (body) => call('PATCH', '/admin/dispatch-settings', { as: adminToken, body });
const assign = (riderId, orderIds) => call('POST', '/admin/delivery/assign', { as: adminToken, body: { riderId: String(riderId), orderIds: orderIds.map(String) } });

test('settings default to automatic, one order per rider until multi-order trips are on', async () => {
    const s = ok(await call('GET', '/admin/dispatch-settings', { as: adminToken }), 'get settings');
    assert.equal(s.dispatchMode, 'auto');
    assert.equal(s.maxOrdersPerRider, 3);
    assert.equal(s.effectiveMaxOrdersPerRider, 1);

    const saved = ok(await settings({ dispatchMode: 'manual', multiOrderTrips: true, maxOrdersPerRider: 2 }), 'save');
    assert.equal(saved.dispatchMode, 'manual');
    assert.equal(saved.effectiveMaxOrdersPerRider, 2);
    assert.equal((await settings({ maxOrdersPerRider: 50 })).status, 400, 'out of range is refused');
    assert.equal((await settings({})).status, 400, 'empty update is refused');
});

test('manual mode: no broadcast, the order waits on the board', async () => {
    await settings({ dispatchMode: 'manual' });
    const o = await quickOrder();
    await M.dispatch.tryAutoAssign(o._id);
    const doc = await M.Order.findById(o._id).lean();
    assert.equal(doc.dispatch.status, 'unassigned');
    assert.equal((doc.dispatch.offeredTo || []).length, 0, 'no rider was offered it');
    assert.ok(doc.dispatch.manualQueuedAt, 'queued for an admin');
    assert.equal(doc.dispatch.dispatchingAt, undefined, 'dispatch lock released');

    const board = ok(await call('GET', '/admin/delivery/dispatch-board', { as: adminToken }), 'board');
    assert.equal(board.waiting.length, 1);
    assert.equal(board.waiting[0].orderId, o.orderId);
    assert.ok(board.riders.find((r) => r.name === 'Rahul'), 'online rider listed');
    assert.ok(!board.riders.find((r) => r.name === 'Sonu'), 'offline rider not listed');
});

test('assign several orders to one rider, within the limit; the rider sees them all', async () => {
    await settings({ dispatchMode: 'manual', multiOrderTrips: true, maxOrdersPerRider: 2 });
    const a = await quickOrder();
    const b = await quickOrder({ orderStatus: 'ready_for_pickup' });
    const c = await quickOrder();

    const res = ok(await assign(ids.rahul, [a._id, b._id]), 'assign two');
    assert.equal(res.assigned.length, 2);
    assert.equal(res.activeOrders, 2);
    const doc = await M.Order.findById(a._id).lean();
    assert.equal(doc.dispatch.status, 'accepted');
    assert.equal(String(doc.dispatch.deliveryPartnerId), String(ids.rahul));
    assert.equal(doc.dispatch.assignedBy, 'admin');

    const full = await assign(ids.rahul, [c._id]);
    assert.equal(full.status, 400, 'third order is over the limit');
    assert.match(full.body.message, /can carry 2 at a time/);

    const riderToken = tokenFor('DELIVERY_PARTNER', ids.rahul);
    const trip = ok(await call('GET', '/delivery/orders/current', { as: riderToken }), 'current trip');
    assert.equal(trip.activeOrders.length, 2);
    assert.ok(trip.activeOrder, 'single order kept for older apps');
});

test('one order per rider until multi-order trips are switched on', async () => {
    await settings({ dispatchMode: 'manual' });
    const a = await quickOrder();
    const b = await quickOrder();
    const res = await assign(ids.rahul, [a._id, b._id]);
    assert.equal(res.status, 400);
    assert.match(res.body.message, /can carry 1 at a time/);
});

test('offline riders, Shop orders, picked-up orders and cash-limited riders are refused', async () => {
    await settings({ dispatchMode: 'manual', multiOrderTrips: true });
    const a = await quickOrder();
    assert.equal((await assign(ids.offline, [a._id])).status, 400, 'offline rider');

    const shop = await quickOrder({ fulfilmentMode: 'standard' });
    const picked = await quickOrder({ orderStatus: 'picked_up' });
    const mixed = ok(await assign(ids.rahul, [shop._id, picked._id, a._id]), 'mixed batch');
    assert.deepEqual(mixed.assigned, [String(a._id)]);
    assert.equal(mixed.failed.length, 2);

    await M.CashLimit.create({ deliveryCashLimit: 1000, isActive: true });
    await M.Wallet.create({ deliveryPartnerId: ids.imran, cashInHand: 1500 });
    const cash = await quickOrder({ payment: { method: 'cash', status: 'cod_pending' } });
    const prepaid = await quickOrder();
    const res = ok(await assign(ids.imran, [cash._id, prepaid._id]), 'cash-limited rider');
    assert.deepEqual(res.assigned, [String(prepaid._id)], 'prepaid order still goes');
    assert.match(res.failed[0].reason, /cash limit/);
});

test('two admins assigning the same order: only one wins', async () => {
    await settings({ dispatchMode: 'manual', multiOrderTrips: true });
    const o = await quickOrder();
    const [r1, r2] = await Promise.all([assign(ids.rahul, [o._id]), assign(ids.imran, [o._id])]);
    const won = [r1, r2].filter((r) => r.status === 200 && r.body.data.assigned.length === 1);
    assert.equal(won.length, 1, 'exactly one assignment succeeded');
    const doc = await M.Order.findById(o._id).lean();
    assert.equal(doc.dispatch.status, 'accepted');
});

test('move and unassign before pickup; not after', async () => {
    await settings({ dispatchMode: 'manual', multiOrderTrips: true });
    const o = await quickOrder();
    ok(await assign(ids.rahul, [o._id]), 'assign');

    const moved = ok(await call('POST', `/admin/delivery/orders/${o._id}/move`, { as: adminToken, body: { riderId: String(ids.imran) } }), 'move');
    assert.deepEqual(moved.assigned, [String(o._id)]);
    let doc = await M.Order.findById(o._id).lean();
    assert.equal(String(doc.dispatch.deliveryPartnerId), String(ids.imran));
    assert.ok(!(doc.dispatch.offeredTo || []).some((x) => x.action === 'deassigned'), 'old rider is not barred');

    ok(await call('POST', `/admin/delivery/orders/${o._id}/unassign`, { as: adminToken }), 'unassign');
    doc = await M.Order.findById(o._id).lean();
    assert.equal(doc.dispatch.status, 'unassigned');
    assert.equal(doc.dispatch.deliveryPartnerId, null);

    ok(await assign(ids.rahul, [o._id]), 'reassign');
    await M.Order.updateOne({ _id: o._id }, { $set: { orderStatus: 'picked_up', 'deliveryState.pickedUpAt': new Date() } });
    const late = await call('POST', `/admin/delivery/orders/${o._id}/unassign`, { as: adminToken });
    assert.equal(late.status, 400, 'picked-up orders stay with the rider');
});

test('waiting alert and fallback to automatic run from the sweep', async () => {
    await settings({ dispatchMode: 'manual', manualAlertMinutes: 2, manualFallbackMinutes: 5 });
    const o = await quickOrder();
    await M.dispatch.tryAutoAssign(o._id);
    await M.Order.updateOne({ _id: o._id }, { $set: { 'dispatch.manualQueuedAt': new Date(Date.now() - 6 * 60000) } });

    const first = await M.dispatch.sweepManualDispatchQueue();
    assert.equal(first.alerted, 1);
    assert.equal(first.fellBack, 1);
    const doc = await M.Order.findById(o._id).lean();
    assert.ok(doc.dispatch.waitingAlertAt);
    assert.ok(doc.dispatch.fallbackToAutoAt);

    const second = await M.dispatch.sweepManualDispatchQueue();
    assert.deepEqual(second, { alerted: 0, fellBack: 0 }, 'each order is alerted and released once');
});

test('automatic mode is unchanged, and riders still accept only one offer at a time', async () => {
    const s = ok(await call('GET', '/admin/dispatch-settings', { as: adminToken }), 'settings');
    assert.equal(s.dispatchMode, 'auto');
    const a = await quickOrder();
    const b = await quickOrder();
    const riderToken = tokenFor('DELIVERY_PARTNER', ids.rahul);
    ok(await call('PATCH', `/delivery/orders/${a._id}/accept`, { as: riderToken }), 'accept first');
    const second = await call('PATCH', `/delivery/orders/${b._id}/accept`, { as: riderToken });
    assert.equal(second.status, 400, 'second self-accept still refused');
});

test('customers cannot use the admin dispatch routes', async () => {
    const user = tokenFor('USER', ids.user);
    const res = await call('POST', '/admin/delivery/assign', { as: user, body: {} });
    assert.ok([401, 403].includes(res.status), `got ${res.status}`);
});
