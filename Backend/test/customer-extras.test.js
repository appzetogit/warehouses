/**
 * Customer extras: restoring the saved cart per storefront (rechecked against
 * the catalogue on read), and paying again for an online checkout while its
 * orders are still held.
 */
import { test, before, after, mock } from 'node:test';
import assert from 'node:assert/strict';

const rz = { orders: new Map(), payments: new Map() };
mock.module(new URL('../src/modules/commerce/orders/helpers/razorpay.helper.js', import.meta.url).href, {
    namedExports: {
        isRazorpayConfigured: () => true,
        getRazorpayKeyId: () => 'rzp_test_key',
        getRazorpayInstance: () => { throw new Error('tests use the helper stand-ins only'); },
        createRazorpayOrder: async (amount, currency = 'INR', receipt = '', notes = {}) => {
            const order = { id: `order_${rz.orders.size + 1}`, amount, currency, receipt, notes: notes || {}, status: 'created' };
            rz.orders.set(order.id, order);
            return order;
        },
        fetchRazorpayOrder: async (id) => rz.orders.get(id),
        createPaymentLink: async () => ({ id: 'plink_1', short_url: 'https://rzp.io/test' }),
        fetchRazorpayPaymentLink: async (id) => ({ id, status: 'created' }),
        verifyPaymentSignature: (orderId, paymentId, signature) => signature === `sig:${orderId}|${paymentId}`,
        fetchRazorpayPayment: async (id) => rz.payments.get(id),
        initiateRazorpayRefund: async () => ({ success: true, refundId: 'rfnd_1', status: 'processed' }),
    },
});

function pay(rzOrderId) {
    const order = rz.orders.get(rzOrderId);
    const id = `pay_${rz.payments.size + 1}`;
    rz.payments.set(id, { id, order_id: rzOrderId, amount: order.amount, status: 'captured' });
    return { razorpayOrderId: rzOrderId, razorpayPaymentId: id, razorpaySignature: `sig:${rzOrderId}|${id}` };
}

const { startApp, stopApp, tokenFor, call, ok } = await import('./helpers/app.js');

const ids = {};
const ZONE = [
    { latitude: 12.90, longitude: 77.55 },
    { latitude: 12.90, longitude: 77.65 },
    { latitude: 13.00, longitude: 77.65 },
    { latitude: 13.00, longitude: 77.55 },
];
const address = {
    label: 'Home', street: '1 Test Road', city: 'Bengaluru', state: 'KA', phone: '9111100009',
    latitude: 12.9352, longitude: 77.6245,
    location: { type: 'Point', coordinates: [77.6245, 12.9352] },
};

let models;
let phoneSeq = 0;
const newCustomer = async () => {
    const user = await models.User.create({ name: 'Buyer', phone: `92222${String(++phoneSeq).padStart(5, '0')}`, isActive: true });
    return { id: user._id, as: tokenFor('USER', user._id) };
};

before(async () => {
    await startApp();
    const { Zone } = await import('../src/modules/commerce/admin/models/zone.model.js');
    const { Seller } = await import('../src/modules/commerce/seller/models/seller.model.js');
    const { Product } = await import('../src/modules/commerce/admin/models/product.model.js');
    const { User } = await import('../src/core/users/user.model.js');
    const { Order } = await import('../src/modules/commerce/orders/models/order.model.js');
    const { Checkout } = await import('../src/modules/commerce/orders/models/checkout.model.js');
    const { UserCart } = await import('../src/modules/commerce/user/models/userCart.model.js');
    models = { User, Order, Checkout, Product, UserCart };

    const zone = await Zone.create({ name: 'Extras Zone', country: 'India', coordinates: ZONE, isActive: true });
    const store = (name, lat, lng, phone, channels) => Seller.create({
        channels, sellerName: name, ownerName: 'Owner', ownerPhone: phone, phone, status: 'approved',
        isAcceptingOrders: true, zoneId: zone._id,
        location: { type: 'Point', coordinates: [lng, lat], latitude: lat, longitude: lng },
    });
    const both = { quick: { status: 'approved' }, shop: { status: 'approved' } };
    const a = await store('Store A', 12.9716, 77.5946, '9222000001', both);
    const q = await store('Quick Only', 12.9500, 77.6000, '9222000002', { quick: { status: 'approved' }, shop: { status: 'none' } });
    ids.a = a._id;
    ids.q = q._id;
    ids.rice = (await Product.create({ sellerId: a._id, name: 'Rice 1kg', price: 300, stock: { quick: 50, shop: 3 }, isAvailable: true, approvalStatus: 'approved' }))._id;
    ids.soap = (await Product.create({ sellerId: a._id, name: 'Soap', price: 100, stock: { quick: 50, shop: 0 }, isAvailable: true, approvalStatus: 'approved' }))._id;
    ids.quickOnly = (await Product.create({ sellerId: a._id, name: 'Ice cream', price: 80, channels: { quick: true, shop: false }, stock: { quick: 10, shop: null }, isAvailable: true, approvalStatus: 'approved' }))._id;
    ids.qStore = (await Product.create({ sellerId: q._id, name: 'Milk', price: 30, stock: { quick: 10, shop: null }, isAvailable: true, approvalStatus: 'approved' }))._id;
});

after(stopApp);

const line = (itemId, name, price, quantity, sellerId = ids.a) => ({ itemId: String(itemId), lineItemId: String(itemId), sellerId: String(sellerId), name, price, quantity });

test('GET /user/cart returns each storefront\'s own cart', async () => {
    const buyer = await newCustomer();
    ok(await call('PUT', '/user/cart', { as: buyer.as, body: { mode: 'shop', items: [line(ids.rice, 'Rice 1kg', 300, 1)] } }), 'sync shop');
    ok(await call('PUT', '/user/cart', { as: buyer.as, body: { mode: 'quick', items: [line(ids.qStore, 'Milk', 30, 2, ids.q)] } }), 'sync quick');

    const shop = ok(await call('GET', '/user/cart?mode=shop', { as: buyer.as }), 'get shop');
    assert.deepEqual(shop.items.map((i) => i.name), ['Rice 1kg']);
    assert.equal(shop.mode, 'shop');
    const quick = ok(await call('GET', '/user/cart?mode=quick', { as: buyer.as }), 'get quick');
    assert.deepEqual(quick.items.map((i) => [i.name, i.quantity, i.sellerId]), [['Milk', 2, String(ids.q)]]);

    const other = await newCustomer();
    const none = ok(await call('GET', '/user/cart?mode=shop', { as: other.as }), 'empty');
    assert.deepEqual(none.items, [], 'no cart is an empty list, not someone else\'s');
    assert.equal((await call('GET', '/user/cart?mode=shop')).status, 401);
});

test('reading the cart refreshes prices and drops what the channel cannot sell', async () => {
    const buyer = await newCustomer();
    ok(await call('PUT', '/user/cart', {
        as: buyer.as,
        body: {
            mode: 'shop',
            items: [
                line(ids.rice, 'Rice 1kg', 250, 5), // stale price, more than the 3 in shop stock
                line(ids.soap, 'Soap', 100, 1), // shop stock 0
                line(ids.quickOnly, 'Ice cream', 80, 1), // not listed in shop
                line(ids.qStore, 'Milk', 30, 1, ids.q), // store not approved for shop
            ],
        },
    }), 'sync');

    const cart = ok(await call('GET', '/user/cart?mode=shop', { as: buyer.as }), 'get');
    assert.equal(cart.items.length, 1);
    const [rice] = cart.items;
    assert.equal(rice.price, 300, 'the current price, not the saved one');
    assert.equal(rice.quantity, 3, 'cut to the shop stock');
    assert.deepEqual(cart.changed[0].flags.sort(), ['price_changed', 'quantity_reduced']);
    const reasons = Object.fromEntries(cart.removed.map((r) => [r.name, r.reason]));
    assert.deepEqual(reasons, { Soap: 'out_of_stock', 'Ice cream': 'not_in_channel', Milk: 'seller_not_approved' });
    assert.equal(cart.subtotal, 900);

    // The same lines are fine in quick, which has its own stock.
    ok(await call('PUT', '/user/cart', {
        as: buyer.as,
        body: { mode: 'quick', items: [line(ids.soap, 'Soap', 100, 2), line(ids.quickOnly, 'Ice cream', 80, 1)] },
    }), 'sync quick');
    const quick = ok(await call('GET', '/user/cart?mode=quick', { as: buyer.as }), 'get quick');
    assert.equal(quick.items.length, 2);
    assert.equal(quick.removed.length, 0);

    // A read does not rewrite what is stored.
    const stored = await models.UserCart.findOne({ userId: buyer.id, mode: 'shop' }).lean();
    assert.equal(stored.items.length, 4);
});

test('syncing replaces the saved cart, so local items never double up', async () => {
    const buyer = await newCustomer();
    ok(await call('PUT', '/user/cart', { as: buyer.as, body: { mode: 'shop', items: [line(ids.rice, 'Rice 1kg', 300, 2)] } }), 'server cart');
    // The device already had its own cart: it is kept and pushed up as is.
    ok(await call('PUT', '/user/cart', { as: buyer.as, body: { mode: 'shop', items: [line(ids.rice, 'Rice 1kg', 300, 1)] } }), 'local wins');
    ok(await call('PUT', '/user/cart', { as: buyer.as, body: { mode: 'shop', items: [line(ids.rice, 'Rice 1kg', 300, 1)] } }), 'again');

    const cart = ok(await call('GET', '/user/cart?mode=shop', { as: buyer.as }), 'get');
    assert.deepEqual(cart.items.map((i) => i.quantity), [1], 'one line, the local quantity');
    assert.equal(await models.UserCart.countDocuments({ userId: buyer.id }), 1, 'one cart per mode');

    ok(await call('PUT', '/user/cart', { as: buyer.as, body: { mode: 'shop', items: [] } }), 'clear');
    assert.deepEqual(ok(await call('GET', '/user/cart?mode=shop', { as: buyer.as }), 'get').items, []);
});

const placeOnline = async (buyer) => ok(await call('POST', '/orders/checkout', {
    as: buyer.as,
    body: { items: [line(ids.rice, 'Rice 1kg', 300, 1)], deliveryAddress: address, fulfilmentMode: 'quick', paymentMethod: 'razorpay' },
}), 'checkout', 201);

test('retry-payment hands back the same gateway order for the same total, to the owner only', async () => {
    const buyer = await newCustomer();
    ok(await call('PUT', '/user/cart', { as: buyer.as, body: { mode: 'shop', items: [line(ids.rice, 'Rice 1kg', 300, 1)] } }), 'shop cart');
    const { checkout, razorpay } = await placeOnline(buyer);
    assert.equal(await models.UserCart.countDocuments({ userId: buyer.id, mode: 'shop' }), 1, 'a quick checkout leaves the shop cart alone');

    const path = `/orders/checkout/${checkout.checkoutId}/retry-payment`;
    const first = ok(await call('POST', path, { as: buyer.as }), 'retry');
    const again = ok(await call('POST', path, { as: buyer.as }), 'retry again');
    assert.equal(first.razorpay.orderId, razorpay.orderId, 'the open gateway order is reused');
    assert.equal(again.razorpay.orderId, razorpay.orderId, 'idempotent');
    assert.equal(first.razorpay.amount, Math.round(checkout.pricing.grandTotal * 100));
    assert.ok(new Date(first.holdEndsAt) > new Date());

    const stranger = await newCustomer();
    assert.equal((await call('POST', path, { as: stranger.as })).status, 404, 'not someone else\'s checkout');

    // A gateway order that can no longer be used is replaced by a new one for the same amount.
    rz.orders.get(razorpay.orderId).amount = 1; // no longer matches the checkout
    const fresh = ok(await call('POST', path, { as: buyer.as }), 'retry after gateway order lost');
    assert.notEqual(fresh.razorpay.orderId, razorpay.orderId);
    assert.equal(fresh.razorpay.amount, first.razorpay.amount);

    // Verify works unchanged against the order handed out by the retry.
    ok(await call('POST', `/orders/checkout/${checkout.checkoutId}/verify-payment`, { as: buyer.as, body: pay(fresh.razorpay.orderId) }), 'verify');
    const orders = await models.Order.find({ checkoutId: checkout._id }).lean();
    assert.ok(orders.every((o) => o.payment.status === 'paid'));

    const paid = await call('POST', path, { as: buyer.as });
    assert.equal(paid.status, 409);
});

test('retry-payment after the hold has run out is a 409 with a clear message', async () => {
    const buyer = await newCustomer();
    const { checkout } = await placeOnline(buyer);
    await models.Checkout.collection.updateOne(
        { checkoutId: checkout.checkoutId },
        { $set: { createdAt: new Date(Date.now() - 31 * 60 * 1000) } },
    );
    const res = await call('POST', `/orders/checkout/${checkout.checkoutId}/retry-payment`, { as: buyer.as });
    assert.equal(res.status, 409);
    assert.match(res.body.message, /run out/);
    assert.equal(res.body.data.reason, 'hold_expired');

    // An abandoned checkout cannot be retried either.
    const other = await placeOnline(buyer);
    ok(await call('POST', `/orders/checkout/${other.checkout.checkoutId}/abandon`, { as: buyer.as }), 'abandon');
    assert.equal((await call('POST', `/orders/checkout/${other.checkout.checkoutId}/retry-payment`, { as: buyer.as })).status, 409);
});

test('the coin expiry list shows lots running out soon with their dates', async () => {
    const coins = await import('../src/modules/commerce/coins/services/coin.service.js');
    const buyer = await newCustomer();
    await coins.creditCoins({ userId: buyer.id, amount: 40, source: 'spin', refId: `x-spin-${buyer.id}` });
    const res = ok(await call('GET', '/user/coins/expiring?days=365', { as: buyer.as }), 'expiring');
    assert.equal(res.lots.length, 1);
    assert.equal(res.total, 40);
    assert.ok(res.lots[0].expiresAt);
    const none = ok(await call('GET', '/user/coins/expiring?days=1', { as: buyer.as }), 'none soon');
    assert.equal(none.lots.length, 0);
    const ledger = ok(await call('GET', '/user/coins/ledger', { as: buyer.as }), 'ledger');
    assert.equal(ledger.entries[0].signedAmount, 40);
});
