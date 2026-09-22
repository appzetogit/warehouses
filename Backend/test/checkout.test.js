/**
 * The split checkout: one cart across several stores, one payment.
 *
 * What must hold, whatever the payment method: a coupon is used once for the
 * whole cart; coins reduce what is charged instead of being taken on top of it;
 * the money is taken once; and the stores' orders go live only when it has
 * been. Abandoning or cancelling gives back exactly what was taken.
 */
import { test, before, after, mock } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';

const rz = { orders: new Map(), payments: new Map(), refunds: [] };
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
        initiateRazorpayRefund: async (paymentId, amount) => {
            const refund = { id: `rfnd_${rz.refunds.length + 1}`, paymentId, amount };
            rz.refunds.push(refund);
            return { success: true, refundId: refund.id, status: 'processed' };
        },
    },
});

function pay(rzOrderId, paise) {
    const order = rz.orders.get(rzOrderId);
    assert.ok(order, `Razorpay order ${rzOrderId} exists`);
    const id = `pay_${rz.payments.size + 1}`;
    rz.payments.set(id, { id, order_id: rzOrderId, amount: paise ?? order.amount, status: 'captured' });
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
const CUSTOMER_AT = { lat: 12.9352, lng: 77.6245 };
const address = {
    label: 'Home', street: '1 Test Road', city: 'Bengaluru', state: 'KA', phone: '9111100009',
    latitude: CUSTOMER_AT.lat, longitude: CUSTOMER_AT.lng,
    location: { type: 'Point', coordinates: [CUSTOMER_AT.lng, CUSTOMER_AT.lat] },
};

let models;
let phoneSeq = 0;
const newCustomer = async () => {
    const user = await models.User.create({ name: 'Buyer', phone: `91111${String(++phoneSeq).padStart(5, '0')}`, isActive: true });
    return { id: user._id, as: tokenFor('USER', user._id) };
};

before(async () => {
    const db = await startApp();
    const { Zone } = await import('../src/modules/commerce/admin/models/zone.model.js');
    const { Seller } = await import('../src/modules/commerce/seller/models/seller.model.js');
    const { Product } = await import('../src/modules/commerce/admin/models/product.model.js');
    const { User } = await import('../src/core/users/user.model.js');
    const { Offer } = await import('../src/modules/commerce/admin/models/offer.model.js');
    const { Order } = await import('../src/modules/commerce/orders/models/order.model.js');
    const { Checkout } = await import('../src/modules/commerce/orders/models/checkout.model.js');
    const { UserWallet } = await import('../src/modules/commerce/user/models/userWallet.model.js');
    const coins = await import('../src/modules/commerce/coins/services/coin.service.js');
    const { CoinLedger } = await import('../src/modules/commerce/coins/models/coin.model.js');
    await CoinLedger.init();
    models = { User, Offer, Order, Checkout, UserWallet, Product, coins, CoinLedger, db };

    const zone = await Zone.create({ name: 'Checkout Zone', country: 'India', coordinates: ZONE, isActive: true });
    ids.zone = zone._id;
    const store = (name, lat, lng, phone) => Seller.create({ channels: { quick: { status: 'approved' }, shop: { status: 'approved' } },
        sellerName: name, ownerName: 'Owner', ownerPhone: phone, phone, status: 'approved',
        isAcceptingOrders: true, zoneId: zone._id,
        location: { type: 'Point', coordinates: [lng, lat], latitude: lat, longitude: lng },
    });
    const a = await store('Store A', 12.9716, 77.5946, '9111000001');
    const b = await store('Store B', 12.9500, 77.6000, '9111000002');
    ids.a = a._id;
    ids.b = b._id;
    ids.pa = (await Product.create({ sellerId: a._id, name: 'Rice 1kg', price: 300, stock: { quick: 50 }, isAvailable: true, approvalStatus: 'approved' }))._id;
    ids.pb = (await Product.create({ sellerId: b._id, name: 'Soap', price: 100, stock: { quick: 50 }, isAvailable: true, approvalStatus: 'approved' }))._id;
});

after(stopApp);

const cart = (qa = 1, qb = 1) => [
    { itemId: String(ids.pa), sellerId: String(ids.a), name: 'Rice 1kg', price: 300, quantity: qa },
    { itemId: String(ids.pb), sellerId: String(ids.b), name: 'Soap', price: 100, quantity: qb },
];
const checkoutBody = (extra = {}) => ({ items: cart(), deliveryAddress: address, fulfilmentMode: 'quick', ...extra });
const childrenOf = async (checkout) => models.Order.find({ checkoutId: checkout._id }).lean();
const sumTotals = (orders) => Math.round(orders.reduce((s, o) => s + o.pricing.total, 0) * 100) / 100;

test('a two-store cash checkout uses the coupon once, split between the stores', async () => {
    await models.Offer.create({
        couponCode: 'CART100', discountType: 'flat-price', discountValue: 100, status: 'active',
        showInCart: true, minOrderValue: 0, usageLimit: 10,
    });
    const buyer = await newCustomer();

    const quote = ok(await call('POST', '/orders/checkout/calculate', { as: buyer.as, body: checkoutBody({ couponCode: 'CART100' }) }), 'quote');
    assert.equal(quote.discount, 100, 'the coupon counts once for the cart, not once per store');
    assert.deepEqual(quote.childPricings.map((c) => c.couponShare), [75, 25], 'shared by subtotal (300 : 100)');

    const placed = ok(await call('POST', '/orders/checkout', {
        as: buyer.as, body: checkoutBody({ couponCode: 'CART100', paymentMethod: 'cash' }),
    }), 'checkout', 201);
    const orders = await childrenOf(placed.checkout);
    assert.equal(orders.length, 2);
    assert.ok(orders.every((o) => ['created', 'confirmed'].includes(o.orderStatus)), 'cash orders go live at once');
    assert.equal(sumTotals(orders), placed.checkout.pricing.grandTotal);
    assert.equal((await models.Offer.findOne({ couponCode: 'CART100' })).usedCount, 1, 'used once');
});

test('coins lower what is charged, and one Razorpay payment releases every store', async () => {
    const buyer = await newCustomer();
    await models.coins.creditCoins({ userId: buyer.id, amount: 100, source: 'spin', refId: `spin-${buyer.id}` });

    const res = ok(await call('POST', '/orders/checkout', {
        as: buyer.as, body: checkoutBody({ paymentMethod: 'razorpay', coins: 100 }),
    }), 'checkout', 201);
    const { checkout, razorpay } = res;
    let orders = await childrenOf(checkout);

    assert.equal(checkout.pricing.coinsUsed, 100);
    assert.equal(orders.reduce((s, o) => s + o.coinsUsed, 0), 100, 'the coins are shared out');
    const withoutCoins = orders.reduce((s, o) => s + o.pricing.total + o.coinsDiscount, 0);
    assert.equal(Math.round((withoutCoins - 100) * 100) / 100, checkout.pricing.grandTotal, 'the charge is 100 lower, not the same');
    assert.equal(razorpay.amount, Math.round(checkout.pricing.grandTotal * 100), 'one Razorpay order for the whole cart');
    assert.ok(orders.every((o) => o.orderStatus === 'pending_payment'), 'nothing goes to the stores before payment');
    assert.equal((await models.coins.getCoinBalance(buyer.id)).usable, 0);

    const proof = pay(razorpay.orderId);
    ok(await call('POST', `/orders/checkout/${checkout.checkoutId}/verify-payment`, { as: buyer.as, body: proof }), 'verify');
    // A second verify (or the webhook) changes nothing.
    ok(await call('POST', `/orders/checkout/${checkout.checkoutId}/verify-payment`, { as: buyer.as, body: proof }), 'verify again');

    orders = await childrenOf(checkout);
    assert.ok(orders.every((o) => o.orderStatus === 'created' && o.payment.status === 'paid'), 'every store released');
    assert.equal(await models.CoinLedger.countDocuments({ userId: buyer.id, type: 'debit' }), 1, 'coins taken once');

    // Cancelling one store's order gives back only its share of the coins.
    const [first] = orders;
    ok(await call('PATCH', `/orders/${first._id}/cancel`, { as: buyer.as, body: { reason: 'changed my mind' } }), 'cancel one');
    assert.equal((await models.coins.getCoinBalance(buyer.id)).usable, first.coinsUsed);
});

test('a payment for the wrong amount releases nothing', async () => {
    const buyer = await newCustomer();
    const { checkout, razorpay } = ok(await call('POST', '/orders/checkout', {
        as: buyer.as, body: checkoutBody({ paymentMethod: 'razorpay' }),
    }), 'checkout', 201);

    const short = pay(razorpay.orderId, 100);
    const res = await call('POST', `/orders/checkout/${checkout.checkoutId}/verify-payment`, { as: buyer.as, body: short });
    assert.equal(res.status, 400);
    const orders = await childrenOf(checkout);
    assert.ok(orders.every((o) => o.orderStatus === 'pending_payment'));
});

test('a wallet checkout is charged once, for the whole cart', async () => {
    const buyer = await newCustomer();
    await models.UserWallet.create({ userId: buyer.id, balance: 5000, transactions: [] });

    const { checkout } = ok(await call('POST', '/orders/checkout', {
        as: buyer.as, body: checkoutBody({ paymentMethod: 'wallet' }),
    }), 'checkout', 201);

    const wallet = await models.UserWallet.findOne({ userId: buyer.id }).lean();
    assert.equal(wallet.transactions.filter((t) => t.type === 'deduction').length, 1, 'one deduction');
    assert.equal(Math.round((5000 - wallet.balance) * 100) / 100, checkout.pricing.grandTotal);
    const orders = await childrenOf(checkout);
    assert.ok(orders.every((o) => o.orderStatus === 'created' && o.payment.status === 'paid'));
});

test('closing the payment sheet gives back the stock and the coins', async () => {
    const buyer = await newCustomer();
    await models.coins.creditCoins({ userId: buyer.id, amount: 50, source: 'spin', refId: `spin-${buyer.id}` });
    const before = (await models.Product.findById(ids.pa).lean()).stock.quick;

    const { checkout } = ok(await call('POST', '/orders/checkout', {
        as: buyer.as, body: checkoutBody({ paymentMethod: 'razorpay', coins: 50 }),
    }), 'checkout', 201);
    assert.equal((await models.Product.findById(ids.pa).lean()).stock.quick, before - 1, 'held while paying');

    ok(await call('POST', `/orders/checkout/${checkout.checkoutId}/abandon`, { as: buyer.as }), 'abandon');

    assert.equal((await models.Product.findById(ids.pa).lean()).stock.quick, before);
    assert.equal((await models.coins.getCoinBalance(buyer.id)).usable, 50);
    assert.equal((await childrenOf(checkout)).length, 0);
    assert.equal((await models.Checkout.findById(checkout._id).lean()).status, 'cancelled');
});

test('if the app never verifies, the gateway webhook still releases the orders', async () => {
    const buyer = await newCustomer();
    const { checkout, razorpay } = ok(await call('POST', '/orders/checkout', {
        as: buyer.as, body: checkoutBody({ paymentMethod: 'razorpay' }),
    }), 'checkout', 201);
    const proof = pay(razorpay.orderId);

    const { handleCheckoutPaymentCaptured } = await import('../src/modules/commerce/orders/services/orderSplit.service.js');
    const handled = await handleCheckoutPaymentCaptured({
        rzOrderId: razorpay.orderId, rzPaymentId: proof.razorpayPaymentId, amountPaise: razorpay.amount,
    });

    assert.equal(handled, true);
    const orders = await childrenOf(checkout);
    assert.ok(orders.every((o) => o.orderStatus === 'created' && o.payment.status === 'paid'));
});
