/**
 * Courier operations: NDR capture from tracking and admin NDR actions, RTO
 * receive (restock once into the order's channel, refund a prepaid order once),
 * COD remittance matching, and the admin checkout (order-group) view.
 */
import { test, before, after, mock } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';

const rz = { refunds: [] };
mock.module(new URL('../src/modules/commerce/orders/helpers/razorpay.helper.js', import.meta.url).href, {
    namedExports: {
        isRazorpayConfigured: () => true,
        getRazorpayKeyId: () => 'rzp_test_key',
        getRazorpayInstance: () => { throw new Error('not used'); },
        createRazorpayOrder: async () => ({ id: 'order_x' }),
        fetchRazorpayOrder: async () => null,
        createPaymentLink: async () => ({ id: 'plink_1', short_url: 'https://rzp.io/test' }),
        fetchRazorpayPaymentLink: async (id) => ({ id, status: 'created' }),
        verifyPaymentSignature: () => true,
        fetchRazorpayPayment: async () => null,
        initiateRazorpayRefund: async (paymentId, amount) => {
            await new Promise((r) => setTimeout(r, 20));
            const refund = { id: `rfnd_${rz.refunds.length + 1}`, paymentId, amount };
            rz.refunds.push(refund);
            return { success: true, refundId: refund.id, status: 'processed' };
        },
    },
});

const { startApp, stopApp, tokenFor, call, ok } = await import('./helpers/app.js');

let Order;
let Product;
let Checkout;
let courier;
let adminToken;
const ids = {};

before(async () => {
    const db = await startApp();
    ({ Order } = await import('../src/modules/commerce/orders/models/order.model.js'));
    ({ Product } = await import('../src/modules/commerce/admin/models/product.model.js'));
    ({ Checkout } = await import('../src/modules/commerce/orders/models/checkout.model.js'));
    const { CodRemittance } = await import('../src/modules/commerce/orders/models/codRemittance.model.js');
    await CodRemittance.init();
    const { Seller } = await import('../src/modules/commerce/seller/models/seller.model.js');
    const { User } = await import('../src/core/users/user.model.js');
    const { MockShippingProvider } = await import('../src/modules/commerce/delivery/services/shipping/mockShipping.provider.js');
    const { setShippingProvider } = await import('../src/modules/commerce/delivery/services/shipping/index.js');

    courier = new MockShippingProvider();
    setShippingProvider(courier);

    const seller = await Seller.create({
        channels: { quick: { status: 'approved' }, shop: { status: 'approved' } },
        sellerName: 'Ops Mart', ownerName: 'Owner', ownerPhone: '9200000001', phone: '9200000001', status: 'approved',
        location: { type: 'Point', coordinates: [77.59, 12.97] },
    });
    ids.seller = seller._id;
    const user = await User.create({ name: 'Ops Customer', phone: '9200000002', isActive: true });
    ids.user = user._id;
    const product = await Product.create({ sellerId: seller._id, approvalStatus: 'approved', name: 'Ops Tee', price: 300, stock: { quick: 5, shop: 10 } });
    ids.product = product._id;
    const adminId = new mongoose.Types.ObjectId();
    await db.collection('admins').insertOne({ _id: adminId, email: 'ops_admin@example.com', role: 'ADMIN', adminType: 'super_admin', isActive: true });
    adminToken = tokenFor('ADMIN', adminId, { adminType: 'super_admin' });
});

after(stopApp);

const ADDRESS = { name: 'Ops Customer', street: '1 MG Road', city: 'Bengaluru', state: 'KA', zipCode: '560001', phone: '9200000002', location: { type: 'Point', coordinates: [77.62, 12.93] } };

/** A standard order for 2 x Ops Tee (600), stock reserved from the shop shelf. */
async function makeOrder({ status = 'confirmed', method = 'razorpay', total = 600, checkoutId = null } = {}) {
    return Order.create({
        userId: ids.user,
        sellerId: ids.seller,
        fulfilmentMode: 'standard',
        checkoutId,
        items: [{ itemId: String(ids.product), name: 'Ops Tee', price: 300, quantity: 2 }],
        deliveryAddress: ADDRESS,
        customerName: 'Ops Customer',
        customerPhone: '9200000002',
        pricing: { subtotal: 600, discount: 0, deliveryFee: 0, tax: 0, total },
        payment: {
            method,
            status: method === 'cash' ? 'cod_pending' : 'paid',
            razorpay: method === 'razorpay' ? { paymentId: `pay_${new mongoose.Types.ObjectId()}` } : undefined,
        },
        orderStatus: status,
        stockReservedAt: new Date(),
        stockReservations: [{ itemId: String(ids.product), variantId: '', channel: 'shop', qty: 2 }],
    });
}

async function bookedOrder(opts) {
    const order = await makeOrder(opts);
    const booked = ok(await call('POST', `/admin/shipments/${order._id}/book`, { as: adminToken }), 'book');
    return { order, awb: booked.shipment.awb };
}

const track = (order) => call('GET', `/admin/shipments/${order._id}/tracking`, { as: adminToken });
const shopStock = async () => (await Product.findById(ids.product).lean()).stock.shop;

// ---- NDR --------------------------------------------------------------------

test('a failed attempt from tracking lands in the NDR queue; re-attempt and contact act on it', async () => {
    const { order, awb } = await bookedOrder();
    courier.setStatus(awb, 'undelivered', '', { reason: 'Customer not reachable' });
    ok(await track(order), 'track');

    let saved = await Order.findById(order._id).lean();
    assert.equal(saved.shipment.status, 'undelivered');
    assert.equal(saved.shipment.ndr.attempts, 1);
    assert.equal(saved.shipment.ndr.lastReason, 'Customer not reachable');
    assert.equal(saved.shipment.ndr.pending, true);

    const queue = ok(await call('GET', '/admin/shipments/ndr', { as: adminToken }), 'ndr queue');
    const row = queue.data.find((r) => r._id === String(order._id));
    assert.ok(row, 'order is in the pending NDR queue');
    assert.equal(row.ndr.attempts, 1);

    // Tracking again without a new attempt does not re-open or double count.
    ok(await track(order), 'track again');
    assert.equal((await Order.findById(order._id).lean()).shipment.ndr.attempts, 1);

    ok(await call('POST', `/admin/shipments/ndr/${order._id}/action`, { as: adminToken, body: { action: 'contact' } }), 'contact');
    saved = await Order.findById(order._id).lean();
    assert.ok(saved.shipment.ndr.lastContactAt);
    assert.equal(saved.shipment.ndr.pending, true, 'contacting leaves the NDR open');

    const r = ok(await call('POST', `/admin/shipments/ndr/${order._id}/action`, {
        as: adminToken, body: { action: 'reattempt', phone: '9200000099', address1: '2 MG Road', deferredDate: '2026-09-30' },
    }), 'reattempt');
    assert.equal(r.shipment.ndr.action, 'reattempt');
    assert.equal(r.shipment.ndr.pending, false);
    const sent = courier.ndrActions.at(-1);
    assert.equal(sent.awb, awb);
    assert.equal(sent.action, 'reattempt');
    assert.equal(sent.phone, '9200000099');
    assert.equal(sent.deferredDate, '2026-09-30');

    const pendingNow = ok(await call('GET', '/admin/shipments/ndr', { as: adminToken }), 'ndr queue after');
    assert.ok(!pendingNow.data.some((x) => x._id === String(order._id)));

    // A second failed attempt re-opens it.
    courier.setStatus(awb, 'undelivered', '', { reason: 'Address incomplete' });
    ok(await track(order), 'track 2nd attempt');
    saved = await Order.findById(order._id).lean();
    assert.equal(saved.shipment.ndr.attempts, 2);
    assert.equal(saved.shipment.ndr.pending, true);
    assert.equal(saved.shipment.ndr.action, null);

    const bad = await call('POST', `/admin/shipments/ndr/${order._id}/action`, { as: adminToken, body: { action: 'explode' } });
    assert.equal(bad.status, 400);
});

// ---- RTO --------------------------------------------------------------------

test('NDR -> RTO, then receiving restocks the shop shelf once and refunds a prepaid order once', async () => {
    const { order, awb } = await bookedOrder({ method: 'razorpay' });
    courier.setStatus(awb, 'undelivered', '', { reason: 'Refused' });
    ok(await track(order), 'track');
    ok(await call('POST', `/admin/shipments/ndr/${order._id}/action`, { as: adminToken, body: { action: 'rto' } }), 'rto');
    assert.equal(courier.ndrActions.at(-1).action, 'rto');

    const rtoQueue = ok(await call('GET', '/admin/shipments/rto', { as: adminToken }), 'rto queue');
    const row = rtoQueue.data.find((r) => r._id === String(order._id));
    assert.ok(row);
    assert.equal(row.prepaid, true);

    const stockBefore = await shopStock();
    const refundsBefore = rz.refunds.length;
    const [a, b] = await Promise.all([
        call('POST', `/admin/shipments/rto/${order._id}/receive`, { as: adminToken, body: { note: 'box ok' } }),
        call('POST', `/admin/shipments/rto/${order._id}/receive`, { as: adminToken, body: {} }),
    ]);
    ok(a, 'receive a');
    ok(b, 'receive b');
    const third = ok(await call('POST', `/admin/shipments/rto/${order._id}/receive`, { as: adminToken, body: {} }), 'receive again');
    assert.equal(third.alreadyReceived, true);
    assert.equal(third.refund.status, 'processed');

    assert.equal(await shopStock(), stockBefore + 2, 'restocked into the shop channel exactly once');
    assert.equal(rz.refunds.length, refundsBefore + 1, 'refunded exactly once');
    const saved = await Order.findById(order._id).lean();
    assert.equal(saved.shipment.status, 'rto_received');
    assert.equal(saved.payment.status, 'refunded');
    assert.equal(saved.orderStatus, 'cancelled_by_admin');

    // Stale courier tracking does not un-receive it.
    ok(await track(order), 'track after receive');
    assert.equal((await Order.findById(order._id).lean()).shipment.status, 'rto_received');
    const received = ok(await call('GET', '/admin/shipments/rto?state=received', { as: adminToken }), 'received list');
    assert.ok(received.data.some((r) => r._id === String(order._id)));
});

test('a COD RTO (from courier tracking) restocks but has nothing to refund', async () => {
    const { order, awb } = await bookedOrder({ method: 'cash' });
    courier.setStatus(awb, 'rto_in_transit', 'Returning');
    ok(await track(order), 'track');
    const saved = await Order.findById(order._id).lean();
    assert.ok(saved.shipment.rto.initiatedAt);

    const before = await shopStock();
    const refunds = rz.refunds.length;
    const r = ok(await call('POST', `/admin/shipments/rto/${order._id}/receive`, { as: adminToken, body: {} }), 'receive');
    assert.equal(r.refund.status, 'not_applicable');
    assert.equal(r.restocked, true);
    assert.equal(await shopStock(), before + 2);
    assert.equal(rz.refunds.length, refunds);

    const notRto = await makeOrder();
    assert.equal((await call('POST', `/admin/shipments/rto/${notRto._id}/receive`, { as: adminToken, body: {} })).status, 400);
});

// ---- COD remittance -----------------------------------------------------------

test('a courier remittance matches delivered COD shipments: matched, short, missing, unexpected, duplicate', async () => {
    const delivered = [];
    for (let i = 0; i < 3; i += 1) {
        const { order, awb } = await bookedOrder({ method: 'cash', total: 600 });
        courier.setStatus(awb, 'delivered');
        ok(await track(order), 'deliver');
        delivered.push({ order, awb });
    }
    const prepaid = await bookedOrder({ method: 'razorpay' });

    const csv = [
        'AWB Number,COD Amount',
        `${delivered[0].awb},600`,
        `${delivered[1].awb},550`,
        'AWB-NOT-OURS,120',
        `${prepaid.awb},600`,
    ].join('\n');

    const preview = ok(await call('POST', '/admin/cod-remittances/preview', { as: adminToken, body: { csv } }), 'preview');
    assert.deepEqual(preview.lines.map((l) => l.status), ['matched', 'short', 'unexpected', 'unexpected']);

    const rem = ok(await call('POST', '/admin/cod-remittances', {
        as: adminToken, body: { courier: 'MockExpress', reference: 'UTR-0001', date: new Date(Date.now() + 60000).toISOString(), csv },
    }), 'create');
    assert.equal(rem.totals.matched, 1);
    assert.equal(rem.totals.short, 1);
    assert.equal(rem.totals.unexpected, 2);
    assert.equal(rem.totals.received, 1870);
    const shortLine = rem.lines.find((l) => l.awb === delivered[1].awb);
    assert.equal(shortLine.expected, 600);
    assert.match(shortLine.note, /Short by 50/);
    assert.ok(rem.missing.rows.some((m) => m.awb === delivered[2].awb), 'the unremitted delivery is missing');
    assert.ok(!rem.missing.rows.some((m) => m.awb === delivered[0].awb));

    const o0 = await Order.findById(delivered[0].order._id).lean();
    assert.equal(o0.shipment.codRemittance.reference, 'UTR-0001');
    assert.equal(o0.shipment.codRemittance.status, 'matched');

    // Same reference again is refused; the same AWB in a new remittance is a duplicate.
    assert.equal((await call('POST', '/admin/cod-remittances', { as: adminToken, body: { courier: 'MockExpress', reference: 'UTR-0001', csv } })).status, 400);
    const again = ok(await call('POST', '/admin/cod-remittances', {
        as: adminToken, body: { courier: 'MockExpress', reference: 'UTR-0002', lines: [{ awb: delivered[0].awb, amount: 600 }, { awb: delivered[2].awb, amount: 600 }] },
    }), 'second remittance');
    assert.deepEqual(again.lines.map((l) => l.status), ['duplicate', 'matched']);

    const list = ok(await call('GET', '/admin/cod-remittances?search=UTR-0001', { as: adminToken }), 'list');
    assert.equal(list.data.length, 1);
    const detail = ok(await call('GET', `/admin/cod-remittances/${list.data[0]._id}`, { as: adminToken }), 'detail');
    assert.equal(detail.lines.length, 4);

    const summary = ok(await call('GET', '/admin/cod-remittances/summary', { as: adminToken }), 'summary');
    assert.ok(summary.riders && typeof summary.riders.cashInHand === 'number');
    const mock = summary.couriers.byCourier.find((c) => c.courier === 'MockExpress');
    assert.ok(mock.deliveredCount >= 3);
    assert.ok(mock.remittedCount >= 3);
});

// ---- checkouts --------------------------------------------------------------

test('admin checkout list and detail show the payment, split and each child order', async () => {
    const ck = await Checkout.create({
        checkoutId: 'CHK-OPS-1', userId: ids.user, fulfilmentMode: 'standard', customerAddress: ADDRESS,
        pricing: { subtotal: 1200, discount: 100, coinsUsed: 20, coinsDiscount: 20, couponCode: 'SAVE100', grandTotal: 1080 },
        payment: { method: 'razorpay', status: 'paid' },
        status: 'confirmed',
    });
    const a = await makeOrder({ checkoutId: ck._id, total: 540 });
    const b = await makeOrder({ checkoutId: ck._id, total: 540 });
    await Order.updateMany({ _id: { $in: [a._id, b._id] } }, { $set: { 'pricing.discount': 50, coinsUsed: 10, coinsDiscount: 10 } });
    await Checkout.updateOne({ _id: ck._id }, { $set: { childOrderIds: [a._id, b._id], childOrderCodes: [a.order_id, b.order_id], sellerIds: [ids.seller] } });

    const byPhone = ok(await call('GET', '/admin/checkouts?search=9200000002', { as: adminToken }), 'search phone');
    const row = byPhone.data.find((r) => r.checkoutId === 'CHK-OPS-1');
    assert.ok(row);
    assert.equal(row.orderCount, 2);
    assert.equal(row.mode, 'shop');
    assert.equal(row.customer.name, 'Ops Customer');
    assert.equal(ok(await call('GET', '/admin/checkouts?search=CHK-OPS&status=cancelled', { as: adminToken }), 'status').data.length, 0);
    assert.equal(ok(await call('GET', '/admin/checkouts?from=2999-01-01', { as: adminToken }), 'date').data.length, 0);

    const d = ok(await call('GET', '/admin/checkouts/CHK-OPS-1', { as: adminToken }), 'detail');
    assert.equal(d.payment.method, 'razorpay');
    assert.equal(d.pricing.grandTotal, 1080);
    assert.equal(d.orders.length, 2);
    assert.equal(d.split.couponShares, 100);
    assert.equal(d.split.coinsShares, 20);
    assert.equal(d.split.total, 1080);
    assert.equal(d.orders[0].seller.name, 'Ops Mart');
    assert.equal(d.orders[0].pricing.couponShare, 50);
    const byId = ok(await call('GET', `/admin/checkouts/${ck._id}`, { as: adminToken }), 'detail by _id');
    assert.equal(byId.checkoutId, 'CHK-OPS-1');
    assert.equal((await call('GET', '/admin/checkouts/CHK-NOPE', { as: adminToken })).status, 404);
});
