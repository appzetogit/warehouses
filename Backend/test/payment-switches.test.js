/**
 * ONLINE_PAYMENTS_ENABLED=false (only test keys configured): checkout offers
 * cash on delivery only, and an online checkout is refused with a clear message.
 */
import { test, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';

const { startApp, stopApp, tokenFor, call, ok } = await import('./helpers/app.js');
const { clearPaymentSwitchCache } = await import('../src/core/payments/paymentSwitches.js');
const { default: mongoose } = await import('mongoose');
let userToken;
let adminToken;
let db;

before(async () => {
    db = await startApp();
    const adminId = new mongoose.Types.ObjectId();
    await db.collection('admins').insertOne({ _id: adminId, email: 'pay_switch@example.com', role: 'ADMIN', adminType: 'super_admin', isActive: true });
    adminToken = tokenFor('ADMIN', adminId, { adminType: 'super_admin' });
    const { User } = await import('../src/core/users/user.model.js');
    const user = await User.create({ name: 'Buyer', phone: '9300000501', isActive: true });
    userToken = tokenFor('USER', user._id);
});

after(stopApp);

afterEach(async () => {
    delete process.env.ONLINE_PAYMENTS_ENABLED;
    await db.collection('businesssettings').updateMany({}, { $unset: { paymentSwitches: '' } });
    clearPaymentSwitchCache();
});

test('business settings say which ways to pay are on', async () => {
    process.env.ONLINE_PAYMENTS_ENABLED = 'false';
    const off = ok(await call('GET', '/settings/business'), 'settings');
    assert.deepEqual(off.payments, { online: false, cashOnDelivery: true });

    delete process.env.ONLINE_PAYMENTS_ENABLED;
    const on = ok(await call('GET', '/settings/business'), 'settings');
    assert.equal(on.payments.online, true);
});

test('an online checkout is refused while online payment is off', async () => {
    process.env.ONLINE_PAYMENTS_ENABLED = 'false';
    const res = await call('POST', '/orders/checkout', {
        as: userToken,
        body: {
            paymentMethod: 'razorpay',
            fulfilmentMode: 'standard',
            items: [{ itemId: '6ac8ba11b473070bb030fde4', quantity: 1, price: 100, name: 'Kurta' }],
            deliveryAddress: { name: 'Buyer', street: '12 Scheme 54', city: 'Indore', state: 'MP', zipCode: '452010', phone: '9300000501', location: { type: 'Point', coordinates: [75.9, 22.76] } },
        },
    });
    assert.equal(res.status, 400);
    assert.match(JSON.stringify(res.body), /Cash on Delivery/);
});

test('the admin switch overrides the server default and is read back', async () => {
    const off = ok(await call('PATCH', '/admin/payment-settings', { as: adminToken, body: { online: false } }), 'switch off');
    assert.equal(off.online, false);
    assert.equal(off.cashOnDelivery, true);
    assert.ok(['live', 'test', 'unknown'].includes(off.gateway.mode));
    assert.equal(typeof off.gateway.webhookConfigured, 'boolean');

    const settings = ok(await call('GET', '/settings/business'), 'settings');
    assert.deepEqual(settings.payments, { online: false, cashOnDelivery: true });
});

test('both ways to pay cannot be switched off', async () => {
    ok(await call('PATCH', '/admin/payment-settings', { as: adminToken, body: { online: false } }), 'switch off');
    const res = await call('PATCH', '/admin/payment-settings', { as: adminToken, body: { cashOnDelivery: false } });
    assert.equal(res.status, 400);
    assert.match(JSON.stringify(res.body), /at least one/i);
});

test('a non-boolean switch value is refused', async () => {
    const res = await call('PATCH', '/admin/payment-settings', { as: adminToken, body: { online: 'yes' } });
    assert.equal(res.status, 400);
});

test('payment settings need an admin', async () => {
    const res = await call('PATCH', '/admin/payment-settings', { as: userToken, body: { online: false } });
    assert.ok([401, 403].includes(res.status));
});
