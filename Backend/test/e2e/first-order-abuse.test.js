/**
 * Journey: the first-order offer, and someone trying it twice from one phone.
 *
 * The admin runs a first-order offer -> a new customer gets it automatically
 * and orders -> a second new account on the same device is refused it (quote
 * says why; placing the order does not get the discount) -> the first
 * customer cancels -> the claim is released and the second account gets the
 * offer. Throughout, the discount is only ever on one live order.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import {
    startApp, stopApp, call, ok, createAdmin, createZone, createCustomer, onboardSeller, listProduct,
    orderDoc, addressAt, CUSTOMER_AT,
} from './lib/harness.js';

process.env.FIRST_ORDER_PEPPER ||= 'journey-pepper';

let db;
const w = {};
const DEVICE = 'android-7f3a9c21-shared-handset';

before(async () => {
    db = await startApp();
    w.admin = await createAdmin(db);
    w.zoneId = await createZone(w.admin);
    w.seller = await onboardSeller(w.admin, { name: 'Welcome Wear', zoneId: w.zoneId });
    w.product = await listProduct(w.seller, w.admin, { name: 'Basic Tee', price: 400, channels: { quick: true, shop: true }, stock: { quick: 50, shop: 50 } });
    ok(await call('POST', '/admin/offers', {
        as: w.admin.as,
        body: { couponCode: 'WELCOME100', discountType: 'flat-price', discountValue: 100, minOrderValue: 0, isFirstOrderOnly: true },
    }), 'first-order offer', 201);
    w.first = await createCustomer(db, 'First Person');
    w.second = await createCustomer(db, 'Second Account');
});
after(stopApp);

// Each account has its own delivery phone: only the device links them.
const body = (who, extra = {}) => ({
    items: [{ itemId: String(w.product._id), sellerId: String(w.seller.id), name: 'Basic Tee', price: 400, quantity: 1 }],
    deliveryAddress: addressAt(CUSTOMER_AT, { phone: who === w.first ? '9844400001' : '9844400002' }),
    fulfilmentMode: 'quick', paymentMethod: 'cash', ...extra,
});
const onDevice = (device) => ({ 'x-device-id': device });
const quote = async (who, device = DEVICE, extra = {}) => ok(await call('POST', '/orders/checkout/calculate', { as: who.as, body: body(who, extra), headers: onDevice(device) }), 'quote');
const place = (who, device = DEVICE, extra = {}) => call('POST', '/orders/checkout', { as: who.as, body: body(who, extra), headers: onDevice(device) });
const claims = async () => ok(await call('GET', '/admin/first-order-guard/claims', { as: w.admin.as }), 'claims').items;

test('a new customer gets the first-order offer automatically and orders with it', async () => {
    const q = await quote(w.first);
    assert.equal(q.appliedCoupon?.code, 'WELCOME100');
    assert.equal(q.discount, 100);

    const placed = ok(await place(w.first), 'first order', 201);
    const order = await orderDoc(placed.childOrders[0]._id || placed.childOrders[0].id);
    w.firstOrder = String(order._id);
    assert.equal(order.pricing.discount, 100);
    assert.equal(order.pricing.total, q.grandTotal);
    const mine = (await claims()).filter((c) => String(c.user?._id || c.user) === String(w.first.id));
    assert.equal(mine.length, 1, 'one claim, for this person');
    assert.equal(mine[0].offerCode, 'WELCOME100');
    assert.deepEqual(mine[0].signals, { account: true, phone: true, device: true, payment: false }, 'the device header was captured');

    // The same account does not get it twice.
    const again = await quote(w.first, 'another-device-0001');
    assert.equal(again.discount, 0);
});

test('a second account on the same device is refused the offer', async () => {
    const q = await quote(w.second);
    assert.equal(q.discount, 0);
    assert.equal(q.couponRefusal?.signal, 'device');
    assert.match(q.couponRefusal.reason, /device/i);

    // Typing the code in does not get around it.
    const typed = await quote(w.second, DEVICE, { couponCode: 'WELCOME100' });
    assert.equal(typed.discount, 0);

    // Placing the order goes through at full price: the offer is dropped, not the sale.
    const attempt = ok(await place(w.second, DEVICE, { couponCode: 'WELCOME100' }), 'second account orders anyway', 201);
    const order = await orderDoc(attempt.childOrders[0]._id || attempt.childOrders[0].id);
    assert.equal(order.pricing.discount, 0, 'placed at full price, never with the offer');
    assert.equal(order.pricing.total, typed.grandTotal);
    assert.equal((await claims()).filter((c) => String(c.user?._id || c.user) === String(w.second.id)).length, 0, 'no claim for the second account');
    ok(await call('PATCH', `/orders/${order._id}/cancel`, { as: w.second.as, body: { reason: 'wanted the offer' } }), 'cancel full-price order');
    const live = await db.collection('orders').countDocuments({ 'pricing.discount': 100, orderStatus: { $nin: ['cancelled_by_user', 'cancelled_by_seller', 'cancelled_by_admin'] } });
    assert.equal(live, 1, 'the offer is on one live order only');
});

test('the first customer cancels: the claim is released and the second account can use the offer', async () => {
    ok(await call('PATCH', `/orders/${w.firstOrder}/cancel`, { as: w.first.as, body: { reason: 'changed my mind' } }), 'cancel');
    assert.equal((await orderDoc(w.firstOrder)).orderStatus, 'cancelled_by_user');
    const left = (await claims()).filter((c) => String(c.user?._id || c.user) === String(w.first.id));
    assert.equal(left.length, 0, 'claim released');

    const q = await quote(w.second);
    assert.equal(q.appliedCoupon?.code, 'WELCOME100', 'the device is free again');
    const placed = ok(await place(w.second), 'second account orders', 201);
    const order = await orderDoc(placed.childOrders[0]._id || placed.childOrders[0].id);
    assert.equal(order.pricing.discount, 100);

    // And now the first account cannot take it back from the same device.
    const back = await quote(w.first);
    assert.equal(back.discount, 0);
    assert.equal(back.couponRefusal?.signal, 'device');
});
