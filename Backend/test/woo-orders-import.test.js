import test from 'node:test';
import assert from 'node:assert/strict';
import { customersFromOrders, lineAttributes, mapOrder, mapStatus, phone10, stateName } from '../scripts/lib/woo-orders-import.mjs';

const order = (extra = {}) => ({
    id: 18946, status: 'wc-completed', currency: 'INR', total: '297.82000000', tax: '0.00000000',
    customerId: '0', email: 'riya@example.com', createdAtGmt: '2026-09-11 10:15:00', updatedAtGmt: '2026-09-14 08:00:00',
    paymentMethod: 'razorpay', paymentMethodTitle: 'Razorpay', transactionId: 'pay_ABC', customerNote: '',
    dateCompletedGmt: '2026-09-14 07:59:00', shippingTotal: '49',
    billing: { first_name: 'Riya', last_name: 'Sharma', address_1: '12 Scheme 54', address_2: '', city: 'Indore', state: 'MP', postcode: '452010', phone: '+91 98765-43210', email: 'riya@example.com' },
    shipping: { first_name: '', last_name: '', address_1: '', city: '', state: '', postcode: '' },
    items: [
        { type: 'line_item', name: 'Tiny Heart Pearl Station Necklace &#8211; The Warehousess', productId: '19001', qty: '1', lineSubtotal: '319', lineTotal: '248.82', attrs: { pa_size: 'free-size' } },
        { type: 'shipping', name: 'Flat rate', cost: '49' },
        { type: 'coupon', name: 'roshni22', discount: '70.18' },
    ],
    meta: {},
    ...extra,
});

const product = { _id: 'p1', image: '/uploads/x.webp', categoryName: 'Neckpieces', variants: [{ _id: 'v1', attributes: [{ name: 'Size', value: 'Free Size' }] }] };

test('phone numbers become the 10 digits people sign in with', () => {
    assert.equal(phone10('+91 98765-43210'), '9876543210');
    assert.equal(phone10('09876543210'), '9876543210');
    assert.equal(phone10('12345'), '');
});

test('state codes become names', () => {
    assert.equal(stateName('MP'), 'Madhya Pradesh');
    assert.equal(stateName('Gujarat'), 'Gujarat');
});

test('statuses: completed and old processing are delivered, cancelled and refunded are cancelled', () => {
    assert.equal(mapStatus('wc-completed').orderStatus, 'delivered');
    assert.equal(mapStatus('wc-processing').orderStatus, 'delivered');
    assert.match(mapStatus('wc-processing').note, /Processing/);
    assert.equal(mapStatus('wc-cancelled').orderStatus, 'cancelled_by_admin');
    assert.equal(mapStatus('wc-refunded').refunded, true);
    assert.equal(mapStatus('wc-on-hold').orderStatus, 'cancelled_by_admin');
});

test('line sizes are tidied like the catalogue', () => {
    assert.deepEqual(lineAttributes({ pa_size: 'free-size' }), [{ name: 'Size', value: 'Free Size' }]);
    assert.deepEqual(lineAttributes({ size: 'xl', pa_size: 'xl', seller_id: '3' }), [{ name: 'Size', value: 'XL' }]);
});

test('an order maps with its product, size, coupon, delivery and payment', () => {
    const o = mapOrder(order(), { userId: 'u1', sellerId: 's1', productFor: (id) => (id === '19001' ? product : null) });
    assert.equal(o.order_id, 'WH-18946');
    assert.equal(o.orderStatus, 'delivered');
    assert.equal(o.fulfilmentMode, 'standard');
    assert.deepEqual(o.items.map((i) => [i.itemId, i.name, i.variantId, i.variantName, i.price, i.quantity]), [['p1', 'Tiny Heart Pearl Station Necklace', 'v1', 'Free Size', 319, 1]]);
    assert.deepEqual(o.pricing, { subtotal: 319, tax: 0, deliveryFee: 49, discount: 70.18, couponCode: 'ROSHNI22', total: 297.82, currency: 'INR' });
    assert.deepEqual(o.payment, { method: 'razorpay', status: 'paid', razorpay: { paymentId: 'pay_ABC' } });
    assert.equal(o.deliveryAddress.street, '12 Scheme 54');
    assert.equal(o.deliveryAddress.state, 'Madhya Pradesh');
    assert.equal(o.customerPhone, '9876543210');
    assert.equal(o.createdAt.toISOString(), '2026-09-11T10:15:00.000Z');
    assert.deepEqual(o.legacy, { source: 'woocommerce', orderId: 18946, status: 'wc-completed' });
});

test('a product no longer sold keeps its name and price on the order', () => {
    const o = mapOrder(order(), { userId: 'u1', sellerId: 's1' });
    assert.equal(o.items[0].itemId, 'woo-19001');
    assert.equal(o.items[0].variantId, '');
});

test('cancelled and refunded orders carry the reason and payment outcome', () => {
    const cancelled = mapOrder(order({ status: 'wc-cancelled', transactionId: '' }), {});
    assert.equal(cancelled.orderStatus, 'cancelled_by_admin');
    assert.equal(cancelled.payment.status, 'failed');
    assert.equal(cancelled.cancellationReason, 'Cancelled on the old website');

    const refunded = mapOrder(order({ status: 'wc-refunded', paymentMethod: 'cod' }), {});
    assert.equal(refunded.payment.method, 'cash');
    assert.equal(refunded.payment.status, 'refunded');
    assert.equal(refunded.payment.refund.amount, 297.82);
});

test('a cash order with a discount fee counts it as a discount', () => {
    const o = mapOrder(order({ paymentMethod: 'cod', items: [
        { type: 'line_item', name: 'Corset Top', productId: '1', qty: '1', lineSubtotal: '799', lineTotal: '799', attrs: {} },
        { type: 'fee', name: '₹80 Discount', lineTotal: '-80' },
        { type: 'shipping', name: 'Flat rate', cost: '49' },
    ] }), {});
    assert.equal(o.pricing.discount, 80);
    assert.equal(o.payment.status, 'paid');
});

test('one customer per phone, keeping the latest name and email', () => {
    const list = customersFromOrders([
        order({ createdAtGmt: '2026-06-01 00:00:00', billing: { first_name: 'R', last_name: '', phone: '9876543210', email: '' } }),
        order(),
        order({ billing: { first_name: 'No', phone: '' } }),
    ]);
    assert.equal(list.length, 1);
    assert.deepEqual([list[0].phone, list[0].name, list[0].email, list[0].orders], ['9876543210', 'Riya Sharma', 'riya@example.com', 2]);
});
