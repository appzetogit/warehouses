/**
 * API smoke suite: the money and dispatch paths, end to end through the real
 * app (routing, auth, validation, services, Mongo), with real JWTs.
 *
 * External services are off or stubbed: Redis is disabled, so queues fall back
 * to in-process work; there are no Google Maps or Firebase keys, so distance is
 * straight-line and pushes are skipped. What this proves is that our own code
 * still places, accepts, dispatches, cancels and refunds orders after a
 * refactor, not that the providers behave.
 */
import { test, before, after, mock } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';

// Razorpay as our code sees it. Every caller goes through this helper, so one
// stand-in covers ordering, wallet top-ups and refunds.
const rz = { orders: new Map(), payments: new Map(), refunds: [] };
mock.module(new URL('../src/modules/commerce/orders/helpers/razorpay.helper.js', import.meta.url).href, {
    namedExports: {
        isRazorpayConfigured: () => true,
        getRazorpayKeyId: () => 'rzp_test_key',
        getRazorpayInstance: () => { throw new Error('smoke tests use the helper stand-ins only'); },
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
        initiateRazorpayRefund: async (paymentId, amount) => {
            const refund = { id: `rfnd_${rz.refunds.length + 1}`, paymentId, amount };
            rz.refunds.push(refund);
            return { success: true, refundId: refund.id, status: 'processed' };
        },
    },
});

/** What the Razorpay checkout hands back after the customer pays. */
function payRazorpay(orderId) {
    const order = rz.orders.get(orderId);
    assert.ok(order, `Razorpay order ${orderId} exists`);
    const id = `pay_${rz.payments.size + 1}`;
    rz.payments.set(id, { id, order_id: orderId, amount: order.amount, status: 'captured', notes: order.notes });
    order.status = 'paid';
    return { razorpayOrderId: orderId, razorpayPaymentId: id, razorpaySignature: `sig:${orderId}|${id}` };
}

const { startApp, stopApp, tokenFor, call, ok } = await import('./helpers/app.js');

const ids = {};

// A square around central Bengaluru; the seller and customer are inside it.
const ZONE = [
    { latitude: 12.90, longitude: 77.55 },
    { latitude: 12.90, longitude: 77.65 },
    { latitude: 13.00, longitude: 77.65 },
    { latitude: 13.00, longitude: 77.55 },
];
const SELLER_AT = { lat: 12.9716, lng: 77.5946 };
const CUSTOMER_AT = { lat: 12.9352, lng: 77.6245 };

before(async () => {
    const db = await startApp();
    const { Zone } = await import('../src/modules/commerce/admin/models/zone.model.js');
    const { Seller } = await import('../src/modules/commerce/seller/models/seller.model.js');
    const { Product } = await import('../src/modules/commerce/admin/models/product.model.js');
    const { User } = await import('../src/core/users/user.model.js');

    const zone = await Zone.create({ name: 'Smoke Zone', country: 'India', coordinates: ZONE, isActive: true });
    ids.zone = zone._id;

    const seller = await Seller.create({
        sellerName: 'Smoke Mart',
        ownerName: 'Owner',
        ownerPhone: '9000000001',
        phone: '9000000001',
        status: 'approved',
        isAcceptingOrders: true,
        zoneId: zone._id,
        location: { type: 'Point', coordinates: [SELLER_AT.lng, SELLER_AT.lat], latitude: SELLER_AT.lat, longitude: SELLER_AT.lng },
    });
    ids.seller = seller._id;

    const product = await Product.create({
        sellerId: seller._id,
        name: 'Milk 1L',
        price: 60,
        stockQty: 10,
        isAvailable: true,
        approvalStatus: 'approved',
    });
    ids.product = product._id;

    const user = await User.create({ name: 'Smoke Customer', phone: '9000000002', isActive: true });
    ids.user = user._id;

    const { DeliveryPartner } = await import('../src/modules/commerce/delivery/models/deliveryPartner.model.js');
    const rider = await DeliveryPartner.create({
        name: 'Smoke Rider', phone: '9000000003', status: 'approved', availabilityStatus: 'online',
        lastLat: SELLER_AT.lat + 0.002, lastLng: SELLER_AT.lng + 0.002, lastLocationAt: new Date(),
        lastLocation: { type: 'Point', coordinates: [SELLER_AT.lng + 0.002, SELLER_AT.lat + 0.002] },
    });
    ids.rider = rider._id;

    ids.db = db;
});

/** Polls until check() returns something truthy; dispatch runs after the response. */
async function waitFor(check, what, ms = 10000) {
    const until = Date.now() + ms;
    for (;;) {
        const value = await check();
        if (value) return value;
        if (Date.now() > until) assert.fail(`timed out waiting for ${what}`);
        await new Promise((r) => setTimeout(r, 200));
    }
}

after(stopApp);

const cartLine = (qty = 2) => ({ itemId: String(ids.product), name: 'Milk 1L', price: 60, quantity: qty });
const address = {
    label: 'Home', street: '1 Test Road', city: 'Bengaluru', state: 'KA',
    latitude: CUSTOMER_AT.lat, longitude: CUSTOMER_AT.lng,
};

test('a customer prices and places a cash order, and stock is reserved', async () => {
    const as = tokenFor('USER', ids.user);

    const quote = ok(await call('POST', '/orders/calculate', {
        as,
        body: {
            sellerId: String(ids.seller), items: [cartLine()], zoneId: String(ids.zone),
            deliveryAddress: { location: { coordinates: [CUSTOMER_AT.lng, CUSTOMER_AT.lat] } },
        },
    }), 'calculate');
    assert.equal(quote.pricing.subtotal, 120);
    ids.quote = quote.pricing;

    const placed = ok(await call('POST', '/orders', {
        as,
        body: {
            sellerId: String(ids.seller), items: [cartLine()], address,
            pricing: { subtotal: quote.pricing.subtotal, total: quote.pricing.total },
            paymentMethod: 'cash', zoneId: String(ids.zone),
        },
    }), 'place order', 201);
    ids.order = placed.order._id || placed.order.id;
    assert.ok(ids.order, 'order id returned');

    const product = await ids.db.collection('products').findOne({ _id: ids.product });
    assert.equal(product.stockQty, 8, 'two units reserved');
});

test('the seller packs it, a rider delivers it with the handover OTP', async () => {
    const seller = tokenFor('SELLER', ids.seller);
    const rider = tokenFor('DELIVERY_PARTNER', ids.rider);
    const customer = tokenFor('USER', ids.user);
    const order = String(ids.order);

    for (const orderStatus of ['confirmed', 'preparing', 'ready_for_pickup']) {
        ok(await call('PATCH', `/seller/orders/${order}/status`, { as: seller, body: { orderStatus } }), `seller → ${orderStatus}`);
    }

    await waitFor(async () => {
        const res = await call('GET', '/delivery/orders/available', { as: rider });
        const list = res.body?.data?.data || [];
        return Array.isArray(list) && list.some((o) => String(o._id || o.id || o.orderMongoId) === order);
    }, 'the offer to reach the rider');

    ok(await call('PATCH', `/delivery/orders/${order}/accept`, { as: rider }), 'rider accepts');
    ok(await call('PATCH', `/delivery/orders/${order}/reached-pickup`, { as: rider }), 'reached pickup');
    ok(await call('PATCH', `/delivery/orders/${order}/confirm-pickup`, { as: rider, body: {} }), 'picked up');
    ok(await call('PATCH', `/delivery/orders/${order}/reached-drop`, { as: rider }), 'reached drop');

    const otp = ok(await call('GET', `/orders/${order}/drop-otp`, { as: customer }), 'customer reads OTP');
    const code = otp?.otp || otp?.handoverOtp || otp?.dropOtp;
    assert.ok(code, `an OTP for the customer: ${JSON.stringify(otp)}`);
    ok(await call('POST', `/delivery/orders/${order}/verify-drop-otp`, { as: rider, body: { otp: String(code) } }), 'rider verifies OTP');
    ok(await call('PATCH', `/delivery/orders/${order}/complete`, { as: rider, body: {} }), 'rider completes');

    const done = ok(await call('GET', `/orders/${order}`, { as: customer }), 'customer reads order');
    assert.equal((done.order || done).orderStatus, 'delivered');
});

const stockOf = async () => (await ids.db.collection('products').findOne({ _id: ids.product })).stockQty;
const orderDoc = (id) => ids.db.collection('orders').findOne({ _id: new mongoose.Types.ObjectId(String(id)) });

async function placeOrder(paymentMethod, qty = 1) {
    const as = tokenFor('USER', ids.user);
    const quote = ok(await call('POST', '/orders/calculate', {
        as,
        body: {
            sellerId: String(ids.seller), items: [cartLine(qty)], zoneId: String(ids.zone),
            deliveryAddress: { location: { coordinates: [CUSTOMER_AT.lng, CUSTOMER_AT.lat] } },
        },
    }), 'calculate');
    const placed = ok(await call('POST', '/orders', {
        as,
        body: {
            sellerId: String(ids.seller), items: [cartLine(qty)], address,
            pricing: { subtotal: quote.pricing.subtotal, total: quote.pricing.total },
            paymentMethod, zoneId: String(ids.zone),
        },
    }), `place ${paymentMethod} order`, 201);
    return { id: String(placed.order._id || placed.order.id), total: quote.pricing.total, razorpay: placed.razorpay };
}

test('a customer cancels a cash order and the stock comes back', async () => {
    const before = await stockOf();
    const { id } = await placeOrder('cash', 3);
    assert.equal(await stockOf(), before - 3);

    ok(await call('PATCH', `/orders/${id}/cancel`, { as: tokenFor('USER', ids.user), body: { reason: 'changed my mind' } }), 'cancel');
    assert.equal((await orderDoc(id)).orderStatus, 'cancelled_by_user');
    assert.equal(await stockOf(), before, 'stock restored');
});

test('an order paid by Razorpay and rejected by the seller is refunded through Razorpay', async () => {
    const before = await stockOf();
    const { id, total, razorpay } = await placeOrder('razorpay', 1);
    assert.equal((await orderDoc(id)).orderStatus, 'pending_payment');

    const rzOrderId = razorpay?.orderId || razorpay?.id || razorpay?.razorpayOrderId;
    assert.ok(rzOrderId, `a Razorpay order to pay: ${JSON.stringify(razorpay)}`);
    ok(await call('POST', '/orders/verify-payment', {
        as: tokenFor('USER', ids.user), body: { orderId: id, ...payRazorpay(rzOrderId) },
    }), 'verify payment');
    const paid = await orderDoc(id);
    assert.equal(paid.payment.status, 'paid');
    assert.notEqual(paid.orderStatus, 'pending_payment');

    const refundsBefore = rz.refunds.length;
    ok(await call('PATCH', `/seller/orders/${id}/status`, {
        as: tokenFor('SELLER', ids.seller), body: { orderStatus: 'cancelled_by_seller', note: 'out of stock' },
    }), 'seller rejects');

    const cancelled = await orderDoc(id);
    assert.equal(cancelled.orderStatus, 'cancelled_by_seller');
    assert.equal(rz.refunds.length, refundsBefore + 1, 'one Razorpay refund');
    assert.equal(rz.refunds.at(-1).amount, total, 'for the order total');
    assert.equal(cancelled.payment.refund.status, 'processed');
    assert.equal(await stockOf(), before, 'stock restored');
});

test('a wallet top-up pays for an order, and cancelling it credits the wallet back', async () => {
    const as = tokenFor('USER', ids.user);
    const topup = ok(await call('POST', '/user/wallet/topup/order', { as, body: { amount: 500 } }), 'top-up order');
    const rzOrderId = topup?.razorpay?.orderId || topup?.razorpay?.id;
    ok(await call('POST', '/user/wallet/topup/verify', { as, body: payRazorpay(rzOrderId) }), 'top-up verify');

    const balance = async () => {
        const w = ok(await call('GET', '/user/wallet', { as }), 'wallet');
        return Number((w.wallet || w).balance);
    };
    const start = await balance();
    assert.equal(start, 500);

    const { id, total } = await placeOrder('wallet', 1);
    assert.equal(await balance(), start - total, 'order paid from the wallet');

    ok(await call('PATCH', `/orders/${id}/cancel`, { as, body: {} }), 'cancel');
    assert.equal(await balance(), start, 'wallet refunded in full');
});

test('abandoning an online payment deletes the order and releases its stock', async () => {
    const before = await stockOf();
    const { id } = await placeOrder('razorpay', 2);
    assert.equal(await stockOf(), before - 2);

    ok(await call('DELETE', `/orders/${id}/pending-payment`, { as: tokenFor('USER', ids.user) }), 'abandon');
    assert.equal(await orderDoc(id), null, 'order removed');
    assert.equal(await stockOf(), before, 'stock released');
});

test('a product with attribute variants: the seller creates it, a customer orders one variant', async () => {
    const seller = tokenFor('SELLER', ids.seller);
    const customer = tokenFor('USER', ids.user);

    const created = ok(await call('POST', '/seller/products', {
        as: seller,
        body: {
            name: 'Cotton Tee',
            tags: 'tee, Cotton',
            variants: [
                { attributes: [{ name: 'Size', value: 'M' }, { name: 'Color', value: 'Red' }], price: 399, mrp: 499, stockQty: 2 },
                { attributes: { Size: 'L', Color: 'Red' }, price: 399, mrp: 499, stockQty: 0 },
            ],
        },
    }), 'create product', 201).product;
    assert.deepEqual(created.tags, ['tee', 'cotton']);
    assert.equal(created.variants[0].name, 'M / Red', 'named after its attributes');
    await ids.db.collection('products').updateOne({ _id: new mongoose.Types.ObjectId(String(created._id)) }, { $set: { approvalStatus: 'approved' } });

    const [m, l] = created.variants.map((v) => String(v._id));
    const lineFor = (variantId, quantity) => ({ itemId: String(created._id), variantId, name: 'Cotton Tee', price: 399, quantity });

    const soldOut = await call('POST', '/orders/calculate', {
        as: customer, body: { sellerId: String(ids.seller), items: [lineFor(l, 1)], zoneId: String(ids.zone) },
    });
    assert.equal(soldOut.status, 400);
    assert.match(soldOut.body.message, /Cotton Tee \(L \/ Red\) just went out of stock/);

    const quote = ok(await call('POST', '/orders/calculate', {
        as: customer, body: { sellerId: String(ids.seller), items: [lineFor(m, 2)], zoneId: String(ids.zone) },
    }), 'calculate');
    const placed = ok(await call('POST', '/orders', {
        as: customer,
        body: {
            sellerId: String(ids.seller), items: [lineFor(m, 2)], address,
            pricing: { subtotal: quote.pricing.subtotal, total: quote.pricing.total }, paymentMethod: 'cash',
        },
    }), 'place', 201);

    const line = placed.order.items[0];
    assert.deepEqual(line.variantAttributes, [{ name: 'Size', value: 'M' }, { name: 'Color', value: 'Red' }]);
    const product = await ids.db.collection('products').findOne({ _id: new mongoose.Types.ObjectId(String(created._id)) });
    assert.equal(product.variants[0].stockQty, 0);
    assert.equal(product.isAvailable, false, 'every variant is sold out');

    // The seller restocks L alone.
    const restock = ok(await call('PATCH', '/seller/products/stock', {
        as: seller, body: [{ itemId: String(created._id), variantId: l, stockQty: 5 }],
    }), 'restock variant');
    assert.equal(restock.updated[0].stockQty, 5);
    const after = await ids.db.collection('products').findOne({ _id: product._id });
    assert.equal(after.isAvailable, true, 'listed again');

    const dup = await call('POST', '/seller/products', {
        as: seller,
        body: { name: 'Dup', variants: [{ attributes: { Size: 'M' }, price: 1 }, { attributes: { size: 'm' }, price: 2 }] },
    });
    assert.equal(dup.status, 400);
    assert.match(dup.body.message, /same options/);
});

test('a first-order offer applies itself, and a cancelled or unpaid order does not use it up', async () => {
    const { User } = await import('../src/core/users/user.model.js');
    const { Offer } = await import('../src/modules/commerce/admin/models/offer.model.js');
    const { Order } = await import('../src/modules/commerce/orders/models/order.model.js');
    await Offer.create({
        couponCode: 'WELCOME50', discountType: 'flat-price', discountValue: 50, status: 'active',
        showInCart: true, isFirstOrderOnly: true, minOrderValue: 0,
    });
    const newcomer = await User.create({ name: 'Newcomer', phone: '9000000077', isActive: true });
    for (const orderStatus of ['cancelled_by_user', 'pending_payment']) {
        await Order.collection.insertOne({ userId: newcomer._id, orderStatus, deliveryAddress: { phone: '9000000077' } });
    }

    const quote = ok(await call('POST', '/orders/calculate', {
        as: tokenFor('USER', newcomer._id),
        body: {
            sellerId: String(ids.seller), items: [cartLine(1)], zoneId: String(ids.zone),
            deliveryAddress: { location: { coordinates: [CUSTOMER_AT.lng, CUSTOMER_AT.lat] } },
        },
    }), 'calculate');
    assert.equal(quote.pricing.appliedCoupon?.code, 'WELCOME50');
    assert.equal(quote.pricing.appliedCoupon?.isAutoApplied, true);
    assert.equal(quote.pricing.discount, 50);

    // The customer from the earlier tests has a real order, so gets nothing.
    const returning = ok(await call('POST', '/orders/calculate', {
        as: tokenFor('USER', ids.user),
        body: {
            sellerId: String(ids.seller), items: [cartLine(1)], zoneId: String(ids.zone),
            deliveryAddress: { location: { coordinates: [CUSTOMER_AT.lng, CUSTOMER_AT.lat] } },
        },
    }), 'calculate returning');
    assert.equal(returning.pricing.discount, 0);
});
