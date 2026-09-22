/**
 * Harness for the end-to-end journeys and the load script's --local mode.
 *
 * The real app on a random port over an in-memory replica set, like
 * test/helpers/app.js, plus what a journey needs on top: request headers
 * (x-device-id), the base URL (for the load script), and builders that set up
 * a world through the HTTP API the way people would (admin creates the zone,
 * a seller registers, the admin approves...). Only what has no API is written
 * straight to Mongo: the admin account, customers and riders (they sign in by
 * OTP, which a test cannot receive).
 *
 * The app is imported lazily in startApp, so a test file can mock modules
 * (Razorpay) before any of it loads. Nothing here imports node:test, so a plain
 * Node script can use it.
 */
import assert from 'node:assert/strict';
import mongoose from 'mongoose';

process.env.JWT_ACCESS_SECRET ||= 'test-access-secret';
process.env.JWT_REFRESH_SECRET ||= 'test-refresh-secret';

const { startDb, stopDb } = await import('../../helpers/db.js');

let server;
let base;
let signAccessToken;

export async function startApp({ port = 0 } = {}) {
    await startDb();
    ({ signAccessToken } = await import('../../../src/core/auth/token.util.js'));
    const { default: app } = await import('../../../src/app.js');
    // Build every index now (text search, the unique keys races rely on)
    // rather than racing mongoose's background build.
    await Promise.all(Object.values(mongoose.models).map((m) => m.init().catch(() => {})));
    await new Promise((resolve) => { server = app.listen(port, resolve); });
    base = `http://127.0.0.1:${server.address().port}/api/v1`;
    return mongoose.connection.db;
}

export async function stopApp() {
    await new Promise((resolve) => (server ? server.close(resolve) : resolve()));
    server?.closeAllConnections?.();
    await stopDb();
}

export const baseUrl = () => base;
export const tokenFor = (role, id, extra = {}) => signAccessToken({ userId: String(id), role, ...extra });
export const oid = (id) => new mongoose.Types.ObjectId(String(id));

export async function call(method, path, { as, body, headers = {} } = {}) {
    const h = { 'content-type': 'application/json', ...headers };
    if (as) h.authorization = `Bearer ${as}`;
    const res = await fetch(`${base}${path}`, {
        method,
        headers: h,
        body: body === undefined ? undefined : JSON.stringify(body),
    });
    const json = await res.json().catch(() => null);
    return { status: res.status, body: json };
}

/** Fails with the server's message rather than a bare status mismatch. */
export function ok(res, what, status = 200) {
    assert.equal(res.status, status, `${what}: ${res.status} ${JSON.stringify(res.body)}`);
    return res.body?.data;
}

/** Polls until check() returns something truthy; some work runs after the response. */
export async function waitFor(check, what, ms = 10000) {
    const until = Date.now() + ms;
    for (;;) {
        const value = await check();
        if (value) return value;
        if (Date.now() > until) assert.fail(`timed out waiting for ${what}`);
        await new Promise((r) => setTimeout(r, 100));
    }
}

export const round2 = (n) => Math.round(n * 100) / 100;

// ---- the world -----------------------------------------------------------------

/** A square around central Bengaluru. */
export const ZONE = [
    { latitude: 12.90, longitude: 77.55 },
    { latitude: 12.90, longitude: 77.65 },
    { latitude: 13.00, longitude: 77.65 },
    { latitude: 13.00, longitude: 77.55 },
];
export const STORE_AT = { lat: 12.9716, lng: 77.5946 };
export const CUSTOMER_AT = { lat: 12.9352, lng: 77.6245 };
/** Indore: outside every zone. */
export const FAR_AWAY = { lat: 22.7196, lng: 75.8577 };

export function addressAt(at, extra = {}) {
    return {
        label: 'Home', name: 'Journey Customer', street: '1 Test Road', city: 'Bengaluru', state: 'KA', zipCode: '560001',
        phone: '9800000000', latitude: at.lat, longitude: at.lng,
        location: { type: 'Point', coordinates: [at.lng, at.lat] },
        ...extra,
    };
}

let seq = 0;
const uniquePhone = (prefix) => `${prefix}${String(Date.now() % 1e5).padStart(5, '0')}${String(++seq).padStart(3, '0')}`.slice(0, 10);

/** The admin account: there is no API that creates the first one. */
export async function createAdmin(db) {
    const id = new mongoose.Types.ObjectId();
    await db.collection('admins').insertOne({
        _id: id, email: `journey_admin_${id}@example.com`, role: 'ADMIN', adminType: 'super_admin', isActive: true,
    });
    return { id, as: tokenFor('ADMIN', id, { adminType: 'super_admin' }) };
}

export async function createZone(admin, name = 'Journey Zone') {
    const data = ok(await call('POST', '/admin/zones', {
        as: admin.as, body: { name, coordinates: ZONE, isActive: true },
    }), 'admin creates zone', 201);
    return (data.zone || data)._id;
}

/** A customer. Customers sign in by OTP, so the account is written directly. */
export async function createCustomer(db, name = 'Journey Customer') {
    const id = new mongoose.Types.ObjectId();
    const phone = uniquePhone('97');
    await db.collection('users').insertOne({ _id: id, name, phone, role: 'USER', isActive: true, status: 'active', createdAt: new Date() });
    return { id, phone, as: tokenFor('USER', id) };
}

/** An approved, online rider next to the store. */
export async function createRider(near = STORE_AT) {
    const { DeliveryPartner } = await import('../../../src/modules/commerce/delivery/models/deliveryPartner.model.js');
    const lat = near.lat + 0.002;
    const lng = near.lng + 0.002;
    const rider = await DeliveryPartner.create({
        name: 'Journey Rider', phone: uniquePhone('96'), status: 'approved', availabilityStatus: 'online',
        lastLat: lat, lastLng: lng, lastLocationAt: new Date(),
        lastLocation: { type: 'Point', coordinates: [lng, lat] },
    });
    return { id: rider._id, as: tokenFor('DELIVERY_PARTNER', rider._id) };
}

/**
 * A seller registers choosing `channels`, and the admin approves the account
 * and each channel, all over HTTP.
 */
export async function onboardSeller(admin, { name = 'Journey Store', channels = ['quick', 'shop'], zoneId, at = STORE_AT, pincode = '560001' } = {}) {
    const registered = ok(await call('POST', '/seller/register', {
        body: {
            sellerName: `${name} ${++seq}`, ownerName: 'Owner', ownerPhone: uniquePhone('95'),
            channels: channels.join(','), zoneId: zoneId ? String(zoneId) : '', pincode,
            addressLine1: '12 MG Road', city: 'Bengaluru', state: 'KA',
            latitude: String(at.lat), longitude: String(at.lng),
        },
    }), 'seller registers', 201);
    const id = registered._id;
    ok(await call('PATCH', `/admin/sellers/${id}/approve`, { as: admin.as, body: {} }), 'admin approves the account');
    let seller;
    for (const c of channels) {
        seller = ok(await call('PATCH', `/admin/sellers/${id}/channels/${c}`, { as: admin.as, body: { action: 'approve' } }), `admin approves ${c}`);
    }
    return { id, as: tokenFor('SELLER', id), registered, seller };
}

/** The seller lists a product and the admin approves it. */
export async function listProduct(seller, admin, body) {
    const created = ok(await call('POST', '/seller/products', { as: seller.as, body }), `seller creates ${body.name}`, 201).product;
    ok(await call('PATCH', `/admin/products/${created._id}/approve`, { as: admin.as, body: {} }), `admin approves ${body.name}`);
    return created;
}

export async function productStock(id) {
    const doc = await mongoose.connection.db.collection('products').findOne({ _id: oid(id) });
    return doc;
}

export const orderDoc = (id) => mongoose.connection.db.collection('orders').findOne({ _id: oid(id) });
export const ordersOfCheckout = (checkoutMongoId) => mongoose.connection.db.collection('orders').find({ checkoutId: oid(checkoutMongoId) }).sort({ _id: 1 }).toArray();

/** The seller takes an order from created to ready for pickup. */
export async function sellerPrepares(seller, orderId) {
    for (const orderStatus of ['confirmed', 'preparing', 'ready_for_pickup']) {
        ok(await call('PATCH', `/seller/orders/${orderId}/status`, { as: seller.as, body: { orderStatus } }), `seller -> ${orderStatus}`);
    }
}

/** A rider takes the offer and hands the order over with the customer's OTP. */
export async function riderDelivers(rider, customer, orderId) {
    const order = String(orderId);
    await waitFor(async () => {
        const res = await call('GET', '/delivery/orders/available', { as: rider.as });
        const list = res.body?.data?.data || [];
        return Array.isArray(list) && list.some((o) => String(o._id || o.id || o.orderMongoId) === order);
    }, 'the offer to reach the rider');
    ok(await call('PATCH', `/delivery/orders/${order}/accept`, { as: rider.as }), 'rider accepts');
    ok(await call('PATCH', `/delivery/orders/${order}/reached-pickup`, { as: rider.as }), 'reached pickup');
    ok(await call('PATCH', `/delivery/orders/${order}/confirm-pickup`, { as: rider.as, body: {} }), 'picked up');
    ok(await call('PATCH', `/delivery/orders/${order}/reached-drop`, { as: rider.as }), 'reached drop');
    const otp = ok(await call('GET', `/orders/${order}/drop-otp`, { as: customer.as }), 'customer reads OTP');
    const code = otp?.otp || otp?.handoverOtp || otp?.dropOtp;
    assert.ok(code, `an OTP for the customer: ${JSON.stringify(otp)}`);
    const wrong = await call('POST', `/delivery/orders/${order}/verify-drop-otp`, { as: rider.as, body: { otp: code === '0000' ? '1111' : '0000' } });
    assert.notEqual(wrong.status, 200, 'a wrong OTP is refused');
    ok(await call('POST', `/delivery/orders/${order}/verify-drop-otp`, { as: rider.as, body: { otp: String(code) } }), 'rider verifies OTP');
    ok(await call('PATCH', `/delivery/orders/${order}/complete`, { as: rider.as, body: {} }), 'rider completes');
}
