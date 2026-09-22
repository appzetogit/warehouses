/**
 * GET sweep: every read endpoint in the route snapshot, called as the audience
 * it is built for, must not answer 5xx. A 4xx is fine (validation, missing
 * query params, permissions); a 5xx is a crash the admin/seller/rider/customer
 * screens would show as "Failed to load ...".
 *
 * Routes with path params get seeded ids where the param name makes the
 * target obvious; the rest are skipped and listed.
 */
import { test, before, after, mock } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import mongoose from 'mongoose';

// Razorpay stays offline: the helper is the one door every caller uses.
mock.module(new URL('../src/modules/commerce/orders/helpers/razorpay.helper.js', import.meta.url).href, {
    namedExports: {
        isRazorpayConfigured: () => true,
        getRazorpayKeyId: () => 'rzp_test_key',
        getRazorpayInstance: () => { throw new Error('sweep uses stand-ins only'); },
        createRazorpayOrder: async (amount, currency = 'INR') => ({ id: 'order_sweep', amount, currency, status: 'created' }),
        fetchRazorpayOrder: async (id) => ({ id, status: 'created' }),
        createPaymentLink: async () => ({ id: 'plink_1', short_url: 'https://rzp.io/test' }),
        fetchRazorpayPaymentLink: async (id) => ({ id, status: 'created' }),
        verifyPaymentSignature: () => false,
        fetchRazorpayPayment: async () => null,
        initiateRazorpayRefund: async () => ({ success: true, refundId: 'rfnd_1', status: 'processed' }),
    },
});

const { startApp, stopApp, tokenFor, call } = await import('./helpers/app.js');

const ids = {};
const tokens = {};

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
    const { Category } = await import('../src/modules/commerce/admin/models/category.model.js');
    const { User } = await import('../src/core/users/user.model.js');
    const { DeliveryPartner } = await import('../src/modules/commerce/delivery/models/deliveryPartner.model.js');

    ids.admin = new mongoose.Types.ObjectId();
    await db.collection('admins').insertOne({
        _id: ids.admin, email: 'root@example.com', role: 'ADMIN', adminType: 'super_admin', isActive: true,
    });

    const zone = await Zone.create({ name: 'Sweep Zone', country: 'India', coordinates: ZONE, isActive: true });
    ids.zone = zone._id;
    const category = await Category.create({ name: 'Grocery' });
    ids.category = category._id;

    const seller = await Seller.create({ channels: { quick: { status: 'approved' }, shop: { status: 'approved' } },
        sellerName: 'Sweep Mart', ownerName: 'Owner', ownerPhone: '9200000001', phone: '9200000001',
        status: 'approved', isAcceptingOrders: true, zoneId: zone._id,
        location: { type: 'Point', coordinates: [SELLER_AT.lng, SELLER_AT.lat], latitude: SELLER_AT.lat, longitude: SELLER_AT.lng },
    });
    ids.seller = seller._id;

    const product = await Product.create({
        sellerId: seller._id, name: 'Milk 1L', price: 60, stock: { quick: 10 }, isAvailable: true,
        approvalStatus: 'approved', categoryId: category._id,
        variants: [{ name: '500ml', price: 32, attributes: [{ name: 'Size', value: '500ml' }] }],
    });
    ids.product = product._id;

    const user = await User.create({ name: 'Sweep Customer', phone: '9200000002', isActive: true });
    ids.user = user._id;

    const rider = await DeliveryPartner.create({
        name: 'Sweep Rider', phone: '9200000003', status: 'approved', availabilityStatus: 'online',
        lastLat: SELLER_AT.lat, lastLng: SELLER_AT.lng, lastLocationAt: new Date(),
        lastLocation: { type: 'Point', coordinates: [SELLER_AT.lng, SELLER_AT.lat] },
    });
    ids.rider = rider._id;

    tokens.admin = tokenFor('ADMIN', ids.admin, { adminType: 'super_admin' });
    tokens.seller = tokenFor('SELLER', ids.seller);
    tokens.rider = tokenFor('DELIVERY_PARTNER', ids.rider);
    tokens.customer = tokenFor('USER', ids.user);

    // One real order, placed through the API so every derived record exists.
    const placed = await call('POST', '/orders', {
        as: tokens.customer,
        body: {
            sellerId: String(ids.seller),
            items: [{ itemId: String(ids.product), variantId: String(product.variants[0]._id), name: 'Milk 1L', price: 32, quantity: 1 }],
            address: { label: 'Home', street: '1 Test Road', city: 'Bengaluru', state: 'KA', latitude: CUSTOMER_AT.lat, longitude: CUSTOMER_AT.lng },
            pricing: { subtotal: 32, total: 32 },
            paymentMethod: 'cash', zoneId: String(ids.zone),
        },
    });
    const order = placed.body?.data?.order;
    assert.ok(order, `seed order placed: ${placed.status} ${JSON.stringify(placed.body)}`);
    ids.order = order.order_id || order.orderId || order._id || order.id;
    ids.orderMongo = order._id || order.id;
    const checkout = await db.collection('checkouts').findOne({});
    ids.checkout = checkout?._id;
});

after(stopApp);

/** Who calls a path. */
function audience(path) {
    if (path.startsWith('/admin') || path.startsWith('/payments/admin') || path === '/catalog/search/categories/admin') return 'admin';
    if (path.startsWith('/seller') || path.startsWith('/payments/seller')) return 'seller';
    if (path.startsWith('/delivery') || path.startsWith('/payments/delivery')) return 'rider';
    if (/^\/(user|orders|payments|notifications|chat|fcm-tokens|auth)(\/|$)/.test(path)) return 'customer';
    return null;
}

/** A seeded id for a param, or undefined when the name doesn't say. */
function paramValue(path, name) {
    switch (name) {
        case 'orderId': return ids.order;
        case 'userId': return ids.user;
        case 'sellerId': return ids.seller;
        case 'deliveryPartnerId': return ids.rider;
        case 'checkoutId': return ids.checkout;
        case 'key': return 'about';
        case 'number': return 'KA01AB1234';
        case 'id':
            if (/^\/admin\/sellers\/:id/.test(path) || /^\/catalog\/stores\/:id/.test(path) || path === '/seller-detail/:id') return ids.seller;
            if (/^\/admin\/customers\/:id/.test(path)) return ids.user;
            if (/^\/admin\/delivery\/:id$/.test(path)) return ids.rider;
            if (/^\/admin\/zones\/:id/.test(path)) return ids.zone;
            if (/^\/admin\/sub-admins\/:id/.test(path)) return ids.admin;
            if (/^\/catalog\/products\/:id/.test(path)) return ids.product;
            if (/^\/catalog\/categories\/:id/.test(path)) return ids.category;
            return undefined;
        default: return undefined;
    }
}

// Deliberate 503s: the route reports missing deployment config, not a crash.
const EXPECTED_503 = new Set(['/.well-known/assetlinks.json']);

const snapshot = fs.readFileSync(new URL('./fixtures/routes.txt', import.meta.url), 'utf8')
    .split('\n').map((l) => l.trim()).filter((l) => l.startsWith('GET '))
    .map((l) => l.slice(4));

test('every GET route answers without a 5xx for its audience', async () => {
    const failures = [];
    const skipped = [];
    let swept = 0;

    for (const full of snapshot) {
        const isApi = full.startsWith('/api/v1');
        let path = isApi ? full.slice('/api/v1'.length) || '/' : full;
        const who = isApi ? audience(path) : null;
        const params = [...path.matchAll(/:(\w+)/g)].map((m) => m[1]);
        let missing = false;
        for (const p of params) {
            const v = paramValue(path, p);
            if (v === undefined || v === null) { missing = true; break; }
            path = path.replace(`:${p}`, encodeURIComponent(String(v)));
        }
        if (missing) { skipped.push(full); continue; }

        swept++;
        // Root-level routes (health, deep links) live outside /api/v1.
        const req = isApi ? call('GET', path, { as: who ? tokens[who] : undefined }) : rootGet(path);
        const res = await withTimeout(req, 15000);
        if (res.status >= 500 && !(res.status === 503 && EXPECTED_503.has(full))) {
            failures.push({ route: full, as: who || 'public', status: res.status, message: res.body?.message || JSON.stringify(res.body)?.slice(0, 160) });
        }
    }

    console.log(`\nGET sweep: ${swept} called, ${skipped.length} skipped (unknown params):`);
    for (const s of skipped) console.log(`  skip ${s}`);
    if (failures.length) {
        console.log('\n5xx responses:');
        console.table(failures);
    }
    assert.deepEqual(failures, [], `${failures.length} GET routes answered 5xx`);
});

/** GET a path outside /api/v1 on the same server. */
async function rootGet(path) {
    // call() prefixes /api/v1; climb out of it.
    return call('GET', `/../..${path}`);
}

/** A route that never answers is as broken as a 5xx. */
function withTimeout(promise, ms) {
    let timer;
    const timeout = new Promise((resolve) => {
        timer = setTimeout(() => resolve({ status: 599, body: { message: `no response in ${ms}ms` } }), ms);
    });
    return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}
