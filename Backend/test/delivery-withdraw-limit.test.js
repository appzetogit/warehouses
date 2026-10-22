/**
 * Rider withdrawals are capped per request at an admin-set share of the
 * CURRENT wallet balance (default 10%), floored to the paisa. The wallet
 * reports that cap as maxWithdrawable; the existing minimum still applies.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';

const { startApp, stopApp, tokenFor, call, ok } = await import('./helpers/app.js');

let db;
let adminToken;
let seq = 0;
let lastRiderId;

before(async () => {
    db = await startApp();
    const adminId = new mongoose.Types.ObjectId();
    await db.collection('admins').insertOne({ _id: adminId, email: 'withdraw_cap@example.com', role: 'ADMIN', adminType: 'super_admin', isActive: true });
    adminToken = tokenFor('ADMIN', adminId, { adminType: 'super_admin' });
    // A low minimum so the share cap is what the tests exercise.
    ok(await setSettings({ deliveryWithdrawalLimit: 10 }), 'set minimum');
});
after(stopApp);

const setSettings = (body) => call('PATCH', '/admin/delivery-cash-limit', { as: adminToken, body });

/** An approved rider whose wallet holds `balance` rupees. */
async function rider(balance) {
    seq += 1;
    const _id = new mongoose.Types.ObjectId();
    await db.collection('delivery_partners').insertOne({
        _id,
        name: `Rider ${seq}`,
        phone: `90000${String(10000 + seq).slice(-5)}`,
        status: 'approved',
        vehicleNumber: `MH14WD${1000 + seq}`,
        bankAccountNumber: '123456789012',
        bankIfscCode: 'SBIN0012345',
        createdAt: new Date(),
        updatedAt: new Date(),
    });
    await db.collection('delivery_wallets').insertOne({ deliveryPartnerId: _id, balance, lockedAmount: 0 });
    lastRiderId = _id;
    return tokenFor('DELIVERY_PARTNER', _id);
}

const wallet = async (token) => ok(await call('GET', '/delivery/wallet', { as: token }), 'wallet').wallet;
const withdraw = (token, amount) => call('POST', '/delivery/wallet/withdraw', { as: token, body: { amount } });

test('balance 571 → maxWithdrawable 57.10 at the default 10%', async () => {
    const t = await rider(571);
    const w = await wallet(t);
    assert.equal(w.pocketBalance, 571);
    assert.equal(w.withdrawalMaxPercent, 10);
    assert.equal(w.maxWithdrawable, 57.1);
    // Existing fields are still there.
    for (const key of ['totalBalance', 'cashInHand', 'totalWithdrawn', 'pendingWithdrawals', 'lockedAmount', 'deliveryWithdrawalLimit', 'transactions']) {
        assert.ok(key in w, `wallet keeps ${key}`);
    }
});

test('57.11 is rejected with the share message; 57.10 is accepted', async () => {
    const t = await rider(571);
    const over = await withdraw(t, 57.11);
    assert.equal(over.status, 400);
    assert.equal(over.body.message, 'You can withdraw up to 10% of your wallet balance (₹57.10) at a time.');

    const okRes = ok(await withdraw(t, 57.1), 'withdraw 57.10', 201);
    assert.equal(okRes.withdrawal.amount, 57.1);
    assert.equal(okRes.withdrawal.status, 'pending');
});

test('a second withdrawal is capped at 10% of the new balance', async () => {
    const t = await rider(571);
    ok(await withdraw(t, 57.1), 'first', 201);

    const w = await wallet(t);
    assert.equal(Math.round(w.pocketBalance * 100), 51390); // 571 - 57.10
    assert.equal(w.maxWithdrawable, 51.39);

    const over = await withdraw(t, 51.4);
    assert.equal(over.status, 400);
    assert.match(over.body.message, /up to 10% of your wallet balance \(₹51\.39\)/);
    ok(await withdraw(t, 51.39), 'second', 201);
});

test('two requests at once cannot both take the same balance', async () => {
    const t = await rider(571);
    const results = await Promise.all([withdraw(t, 57.1), withdraw(t, 57.1)]);
    assert.deepEqual(results.map((r) => r.status).sort(), [201, 400]);
    const pending = await db.collection('delivery_withdrawals').countDocuments({ deliveryPartnerId: lastRiderId });
    assert.equal(pending, 1);
});

test('admin can change the percent and it applies', async () => {
    const got = ok(await call('GET', '/admin/delivery-cash-limit', { as: adminToken }), 'get settings');
    assert.equal(got.deliveryWithdrawalMaxPercent, 10);

    const saved = ok(await setSettings({ deliveryWithdrawalMaxPercent: 25 }), 'set 25%');
    assert.equal(saved.deliveryWithdrawalMaxPercent, 25);
    assert.equal(saved.deliveryWithdrawalLimit, 10, 'other limits untouched');

    for (const bad of [0, 101, 'abc', '']) {
        const res = await setSettings({ deliveryWithdrawalMaxPercent: bad });
        assert.equal(res.status, 400, `rejects ${JSON.stringify(bad)}`);
    }

    try {
        const t = await rider(571);
        const w = await wallet(t);
        assert.equal(w.withdrawalMaxPercent, 25);
        assert.equal(w.maxWithdrawable, 142.75);
        const over = await withdraw(t, 142.76);
        assert.equal(over.status, 400);
        assert.equal(over.body.message, 'You can withdraw up to 25% of your wallet balance (₹142.75) at a time.');
        ok(await withdraw(t, 142.75), 'withdraw 25%', 201);
    } finally {
        ok(await setSettings({ deliveryWithdrawalMaxPercent: 10 }), 'restore 10%');
    }
});

test('the minimum withdrawal check still applies first', async () => {
    ok(await setSettings({ deliveryWithdrawalLimit: 100 }), 'minimum 100');
    try {
        const t = await rider(571);
        const below = await withdraw(t, 57.1);
        assert.equal(below.status, 400);
        assert.equal(below.body.message, 'Minimum withdrawal amount is ₹100');

        // Above the balance is still "insufficient", ahead of the share cap.
        const tooMuch = await withdraw(t, 600);
        assert.equal(tooMuch.status, 400);
        assert.equal(tooMuch.body.message, 'Insufficient balance for this withdrawal');

        const invalid = await withdraw(t, 0);
        assert.equal(invalid.status, 400);
        assert.equal(invalid.body.message, 'Invalid amount');
    } finally {
        ok(await setSettings({ deliveryWithdrawalLimit: 10 }), 'restore minimum');
    }
});

test('an empty wallet can withdraw nothing', async () => {
    const t = await rider(0);
    const w = await wallet(t);
    assert.equal(w.maxWithdrawable, 0);
    const res = await withdraw(t, 10);
    assert.equal(res.status, 400);
    assert.equal(res.body.message, 'Insufficient balance for this withdrawal');
});
