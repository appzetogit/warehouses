/**
 * Journey: a Quick order paid online, then cancelled by the customer.
 *
 * Customer in the zone places a Razorpay checkout (with some coins) -> stock
 * is held and the store sees nothing while unpaid -> pays -> the order goes
 * live -> the customer cancels. Outcomes: one gateway refund, for exactly
 * what was charged, to the original payment; the coins come back; the units
 * go back to the Quick shelf and the Shop shelf never moved.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { installRazorpayMock } from './lib/razorpay.js';

const { rz, pay } = installRazorpayMock();
const {
    startApp, stopApp, call, ok, createAdmin, createZone, createCustomer,
    onboardSeller, listProduct, productStock, orderDoc, addressAt, CUSTOMER_AT,
} = await import('./lib/harness.js');

let db;
const w = {};

before(async () => {
    db = await startApp();
    w.admin = await createAdmin(db);
    w.zoneId = await createZone(w.admin);
    w.seller = await onboardSeller(w.admin, { name: 'Linen Loft', zoneId: w.zoneId });
    w.product = await listProduct(w.seller, w.admin, {
        name: 'Linen Shirt', price: 1200, channels: { quick: true, shop: true }, stock: { quick: 6, shop: 30 },
    });
    w.customer = await createCustomer(db, 'Online Customer');
    ok(await call('POST', '/admin/coins/adjust', { as: w.admin.as, body: { userId: String(w.customer.id), amount: 200, reason: 'Promo' } }), 'grant coins');
});
after(stopApp);

const address = addressAt(CUSTOMER_AT, { phone: '9822200002' });
const body = (extra = {}) => ({
    items: [{ itemId: String(w.product._id), sellerId: String(w.seller.id), name: 'Linen Shirt', price: 1200, quantity: 2 }],
    deliveryAddress: address, fulfilmentMode: 'quick', paymentMethod: 'razorpay', coins: 200, ...extra,
});
const stock = async () => (await productStock(w.product._id)).stock;
const coins = async () => ok(await call('GET', '/user/coins/balance', { as: w.customer.as }), 'coins').usable;

test('pay online: stock held while paying, the store sees the order only once paid', async () => {
    const placed = ok(await call('POST', '/orders/checkout', { as: w.customer.as, body: body() }), 'checkout', 201);
    const { checkout, razorpay } = placed;
    w.checkout = checkout;
    assert.equal(checkout.pricing.coinsUsed, 200);
    assert.equal(razorpay.amount, Math.round(checkout.pricing.grandTotal * 100), 'charged the total less the coins, in paise');

    const [child] = placed.childOrders;
    w.orderId = String(child._id || child.id);
    let order = await orderDoc(w.orderId);
    assert.equal(order.orderStatus, 'pending_payment');
    assert.deepEqual(await stock(), { quick: 4, shop: 30 }, 'held from Quick while paying');
    assert.equal(await coins(), 0);

    const sellerList = ok(await call('GET', '/seller/orders?limit=50', { as: w.seller.as }), 'seller orders');
    const rows = sellerList.orders || sellerList.data || sellerList.items || [];
    assert.ok(!JSON.stringify(rows).includes(w.orderId), 'the store does not see an unpaid order');

    ok(await call('POST', `/orders/checkout/${checkout.checkoutId}/verify-payment`, { as: w.customer.as, body: pay(razorpay.orderId) }), 'verify');
    order = await orderDoc(w.orderId);
    assert.equal(order.payment.status, 'paid');
    assert.equal(order.orderStatus, 'created');
    assert.ok(order.payment.razorpay?.paymentId, 'the payment id is on the order, for the refund');
    w.paid = order.pricing.total;
    assert.equal(w.paid, checkout.pricing.grandTotal);
});

test('the customer cancels: one refund to the card for what was paid, coins back, Quick restocked', async () => {
    const refundsBefore = rz.refunds.length;
    ok(await call('PATCH', `/orders/${w.orderId}/cancel`, { as: w.customer.as, body: { reason: 'ordered by mistake' } }), 'cancel');

    const order = await orderDoc(w.orderId);
    assert.equal(order.orderStatus, 'cancelled_by_user');
    assert.equal(rz.refunds.length, refundsBefore + 1, 'one gateway refund');
    const refund = rz.refunds.at(-1);
    assert.equal(refund.amount, w.paid, 'for exactly what was charged');
    assert.equal(refund.paymentId, order.payment.razorpay.paymentId, 'to the original payment');
    assert.equal(order.payment.status, 'refunded');
    assert.equal(order.payment.refund.status, 'processed');

    assert.deepEqual(await stock(), { quick: 6, shop: 30 }, 'back on the Quick shelf; Shop never moved');
    assert.equal(await coins(), 200, 'the coins come back');

    // A second cancel changes nothing: no second refund, no double restock.
    const again = await call('PATCH', `/orders/${w.orderId}/cancel`, { as: w.customer.as, body: {} });
    assert.notEqual(again.status, 200);
    assert.equal(rz.refunds.length, refundsBefore + 1);
    assert.deepEqual(await stock(), { quick: 6, shop: 30 });
    assert.equal(await coins(), 200);
    assert.ok(db);
});
