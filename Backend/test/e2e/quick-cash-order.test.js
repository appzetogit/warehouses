/**
 * Journey: a Quick order paid in cash, from browsing to the doorstep.
 *
 * Customer inside the zone browses Quick -> prices the cart with coins ->
 * places a cash order -> the seller accepts and packs -> a rider picks up and
 * hands over with the customer's OTP. Outcomes: the coins are taken once (a
 * ledger debit), the cash is marked collected on delivery, the cashback lands
 * in the wallet once, and only Quick stock moves.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import {
    startApp, stopApp, call, ok, round2, waitFor, createAdmin, createZone, createCustomer, createRider,
    onboardSeller, listProduct, productStock, orderDoc, sellerPrepares, riderDelivers, addressAt, CUSTOMER_AT,
} from './lib/harness.js';

let db;
const w = {};

before(async () => {
    db = await startApp();
    w.admin = await createAdmin(db);
    w.zoneId = await createZone(w.admin);
    w.seller = await onboardSeller(w.admin, { name: 'Tee Corner', zoneId: w.zoneId });
    w.product = await listProduct(w.seller, w.admin, {
        name: 'Crew Tee', channels: { quick: true, shop: true },
        variants: [
            { attributes: { Size: 'M', Colour: 'Black' }, price: 450, mrp: 599, stock: { quick: 5, shop: 40 } },
            { attributes: { Size: 'L', Colour: 'Black' }, price: 450, mrp: 599, stock: { quick: 5, shop: 40 } },
        ],
    });
    w.variant = w.product.variants.find((v) => v.name === 'M / Black');
    w.customer = await createCustomer(db, 'Cash Customer');
    w.rider = await createRider();

    // The admin grants 120 coins and turns on a flat 25 cashback on delivered orders.
    ok(await call('POST', '/admin/coins/adjust', { as: w.admin.as, body: { userId: String(w.customer.id), amount: 120, reason: 'Welcome' } }), 'grant coins');
    ok(await call('PUT', '/admin/cashback-settings', {
        as: w.admin.as, body: { isEnabled: true, cashbackType: 'flat', cashbackValue: 25, minOrderValue: 0, maxCashback: 0 },
    }), 'cashback settings');
});
after(stopApp);

const address = addressAt(CUSTOMER_AT, { phone: '9811100001' });
const line = (quantity) => ({
    itemId: String(w.product._id), variantId: String(w.variant._id), sellerId: String(w.seller.id),
    name: 'Crew Tee', price: 450, quantity,
});
const body = (extra = {}) => ({ items: [line(2)], deliveryAddress: address, fulfilmentMode: 'quick', coins: 120, ...extra });
const variantStock = async () => (await productStock(w.product._id)).variants.find((v) => String(v._id) === String(w.variant._id)).stock;

test('browse, quote and place a cash order: coins capped and taken once, Quick stock only', async () => {
    const browse = ok(await call('GET', '/catalog/products?fulfilmentMode=quick&limit=100'), 'browse').products;
    assert.ok(browse.some((p) => p.name === 'Crew Tee'), 'the tee is in Quick');

    const quote = ok(await call('POST', '/orders/checkout/calculate', { as: w.customer.as, body: body() }), 'quote');
    assert.equal(quote.subtotal, 900);
    const payable = round2(quote.grandTotal + quote.coinsDiscount);
    assert.equal(quote.coinsUsed, Math.min(120, Math.floor(payable * 0.5)), 'coins capped at half the order, and at the balance');
    assert.equal(quote.coinsUsed, 120);
    assert.equal(quote.coinsDiscount, 120);

    const placed = ok(await call('POST', '/orders/checkout', { as: w.customer.as, body: body({ paymentMethod: 'cash' }) }), 'checkout', 201);
    assert.equal(placed.checkout.pricing.grandTotal, quote.grandTotal, 'charged what was quoted');
    assert.equal(placed.childOrders.length, 1);
    const order = await orderDoc(placed.childOrders[0]._id || placed.childOrders[0].id);
    w.orderId = String(order._id);
    w.total = order.pricing.total;
    assert.equal(order.fulfilmentMode, 'quick');
    assert.equal(order.payment.method, 'cash');
    assert.equal(order.payment.status, 'cod_pending');
    assert.equal(order.coinsUsed, 120);
    assert.equal(order.pricing.total, quote.grandTotal);
    assert.ok(['created', 'confirmed'].includes(order.orderStatus), 'cash orders go straight to the store');

    assert.deepEqual(await variantStock(), { quick: 3, shop: 40 }, 'two units off Quick, Shop untouched');

    const balance = ok(await call('GET', '/user/coins/balance', { as: w.customer.as }), 'coin balance');
    assert.equal(balance.usable, 0);
    const ledger = ok(await call('GET', '/user/coins/ledger', { as: w.customer.as }), 'ledger').entries;
    const debits = ledger.filter((e) => e.type === 'debit');
    assert.equal(debits.length, 1, 'one debit row');
    assert.equal(Math.abs(debits[0].amount), 120);
});

test('the seller accepts, the rider delivers with the OTP; cash collected, cashback credited once', async () => {
    await sellerPrepares(w.seller, w.orderId);
    await riderDelivers(w.rider, w.customer, w.orderId);

    const done = await orderDoc(w.orderId);
    assert.equal(done.orderStatus, 'delivered');
    assert.ok(done.deliveryState.deliveredAt);
    assert.equal(done.payment.status, 'paid', 'cash collected at the door');
    assert.equal(String(done.dispatch.deliveryPartnerId), String(w.rider.id));
    assert.equal(done.deliveryVerification?.dropOtp?.verified, true);

    // Cashback is credited after the response.
    const wallet = await waitFor(async () => {
        const res = ok(await call('GET', '/user/wallet', { as: w.customer.as }), 'wallet');
        const wl = res.wallet || res;
        return Number(wl.balance) > 0 ? wl : null;
    }, 'the cashback');
    assert.equal(Number(wallet.balance), 25);
    const cashback = wallet.transactions.filter((t) => (t.metadata?.source || t.source) === 'cashback' || /Cashback/.test(t.description || ''));
    assert.equal(cashback.length, 1);

    // Delivery does not touch the Shop shelf, and the coins stay spent.
    assert.deepEqual(await variantStock(), { quick: 3, shop: 40 });
    assert.equal(ok(await call('GET', '/user/coins/balance', { as: w.customer.as }), 'coins').usable, 0);

    // The customer sees it delivered; completing again is refused.
    const mine = ok(await call('GET', `/orders/${w.orderId}`, { as: w.customer.as }), 'customer order');
    assert.equal((mine.order || mine).orderStatus, 'delivered');
    const again = await call('PATCH', `/delivery/orders/${w.orderId}/complete`, { as: w.rider.as, body: {} });
    assert.notEqual(again.status, 200);
    const cancelLate = await call('PATCH', `/orders/${w.orderId}/cancel`, { as: w.customer.as, body: { reason: 'late' } });
    assert.notEqual(cancelLate.status, 200, 'a delivered order cannot be cancelled');
    assert.deepEqual(await variantStock(), { quick: 3, shop: 40 }, 'and nothing is restocked');
    assert.equal(db.databaseName, 'test');
});
