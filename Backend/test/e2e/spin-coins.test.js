/**
 * Journey: coins from the wheel and from a refund, spent at checkout.
 *
 * The admin schedules a wheel -> the customer spins inside the window (once a
 * day) and wins coins -> an earlier Shop order is returned and refunded as
 * coins, of which only 80% can be spent -> at checkout the coins pay at most
 * half the order, and never the locked 20%.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { installRazorpayMock } from './lib/razorpay.js';

process.env.SHIPPING_PROVIDER = 'mock';
const { rz, pay } = installRazorpayMock();
const {
    startApp, stopApp, call, ok, round2, createAdmin, createZone, createCustomer, onboardSeller, listProduct,
    orderDoc, ordersOfCheckout, addressAt, CUSTOMER_AT,
} = await import('./lib/harness.js');

let db;
let courier;
const w = {};
const HOUR = 3600 * 1000;

before(async () => {
    db = await startApp();
    const { MockShippingProvider } = await import('../../src/modules/commerce/delivery/services/shipping/mockShipping.provider.js');
    const { setShippingProvider } = await import('../../src/modules/commerce/delivery/services/shipping/index.js');
    courier = new MockShippingProvider();
    setShippingProvider(courier);

    w.admin = await createAdmin(db);
    w.zoneId = await createZone(w.admin);
    w.seller = await onboardSeller(w.admin, { name: 'Coin Couture', zoneId: w.zoneId });
    w.tee = await listProduct(w.seller, w.admin, { name: 'Pocket Tee', price: 400, channels: { quick: true, shop: true }, stock: { quick: 50, shop: 50 } });
    w.jacket = await listProduct(w.seller, w.admin, { name: 'Denim Jacket', price: 1000, channels: { quick: true, shop: true }, stock: { quick: 20, shop: 20 } });
    w.customer = await createCustomer(db, 'Coin Collector');
    const settings = ok(await call('GET', '/admin/coins/settings', { as: w.admin.as }), 'coin settings');
    assert.equal(settings.redeemPercent, 80, 'refund coins are 80% usable');
    assert.equal(settings.maxOrderPercent, 50, 'coins pay at most half an order');
});
after(stopApp);

const balance = async () => ok(await call('GET', '/user/coins/balance', { as: w.customer.as }), 'balance');
const line = (p, name, price, quantity) => ({ itemId: String(p._id), sellerId: String(w.seller.id), name, price, quantity });
const checkoutBody = (items, extra = {}) => ({ items, deliveryAddress: addressAt(CUSTOMER_AT, { phone: '9855500005' }), fulfilmentMode: 'quick', ...extra });

test('the wheel only turns inside its window, once a day, and pays coins into the wallet', async () => {
    const now = Date.now();
    const segments = [{ type: 'coins', value: 50, weight: 1, label: '50 Coins' }, { type: 'coins', value: 50, weight: 1, label: 'Fifty' }];

    const later = ok(await call('POST', '/admin/spin/campaigns', {
        as: w.admin.as, body: { title: 'Next Week', segments, startsAt: new Date(now + 7 * 24 * HOUR) },
    }), 'future wheel', 201);
    ok(await call('PATCH', `/admin/spin/campaigns/${later._id}/active`, { as: w.admin.as, body: { isActive: true } }), 'activate');
    assert.equal(ok(await call('GET', '/user/spin/status', { as: w.customer.as }), 'status').isActive, false, 'not yet');
    assert.equal((await call('POST', '/user/spin/play', { as: w.customer.as, body: {} })).status, 400, 'cannot spin before the window');

    const live = ok(await call('POST', '/admin/spin/campaigns', {
        as: w.admin.as, body: { title: 'Festive Wheel', segments, startsAt: new Date(now - HOUR), endsAt: new Date(now + HOUR), dailyLimit: 1 },
    }), 'live wheel', 201);
    ok(await call('PATCH', `/admin/spin/campaigns/${live._id}/active`, { as: w.admin.as, body: { isActive: true } }), 'activate');
    assert.equal(ok(await call('GET', '/user/spin/status', { as: w.customer.as }), 'status').isActive, true);

    const spun = ok(await call('POST', '/user/spin/play', { as: w.customer.as, body: {} }), 'spin');
    assert.equal(spun.coinsAwarded, 50);
    assert.equal(spun.balance, 50);
    assert.equal(spun.spinsRemaining, 0);
    assert.equal((await call('POST', '/user/spin/play', { as: w.customer.as, body: {} })).status, 400, 'one spin a day');

    const b = await balance();
    assert.deepEqual([b.coins, b.usable], [50, 50], 'wheel coins are fully usable');
    const ledger = ok(await call('GET', '/user/coins/ledger', { as: w.customer.as }), 'ledger').entries;
    const credits = ledger.filter((e) => e.type === 'credit');
    assert.equal(credits.length, 1);
    assert.equal(credits[0].source, 'spin');
    assert.equal(credits[0].amount, 50);
});

test('a returned Shop order refunded as coins: only 80% of them can be spent', async () => {
    // Order, pay, ship, deliver.
    const placed = ok(await call('POST', '/orders/checkout', {
        as: w.customer.as,
        body: checkoutBody([line(w.jacket, 'Denim Jacket', 1000, 1)], { fulfilmentMode: 'standard', paymentMethod: 'razorpay' }),
    }), 'shop checkout', 201);
    ok(await call('POST', `/orders/checkout/${placed.checkout.checkoutId}/verify-payment`, { as: w.customer.as, body: pay(placed.razorpay.orderId) }), 'verify');
    const [order] = await ordersOfCheckout(placed.checkout._id);
    ok(await call('PATCH', `/seller/orders/${order._id}/status`, { as: w.seller.as, body: { orderStatus: 'confirmed' } }), 'confirm');
    const { shipment } = ok(await call('POST', `/admin/shipments/${order._id}/book`, { as: w.admin.as }), 'book');
    courier.setStatus(shipment.awb, 'delivered');
    assert.equal(ok(await call('GET', `/admin/shipments/${order._id}/tracking`, { as: w.admin.as }), 'track').orderDelivered, true);

    // Return it, refunded as coins.
    const ret = ok(await call('POST', `/orders/${order._id}/returns`, {
        as: w.customer.as, body: { items: [{ itemId: String(w.jacket._id), quantity: 1 }], reason: 'Does not fit', refundTo: 'coins' },
    }), 'return', 201);
    ok(await call('POST', `/admin/returns/${ret._id}/approve`, { as: w.admin.as, body: {} }), 'approve');
    const refundsBefore = rz.refunds.length;
    const done = ok(await call('POST', `/admin/returns/${ret._id}/receive`, { as: w.admin.as, body: {} }), 'receive');
    assert.equal(done.refund.method, 'coins');
    assert.equal(rz.refunds.length, refundsBefore, 'nothing back to the card');

    const refundCoins = Math.round(ret.amounts.refundAmount);
    assert.ok(refundCoins >= 900, `a 1000 jacket comes back as ~1000 coins (${refundCoins})`);
    w.refundCoins = refundCoins;
    w.locked = refundCoins - Math.floor(refundCoins * 0.8);
    const b = await balance();
    assert.equal(b.coins, 50 + refundCoins);
    assert.equal(b.usable, 50 + Math.floor(refundCoins * 0.8), 'wheel coins in full, refund coins at 80%');
    const view = ok(await call('GET', `/orders/${order._id}/returns`, { as: w.customer.as }), 'customer view');
    assert.equal(view.returns[0].refund.method, 'coins', 'the customer sees it came back as coins');
    assert.equal((await orderDoc(order._id)).payment.refund.amount, ret.amounts.refundAmount);
});

test('at checkout, coins pay at most half the order, and never the locked 20%', async () => {
    const usable = (await balance()).usable;

    // A small cart: half the order is less than the usable coins.
    const small = ok(await call('POST', '/orders/checkout/calculate', {
        as: w.customer.as, body: checkoutBody([line(w.tee, 'Pocket Tee', 400, 1)], { coins: 100000 }),
    }), 'small quote');
    const smallPayable = round2(small.grandTotal + small.coinsDiscount);
    assert.ok(Math.floor(smallPayable / 2) < usable);
    assert.equal(small.coinsUsed, Math.floor(smallPayable * 0.5), 'capped at 50% of the order');
    assert.equal(small.coinsDiscount, small.coinsUsed);

    // A big cart: the usable coins run out before the cap.
    const bigItems = [line(w.jacket, 'Denim Jacket', 1000, 3)];
    const big = ok(await call('POST', '/orders/checkout/calculate', { as: w.customer.as, body: checkoutBody(bigItems, { coins: 100000 }) }), 'big quote');
    const bigPayable = round2(big.grandTotal + big.coinsDiscount);
    assert.ok(Math.floor(bigPayable / 2) > usable);
    assert.equal(big.coinsUsed, usable, 'only the usable coins, not the locked ones');

    const placed = ok(await call('POST', '/orders/checkout', {
        as: w.customer.as, body: checkoutBody(bigItems, { coins: 100000, paymentMethod: 'cash' }),
    }), 'place big', 201);
    assert.equal(placed.checkout.pricing.coinsUsed, usable);
    assert.equal(placed.checkout.pricing.grandTotal, round2(bigPayable - usable), 'the coins came off the bill');
    const [order] = await ordersOfCheckout(placed.checkout._id);
    assert.equal(order.coinsUsed, usable);

    const after = await balance();
    assert.equal(after.usable, 0);
    assert.equal(after.coins, w.locked, 'the locked 20% of the refund coins remain, unspendable');
    const ledger = ok(await call('GET', '/user/coins/ledger', { as: w.customer.as }), 'ledger').entries;
    const debit = ledger.filter((e) => e.type === 'debit' && String(e.orderId) === String(placed.checkout._id));
    assert.equal(debit.length, 1);
    assert.equal(debit[0].amount, usable);
    assert.equal(debit[0].signedAmount, -usable);
    assert.ok(db);
});
