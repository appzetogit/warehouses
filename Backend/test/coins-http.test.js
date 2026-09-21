import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { startApp, stopApp, tokenFor, call, ok } from './helpers/app.js';

let adminToken;
let userToken;
let userId;

before(async () => {
    const db = await startApp();
    const adminId = new mongoose.Types.ObjectId();
    userId = new mongoose.Types.ObjectId();

    await db.collection('admins').insertOne({
        _id: adminId,
        email: 'admin_coins@example.com',
        role: 'ADMIN',
        adminType: 'super_admin',
        isActive: true,
    });

    await db.collection('users').insertOne({
        _id: userId,
        phone: '9999988888',
        name: 'Coin Customer',
        role: 'USER',
        status: 'active',
    });

    adminToken = tokenFor('ADMIN', adminId, { adminType: 'super_admin' });
    userToken = tokenFor('USER', userId);
});

after(stopApp);

test('customer can get coin balance and ledger over HTTP', async () => {
    const balanceRes = await call('GET', '/user/coins/balance', { as: userToken });
    const balance = ok(balanceRes, 'get coin balance');
    assert.equal(balance.coins, 0);
    assert.equal(balance.usable, 0);

    const ledgerRes = await call('GET', '/user/coins/ledger', { as: userToken });
    const ledger = ok(ledgerRes, 'get coin ledger');
    assert.deepEqual(ledger.entries, []);
});

test('admin can manage coin settings, adjust coins, and view liability report', async () => {
    // 1. Get default settings
    const getSettings = ok(await call('GET', '/admin/coins/settings', { as: adminToken }), 'get settings');
    assert.equal(getSettings.redeemPercent, 80);
    assert.equal(getSettings.expiryDays, 90);

    // 2. Update settings
    const updated = ok(
        await call('PATCH', '/admin/coins/settings', { as: adminToken, body: { maxOrderPercent: 40 } }),
        'patch settings'
    );
    assert.equal(updated.maxOrderPercent, 40);

    // 3. Adjust coins for user
    const adjustRes = ok(
        await call('POST', '/admin/coins/adjust', {
            as: adminToken,
            body: { userId: String(userId), amount: 150, reason: 'Promotional welcome bonus' },
        }),
        'adjust coins'
    );
    assert.equal(adjustRes.adjusted, 150);

    // 4. Verify user balance updated
    const userBalance = ok(await call('GET', '/user/coins/balance', { as: userToken }), 'user balance after adjust');
    assert.equal(userBalance.coins, 150);
    assert.equal(userBalance.usable, 150);

    // 5. Admin report reflects issued coins
    const report = ok(await call('GET', '/admin/coins/report', { as: adminToken }), 'admin report');
    assert.equal(report.credited, 150);
    assert.equal(report.outstandingUsable, 150);

    // 6. Admin can inspect user ledger
    const userLedger = ok(
        await call('GET', `/admin/coins/users/${userId}/ledger`, { as: adminToken }),
        'inspect user ledger'
    );
    assert.equal(userLedger.entries.length, 1);
    assert.equal(userLedger.entries[0].amount, 150);
    assert.equal(userLedger.entries[0].note, 'Promotional welcome bonus');
});

test('unauthenticated or unauthorized access to coin endpoints is refused', async () => {
    const unauth = await call('GET', '/user/coins/balance');
    assert.equal(unauth.status, 401);

    const nonAdmin = await call('GET', '/admin/coins/settings', { as: userToken });
    assert.equal(nonAdmin.status, 403);
});
