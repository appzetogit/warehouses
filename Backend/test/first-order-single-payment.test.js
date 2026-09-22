/**
 * The first-order guard on a single (non-split) Razorpay order: the paying
 * card/UPI joins the order's claim whether the app's verify or the gateway's
 * webhook releases it, once, and a card/UPI already used for another person's
 * first order flags the claim for review without failing the paid order.
 */
import { test, before, after, mock } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

process.env.PUSH_CAMPAIGNS_INLINE = 'false';
process.env.FIRST_ORDER_PEPPER = 'test-pepper';
process.env.RAZORPAY_WEBHOOK_SECRET = 'whsec_test';

const rz = { orders: new Map(), payments: new Map() };
mock.module(new URL('../src/modules/commerce/orders/helpers/razorpay.helper.js', import.meta.url).href, {
    namedExports: {
        isRazorpayConfigured: () => true,
        getRazorpayKeyId: () => 'rzp_test_key',
        getRazorpayInstance: () => { throw new Error('not in tests'); },
        createRazorpayOrder: async (amount, currency = 'INR') => {
            const order = { id: `order_single_${rz.orders.size + 1}`, amount, currency, status: 'created' };
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

const { startApp, stopApp } = await import('./helpers/app.js');

let m;
let product;
let seller;
let phoneSeq = 0;

before(async () => {
    await startApp();
    const { User } = await import('../src/core/users/user.model.js');
    const { Zone } = await import('../src/modules/commerce/admin/models/zone.model.js');
    const { Seller } = await import('../src/modules/commerce/seller/models/seller.model.js');
    const { Product } = await import('../src/modules/commerce/admin/models/product.model.js');
    const { Offer } = await import('../src/modules/commerce/admin/models/offer.model.js');
    const { Order } = await import('../src/modules/commerce/orders/models/order.model.js');
    const { FirstOrderClaim } = await import('../src/modules/commerce/orders/models/firstOrderClaim.model.js');
    const guard = await import('../src/modules/commerce/orders/services/firstOrderGuard.service.js');
    const orders = await import('../src/modules/commerce/orders/services/order.service.js');
    await FirstOrderClaim.init();
    m = { User, Order, FirstOrderClaim, guard, orders };

    const zone = await Zone.create({
        name: 'Single FO Zone', country: 'India', isActive: true,
        coordinates: [{ latitude: 12.9, longitude: 77.55 }, { latitude: 12.9, longitude: 77.65 }, { latitude: 13.0, longitude: 77.65 }, { latitude: 13.0, longitude: 77.55 }],
    });
    seller = await Seller.create({
        channels: { quick: { status: 'approved' }, shop: { status: 'approved' } },
        sellerName: 'Single Store', ownerName: 'O', ownerPhone: '9444488881', phone: '9444488881', status: 'approved',
        isAcceptingOrders: true, zoneId: zone._id,
        location: { type: 'Point', coordinates: [77.5946, 12.9716], latitude: 12.9716, longitude: 77.5946 },
    });
    product = await Product.create({ sellerId: seller._id, name: 'Tea', price: 300, stock: { quick: 100 }, isAvailable: true, approvalStatus: 'approved' });
    await Offer.create({ couponCode: 'FIRST50', discountType: 'flat-price', discountValue: 50, status: 'active', showInCart: true, isFirstOrderOnly: true, minOrderValue: 0 });
});

after(async () => {
    await stopApp();
});

const newUser = () => m.User.create({ name: 'Single', phone: `94444${String(++phoneSeq).padStart(5, '0')}`, isActive: true });

let addrPhone = 7000;
const placeOrder = async (userId, deviceId) => {
    const { order, razorpay } = await m.orders.createOrder(String(userId), {
        sellerId: String(seller._id),
        items: [{ itemId: String(product._id), productId: String(product._id), name: 'Tea', price: 300, quantity: 1 }],
        address: {
            label: 'Home', street: '1 Road', city: 'Bengaluru', state: 'KA', phone: `944447${++addrPhone}`,
            latitude: 12.9352, longitude: 77.6245, location: { type: 'Point', coordinates: [77.6245, 12.9352] },
        },
        paymentMethod: 'razorpay',
        fulfilmentMode: 'quick',
        pricing: { couponCode: 'FIRST50' },
        deviceId,
    });
    assert.ok(razorpay?.orderId, 'a Razorpay order was made');
    return { order, razorpay };
};

const pay = (rzOrderId, instrument) => {
    const order = rz.orders.get(rzOrderId);
    const id = `pay_single_${rz.payments.size + 1}`;
    const entity = { id, order_id: rzOrderId, amount: order.amount, status: 'captured', method: 'upi', ...instrument };
    rz.payments.set(id, entity);
    return { entity, proof: { razorpayOrderId: rzOrderId, razorpayPaymentId: id, razorpaySignature: `sig:${rzOrderId}|${id}` } };
};

const webhook = async (entity) => {
    const raw = JSON.stringify({ event: 'payment.captured', payload: { payment: { entity } } });
    const signature = crypto.createHmac('sha256', process.env.RAZORPAY_WEBHOOK_SECRET).update(raw).digest('hex');
    const { handleRazorpayWebhook } = await import('../src/core/payments/controllers/razorpayWebhook.controller.js');
    let status = 0;
    const res = {
        status(code) { status = code; return this; },
        json() { return this; },
        send() { return this; },
    };
    await handleRazorpayWebhook({ headers: { 'x-razorpay-signature': signature }, rawBody: Buffer.from(raw), body: JSON.parse(raw) }, res);
    return status;
};

const claimOf = (orderId) => m.FirstOrderClaim.findOne({ orderId }).lean();

test('single order: verify records the payment fingerprint; the webhook firing too records it once', async () => {
    const a = await newUser();
    const { order, razorpay } = await placeOrder(a._id, 'single-dev-aaaa-01');
    const before = await claimOf(order._id);
    assert.ok(before, 'a first-order claim was taken for the single order');
    assert.equal(before.paymentHash ?? undefined, undefined, 'no payment instrument before paying');

    const { entity, proof } = pay(razorpay.orderId, { vpa: 'Shared@UPI' });
    await m.orders.verifyPayment(String(a._id), { orderId: String(order._id), ...proof });
    const expected = m.guard.hashSignal('payment', 'upi:shared@upi');
    const afterVerify = await claimOf(order._id);
    assert.equal(afterVerify.paymentHash, expected);
    assert.equal(afterVerify.flagged, false);

    // The gateway's webhook for the same payment arrives after verify.
    assert.equal(await webhook(entity), 200);
    const afterWebhook = await claimOf(order._id);
    assert.equal(afterWebhook.paymentHash, expected);
    assert.equal(afterWebhook.flagged, false, 'its own instrument does not flag it');
    assert.equal(await m.FirstOrderClaim.countDocuments({ paymentHash: expected }), 1, 'recorded once');
    assert.equal((await m.Order.findById(order._id).lean()).payment.status, 'paid');
});

test('single order: webhook-only release records the fingerprint; a reused UPI flags, never fails, the paid order', async () => {
    // B pays with the UPI that A's first order already used, and the app never verifies.
    const b = await newUser();
    const { order, razorpay } = await placeOrder(b._id, 'single-dev-bbbb-02');
    const { entity, proof } = pay(razorpay.orderId, { vpa: 'shared@upi' });
    assert.equal(await webhook(entity), 200);

    const released = await m.Order.findById(order._id).lean();
    assert.equal(released.payment.status, 'paid', 'the paid order is not failed');
    assert.equal(released.orderStatus, 'created', 'and it went live');
    const claim = await claimOf(order._id);
    assert.equal(claim.flagged, true, 'flagged for admin review');
    assert.match(claim.flagReason, /already used/i);
    const expected = m.guard.hashSignal('payment', 'upi:shared@upi');
    assert.equal(await m.FirstOrderClaim.countDocuments({ paymentHash: expected }), 1, 'the instrument stays with the first claim');

    // The late verify (and a repeated webhook) change nothing and do not throw.
    await m.orders.verifyPayment(String(b._id), { orderId: String(order._id), ...proof });
    assert.equal(await webhook(entity), 200);
    const again = await claimOf(order._id);
    assert.equal(again.flagged, true);
    assert.equal(again.paymentHash ?? undefined, undefined);
    assert.equal(await m.FirstOrderClaim.countDocuments({ flagged: true, orderId: order._id }), 1);

    // A fresh card on a third person's webhook-only order is simply recorded.
    const c = await newUser();
    const third = await placeOrder(c._id, 'single-dev-cccc-03');
    const paid = pay(third.razorpay.orderId, { method: 'card', card: { fingerprint: 'fp_c_1' } });
    assert.equal(await webhook(paid.entity), 200);
    const cClaim = await claimOf(third.order._id);
    assert.equal(cClaim.paymentHash, m.guard.hashSignal('payment', 'cardfp:fp_c_1'));
    assert.equal(cClaim.flagged, false);
});
