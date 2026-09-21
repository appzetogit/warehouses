import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { startApp, stopApp, tokenFor, call, ok } from './helpers/app.js';

let userToken;
let userId;

before(async () => {
    await startApp();
    const { User } = await import('../src/core/users/user.model.js');
    const { Product } = await import('../src/modules/commerce/admin/models/product.model.js');
    const { Seller } = await import('../src/modules/commerce/seller/models/seller.model.js');
    const { Zone } = await import('../src/modules/commerce/admin/models/zone.model.js');

    const user = await User.create({
        phone: '9777700001',
        name: 'Lucky Customer',
        role: 'USER',
        status: 'active',
    });
    userId = user._id;
    userToken = tokenFor('USER', user._id);

    const zone = await Zone.create({
        name: 'AI Test Zone',
        country: 'India',
        coordinates: [
            { latitude: 12.90, longitude: 77.55 },
            { latitude: 12.90, longitude: 77.65 },
            { latitude: 13.00, longitude: 77.65 },
            { latitude: 13.00, longitude: 77.55 },
        ],
        isActive: true,
    });

    const seller = await Seller.create({
        sellerName: 'AI Test Store',
        ownerName: 'AI Owner',
        phone: '9777700002',
        status: 'approved',
        isAcceptingOrders: true,
        zoneId: zone._id,
        location: { type: 'Point', coordinates: [77.5946, 12.9716], latitude: 12.9716, longitude: 77.5946 },
    });

    await Product.create({
        sellerId: seller._id,
        name: 'Wireless Bluetooth Headset',
        price: 799,
        mrp: 1499,
        stockQty: 50,
        isAvailable: true,
    });
});

after(stopApp);

test('user can check spin status and play daily lucky wheel', async () => {
    const statusRes = await call('GET', '/user/spin/status', { as: userToken });
    assert.equal(statusRes.status, 200);
    const statusData = ok(statusRes, 'spin status');
    assert.equal(statusData.canSpin, true);
    assert.equal(statusData.spinsRemaining, 1);
    assert.ok(Array.isArray(statusData.segments));

    // Play the spin
    const playRes = await call('POST', '/user/spin/play', { as: userToken, body: {} });
    assert.equal(playRes.status, 200);
    const playData = ok(playRes, 'spin play');
    assert.ok(typeof playData.winningIndex === 'number');
    assert.ok(playData.segment);
    assert.equal(playData.spinsRemaining, 0);

    // Second spin today must be refused by daily rate limit
    const retryRes = await call('POST', '/user/spin/play', { as: userToken, body: {} });
    assert.equal(retryRes.status, 400);
});

test('ai assistant answers shopping and product questions', async () => {
    const chatRes = await call('POST', '/ai/chat', {
        as: userToken,
        body: { message: 'find bluetooth headset under 1000' },
    });
    assert.equal(chatRes.status, 200);
    const chatData = ok(chatRes, 'ai chat products');
    assert.ok(chatData.reply);
    assert.ok(Array.isArray(chatData.products));
    assert.ok(chatData.products.length > 0);
    assert.match(chatData.products[0].name, /Bluetooth Headset/i);
});

test('ai assistant responds with coin reward details for coins query', async () => {
    const coinQueryRes = await call('POST', '/ai/chat', {
        as: userToken,
        body: { message: 'what is my coin balance' },
    });
    assert.equal(coinQueryRes.status, 200);
    const data = ok(coinQueryRes, 'ai chat coins');
    assert.ok(data.reply);
    assert.match(data.reply, /coins/i);
});

test('ten spins at once pay out once', async () => {
    const { User } = await import('../src/core/users/user.model.js');
    const { SpinResult } = await import('../src/modules/commerce/spin/models/spin.model.js');
    await SpinResult.init();
    const racer = await User.create({ phone: '9777700011', name: 'Fast Tapper', role: 'USER', status: 'active' });
    const token = tokenFor('USER', racer._id);

    const results = await Promise.all(
        Array.from({ length: 10 }, () => call('POST', '/user/spin/play', { as: token, body: {} }))
    );

    assert.equal(results.filter((r) => r.status === 200).length, 1);
    assert.equal(await SpinResult.countDocuments({ userId: racer._id }), 1);
});

test('once the monthly budget is spent, the wheel stops paying', async () => {
    const { User } = await import('../src/core/users/user.model.js');
    const { SpinCampaign } = await import('../src/modules/commerce/spin/models/spin.model.js');
    const { CoinLot } = await import('../src/modules/commerce/coins/models/coin.model.js');
    // Every segment pays 10, and the budget holds one prize.
    await SpinCampaign.updateMany({}, { $set: { isActive: false } });
    await SpinCampaign.create({
        title: 'Budget wheel', isActive: true, dailyLimit: 1, monthlyCoinBudget: 10,
        segments: [
            { id: 1, label: '10 Coins', type: 'coins', value: 10, weight: 1 },
            { id: 2, label: 'Better Luck', type: 'none', value: 0, weight: 1 },
        ],
    });

    let paid = 0;
    for (let i = 0; i < 8; i++) {
        const u = await User.create({ phone: `97777002${i}0`, name: `Spinner ${i}`, role: 'USER', status: 'active' });
        const res = ok(await call('POST', '/user/spin/play', { as: tokenFor('USER', u._id), body: {} }), 'spin');
        paid += res.coinsAwarded;
        if (res.coinsAwarded === 0) assert.equal(res.segment.type, 'none', 'lands on the blank segment');
    }
    assert.ok(paid <= 10, `paid ${paid}, budget 10`);
    const lots = await CoinLot.find({ source: 'spin', userId: { $ne: userId } }).lean();
    assert.ok(lots.reduce((s, l) => s + l.amount, 0) <= 10 + 100, 'the earlier race test may have paid one prize');
});

test('admins build wheels, run one at a time, and can switch the wheel off', async () => {
    const adminId = new mongoose.Types.ObjectId();
    const { default: mongooseLib } = await import('mongoose');
    await mongooseLib.connection.db.collection('admins').insertOne({
        _id: adminId, email: 'spin-admin@example.com', role: 'ADMIN', adminType: 'super_admin', isActive: true,
    });
    const admin = tokenFor('ADMIN', adminId, { adminType: 'super_admin' });

    const bad = await call('POST', '/admin/spin/campaigns', {
        as: admin, body: { title: 'Broken', segments: [{ type: 'coins', value: 0, weight: 1 }, { type: 'none', weight: 1 }] },
    });
    assert.equal(bad.status, 400, 'a coin segment worth nothing is refused');

    const created = ok(await call('POST', '/admin/spin/campaigns', {
        as: admin,
        body: { title: 'Festive', dailyLimit: 2, segments: [
            { type: 'coins', value: 20, weight: 1 },
            { type: 'none', weight: 3 },
        ] },
    }), 'create', 201);
    assert.deepEqual(created.segments.map((s) => s.chancePercent), [25, 75]);
    assert.equal(created.isActive, false, 'new wheels start switched off');

    ok(await call('PATCH', `/admin/spin/campaigns/${created._id}/active`, { as: admin, body: { isActive: true } }), 'activate');
    const list = ok(await call('GET', '/admin/spin/campaigns', { as: admin }), 'list');
    assert.equal(list.filter((c) => c.isActive).length, 1, 'only one wheel runs');
    assert.equal(list.find((c) => c.isActive).title, 'Festive');
    const status = ok(await call('GET', '/user/spin/status', { as: userToken }), 'status');
    assert.equal(status.dailyLimit, 2);

    ok(await call('PATCH', `/admin/spin/campaigns/${created._id}/active`, { as: admin, body: { isActive: false } }), 'switch off');
    const off = ok(await call('GET', '/user/spin/status', { as: userToken }), 'status off');
    assert.equal(off.canSpin, false);
    assert.equal((await call('POST', '/user/spin/play', { as: userToken, body: {} })).status, 400);

    const report = ok(await call('GET', '/admin/spin/report', { as: admin }), 'report');
    assert.ok(report.spins >= 1, 'counts this month');
    assert.ok(Array.isArray(report.bySegment));

    const customerTry = await call('GET', '/admin/spin/campaigns', { as: userToken });
    assert.ok([401, 403].includes(customerTry.status), 'customers cannot reach it');
});
