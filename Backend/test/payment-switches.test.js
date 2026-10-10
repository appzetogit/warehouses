/**
 * ONLINE_PAYMENTS_ENABLED=false (only test keys configured): checkout offers
 * cash on delivery only, and an online checkout is refused with a clear message.
 */
import { test, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';

const { startApp, stopApp, tokenFor, call, ok } = await import('./helpers/app.js');
let userToken;

before(async () => {
    await startApp();
    const { User } = await import('../src/core/users/user.model.js');
    const user = await User.create({ name: 'Buyer', phone: '9300000501', isActive: true });
    userToken = tokenFor('USER', user._id);
});

after(stopApp);

afterEach(() => {
    delete process.env.ONLINE_PAYMENTS_ENABLED;
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
