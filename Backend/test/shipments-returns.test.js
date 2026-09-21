/**
 * Courier shipments (admin book / track / cancel) and returns (request window,
 * approve / reject, receive -> refund once, coins option, amounts), through
 * the real app with the mock courier and a Razorpay stand-in.
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
            // A slow gateway, so racing refunds overlap.
            await new Promise((r) => setTimeout(r, 30));
            const refund = { id: `rfnd_${rz.refunds.length + 1}`, paymentId, amount };
            rz.refunds.push(refund);
            return { success: true, refundId: refund.id, status: 'processed' };
        },
    },
});

const { startApp, stopApp, tokenFor, call, ok } = await import('./helpers/app.js');

const DAY = 24 * 60 * 60 * 1000;
let Order;
let ReturnRequest;
let courier;
let adminToken;
let userToken;
let sellerToken;
const ids = {};

before(async () => {
    const db = await startApp();
    ({ Order } = await import('../src/modules/commerce/orders/models/order.model.js'));
    ({ ReturnRequest } = await import('../src/modules/commerce/orders/models/returnRequest.model.js'));
    const { Seller } = await import('../src/modules/commerce/seller/models/seller.model.js');
    const { User } = await import('../src/core/users/user.model.js');
    const { MockShippingProvider } = await import('../src/modules/commerce/delivery/services/shipping/mockShipping.provider.js');
    const { setShippingProvider } = await import('../src/modules/commerce/delivery/services/shipping/index.js');
    const { updateCoinSettings } = await import('../src/modules/commerce/coins/services/coin.service.js');

    courier = new MockShippingProvider();
    setShippingProvider(courier);
    await updateCoinSettings({ isEnabled: true, redeemPercent: 80, expiryDays: 90, maxOrderPercent: 50, coinValue: 1 });

    const seller = await Seller.create({
        sellerName: 'Courier Mart', ownerName: 'Owner', ownerPhone: '9100000001', phone: '9100000001', status: 'approved',
        location: { type: 'Point', coordinates: [77.59, 12.97] },
    });
    ids.seller = seller._id;
    const user = await User.create({ name: 'Return Customer', phone: '9100000002', isActive: true });
    ids.user = user._id;
    const adminId = new mongoose.Types.ObjectId();
    await db.collection('admins').insertOne({ _id: adminId, email: 'ship_admin@example.com', role: 'ADMIN', adminType: 'super_admin', isActive: true });

    adminToken = tokenFor('ADMIN', adminId, { adminType: 'super_admin' });
    userToken = tokenFor('USER', user._id);
    sellerToken = tokenFor('SELLER', seller._id);
});

after(stopApp);

const ADDRESS = { name: 'Return Customer', street: '1 MG Road', city: 'Bengaluru', state: 'KA', zipCode: '560001', phone: '9100000002', location: { type: 'Point', coordinates: [77.62, 12.93] } };

/**
 * subtotal 1000 (A 300 x2, B 400 x1), coupon 100, delivery 50, 50 coins:
 * total 900. Paid by Razorpay unless `method` says otherwise.
 */
async function makeOrder({ status = 'delivered', method = 'razorpay', deliveredDaysAgo = 1, mode = 'standard', coins = 50 } = {}) {
    const deliveredAt = status === 'delivered' ? new Date(Date.now() - deliveredDaysAgo * DAY) : null;
    const order = await Order.create({
        userId: ids.user,
        sellerId: ids.seller,
        fulfilmentMode: mode,
        items: [
            { itemId: 'A', name: 'Shirt', price: 300, quantity: 2 },
            { itemId: 'B', name: 'Shoes', price: 400, quantity: 1 },
        ],
        deliveryAddress: ADDRESS,
        customerName: 'Return Customer',
        customerPhone: '9100000002',
        pricing: { subtotal: 1000, discount: 100, deliveryFee: 50, tax: 0, total: 900, coinsDiscount: coins },
        coinsUsed: coins,
        coinsDiscount: coins,
        payment: {
            method,
            status: method === 'cash' ? (status === 'delivered' ? 'paid' : 'cod_pending') : 'paid',
            razorpay: method === 'razorpay' ? { paymentId: `pay_${new mongoose.Types.ObjectId()}` } : undefined,
        },
        orderStatus: status,
        deliveryState: deliveredAt ? { deliveredAt } : undefined,
    });
    if (coins > 0) {
        const { creditCoins, redeemCoins } = await import('../src/modules/commerce/coins/services/coin.service.js');
        await creditCoins({ userId: ids.user, amount: coins, source: 'admin', refId: `seed-${order._id}` });
        await redeemCoins({ userId: ids.user, orderId: order._id, coins });
    }
    return order;
}

// ---- shipments --------------------------------------------------------------

test('admin books, lists, tracks (delivering the order) and the listing filters work', async () => {
    const order = await makeOrder({ status: 'confirmed', coins: 0 });

    const booked = ok(await call('POST', `/admin/shipments/${order._id}/book`, { as: adminToken }), 'book');
    assert.match(booked.shipment.awb, /^AWB/);
    assert.equal(booked.order.orderStatus, 'ready_for_pickup');
    const awb = booked.shipment.awb;

    const again = await call('POST', `/admin/shipments/${order._id}/book`, { as: adminToken });
    assert.equal(again.status, 400, 'a second booking is refused');

    const list = ok(await call('GET', `/admin/shipments?search=${awb}`, { as: adminToken }), 'list');
    assert.equal(list.data.length, 1);
    assert.equal(list.data[0].seller.name, 'Courier Mart');
    assert.equal(list.data[0].shipment.courierName, 'MockExpress');
    assert.equal(list.data[0].canCancel, true);
    const byCourier = ok(await call('GET', '/admin/shipments?courier=mockexp&status=booked', { as: adminToken }), 'courier filter');
    assert.ok(byCourier.data.some((r) => r.shipment?.awb === awb));
    const future = ok(await call('GET', '/admin/shipments?from=2999-01-01', { as: adminToken }), 'date filter');
    assert.equal(future.data.length, 0);

    const t1 = ok(await call('GET', `/admin/shipments/${order._id}/tracking`, { as: adminToken }), 'track');
    assert.equal(t1.tracking.currentStatus, 'manifested');
    assert.equal(t1.orderDelivered, false);

    courier.setStatus(awb, 'delivered', 'Delivered to customer');
    const t2 = ok(await call('GET', `/admin/shipments/${order._id}/tracking`, { as: adminToken }), 'track delivered');
    assert.equal(t2.orderDelivered, true);
    assert.equal(t2.orderStatus, 'delivered');
    const saved = await Order.findById(order._id).lean();
    assert.equal(saved.shipment.status, 'delivered');
    assert.ok(saved.deliveryState.deliveredAt);

    const cancelDelivered = await call('POST', `/admin/shipments/${order._id}/cancel`, { as: adminToken, body: {} });
    assert.equal(cancelDelivered.status, 400, 'a delivered shipment cannot be cancelled');
});

test('delivered tracking on a cancelled order is shown but does not deliver it', async () => {
    const order = await makeOrder({ status: 'confirmed', coins: 0 });
    const { shipment } = ok(await call('POST', `/admin/shipments/${order._id}/book`, { as: adminToken }), 'book');
    await Order.updateOne({ _id: order._id }, { $set: { orderStatus: 'cancelled_by_admin' } });
    courier.setStatus(shipment.awb, 'delivered');
    const t = ok(await call('GET', `/admin/shipments/${order._id}/tracking`, { as: adminToken }), 'track');
    assert.equal(t.tracking.currentStatus, 'delivered');
    assert.equal(t.orderDelivered, false);
    assert.equal(t.orderStatus, 'cancelled_by_admin');
});

test('admin cancels a shipment, which can then be booked again', async () => {
    const order = await makeOrder({ status: 'preparing', coins: 0 });
    const first = ok(await call('POST', `/admin/shipments/${order._id}/book`, { as: adminToken }), 'book');
    const cancelled = ok(await call('POST', `/admin/shipments/${order._id}/cancel`, { as: adminToken, body: { reason: 'wrong box' } }), 'cancel');
    assert.equal(cancelled.shipment.status, 'cancelled');
    assert.equal(cancelled.shipment.awb, null);
    assert.equal(cancelled.shipment.cancelledAwb, first.shipment.awb);

    const list = ok(await call('GET', '/admin/shipments?status=cancelled', { as: adminToken }), 'list cancelled');
    assert.ok(list.data.some((r) => r._id === String(order._id)));
    assert.equal((await call('POST', `/admin/shipments/${order._id}/cancel`, { as: adminToken, body: {} })).status, 400);

    const rebooked = ok(await call('POST', `/admin/shipments/${order._id}/book`, { as: adminToken }), 'rebook');
    assert.notEqual(rebooked.shipment.awb, first.shipment.awb);
});

test('shipment endpoints refuse quick orders and need an admin', async () => {
    const quick = await makeOrder({ status: 'confirmed', mode: 'quick', coins: 0 });
    assert.equal((await call('POST', `/admin/shipments/${quick._id}/book`, { as: adminToken })).status, 404);
    assert.equal((await call('GET', '/admin/shipments', { as: userToken })).status, 403);
});

// ---- returns ----------------------------------------------------------------

const requestReturn = (orderId, body) => call('POST', `/orders/${orderId}/returns`, { as: userToken, body });

test('the return window is a setting and only delivered standard orders qualify', async () => {
    const old = await makeOrder({ deliveredDaysAgo: 10, coins: 0 });
    const body = { items: [{ itemId: 'A', quantity: 1 }], reason: 'Too small' };

    const info = ok(await call('GET', `/orders/${old._id}/returns`, { as: userToken }), 'eligibility');
    assert.equal(info.eligible, false);
    assert.equal(info.windowDays, 7);
    assert.match((await requestReturn(old._id, body)).body.message, /7-day return window/);

    ok(await call('PATCH', '/admin/returns/settings', { as: adminToken, body: { returnWindowDays: 14 } }), 'settings');
    assert.equal(ok(await call('GET', '/admin/returns/settings', { as: adminToken }), 'get settings').returnWindowDays, 14);
    ok(await requestReturn(old._id, body), 'within the longer window', 201);
    ok(await call('PATCH', '/admin/returns/settings', { as: adminToken, body: { returnWindowDays: 7 } }), 'reset');

    const shipping = await makeOrder({ status: 'ready_for_pickup', coins: 0 });
    assert.equal((await requestReturn(shipping._id, body)).status, 400, 'not delivered yet');
    const quick = await makeOrder({ mode: 'quick', coins: 0 });
    assert.equal((await requestReturn(quick._id, body)).status, 400, 'quick orders are not returnable');
});

test('amounts: the lines\' share of the paid goods, less the coins share, which comes back as coins', async () => {
    const { computeReturnAmounts } = await import('../src/modules/commerce/orders/services/returnRequest.service.js');
    const order = (await makeOrder({ coins: 50 })).toObject();
    // 300 of 1000 goods; goods paid 900 (after the 100 coupon); 50 of 950 paid in coins.
    assert.deepEqual(computeReturnAmounts(order, [{ price: 300, quantity: 1 }]), { itemsValue: 300, refundAmount: 255.79, coinsBack: 14 });
    // Everything back: all goods' money (the delivery fee is kept), 47 coins.
    assert.deepEqual(computeReturnAmounts(order, [{ price: 300, quantity: 2 }, { price: 400, quantity: 1 }]), { itemsValue: 1000, refundAmount: 852.63, coinsBack: 47 });
});

test('quantities are checked and one return per order is open at a time', async () => {
    const order = await makeOrder({ coins: 0 });
    assert.equal((await requestReturn(order._id, { items: [{ itemId: 'A', quantity: 3 }], reason: 'x' })).status, 400);
    assert.equal((await requestReturn(order._id, { items: [{ itemId: 'Z', quantity: 1 }], reason: 'x' })).status, 400);
    assert.equal((await requestReturn(order._id, { items: [{ itemId: 'A', quantity: 1 }] })).status, 400, 'reason required');

    const results = await Promise.all([
        requestReturn(order._id, { items: [{ itemId: 'A', quantity: 1 }], reason: 'x' }),
        requestReturn(order._id, { items: [{ itemId: 'B', quantity: 1 }], reason: 'y' }),
    ]);
    assert.deepEqual(results.map((r) => r.status).sort(), [201, 409]);
});

test('approve books a reverse pickup; receive refunds once even when raced; seller sees it', async () => {
    const order = await makeOrder({ coins: 50 });
    const created = ok(await requestReturn(order._id, {
        items: [{ itemId: 'A', quantity: 1 }],
        reason: 'Wrong size',
        photos: ['https://cdn.example.com/a.jpg', 'javascript:alert(1)'],
    }), 'request', 201);
    assert.deepEqual(created.photos, ['https://cdn.example.com/a.jpg']);
    assert.equal(created.amounts.refundAmount, 255.79);

    assert.equal((await call('POST', `/admin/returns/${created._id}/receive`, { as: adminToken, body: {} })).status, 409, 'not approved yet');

    const approved = ok(await call('POST', `/admin/returns/${created._id}/approve`, { as: adminToken, body: { bookPickup: true } }), 'approve');
    assert.equal(approved.status, 'approved');
    assert.match(approved.reverseShipment.awb, /^RAWB/);
    assert.equal((await call('POST', `/admin/returns/${created._id}/approve`, { as: adminToken, body: {} })).status, 409);

    const before = rz.refunds.length;
    const race = await Promise.all([1, 2, 3].map(() => call('POST', `/admin/returns/${created._id}/receive`, { as: adminToken, body: {} })));
    assert.deepEqual(race.map((r) => r.status).sort(), [200, 409, 409]);
    assert.equal(rz.refunds.length - before, 1, 'one gateway refund');
    assert.equal(rz.refunds.at(-1).amount, 255.79);
    assert.equal((await call('POST', `/admin/returns/${created._id}/receive`, { as: adminToken, body: {} })).status, 409);

    const done = await ReturnRequest.findById(created._id).lean();
    assert.equal(done.status, 'refunded');
    assert.equal(done.refund.method, 'razorpay');
    assert.equal(done.openKey, undefined);

    const { CoinLedger } = await import('../src/modules/commerce/coins/models/coin.model.js');
    const reversal = await CoinLedger.findOne({ type: 'reversal', refId: `return:${created._id}:coins` }).lean();
    assert.equal(reversal.amount, 14);

    const saved = await Order.findById(order._id).lean();
    assert.equal(saved.payment.status, 'paid', 'a partial refund leaves the order paid');
    assert.equal(saved.payment.refund.amount, 255.79);

    // A second return for the rest of the order refunds separately.
    const second = ok(await requestReturn(order._id, { items: [{ itemId: 'B', quantity: 1 }], reason: 'Changed mind' }), 'second', 201);
    ok(await call('POST', `/admin/returns/${second._id}/approve`, { as: adminToken, body: {} }), 'approve 2');
    ok(await call('POST', `/admin/returns/${second._id}/receive`, { as: adminToken, body: {} }), 'receive 2');
    assert.equal(rz.refunds.length - before, 2);
    assert.equal((await Order.findById(order._id).lean()).payment.refund.amount, round2(255.79 + 341.05));

    const sellerList = ok(await call('GET', '/seller/returns', { as: sellerToken }), 'seller list');
    assert.ok(sellerList.data.some((r) => String(r._id) === String(created._id)));
    const adminList = ok(await call('GET', `/admin/returns?status=refunded&search=${order.order_id}`, { as: adminToken }), 'admin list');
    assert.equal(adminList.data.length, 2);
    assert.equal(adminList.data[0].sellerName, 'Courier Mart');
    const detail = ok(await call('GET', `/admin/returns/${created._id}`, { as: adminToken }), 'detail');
    assert.equal(detail.order.order_id, order.order_id);
});

const round2 = (n) => Math.round(n * 100) / 100;

test('reject needs a reason, frees the order for another request, and shows to the customer', async () => {
    const order = await makeOrder({ coins: 0 });
    const r = ok(await requestReturn(order._id, { items: [{ itemId: 'A', quantity: 2 }], reason: 'Faded' }), 'request', 201);
    assert.equal((await call('POST', `/admin/returns/${r._id}/reject`, { as: adminToken, body: {} })).status, 400);
    const rejected = ok(await call('POST', `/admin/returns/${r._id}/reject`, { as: adminToken, body: { reason: 'Worn' } }), 'reject');
    assert.equal(rejected.status, 'rejected');
    assert.equal((await call('POST', `/admin/returns/${r._id}/receive`, { as: adminToken, body: {} })).status, 409);

    const info = ok(await call('GET', `/orders/${order._id}/returns`, { as: userToken }), 'customer view');
    assert.equal(info.returns[0].status, 'rejected');
    assert.equal(info.returns[0].rejectionReason, 'Worn');
    assert.equal(info.eligible, true);
    assert.equal(info.items.find((i) => i.itemId === 'A').returnable, 2, 'rejected quantities are returnable again');
});

test('coins refund option credits refund coins; cash orders refund to the wallet', async () => {
    const { CoinLot } = await import('../src/modules/commerce/coins/models/coin.model.js');
    const walletPaid = await makeOrder({ method: 'wallet', coins: 0 });
    const r = ok(await requestReturn(walletPaid._id, { items: [{ itemId: 'B', quantity: 1 }], reason: 'x', refundTo: 'coins' }), 'request', 201);
    assert.equal(r.amounts.refundAmount, 360); // 400/1000 of 900
    ok(await call('POST', `/admin/returns/${r._id}/approve`, { as: adminToken, body: {} }), 'approve');
    const done = ok(await call('POST', `/admin/returns/${r._id}/receive`, { as: adminToken, body: {} }), 'receive');
    assert.equal(done.refund.method, 'coins');
    const lot = await CoinLot.findOne({ source: 'refund', refId: `return:${r._id}` }).lean();
    assert.equal(lot.amount, 360);
    assert.equal(lot.spendable, 288, 'refund coins carry the redeem percentage');

    const { getUserWallet } = await import('../src/modules/commerce/user/services/userWallet.service.js');
    const startBalance = (await getUserWallet(ids.user)).balance || 0;
    const cod = await makeOrder({ method: 'cash', coins: 0 });
    const c = ok(await requestReturn(cod._id, { items: [{ itemId: 'A', quantity: 1 }], reason: 'x' }), 'cod request', 201);
    ok(await call('POST', `/admin/returns/${c._id}/approve`, { as: adminToken, body: {} }), 'approve cod');
    const codDone = ok(await call('POST', `/admin/returns/${c._id}/receive`, { as: adminToken, body: {} }), 'receive cod');
    assert.equal(codDone.refund.method, 'wallet');
    assert.equal((await getUserWallet(ids.user)).balance - startBalance, 270);
});
