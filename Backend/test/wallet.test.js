import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { startDb, stopDb, clearDb } from './helpers/db.js';
import { UserWallet } from '../src/modules/commerce/user/models/userWallet.model.js';
import {
    deductWalletBalance,
    refundWalletBalance,
    creditCashback,
    creditReferralReward,
    getUserWallet
} from '../src/modules/commerce/user/services/userWallet.service.js';

before(startDb);
after(stopDb);
beforeEach(clearDb);

const newUser = () => new mongoose.Types.ObjectId();
const fund = (userId, balance) => UserWallet.create({ userId, balance, transactions: [] });

test('concurrent deductions cannot overdraw the wallet', async () => {
    const userId = newUser();
    await fund(userId, 100);

    const results = await Promise.allSettled(
        Array.from({ length: 10 }, (_, i) => deductWalletBalance(userId, 100, `order ${i}`))
    );

    assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
    const rejected = results.filter((r) => r.status === 'rejected');
    assert.equal(rejected.length, 9);
    assert.match(rejected[0].reason.message, /Insufficient wallet balance/);

    const wallet = await getUserWallet(userId);
    assert.equal(wallet.balance, 0);
    assert.equal(wallet.transactions.length, 1);
});

test('concurrent credits all land', async () => {
    const userId = newUser();
    await Promise.all(
        Array.from({ length: 20 }, () => refundWalletBalance(userId, 5, 'refund', { orderId: new mongoose.Types.ObjectId() }))
    );
    const wallet = await getUserWallet(userId);
    assert.equal(wallet.balance, 100);
    assert.equal(wallet.transactions.length, 20);
});

test('the first credit for a new user creates the wallet once, even when raced', async () => {
    const userId = newUser();
    await Promise.all(Array.from({ length: 5 }, () => creditReferralReward(userId, 10)));
    assert.equal(await UserWallet.countDocuments({ userId }), 1);
    const wallet = await getUserWallet(userId);
    assert.equal(wallet.balance, 50);
    assert.equal(wallet.referralEarnings, 50);
});

test('an order is refunded to the wallet only once', async () => {
    const userId = newUser();
    const orderId = new mongoose.Types.ObjectId();
    await Promise.all([
        refundWalletBalance(userId, 250, 'user cancel', { orderId }),
        refundWalletBalance(userId, 250, 'timeout cancel', { orderId })
    ]);
    const wallet = await getUserWallet(userId);
    assert.equal(wallet.balance, 250);
    assert.equal(wallet.transactions.length, 1);
});

test('cashback is credited once per order', async () => {
    const userId = newUser();
    const order = { _id: new mongoose.Types.ObjectId(), order_id: 'FOD-1' };
    const [a, b] = await Promise.all([creditCashback(userId, 20, order), creditCashback(userId, 20, order)]);
    assert.deepEqual([a, b].sort(), [false, true]);
    assert.equal((await getUserWallet(userId)).balance, 20);
});

test('interleaved credits and debits all apply', async () => {
    const userId = newUser();
    await fund(userId, 300);
    await Promise.all([
        deductWalletBalance(userId, 100, 'a'),
        refundWalletBalance(userId, 50, 'b', { orderId: new mongoose.Types.ObjectId() }),
        deductWalletBalance(userId, 100, 'c')
    ]);
    assert.equal((await getUserWallet(userId)).balance, 150);
});
