/**
 * Marketing push campaigns (segments, schedule, cap, quiet hours, opt-out,
 * idempotent batches) and the first-order abuse guard (one first-order offer
 * per account, phone, device or payment instrument).
 */
import { test, before, after, mock } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';

process.env.PUSH_CAMPAIGNS_INLINE = 'false';
process.env.FIRST_ORDER_PEPPER = 'test-pepper';

mock.module(new URL('../src/modules/commerce/orders/helpers/razorpay.helper.js', import.meta.url).href, {
    namedExports: {
        isRazorpayConfigured: () => true,
        getRazorpayKeyId: () => 'rzp_test_key',
        getRazorpayInstance: () => { throw new Error('not in tests'); },
        createRazorpayOrder: async (amount) => ({ id: `order_${Math.random().toString(36).slice(2)}`, amount, currency: 'INR' }),
        fetchRazorpayOrder: async () => null,
        createPaymentLink: async () => ({ id: 'plink_1', short_url: 'https://rzp.io/test' }),
        fetchRazorpayPaymentLink: async (id) => ({ id, status: 'created' }),
        verifyPaymentSignature: () => true,
        fetchRazorpayPayment: async () => null,
        initiateRazorpayRefund: async () => ({ success: true, refundId: 'rfnd_1', status: 'processed' }),
    },
});

const { startApp, stopApp, tokenFor, call, ok } = await import('./helpers/app.js');

const DAY = 24 * 3600 * 1000;
let db;
let m; // models + services
let admin;
const sent = [];

before(async () => {
    db = await startApp();
    const { User } = await import('../src/core/users/user.model.js');
    const { Zone } = await import('../src/modules/commerce/admin/models/zone.model.js');
    const { Seller } = await import('../src/modules/commerce/seller/models/seller.model.js');
    const { Product } = await import('../src/modules/commerce/admin/models/product.model.js');
    const { Offer } = await import('../src/modules/commerce/admin/models/offer.model.js');
    const { Order } = await import('../src/modules/commerce/orders/models/order.model.js');
    const campaigns = await import('../src/modules/commerce/campaigns/services/pushCampaign.service.js');
    const cm = await import('../src/modules/commerce/campaigns/models/pushCampaign.model.js');
    const guard = await import('../src/modules/commerce/orders/services/firstOrderGuard.service.js');
    const { FirstOrderClaim } = await import('../src/modules/commerce/orders/models/firstOrderClaim.model.js');
    const split = await import('../src/modules/commerce/orders/services/orderSplit.service.js');
    const orders = await import('../src/modules/commerce/orders/services/order.service.js');
    await Promise.all([cm.PushCampaignDelivery.init(), FirstOrderClaim.init()]);
    m = { User, Zone, Seller, Product, Offer, Order, campaigns, ...cm, guard, FirstOrderClaim, split, orders };

    campaigns.setPushSenderForTests(async (target, payload) => {
        sent.push({ ...target, campaignId: payload.data.campaignId });
        return { successCount: 1, failureCount: 0, results: [{ ok: true }] };
    });

    const adminId = new mongoose.Types.ObjectId();
    await db.collection('admins').insertOne({ _id: adminId, email: 'campaigns@example.com', role: 'ADMIN', adminType: 'super_admin', isActive: true });
    admin = tokenFor('ADMIN', adminId, { adminType: 'super_admin' });
});

after(async () => {
    m?.campaigns.setPushSenderForTests(null);
    await stopApp();
});

let phoneSeq = 0;
const newUser = (extra = {}) => m.User.create({ name: 'Person', phone: `93333${String(++phoneSeq).padStart(5, '0')}`, isActive: true, ...extra });
const rawOrder = (userId, extra = {}) => db.collection('orders').insertOne({
    userId, orderStatus: 'delivered', fulfilmentMode: 'quick', createdAt: new Date(), ...extra,
});
const noQuiet = { dailyCap: 3, quietHours: { enabled: false, start: '22:00', end: '08:00' }, batchSize: 2, batchDelayMs: 0 };
const has = (targets, id) => targets.some((t) => t.ownerId === String(id));

// ---------------------------------------------------------------------------
// Campaigns
// ---------------------------------------------------------------------------

test('segments resolve to the right people', async () => {
    const zoneA = new mongoose.Types.ObjectId();
    const zoneB = new mongoose.Types.ObjectId();
    const quickRecent = await newUser();
    const shopRecent = await newUser();
    const lapsed = await newUser();
    const never = await newUser();
    const rich = await newUser();
    const inactiveAccount = await newUser({ isActive: false });

    await rawOrder(quickRecent._id, { zoneId: zoneA, fulfilmentMode: 'quick', createdAt: new Date(Date.now() - 2 * DAY) });
    await rawOrder(shopRecent._id, { zoneId: zoneB, fulfilmentMode: 'standard', createdAt: new Date(Date.now() - 3 * DAY) });
    await rawOrder(lapsed._id, { zoneId: zoneA, fulfilmentMode: 'quick', createdAt: new Date(Date.now() - 60 * DAY) });
    await rawOrder(never._id, { zoneId: zoneA, orderStatus: 'cancelled_by_user' }); // does not count
    await rawOrder(inactiveAccount._id, { zoneId: zoneA });
    await db.collection('coin_lots').insertMany([
        { userId: rich._id, amount: 500, spendable: 400, used: 50, expiresAt: new Date(Date.now() + 30 * DAY), expiredAt: null, source: 'admin' },
        { userId: never._id, amount: 900, spendable: 900, used: 0, expiresAt: new Date(Date.now() - DAY), expiredAt: null, source: 'admin' },
    ]);
    const seller = await m.Seller.create({ sellerName: 'Seg Store', ownerName: 'O', ownerPhone: '9333399991', phone: '9333399991', status: 'approved' });

    const R = (audience) => m.campaigns.resolveAudience(audience);

    const all = await R({ type: 'all_customers' });
    assert.ok(has(all, never._id) && has(all, rich._id));
    assert.ok(!has(all, inactiveAccount._id), 'deactivated accounts are never targeted');

    const inZoneA = await R({ type: 'zone', zoneIds: [zoneA] });
    assert.ok(has(inZoneA, quickRecent._id) && has(inZoneA, lapsed._id));
    assert.ok(!has(inZoneA, shopRecent._id) && !has(inZoneA, never._id), 'other zone / cancelled-only are out');

    const quick = await R({ type: 'channel', channel: 'quick', days: 30 });
    assert.ok(has(quick, quickRecent._id) && !has(quick, shopRecent._id) && !has(quick, lapsed._id));
    const shop = await R({ type: 'channel', channel: 'shop', days: 30 });
    assert.ok(has(shop, shopRecent._id) && !has(shop, quickRecent._id));

    const inactive = await R({ type: 'inactive', days: 30 });
    assert.ok(has(inactive, lapsed._id) && !has(inactive, quickRecent._id) && !has(inactive, never._id));

    const neverOrdered = await R({ type: 'never_ordered' });
    assert.ok(has(neverOrdered, never._id) && has(neverOrdered, rich._id) && !has(neverOrdered, quickRecent._id));

    const coins = await R({ type: 'coin_balance', minCoins: 400 });
    assert.ok(has(coins, rich._id), '450 unspent coins');
    assert.ok(!has(coins, never._id), 'expired lots do not count');
    assert.equal((await R({ type: 'coin_balance', minCoins: 451 })).some((t) => t.ownerId === String(rich._id)), false);

    const sellers = await R({ type: 'sellers' });
    assert.ok(sellers.some((t) => t.ownerType === 'SELLER' && t.ownerId === String(seller._id)));

    // The builder's live count, over HTTP.
    await m.NotificationPreference.create({ ownerType: 'USER', ownerId: lapsed._id, marketingPush: false });
    const preview = ok(await call('POST', '/admin/push-campaigns/audience-preview', { as: admin, body: { audience: { type: 'zone', zoneIds: [String(zoneA)] } } }), 'preview');
    assert.deepEqual(preview, { total: 2, optedOut: 1, reachable: 1 });
});

test('schedule: due selection and recurring occurrences', async () => {
    const now = new Date();
    const base = { title: 'T', message: 'M', audience: { type: 'sellers' }, link: '' };
    const due = await m.PushCampaign.create({ ...base, status: 'scheduled', nextRunAt: new Date(now - 60000), runKey: 'once' });
    const future = await m.PushCampaign.create({ ...base, status: 'scheduled', nextRunAt: new Date(+now + 3600000), runKey: 'once' });
    const paused = await m.PushCampaign.create({ ...base, status: 'paused', nextRunAt: new Date(now - 60000), runKey: 'once' });
    const staleRun = await m.PushCampaign.create({ ...base, status: 'sending', heartbeatAt: new Date(now - 30 * 60000), runKey: 'once' });
    const liveRun = await m.PushCampaign.create({ ...base, status: 'sending', heartbeatAt: new Date(now - 60000), runKey: 'once' });

    const ids = (await m.campaigns.selectDueCampaigns(now)).map((c) => String(c._id));
    assert.ok(ids.includes(String(due._id)), 'due one-off');
    assert.ok(ids.includes(String(staleRun._id)), 'a run whose worker died is picked up again');
    assert.ok(!ids.includes(String(future._id)) && !ids.includes(String(paused._id)) && !ids.includes(String(liveRun._id)));
    await m.PushCampaign.deleteMany({ _id: { $in: [due._id, future._id, paused._id, staleRun._id, liveRun._id] } });

    // Daily at 10:00 store time (Asia/Kolkata = UTC+5:30 → 04:30Z), ending in 3 days.
    const after = new Date('2026-03-02T06:00:00Z'); // 11:30 IST, past today's slot
    const daily = { type: 'recurring', frequency: 'daily', timeOfDay: '10:00', endsAt: new Date('2026-03-04T12:00:00Z') };
    assert.equal(m.campaigns.nextOccurrence(daily, after).toISOString(), '2026-03-03T04:30:00.000Z');
    assert.equal(m.campaigns.nextOccurrence(daily, new Date('2026-03-04T05:00:00Z')), null, 'none after the end date');
    // Weekly on Friday (5): 2026-03-02 is a Monday.
    const weekly = { type: 'recurring', frequency: 'weekly', timeOfDay: '18:00', daysOfWeek: [5], endsAt: new Date('2026-12-31') };
    assert.equal(m.campaigns.nextOccurrence(weekly, after).toISOString(), '2026-03-06T12:30:00.000Z');
    assert.equal(m.campaigns.nextOccurrence({ type: 'once' }, after), null);

    // Over HTTP: a recurring campaign needs an end date; send-now is due immediately.
    const bad = await call('POST', '/admin/push-campaigns', { as: admin, body: { title: 'x', message: 'y', audience: { type: 'riders' }, schedule: { type: 'recurring', timeOfDay: '10:00' } } });
    assert.equal(bad.status, 400);
    const c = ok(await call('POST', '/admin/push-campaigns', {
        as: admin,
        body: { title: 'Hi', message: 'Deals', audience: { type: 'riders' }, deepLink: { type: 'category', value: 'fruits' }, schedule: { type: 'now' } },
    }), 'create', 201);
    assert.equal(c.status, 'scheduled');
    assert.equal(c.link, '/category/fruits');
    ok(await call('POST', `/admin/push-campaigns/${c._id}/cancel`, { as: admin }), 'cancel');
    const list = ok(await call('GET', '/admin/push-campaigns', { as: admin }), 'list');
    assert.equal(list.items.find((x) => x._id === c._id).status, 'cancelled');
});

test('opt-out, daily frequency cap and quiet hours are respected', async () => {
    const zone = new mongoose.Types.ObjectId();
    const [fine, optedOut, capped] = await Promise.all([newUser(), newUser(), newUser()]);
    for (const u of [fine, optedOut, capped]) await rawOrder(u._id, { zoneId: zone });

    // Opt-out through the customer's own setting.
    const outToken = tokenFor('USER', optedOut._id);
    assert.equal(ok(await call('GET', '/user/notification-preferences', { as: outToken }), 'prefs').marketingPush, true, 'on by default');
    ok(await call('PATCH', '/user/notification-preferences', { as: outToken, body: { marketingPush: false } }), 'opt out');

    // `capped` already had one marketing push today; the cap is 1.
    const today = m.campaigns.localParts(new Date()).dayKey;
    await m.PushCampaignDelivery.create({ campaignId: new mongoose.Types.ObjectId(), runKey: 'once', ownerType: 'USER', ownerId: capped._id, status: 'sent', localDay: today });

    const campaign = await m.PushCampaign.create({
        title: 'Cap', message: 'M', audience: { type: 'zone', zoneIds: [zone] }, schedule: { type: 'now' },
        status: 'scheduled', nextRunAt: new Date(Date.now() - 1000), runKey: 'once',
    });

    // Quiet hours covering now (store time): nothing is sent, the run moves to their end.
    const nowMin = m.campaigns.localParts(new Date()).minutes;
    const hhmm = (min) => `${String(Math.floor(((min + 1440) % 1440) / 60)).padStart(2, '0')}:${String(((min + 1440) % 1440) % 60).padStart(2, '0')}`;
    const quiet = { ...noQuiet, dailyCap: 1, quietHours: { enabled: true, start: hhmm(nowMin - 30), end: hhmm(nowMin + 30) } };
    const before = sent.length;
    const deferred = await m.campaigns.processCampaign(campaign._id, { settings: quiet });
    assert.equal(deferred.deferred, true);
    assert.equal(sent.length, before, 'nothing sent in quiet hours');
    const afterDefer = await m.PushCampaign.findById(campaign._id).lean();
    assert.equal(afterDefer.status, 'scheduled');
    assert.ok(afterDefer.nextRunAt > new Date(), 'rescheduled to the end of quiet hours');
    assert.equal(await m.PushCampaignDelivery.countDocuments({ campaignId: campaign._id }), 0);

    // Out of quiet hours.
    await m.PushCampaign.updateOne({ _id: campaign._id }, { $set: { nextRunAt: new Date(Date.now() - 1000) } });
    const res = await m.campaigns.processCampaign(campaign._id, { settings: { ...noQuiet, dailyCap: 1 } });
    assert.equal(res.done, true);
    const rows = await m.PushCampaignDelivery.find({ campaignId: campaign._id }).lean();
    const by = (u) => rows.find((r) => String(r.ownerId) === String(u._id));
    assert.equal(by(fine).status, 'sent');
    assert.deepEqual([by(optedOut).status, by(optedOut).reason], ['skipped', 'opted_out']);
    assert.deepEqual([by(capped).status, by(capped).reason], ['skipped', 'frequency_cap']);
    const stats = (await m.PushCampaign.findById(campaign._id).lean()).stats;
    assert.deepEqual({ ...stats }, { targeted: 3, sent: 1, failed: 0, skipped: 2, opened: 0 });
    assert.equal((await m.PushCampaign.findById(campaign._id).lean()).status, 'completed');
});

test('batched sending is idempotent: a campaign run twice sends once', async () => {
    const zone = new mongoose.Types.ObjectId();
    const people = await Promise.all([1, 2, 3, 4, 5].map(() => newUser()));
    for (const u of people) await rawOrder(u._id, { zoneId: zone });
    const campaign = await m.PushCampaign.create({
        title: 'Once', message: 'M', audience: { type: 'zone', zoneIds: [zone] }, schedule: { type: 'now' },
        status: 'scheduled', nextRunAt: new Date(Date.now() - 1000), runKey: 'once',
    });
    const mine = () => sent.filter((s) => s.campaignId === String(campaign._id));

    // Two sweeps racing: only one claims the campaign.
    const [a, b] = await Promise.all([
        m.campaigns.processCampaign(campaign._id, { settings: noQuiet }),
        m.campaigns.processCampaign(campaign._id, { settings: noQuiet }),
    ]);
    assert.equal([a, b].filter((r) => r.claimed).length, 1);
    assert.equal(mine().length, 5, 'everyone once, in batches of 2');
    assert.equal((a.claimed ? a : b).batches, 3);

    // Running the same occurrence again (a crashed worker's retry) sends nothing new.
    await m.PushCampaign.updateOne({ _id: campaign._id }, { $set: { status: 'sending' } });
    await m.campaigns.runCampaignOccurrence(campaign._id, 'once', { settings: noQuiet });
    assert.equal(mine().length, 5);
    assert.equal(new Set(mine().map((s) => s.ownerId)).size, 5);
    assert.equal((await m.campaigns.processCampaign(campaign._id, { settings: noQuiet })).claimed, false, 'completed/claimed campaigns are not re-run');
});

// ---------------------------------------------------------------------------
// First-order guard
// ---------------------------------------------------------------------------

test('a first-order claim blocks the same account, phone, device and payment', async () => {
    const G = m.guard;
    const a = await newUser();
    const claim = await G.claimFirstOrder({ userId: a._id, deviceId: 'device-aaaa-1111', checkoutId: new mongoose.Types.ObjectId() });
    assert.ok(claim.userId && claim.phoneHash && claim.deviceIdHash, 'all signals stored, hashed');
    assert.notEqual(claim.phoneHash, a.phone);

    // Account: same user, another device.
    await assert.rejects(G.claimFirstOrder({ userId: a._id, deviceId: 'device-other-2222' }), /account/i);
    // Device: another user, same device.
    const b = await newUser();
    const check = await G.checkFirstOrderEligibility({ userId: b._id, deviceId: 'device-aaaa-1111' });
    assert.deepEqual([check.ok, check.signal], [false, 'device']);
    await assert.rejects(G.claimFirstOrder({ userId: b._id, deviceId: 'device-aaaa-1111' }), /device/i);
    // Phone: a new account on the same phone number.
    await m.User.deleteOne({ _id: a._id });
    const reborn = await m.User.create({ name: 'Again', phone: a.phone, isActive: true });
    const phoneCheck = await G.checkFirstOrderEligibility({ userId: reborn._id, deviceId: 'device-fresh-3333' });
    assert.deepEqual([phoneCheck.ok, phoneCheck.signal], [false, 'phone']);

    // Payment: the card/UPI of the first claim, seen again on another person's claim, is flagged.
    await G.recordPaymentFingerprint({ checkoutId: claim.checkoutId, payment: { vpa: 'someone@upi' } });
    const c = await newUser();
    const cClaim = await G.claimFirstOrder({ userId: c._id, deviceId: 'device-cccc-4444', checkoutId: new mongoose.Types.ObjectId() });
    const r = await G.recordPaymentFingerprint({ checkoutId: cClaim.checkoutId, payment: { vpa: 'SOMEONE@upi' } });
    assert.equal(r.flagged, true);
    assert.equal((await m.FirstOrderClaim.findById(cClaim._id).lean()).flagged, true);

    // A signal switched off is not checked.
    ok(await call('PUT', '/admin/first-order-guard/settings', { as: admin, body: { signals: { device: false } } }), 'toggle');
    assert.equal((await G.checkFirstOrderEligibility({ userId: b._id, deviceId: 'device-aaaa-1111' })).ok, true);
    const s = ok(await call('PUT', '/admin/first-order-guard/settings', { as: admin, body: { signals: { device: true } } }), 'toggle back');
    assert.equal(s.signals.device, true);
    const claims = ok(await call('GET', '/admin/first-order-guard/claims?flagged=true', { as: admin }), 'claims');
    assert.ok(claims.items.some((x) => String(x._id) === String(cClaim._id)));
});

test('checkout: refusal reason, a race from one device, and release on cancel', async () => {
    const zone = await m.Zone.create({
        name: 'FO Zone', country: 'India', isActive: true,
        coordinates: [{ latitude: 12.9, longitude: 77.55 }, { latitude: 12.9, longitude: 77.65 }, { latitude: 13.0, longitude: 77.65 }, { latitude: 13.0, longitude: 77.55 }],
    });
    const seller = await m.Seller.create({
        channels: { quick: { status: 'approved' }, shop: { status: 'approved' } },
        sellerName: 'FO Store', ownerName: 'O', ownerPhone: '9333388881', phone: '9333388881', status: 'approved',
        isAcceptingOrders: true, zoneId: zone._id,
        location: { type: 'Point', coordinates: [77.5946, 12.9716], latitude: 12.9716, longitude: 77.5946 },
    });
    const product = await m.Product.create({ sellerId: seller._id, name: 'Tea', price: 300, stock: { quick: 100 }, isAvailable: true, approvalStatus: 'approved' });
    await m.Offer.create({ couponCode: 'WELCOME50', discountType: 'flat-price', discountValue: 50, status: 'active', showInCart: true, isFirstOrderOnly: true, minOrderValue: 0 });

    const address = {
        label: 'Home', street: '1 Road', city: 'Bengaluru', state: 'KA', phone: '9333377771',
        latitude: 12.9352, longitude: 77.6245, location: { type: 'Point', coordinates: [77.6245, 12.9352] },
    };
    // Each person's own delivery phone, so only the device links them.
    let addrPhone = 7770;
    const body = (deviceId, extra = {}) => ({
        items: [{ itemId: String(product._id), sellerId: String(seller._id), name: 'Tea', price: 300, quantity: 1 }],
        deliveryAddress: { ...address, phone: `933337${++addrPhone}` }, fulfilmentMode: 'quick', paymentMethod: 'cash', deviceId, ...extra,
    });

    // Two new people on one device, placing their first order at the same moment.
    const [u1, u2] = await Promise.all([newUser(), newUser()]);
    const q1 = await m.split.calculateCheckoutPricing(u1._id, body('shared-device-0001'));
    assert.equal(q1.appliedCoupon?.code, 'WELCOME50', 'auto-applied for a first order');
    const results = await Promise.allSettled([
        m.split.createSplitCheckout(u1._id, body('shared-device-0001')),
        m.split.createSplitCheckout(u2._id, body('shared-device-0001')),
    ]);
    const won = results.filter((r) => r.status === 'fulfilled');
    const lost = results.filter((r) => r.status === 'rejected');
    assert.equal(won.length, 1, 'one of them gets it');
    assert.equal(lost.length, 1);
    assert.match(lost[0].reason.message, /device/i);
    assert.equal(await m.FirstOrderClaim.countDocuments({ deviceIdHash: m.guard.hashSignal('device', 'shared-device-0001') }), 1);

    // The loser's quote says why the coupon is refused.
    const loser = String(won[0].value.checkout.userId) === String(u1._id) ? u2 : u1;
    const winner = loser === u1 ? u2 : u1;
    const refused = await m.split.calculateCheckoutPricing(loser._id, body('shared-device-0001', { couponCode: 'WELCOME50' }));
    assert.equal(refused.discount, 0);
    assert.equal(refused.couponRefusal.signal, 'device');
    assert.match(refused.couponRefusal.reason, /device/i);
    // Over HTTP too, with the web app's device header absent: another device is fine.
    const httpQuote = ok(await call('POST', '/orders/checkout/calculate', { as: tokenFor('USER', loser._id), body: body(undefined) }), 'quote');
    assert.equal(httpQuote.appliedCoupon?.code, 'WELCOME50');

    // The winner cancels before dispatch: the claim is released, the offer is back.
    const order = await m.Order.findOne({ checkoutId: won[0].value.checkout._id }).lean();
    await m.orders.cancelOrder(String(order._id), String(winner._id), 'changed my mind');
    const again = await m.split.calculateCheckoutPricing(loser._id, body('shared-device-0001'));
    assert.equal(again.appliedCoupon?.code, 'WELCOME50', 'released after cancel');
    assert.equal(await m.FirstOrderClaim.countDocuments({ checkoutId: won[0].value.checkout._id }), 0);

    // An abandoned online payment releases it straight away.
    const online = await m.split.createSplitCheckout(loser._id, body('shared-device-0001', { paymentMethod: 'razorpay' }));
    assert.equal(await m.FirstOrderClaim.countDocuments({ checkoutId: online.checkout._id }), 1);
    await m.split.abandonCheckout(loser._id, online.checkout.checkoutId);
    assert.equal(await m.FirstOrderClaim.countDocuments({ checkoutId: online.checkout._id }), 0);
});
