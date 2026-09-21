import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { startDb, stopDb, clearDb } from './helpers/db.js';
import { Category } from '../src/modules/commerce/admin/models/category.model.js';
import { Order } from '../src/modules/commerce/orders/models/order.model.js';
import { Checkout } from '../src/modules/commerce/orders/models/checkout.model.js';
import { SellerCommission } from '../src/modules/commerce/admin/models/sellerCommission.model.js';
import {
    getSellerCommissionSnapshot,
    clearCommissionCaches,
} from '../src/modules/commerce/orders/services/orderTransaction.service.js';
import { ShiprocketProvider } from '../src/modules/commerce/delivery/services/shipping/shiprocket.provider.js';
import { registerPaymentGateway } from '../src/core/payments/gateway/paymentGateway.js';
import { reconcilePayments } from '../src/core/payments/reconciliation.service.js';

before(startDb);
after(stopDb);
beforeEach(async () => {
    await clearDb();
    clearCommissionCaches();
});

const oid = () => new mongoose.Types.ObjectId();

// ---- commission -------------------------------------------------------------

test('commission: category rates apply per line, a child inherits its parent', async () => {
    const parent = oid();
    const child = oid();
    const own = oid();
    await Category.collection.insertMany([
        { _id: parent, name: 'Electronics', commissionPercent: 5 },
        { _id: child, name: 'Phones', parentId: parent, commissionPercent: null },
        { _id: own, name: 'Fashion', commissionPercent: 20 },
    ]);
    const order = {
        sellerId: oid(),
        pricing: { subtotal: 1500 },
        items: [
            { price: 1000, quantity: 1, categoryId: child }, // 5% of 1000
            { price: 250, quantity: 2, categoryId: own }, // 20% of 500
        ],
    };
    const snap = await getSellerCommissionSnapshot(order);
    assert.equal(snap.commissionAmount, 150);
    assert.equal(snap.commissionType, 'category');
});

test("commission: a seller's own rule outranks the category rates", async () => {
    const cat = oid();
    const sellerId = oid();
    await Category.collection.insertOne({ _id: cat, name: 'Fashion', commissionPercent: 20 });
    await SellerCommission.create({ sellerId, defaultCommission: { type: 'percentage', value: 8 } });
    const snap = await getSellerCommissionSnapshot({
        sellerId,
        pricing: { subtotal: 1000 },
        items: [{ price: 1000, quantity: 1, categoryId: cat }],
    });
    assert.equal(snap.commissionAmount, 80);
});

test('commission: a discounted subtotal lowers the base in proportion', async () => {
    const cat = oid();
    await Category.collection.insertOne({ _id: cat, name: 'Fashion', commissionPercent: 10 });
    const snap = await getSellerCommissionSnapshot({
        sellerId: oid(),
        pricing: { subtotal: 800 },
        items: [{ price: 1000, quantity: 1, categoryId: cat }],
    });
    assert.equal(snap.commissionAmount, 80);
});

// ---- Shiprocket -------------------------------------------------------------

function fakeShiprocket(routes) {
    const calls = [];
    const fetchImpl = async (url, opts = {}) => {
        const path = url.replace(/^https:\/\/[^/]+\/v1\/external/, '');
        calls.push({ path, method: opts.method, body: opts.body ? JSON.parse(opts.body) : null, auth: opts.headers?.Authorization });
        const key = Object.keys(routes).find((k) => path.startsWith(k));
        const body = key ? routes[key] : {};
        return { ok: true, status: 200, json: async () => body };
    };
    return { calls, fetchImpl };
}

test('shiprocket: creates the order, assigns an AWB, books a pickup, logs in once', async () => {
    const { calls, fetchImpl } = fakeShiprocket({
        '/auth/login': { token: 'tok' },
        '/orders/create/adhoc': { order_id: 991, shipment_id: 552 },
        '/courier/assign/awb': { response: { data: { awb_code: 'AWB123', courier_name: 'Delhivery' } } },
        '/courier/generate/pickup': { response: { pickup_token_number: 'PK1' } },
        '/courier/generate/label': { label_url: 'https://label' },
    });
    const sr = new ShiprocketProvider({ email: 'e', password: 'p', pickupLocation: 'WH1', fetchImpl });
    const out = await sr.createShipment({
        orderId: 'ORD1',
        customerName: 'Asha',
        customerPhone: '+91 98765 43210',
        deliveryAddress: { street: '1 MG Rd', city: 'Pune', state: 'MH', zipCode: '411001' },
        items: [{ name: 'Shirt', quantity: 2, price: 499 }],
        paymentMethod: 'razorpay',
    });

    assert.deepEqual(
        { awb: out.awb, courier: out.courierName, shipmentId: out.shipmentId, providerOrderId: out.providerOrderId, label: out.labelUrl },
        { awb: 'AWB123', courier: 'Delhivery', shipmentId: '552', providerOrderId: '991', label: 'https://label' },
    );
    assert.equal(calls.filter((c) => c.path === '/auth/login').length, 1);
    const adhoc = calls.find((c) => c.path === '/orders/create/adhoc').body;
    assert.equal(adhoc.pickup_location, 'WH1');
    assert.equal(adhoc.billing_phone, '9876543210');
    assert.equal(adhoc.payment_method, 'Prepaid');
    assert.equal(adhoc.sub_total, 998);
    assert.ok(calls.slice(1).every((c) => c.auth === 'Bearer tok'));
});

test('shiprocket: tracking maps the courier status to ours', async () => {
    const { fetchImpl } = fakeShiprocket({
        '/auth/login': { token: 'tok' },
        '/courier/track/awb/': {
            tracking_data: {
                shipment_track: [{ current_status: 'Out For Delivery' }],
                shipment_track_activities: [{ activity: 'Out for delivery', location: 'Pune', date: '2026-09-20 10:00:00' }],
            },
        },
    });
    const sr = new ShiprocketProvider({ email: 'e', password: 'p', fetchImpl });
    const t = await sr.trackShipment('AWB123');
    assert.equal(t.currentStatus, 'out_for_delivery');
    assert.equal(t.trackingEvents[0].location, 'Pune');
});

// ---- reconciliation ---------------------------------------------------------

test('reconciliation: flags amount mismatches, uncaptured and missing payments', async () => {
    const payments = {
        pay_ok: { amount: 500, status: 'captured' },
        pay_short: { amount: 450, status: 'captured' },
        pay_auth: { amount: 300, status: 'authorized' },
    };
    registerPaymentGateway({
        name: 'fake',
        isConfigured: () => true,
        fetchPayment: async (id) => ({ id, ...payments[id] }),
    });
    process.env.PAYMENT_GATEWAY = 'fake';
    try {
        await Checkout.collection.insertMany([
            { checkoutId: 'CK1', pricing: { grandTotal: 500 }, payment: { method: 'razorpay', status: 'paid', gatewayPaymentId: 'pay_ok' }, createdAt: new Date() },
            { checkoutId: 'CK2', pricing: { grandTotal: 500 }, payment: { method: 'razorpay', status: 'paid', gatewayPaymentId: 'pay_short' }, createdAt: new Date() },
        ]);
        await Order.collection.insertMany([
            { orderId: 'O1', checkoutId: null, pricing: { total: 300 }, payment: { method: 'razorpay', status: 'paid', amountDue: 300, razorpay: { paymentId: 'pay_auth' } }, createdAt: new Date() },
            { orderId: 'O2', checkoutId: null, pricing: { total: 200 }, payment: { method: 'razorpay', status: 'paid', amountDue: 200, razorpay: {} }, createdAt: new Date() },
            // A split checkout's child is checked through its checkout, not again here.
            { orderId: 'O3', checkoutId: 'CK1', pricing: { total: 250 }, payment: { method: 'razorpay', status: 'paid', razorpay: { paymentId: 'pay_ok' } }, createdAt: new Date() },
        ]);

        const report = await reconcilePayments();
        assert.equal(report.checked, 4);
        assert.deepEqual(report.summary, { ok: 1, amount_mismatch: 1, not_captured: 1, missing_payment_id: 1 });
        assert.equal(report.expectedTotal, 1500);
        assert.equal(report.capturedTotal, 1250);
    } finally {
        delete process.env.PAYMENT_GATEWAY;
    }
});
