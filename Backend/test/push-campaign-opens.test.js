/**
 * Campaign push open tracking: each push carries its delivery id and a signed
 * open token; POST /notifications/opened (no sign-in) counts a tap once, only
 * with a valid token, and the admin stats show opens and the open rate.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';

process.env.PUSH_CAMPAIGNS_INLINE = 'false';

const { startApp, stopApp, tokenFor, call, ok } = await import('./helpers/app.js');

let db;
let m;
let admin;
const sent = [];

before(async () => {
    db = await startApp();
    const { User } = await import('../src/core/users/user.model.js');
    const campaigns = await import('../src/modules/commerce/campaigns/services/pushCampaign.service.js');
    const cm = await import('../src/modules/commerce/campaigns/models/pushCampaign.model.js');
    await cm.PushCampaignDelivery.init();
    m = { User, campaigns, ...cm };
    campaigns.setPushSenderForTests(async (target, payload) => {
        sent.push({ ...target, data: payload.data });
        return { successCount: 1, failureCount: 0, results: [{ ok: true }] };
    });
    const adminId = new mongoose.Types.ObjectId();
    await db.collection('admins').insertOne({ _id: adminId, email: 'opens@example.com', role: 'ADMIN', adminType: 'super_admin', isActive: true });
    admin = tokenFor('ADMIN', adminId, { adminType: 'super_admin' });
});

after(async () => {
    m?.campaigns.setPushSenderForTests(null);
    await stopApp();
});

const noQuiet = { dailyCap: 0, quietHours: { enabled: false, start: '22:00', end: '08:00' }, batchSize: 50, batchDelayMs: 0 };
let phoneSeq = 0;

async function sendCampaign(people, optOut = []) {
    const zone = new mongoose.Types.ObjectId();
    for (const u of people) {
        await db.collection('orders').insertOne({ userId: u._id, zoneId: zone, orderStatus: 'delivered', fulfilmentMode: 'quick', createdAt: new Date() });
    }
    for (const u of optOut) await m.campaigns.setNotificationPreferences('USER', u._id, { marketingPush: false });
    const campaign = await m.PushCampaign.create({
        title: 'Sale', message: 'Tea at half price', audience: { type: 'zone', zoneIds: [zone] },
        deepLink: { type: 'offer', value: 'TEA50' }, link: '/offers/TEA50',
        schedule: { type: 'now' }, status: 'scheduled', nextRunAt: new Date(Date.now() - 1000), runKey: 'r1',
    });
    const res = await m.campaigns.processCampaign(campaign._id, { settings: noQuiet });
    assert.equal(res.claimed, true);
    return campaign;
}

const open = (body) => call('POST', '/notifications/opened', { body });

test('each campaign push carries a delivery id, a signed open token and the deep link', async () => {
    const people = await Promise.all([1, 2].map(() => m.User.create({ name: 'P', phone: `95555${String(++phoneSeq).padStart(5, '0')}`, isActive: true })));
    const campaign = await sendCampaign(people);
    const mine = sent.filter((s) => s.data.campaignId === String(campaign._id));
    assert.equal(mine.length, 2);
    for (const s of mine) {
        assert.ok(mongoose.Types.ObjectId.isValid(s.data.deliveryId));
        assert.equal(s.data.openToken, m.campaigns.openTokenFor(s.data.deliveryId));
        assert.equal(s.data.deepLink, '/offers/TEA50');
        const row = await m.PushCampaignDelivery.findById(s.data.deliveryId).lean();
        assert.equal(String(row.ownerId), s.ownerId);
    }
});

test('opens: token validation, counted once, and shown in the stats', async () => {
    const people = await Promise.all([1, 2, 3].map(() => m.User.create({ name: 'Q', phone: `95555${String(++phoneSeq).padStart(5, '0')}`, isActive: true })));
    const optedOut = await m.User.create({ name: 'No', phone: `95555${String(++phoneSeq).padStart(5, '0')}`, isActive: true });
    const campaign = await sendCampaign([...people, optedOut], [optedOut]);
    const mine = sent.filter((s) => s.data.campaignId === String(campaign._id));
    assert.equal(mine.length, 3, 'the opted-out person got nothing');
    const [first, second] = mine;

    // Forged, missing, swapped and malformed tokens count nothing.
    assert.equal((await open({ deliveryId: first.data.deliveryId, openToken: 'forged' })).status, 400);
    assert.equal((await open({ deliveryId: first.data.deliveryId })).status, 400);
    assert.equal((await open({ deliveryId: first.data.deliveryId, openToken: second.data.openToken })).status, 400);
    assert.equal((await open({ deliveryId: 'not-an-id', openToken: first.data.openToken })).status, 400);
    assert.equal((await m.PushCampaign.findById(campaign._id).lean()).stats.opened, 0);

    // A valid open, without signing in, counts once; a replay does not.
    const r1 = ok(await open({ deliveryId: first.data.deliveryId, openToken: first.data.openToken }), 'open');
    assert.equal(r1.counted, true);
    const r2 = ok(await open({ deliveryId: first.data.deliveryId, openToken: first.data.openToken }), 'replay');
    assert.equal(r2.counted, false);
    // Racing taps (service worker and page) still count once.
    const racing = await Promise.all([1, 2, 3].map(() => m.campaigns.recordCampaignOpen({ deliveryId: second.data.deliveryId, openToken: second.data.openToken })));
    assert.equal(racing.filter((r) => r.counted).length, 1);
    // Signed in works too.
    const r3 = await call('POST', '/notifications/opened', { as: tokenFor('USER', people[2]._id), body: { deliveryId: first.data.deliveryId, openToken: first.data.openToken } });
    assert.equal(r3.body.data.counted, false);

    // A skipped (opted-out) delivery can never be opened, even with its own token.
    const skipped = await m.PushCampaignDelivery.findOne({ campaignId: campaign._id, status: 'skipped' }).lean();
    const r4 = ok(await open({ deliveryId: String(skipped._id), openToken: m.campaigns.openTokenFor(skipped._id) }), 'skipped');
    assert.equal(r4.counted, false);

    const row = await m.PushCampaignDelivery.findById(first.data.deliveryId).lean();
    assert.ok(row.openedAt instanceof Date);

    // Admin stats: 2 opens of 3 sent, per campaign and per run.
    const stats = ok(await call('GET', `/admin/push-campaigns/${campaign._id}`, { as: admin }), 'campaign');
    assert.equal(stats.stats.sent, 3);
    assert.equal(stats.stats.opened, 2);
    assert.equal(stats.openRate, 66.7);
    assert.equal(stats.runs.find((r) => r.runKey === 'r1').opened, 2);
    const list = ok(await call('GET', '/admin/push-campaigns', { as: admin }), 'list');
    assert.equal(list.items.find((c) => String(c._id) === String(campaign._id)).stats.opened, 2);

    // Re-running the occurrence (a crashed worker's retry) recomputes the same numbers.
    await m.PushCampaign.updateOne({ _id: campaign._id }, { $set: { status: 'sending' } });
    await m.campaigns.runCampaignOccurrence(campaign._id, 'r1', { settings: noQuiet });
    const after = await m.PushCampaign.findById(campaign._id).lean();
    assert.equal(after.stats.opened, 2);
    assert.equal(after.runs.find((r) => r.runKey === 'r1').opened, 2);
});
