import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { startDb, stopDb, clearDb } from './helpers/db.js';
import { CoinLot, CoinLedger } from '../src/modules/commerce/coins/models/coin.model.js';
import {
    creditCoins,
    getCoinBalance,
    getRedeemableForOrder,
    redeemCoins,
    reverseRedemption,
    adjustCoins,
    expireDueLots,
    getCoinReport,
    updateCoinSettings,
} from '../src/modules/commerce/coins/services/coin.service.js';

before(async () => {
    await startDb();
    await Promise.all([CoinLot.init(), CoinLedger.init()]);
});
after(stopDb);
beforeEach(async () => {
    await clearDb();
    await updateCoinSettings({ isEnabled: true, redeemPercent: 80, expiryDays: 90, maxOrderPercent: 50, coinValue: 1 });
});

const newId = () => new mongoose.Types.ObjectId();
const DAY = 24 * 60 * 60 * 1000;

test('a 1,000-coin refund holds 1,000 coins of which 800 can be spent', async () => {
    const user = newId();
    await creditCoins({ userId: user, amount: 1000, source: 'refund', refId: 'refund-1' });
    const balance = await getCoinBalance(user);
    assert.equal(balance.coins, 1000);
    assert.equal(balance.usable, 800);
    assert.equal(balance.usableValue, 800);
});

test('rewards and admin grants are spendable in full', async () => {
    const user = newId();
    await creditCoins({ userId: user, amount: 100, source: 'spin', refId: 'spin-1' });
    await adjustCoins({ userId: user, amount: 50, reason: 'goodwill', actorId: 'admin1' });
    assert.equal((await getCoinBalance(user)).usable, 150);
});

test('coins pay at most half of an order', async () => {
    const user = newId();
    await creditCoins({ userId: user, amount: 1000, source: 'refund', refId: 'r' });
    assert.deepEqual(await getRedeemableForOrder(user, 1000), { coins: 500, value: 500 });
    assert.deepEqual(await getRedeemableForOrder(user, 3000), { coins: 800, value: 800 }, 'capped by what is usable');
    await updateCoinSettings({ isEnabled: false });
    assert.deepEqual(await getRedeemableForOrder(user, 3000), { coins: 0, value: 0 });
});

test('a refund retried is credited once', async () => {
    const user = newId();
    await Promise.all([
        creditCoins({ userId: user, amount: 200, source: 'refund', refId: 'refund-x' }),
        creditCoins({ userId: user, amount: 200, source: 'refund', refId: 'refund-x' }),
    ].map((p) => p.catch((e) => e)));
    assert.equal((await getCoinBalance(user)).coins, 200);
    assert.equal(await CoinLedger.countDocuments({ userId: user, type: 'credit' }), 1);
});

test('spending takes from the lot that expires first', async () => {
    const user = newId();
    const later = await creditCoins({ userId: user, amount: 100, source: 'spin', refId: 'a', expiresAt: new Date(Date.now() + 30 * DAY) });
    const sooner = await creditCoins({ userId: user, amount: 100, source: 'spin', refId: 'b', expiresAt: new Date(Date.now() + 5 * DAY) });

    await redeemCoins({ userId: user, orderId: newId(), coins: 120 });

    assert.equal((await CoinLot.findById(sooner.lot._id)).used, 100);
    assert.equal((await CoinLot.findById(later.lot._id)).used, 20);
});

test('orders spending at the same moment cannot spend the same coins', async () => {
    const user = newId();
    await creditCoins({ userId: user, amount: 300, source: 'spin', refId: 'c' });

    const results = await Promise.allSettled(
        Array.from({ length: 10 }, () => redeemCoins({ userId: user, orderId: newId(), coins: 100 }))
    );

    assert.equal(results.filter((r) => r.status === 'fulfilled').length, 3);
    assert.match(results.find((r) => r.status === 'rejected').reason.message, /Not enough coins/);
    assert.equal((await getCoinBalance(user)).usable, 0);
});

test('an order redeems once, however often checkout is retried', async () => {
    const user = newId();
    const order = newId();
    await creditCoins({ userId: user, amount: 500, source: 'spin', refId: 'd' });

    const results = await Promise.all(
        Array.from({ length: 4 }, () => redeemCoins({ userId: user, orderId: order, coins: 100 }))
    );

    assert.ok(results.every((r) => r.redeemed === 100));
    assert.equal((await getCoinBalance(user)).usable, 400);
    assert.equal(await CoinLedger.countDocuments({ orderId: order, type: 'debit' }), 1);
});

test('a cancelled order gets its coins back once, into the lots they came from', async () => {
    const user = newId();
    const order = newId();
    await creditCoins({ userId: user, amount: 1000, source: 'refund', refId: 'e' });
    await redeemCoins({ userId: user, orderId: order, coins: 300 });
    assert.equal((await getCoinBalance(user)).usable, 500);

    const results = await Promise.all([reverseRedemption(order), reverseRedemption(order)]);
    assert.deepEqual(results.map((r) => r.reversed).sort(), [0, 300]);
    const balance = await getCoinBalance(user);
    assert.equal(balance.usable, 800);
    assert.equal(balance.coins, 1000);
});

test('coins returned after their lot expired come back as a fresh lot', async () => {
    const user = newId();
    const order = newId();
    const { lot } = await creditCoins({ userId: user, amount: 100, source: 'spin', refId: 'f' });
    await redeemCoins({ userId: user, orderId: order, coins: 60 });
    await CoinLot.updateOne({ _id: lot._id }, { $set: { expiresAt: new Date(Date.now() - 1000) } });

    await reverseRedemption(order);

    const balance = await getCoinBalance(user);
    assert.equal(balance.usable, 60, 'the 60 spent come back; the 40 left on the expired lot do not');
    assert.equal(await CoinLot.countDocuments({ userId: user, source: 'reversal' }), 1);
});

test('expired lots stop counting and are recorded once', async () => {
    const user = newId();
    const { lot } = await creditCoins({ userId: user, amount: 1000, source: 'refund', refId: 'g' });
    await redeemCoins({ userId: user, orderId: newId(), coins: 300 });
    await CoinLot.updateOne({ _id: lot._id }, { $set: { expiresAt: new Date(Date.now() - 1000) } });

    assert.equal((await getCoinBalance(user)).usable, 0);
    assert.deepEqual(await expireDueLots(), { expired: 1 });
    assert.deepEqual(await expireDueLots(), { expired: 0 });
    const entry = await CoinLedger.findOne({ userId: user, type: 'expire' }).lean();
    assert.equal(entry.amount, 700, 'everything not spent, including the unredeemable 200');
});

test('an admin removal needs a reason and enough usable coins', async () => {
    const user = newId();
    await creditCoins({ userId: user, amount: 100, source: 'spin', refId: 'h' });
    await assert.rejects(adjustCoins({ userId: user, amount: -10, reason: '' }), /reason/);
    await assert.rejects(adjustCoins({ userId: user, amount: -500, reason: 'fraud' }), /usable coins/);
    await adjustCoins({ userId: user, amount: -40, reason: 'fraud', actorId: 'admin1' });
    assert.equal((await getCoinBalance(user)).usable, 60);
});

test('the report says what was issued, spent, expired and is still owed', async () => {
    const user = newId();
    const order = newId();
    await creditCoins({ userId: user, amount: 1000, source: 'refund', refId: 'i' });
    await creditCoins({ userId: user, amount: 100, source: 'spin', refId: 'j' });
    await redeemCoins({ userId: user, orderId: order, coins: 200 });
    await redeemCoins({ userId: user, orderId: newId(), coins: 50 });
    await reverseRedemption(order);

    const report = await getCoinReport();
    assert.equal(report.credited, 1100);
    assert.equal(report.creditedSpendable, 900);
    assert.equal(report.redeemed, 50);
    assert.equal(report.outstandingUsable, 850);
    assert.equal(report.outstandingValue, 850);
});
