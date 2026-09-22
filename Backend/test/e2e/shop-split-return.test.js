/**
 * Journey: a Shop order from two stores, delivered by courier, then returned.
 *
 * A customer far outside every zone (Indore) buys from two stores in one cart,
 * with a coupon and coins, and pays once online -> each store's order is
 * booked with the courier (the mock provider) -> tracked -> delivered -> the
 * customer returns one shirt -> admin approves (reverse pickup) -> receives
 * it. Outcomes: coupon and coins applied once across the cart, one charge,
 * Shop stock only; one refund for the returned line, to the card, even when
 * "received" is clicked twice at once; the unit goes back on the Shop shelf.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { installRazorpayMock } from './lib/razorpay.js';

process.env.SHIPPING_PROVIDER = 'mock';
const { rz, pay } = installRazorpayMock();
const {
    startApp, stopApp, call, ok, round2, createAdmin, createZone, createCustomer, onboardSeller, listProduct,
    productStock, orderDoc, ordersOfCheckout, addressAt, FAR_AWAY,
} = await import('./lib/harness.js');

let db;
let courier;
const w = {};

before(async () => {
    db = await startApp();
    const { MockShippingProvider } = await import('../../src/modules/commerce/delivery/services/shipping/mockShipping.provider.js');
    const { setShippingProvider } = await import('../../src/modules/commerce/delivery/services/shipping/index.js');
    courier = new MockShippingProvider();
    setShippingProvider(courier);

    w.admin = await createAdmin(db);
    w.zoneId = await createZone(w.admin);
    // Store A sells in both channels; store B ships only.
    w.a = await onboardSeller(w.admin, { name: 'Shirt Studio', zoneId: w.zoneId });
    w.b = await onboardSeller(w.admin, { name: 'Belt Barn', channels: ['shop'], pincode: '400001' });
    w.shirt = await listProduct(w.a, w.admin, {
        name: 'Poplin Shirt', channels: { quick: true, shop: true },
        variants: [
            { attributes: { Size: 'M', Colour: 'Blue' }, price: 999, stock: { quick: 4, shop: 10 }, images: ['https://cdn.example.com/poplin/m-blue.jpg'] },
            { attributes: { Size: 'L', Colour: 'Blue' }, price: 999, stock: { quick: 4, shop: 10 }, images: ['https://cdn.example.com/poplin/l-blue.jpg'] },
        ],
    });
    w.mBlue = w.shirt.variants.find((v) => v.name === 'M / Blue');
    w.belt = await listProduct(w.b, w.admin, { name: 'Leather Belt', price: 700, stock: { shop: 8 } });
    assert.deepEqual(w.belt.channels, { quick: false, shop: true });

    ok(await call('POST', '/admin/offers', {
        as: w.admin.as, body: { couponCode: 'SHOP200', discountType: 'flat-price', discountValue: 200, minOrderValue: 0 },
    }), 'admin creates coupon', 201);
    w.customer = await createCustomer(db, 'Indore Customer');
    ok(await call('POST', '/admin/coins/adjust', { as: w.admin.as, body: { userId: String(w.customer.id), amount: 300, reason: 'Loyalty' } }), 'grant coins');
});
after(stopApp);

const address = addressAt(FAR_AWAY, { city: 'Indore', state: 'MP', zipCode: '452010', phone: '9833300003' });
const cart = () => [
    { itemId: String(w.shirt._id), variantId: String(w.mBlue._id), sellerId: String(w.a.id), name: 'Poplin Shirt', price: 999, quantity: 2 },
    { itemId: String(w.belt._id), sellerId: String(w.b.id), name: 'Leather Belt', price: 700, quantity: 1 },
];
const body = (extra = {}) => ({ items: cart(), deliveryAddress: address, fulfilmentMode: 'standard', couponCode: 'SHOP200', coins: 300, ...extra });
const shirtStock = async () => (await productStock(w.shirt._id)).variants.find((v) => String(v._id) === String(w.mBlue._id)).stock;
const beltStock = async () => (await productStock(w.belt._id)).stock;

test('outside every zone, Quick is refused but the Shop cart prices with one coupon and capped coins', async () => {
    // Quick to Indore: the order is refused, and nothing it touched is kept.
    // The Quick quote is refused too, so the customer never sees a price they can't order.
    const quickQuote = await call('POST', '/orders/checkout/calculate', { as: w.customer.as, body: body({ fulfilmentMode: 'quick', items: [cart()[0]] }) });
    assert.equal(quickQuote.status, 400, 'no Quick quote outside zones');
    const quick = await call('POST', '/orders/checkout', {
        as: w.customer.as, body: body({ fulfilmentMode: 'quick', items: [cart()[0]], paymentMethod: 'cash' }),
    });
    assert.equal(quick.status, 400, 'no rider comes to Indore');
    assert.deepEqual(await shirtStock(), { quick: 4, shop: 10 }, 'no stock held');
    assert.equal(ok(await call('GET', '/user/coins/balance', { as: w.customer.as }), 'coins').usable, 300, 'coins given back');

    const quote = ok(await call('POST', '/orders/checkout/calculate', { as: w.customer.as, body: body() }), 'quote');
    assert.equal(quote.subtotal, 2698);
    assert.equal(quote.discount, 200, 'the coupon once for the cart');
    const shares = quote.childPricings.map((c) => c.couponShare);
    assert.equal(round2(shares[0] + shares[1]), 200);
    assert.ok(shares[0] > shares[1], 'shared by subtotal (1998 : 700)');
    const payable = round2(quote.grandTotal + quote.coinsDiscount);
    assert.equal(quote.coinsUsed, Math.min(300, Math.floor(payable * 0.5)));
    assert.equal(quote.coinsUsed, 300);
    w.quote = quote;
});

test('one online payment releases both stores; Shop stock only; coupon and coins used once', async () => {
    const placed = ok(await call('POST', '/orders/checkout', { as: w.customer.as, body: body({ paymentMethod: 'razorpay' }) }), 'checkout', 201);
    const { checkout, razorpay } = placed;
    assert.equal(checkout.pricing.grandTotal, w.quote.grandTotal);
    assert.equal(razorpay.amount, Math.round(w.quote.grandTotal * 100), 'one charge for the whole cart');
    let children = await ordersOfCheckout(checkout._id);
    assert.equal(children.length, 2);
    assert.ok(children.every((o) => o.orderStatus === 'pending_payment' && o.fulfilmentMode === 'standard'));

    ok(await call('POST', `/orders/checkout/${checkout.checkoutId}/verify-payment`, { as: w.customer.as, body: pay(razorpay.orderId) }), 'verify');
    children = await ordersOfCheckout(checkout._id);
    assert.ok(children.every((o) => o.orderStatus === 'created' && o.payment.status === 'paid'));
    assert.equal(round2(children.reduce((s, o) => s + o.pricing.total, 0)), w.quote.grandTotal, 'the stores\' totals add up to the charge');
    assert.equal(children.reduce((s, o) => s + o.coinsUsed, 0), 300);
    w.shirtOrder = children.find((o) => String(o.sellerId) === String(w.a.id));
    w.beltOrder = children.find((o) => String(o.sellerId) === String(w.b.id));

    assert.deepEqual(await shirtStock(), { quick: 4, shop: 8 }, 'shirts from the Shop shelf only');
    assert.equal((await beltStock()).shop, 7);

    const offers = ok(await call('GET', '/admin/offers', { as: w.admin.as }), 'offers');
    const list = offers.offers || offers.items || offers;
    assert.equal(list.find((o) => o.couponCode === 'SHOP200').usedCount, 1, 'coupon used once');
    const ledger = ok(await call('GET', '/user/coins/ledger', { as: w.customer.as }), 'ledger').entries;
    const debits = ledger.filter((e) => e.type === 'debit' && String(e.orderId) === String(checkout._id));
    assert.equal(debits.length, 1, 'coins taken once for this checkout');
    assert.equal(debits[0].amount, 300);
    // The refused Quick attempt is turned away before it touches coins: no debit or reversal for it.
    assert.equal(ledger.filter((e) => e.type === 'debit').length, 1);
    assert.equal(ledger.filter((e) => e.type === 'reversal').length, 0);
    assert.equal(ok(await call('GET', '/user/coins/balance', { as: w.customer.as }), 'coins').usable, 0);
});

test('each store confirms, the admin books the courier, tracking delivers both', async () => {
    for (const [seller, order] of [[w.a, w.shirtOrder], [w.b, w.beltOrder]]) {
        ok(await call('PATCH', `/seller/orders/${order._id}/status`, { as: seller.as, body: { orderStatus: 'confirmed' } }), 'seller confirms');
        const booked = ok(await call('POST', `/admin/shipments/${order._id}/book`, { as: w.admin.as }), 'book courier');
        assert.match(booked.shipment.awb, /^AWB/);
        assert.equal(booked.order.orderStatus, 'ready_for_pickup');
        order.awb = booked.shipment.awb;

        courier.setStatus(order.awb, 'in_transit', 'Left the hub');
        const moving = ok(await call('GET', `/admin/shipments/${order._id}/tracking`, { as: w.admin.as }), 'tracking');
        assert.equal(moving.tracking.currentStatus, 'in_transit');
        assert.equal(moving.orderDelivered, false);

        courier.setStatus(order.awb, 'delivered', 'Delivered to customer');
        const done = ok(await call('GET', `/admin/shipments/${order._id}/tracking`, { as: w.admin.as }), 'tracking delivered');
        assert.equal(done.orderDelivered, true);
        const saved = await orderDoc(order._id);
        assert.equal(saved.orderStatus, 'delivered');
        assert.equal(saved.shipment.status, 'delivered');
    }
    assert.notEqual(w.shirtOrder.awb, w.beltOrder.awb, 'one shipment per store');
});

test('a shirt comes back: approve, receive (twice at once) -> one refund to the card, one unit back on the Shop shelf', async () => {
    const order = w.shirtOrder;
    const info = ok(await call('GET', `/orders/${order._id}/returns`, { as: w.customer.as }), 'eligibility');
    assert.equal(info.eligible, true);

    const created = ok(await call('POST', `/orders/${order._id}/returns`, {
        as: w.customer.as, body: { items: [{ itemId: String(w.shirt._id), variantId: String(w.mBlue._id), quantity: 1 }], reason: 'Too tight' },
    }), 'request return', 201);
    // The line's share of what was paid for goods, less its share of the coins.
    const fresh = await orderDoc(order._id);
    const goodsPaid = fresh.pricing.subtotal - fresh.pricing.discount;
    const lineShare = (goodsPaid * 999) / fresh.pricing.subtotal;
    const coinsShare = (fresh.coinsUsed * lineShare) / (fresh.pricing.total + fresh.coinsUsed);
    assert.equal(created.amounts.itemsValue, 999);
    assert.ok(Math.abs(created.amounts.refundAmount - round2(lineShare - coinsShare)) <= 0.02,
        `refund ${created.amounts.refundAmount} vs expected ${round2(lineShare - coinsShare)}`);

    const approved = ok(await call('POST', `/admin/returns/${created._id}/approve`, { as: w.admin.as, body: { bookPickup: true } }), 'approve');
    assert.equal(approved.status, 'approved');
    assert.match(approved.reverseShipment.awb, /^RAWB/);
    assert.deepEqual(await shirtStock(), { quick: 4, shop: 8 }, 'not restocked until received');

    const refundsBefore = rz.refunds.length;
    const race = await Promise.all([1, 2].map(() => call('POST', `/admin/returns/${created._id}/receive`, { as: w.admin.as, body: {} })));
    assert.deepEqual(race.map((r) => r.status).sort(), [200, 409]);
    assert.equal(rz.refunds.length, refundsBefore + 1, 'refunded once');
    const refund = rz.refunds.at(-1);
    assert.equal(refund.amount, created.amounts.refundAmount);
    assert.equal(refund.paymentId, fresh.payment.razorpay.paymentId, 'to the card that paid');

    assert.deepEqual(await shirtStock(), { quick: 4, shop: 9 }, 'back on the Shop shelf, Quick untouched');
    const after = await orderDoc(order._id);
    assert.equal(after.payment.refund.amount, created.amounts.refundAmount);
    assert.equal(after.payment.status, 'paid', 'a partial return leaves the order paid');
    if (created.amounts.coinsBack > 0) {
        assert.equal(ok(await call('GET', '/user/coins/balance', { as: w.customer.as }), 'coins').usable, created.amounts.coinsBack, 'the coins share comes back');
    }

    const view = ok(await call('GET', `/orders/${order._id}/returns`, { as: w.customer.as }), 'customer view');
    assert.equal(view.returns[0].status, 'refunded');
    assert.equal(view.items.find((i) => i.variantId === String(w.mBlue._id)).returnable, 1, 'one shirt still returnable');
    assert.equal((await beltStock()).shop, 7, 'the other store is untouched');
});
