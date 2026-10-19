/**
 * Shiprocket credentials from the admin panel: saved without ever returning the
 * password, kept out of the public business settings, and used by the courier
 * code in place of the .env ones (falling back to them, then to the mock).
 */
import { test, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';

delete process.env.SHIPROCKET_EMAIL;
delete process.env.SHIPROCKET_PASSWORD;
delete process.env.SHIPPING_PROVIDER;

const { startApp, stopApp, tokenFor, call, ok } = await import('./helpers/app.js');
let db;
let shipping;
let adminToken;
let userToken;
const realFetch = globalThis.fetch;
const shiprocketCalls = [];

/** Answers Shiprocket's login and pickup list; other URLs go to the real fetch (the test app). */
const fakeShiprocket = async (url, opts = {}) => {
    const u = String(url);
    if (!u.startsWith('https://apiv2.shiprocket.in/')) return realFetch(url, opts);
    shiprocketCalls.push({ url: u, body: opts.body ? JSON.parse(opts.body) : null });
    const json = (status, body) => ({ ok: status < 400, status, json: async () => body });
    if (u.endsWith('/auth/login')) {
        const { email, password } = JSON.parse(opts.body);
        return email === 'api@shop.in' && password === 'right-pass' ? json(200, { token: 'tok' }) : json(400, { message: 'Invalid email and password combination' });
    }
    if (u.endsWith('/settings/company/pickup')) {
        return json(200, { data: { shipping_address: [{ pickup_location: 'Indore WH', pin_code: 452010, city: 'Indore' }] } });
    }
    return json(404, { message: 'not mocked' });
};

before(async () => {
    db = await startApp();
    // The app loads .env on start, which may force the mock courier for local development.
    delete process.env.SHIPPING_PROVIDER;
    delete process.env.SHIPROCKET_EMAIL;
    delete process.env.SHIPROCKET_PASSWORD;
    shipping = await import('../src/modules/commerce/delivery/services/shipping/index.js');
    globalThis.fetch = fakeShiprocket;
    const adminId = new mongoose.Types.ObjectId();
    await db.collection('admins').insertOne({ _id: adminId, email: 'ship_admin@example.com', role: 'ADMIN', adminType: 'super_admin', isActive: true });
    adminToken = tokenFor('ADMIN', adminId, { adminType: 'super_admin' });
    const userId = new mongoose.Types.ObjectId();
    await db.collection('users').insertOne({ _id: userId, name: 'U', phone: '9000000077', isActive: true });
    userToken = tokenFor('USER', userId);
});

afterEach(async () => {
    delete process.env.SHIPROCKET_EMAIL;
    delete process.env.SHIPROCKET_PASSWORD;
    shiprocketCalls.length = 0;
    await db.collection('businesssettings').updateMany({}, { $unset: { shiprocket: '' } });
    await shipping.refreshShippingConfig();
});

after(async () => {
    globalThis.fetch = realFetch;
    await stopApp();
});

const save = (body) => call('PUT', '/admin/shipping-settings', { as: adminToken, body });

test('with nothing configured the mock courier is used', async () => {
    const s = ok(await call('GET', '/admin/shipping-settings', { as: adminToken }), 'settings');
    assert.equal(s.active, 'mock');
    assert.equal(s.source, 'none');
    assert.equal(s.shiprocket.passwordSet, false);
});

test('saved credentials switch the courier to Shiprocket, and the password never comes back', async () => {
    const s = ok(await save({ email: 'api@shop.in', password: 'right-pass', pickupLocation: 'Indore WH', pickupPincode: '452010' }), 'save');
    assert.equal(s.active, 'shiprocket');
    assert.equal(s.source, 'admin');
    assert.equal(s.shiprocket.email, 'api@shop.in');
    assert.equal(s.shiprocket.passwordSet, true);
    assert.ok(!JSON.stringify(s).includes('right-pass'));

    const p = shipping.getShippingProvider();
    assert.equal(p.name, 'shiprocket');
    assert.equal(p.email, 'api@shop.in');
    assert.equal(p.pickupLocation, 'Indore WH');
    assert.equal(p.pickupPincode, '452010');

    const again = ok(await call('GET', '/admin/shipping-settings', { as: adminToken }), 'settings');
    assert.ok(!JSON.stringify(again).includes('right-pass'));
});

test('the public business settings never include the Shiprocket login', async () => {
    await save({ email: 'api@shop.in', password: 'right-pass', pickupLocation: 'Indore WH' });
    for (const as of [undefined, adminToken]) {
        const res = await call('GET', as ? '/admin/business-settings' : '/settings/business', { as });
        const text = JSON.stringify(res.body);
        assert.ok(!text.includes('right-pass'), 'no password');
        assert.ok(!text.includes('api@shop.in'), 'no API email');
        assert.ok(!text.includes('Indore WH'), 'no pickup nickname');
    }
});

test('saving without a password keeps the saved one; an empty one removes it', async () => {
    await save({ email: 'api@shop.in', password: 'right-pass' });
    const kept = ok(await save({ pickupLocation: 'Indore WH' }), 'save');
    assert.equal(kept.shiprocket.passwordSet, true);
    assert.equal(shipping.getShippingProvider().password, 'right-pass');

    const removed = ok(await save({ password: '' }), 'save');
    assert.equal(removed.shiprocket.passwordSet, false);
    assert.equal(removed.active, 'mock');
});

test('switching Shiprocket off goes back to the mock without losing the login', async () => {
    await save({ email: 'api@shop.in', password: 'right-pass' });
    const off = ok(await save({ enabled: false }), 'save');
    assert.equal(off.active, 'mock');
    assert.equal(off.shiprocket.passwordSet, true);
    const on = ok(await save({ enabled: true }), 'save');
    assert.equal(on.active, 'shiprocket');
});

test('the .env login applies until an admin saves one, then the admin one wins', async () => {
    process.env.SHIPROCKET_EMAIL = 'env@shop.in';
    process.env.SHIPROCKET_PASSWORD = 'env-pass';
    await shipping.refreshShippingConfig();
    assert.equal(shipping.getShippingProvider().email, 'env@shop.in');
    const s = ok(await call('GET', '/admin/shipping-settings', { as: adminToken }), 'settings');
    assert.equal(s.source, 'env');

    await save({ email: 'api@shop.in', password: 'right-pass' });
    assert.equal(shipping.getShippingProvider().email, 'api@shop.in');
});

test('test connection logs in and lists pickup locations without saving', async () => {
    const res = ok(await call('POST', '/admin/shipping-settings/test', { as: adminToken, body: { email: 'api@shop.in', password: 'right-pass' } }), 'test');
    assert.equal(res.ok, true);
    assert.deepEqual(res.pickupLocations, [{ nickname: 'Indore WH', pincode: '452010', city: 'Indore' }]);
    const s = ok(await call('GET', '/admin/shipping-settings', { as: adminToken }), 'settings');
    assert.equal(s.shiprocket.passwordSet, false, 'nothing was saved');
});

test('test connection reports a wrong password, and uses the saved one when left blank', async () => {
    const bad = await call('POST', '/admin/shipping-settings/test', { as: adminToken, body: { email: 'api@shop.in', password: 'wrong' } });
    assert.equal(bad.status, 400);
    assert.match(bad.body.message, /Invalid email and password/);

    await save({ email: 'api@shop.in', password: 'right-pass' });
    const good = await call('POST', '/admin/shipping-settings/test', { as: adminToken, body: { email: 'api@shop.in' } });
    assert.equal(good.status, 200);
});

test('bad input is refused', async () => {
    assert.equal((await save({ email: 'not-an-email' })).status, 400);
    assert.equal((await save({ pickupPincode: '1234' })).status, 400);
    assert.equal((await save({ enabled: 'yes' })).status, 400);
});

test('only admins can read or change shipping settings', async () => {
    assert.ok([401, 403].includes((await call('GET', '/admin/shipping-settings', { as: userToken })).status));
    assert.ok([401, 403].includes((await call('PUT', '/admin/shipping-settings', { as: userToken, body: { email: 'x@y.in' } })).status));
    assert.ok([401, 403].includes((await call('POST', '/admin/shipping-settings/test', {})).status));
});
