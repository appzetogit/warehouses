/**
 * Seller accounts are shared by the owner and staff (one phone number), so a
 * seller may be signed in on up to MAX_SELLER_SESSIONS devices at once; the next
 * login evicts the oldest. USER and DELIVERY_PARTNER stay single-device.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';

const { startApp, stopApp, tokenFor, call, ok } = await import('./helpers/app.js');

let db;
let m;
let admin;

before(async () => {
    db = await startApp();
    const auth = await import('../src/core/auth/auth.service.js');
    const { Otp } = await import('../src/core/otp/otp.model.js');
    const { Seller } = await import('../src/modules/commerce/seller/models/seller.model.js');
    const { User } = await import('../src/core/users/user.model.js');
    const { DeliveryPartner } = await import('../src/modules/commerce/delivery/models/deliveryPartner.model.js');
    m = { auth, Otp, Seller, User, DeliveryPartner };

    const adminId = new mongoose.Types.ObjectId();
    await db.collection('admins').insertOne({
        _id: adminId, email: 'multidevice@example.com', role: 'ADMIN', adminType: 'super_admin', isActive: true,
    });
    admin = tokenFor('ADMIN', adminId, { adminType: 'super_admin' });
});

after(stopApp);

let phoneSeq = 0;
const nextPhone = () => `98765${String(++phoneSeq).padStart(5, '0')}`;

/** Seeds a valid OTP so login can be driven without the per-phone request limit. */
const seedOtp = (phone) => m.Otp.findOneAndUpdate(
    { phone },
    { $set: { otp: '1234', expiresAt: new Date(Date.now() + 60_000), attempts: 0 } },
    { upsert: true },
);

const newSeller = async () => {
    const phone = nextPhone();
    const { insertedId } = await db.collection('sellers').insertOne({
        sellerName: `Store ${phone}`, ownerPhone: phone, status: 'approved', approvedAt: new Date(), tokenVersion: 0,
    });
    return { id: insertedId, phone };
};

const sellerLogin = async (phone, fcmToken, platform = 'mobile') => {
    await seedOtp(phone);
    const res = await m.auth.verifySellerOtpAndLogin(phone, '1234', fcmToken, platform);
    assert.ok(res.accessToken, 'seller login issued tokens');
    return res;
};

const me = (accessToken) => call('GET', '/auth/me', { as: accessToken });
const refresh = (refreshToken) => call('POST', '/auth/refresh-token', { body: { refreshToken } });

const REVOKED = 'You have been signed out because this account was used on another device';

test('a seller can be signed in on 5 devices at once; access and refresh work on all', async () => {
    const s = await newSeller();
    const devices = [];
    for (let i = 0; i < 5; i++) devices.push(await sellerLogin(s.phone));

    for (const [i, d] of devices.entries()) {
        ok(await me(d.accessToken), `device ${'ABCDE'[i]} /auth/me`);
        const r = ok(await refresh(d.refreshToken), `device ${'ABCDE'[i]} refresh`);
        ok(await me(r.accessToken), `device ${'ABCDE'[i]} refreshed token`);
    }

    const doc = await m.Seller.findById(s.id).select('tokenVersion sessionVersions').lean();
    assert.equal(doc.sessionVersions.length, m.auth.MAX_SELLER_SESSIONS);
    assert.deepEqual(doc.sessionVersions, [1, 2, 3, 4, 5]);
});

test('the 6th login evicts only the oldest device', async () => {
    const s = await newSeller();
    const devices = [];
    for (let i = 0; i < 6; i++) devices.push(await sellerLogin(s.phone));
    const [a, ...rest] = devices;

    const denied = await me(a.accessToken);
    assert.equal(denied.status, 401);
    assert.equal(denied.body?.message, REVOKED);
    assert.equal((await refresh(a.refreshToken)).status, 401, 'evicted device cannot refresh');

    for (const [i, d] of rest.entries()) {
        ok(await me(d.accessToken), `device ${'BCDEF'[i]} /auth/me`);
        ok(await refresh(d.refreshToken), `device ${'BCDEF'[i]} refresh`);
    }
});

test('concurrent seller logins each get their own slot', async () => {
    const s = await newSeller();
    const versions = await Promise.all(Array.from({ length: 5 }, () => m.auth.addSellerSession(s.id)));
    assert.equal(new Set(versions).size, 5);
    const doc = await m.Seller.findById(s.id).lean();
    assert.deepEqual([...doc.sessionVersions].sort((x, y) => x - y), [...versions].sort((x, y) => x - y));
});

test('USER and DELIVERY_PARTNER stay single-device', async () => {
    const userPhone = nextPhone();
    await seedOtp(userPhone);
    const u1 = await m.auth.verifyUserOtpAndLogin(userPhone, '1234', undefined, undefined, undefined, 'Ann');
    await seedOtp(userPhone);
    const u2 = await m.auth.verifyUserOtpAndLogin(userPhone, '1234', undefined, undefined, undefined, 'Ann');
    assert.equal((await me(u1.accessToken)).status, 401);
    assert.equal((await refresh(u1.refreshToken)).status, 401);
    ok(await me(u2.accessToken), 'second user login works');
    ok(await refresh(u2.refreshToken), 'second user login refreshes');

    const dpPhone = nextPhone();
    await db.collection('delivery_partners').insertOne({ name: 'Rider', phone: dpPhone, status: 'approved', tokenVersion: 0 });
    await seedOtp(dpPhone);
    const d1 = await m.auth.verifyDeliveryOtpAndLogin(dpPhone, '1234');
    await seedOtp(dpPhone);
    const d2 = await m.auth.verifyDeliveryOtpAndLogin(dpPhone, '1234');
    assert.ok(d1.accessToken && d2.accessToken, 'delivery logins issued tokens');
    assert.equal((await me(d1.accessToken)).status, 401);
    assert.equal((await refresh(d1.refreshToken)).status, 401);
    ok(await me(d2.accessToken), 'second delivery login works');
});

test('a token issued before multi-device (empty sessionVersions) works until the next login', async () => {
    const s = await newSeller();
    const legacy = await sellerLogin(s.phone);
    // Simulate a pre-change account: the version was bumped, but no list exists.
    await db.collection('sellers').updateOne({ _id: s.id }, { $unset: { sessionVersions: 1 } });

    ok(await me(legacy.accessToken), 'legacy token on a seller route');
    const r = ok(await refresh(legacy.refreshToken), 'legacy refresh');
    ok(await me(r.accessToken), 'legacy refreshed token');

    // The next login starts the list; the legacy version is not in it.
    const fresh = await sellerLogin(s.phone);
    assert.equal((await me(legacy.accessToken)).status, 401);
    ok(await me(fresh.accessToken), 'post-change token works');
});

test('seller FCM tokens accumulate across devices without duplicates', async () => {
    const s = await newSeller();
    await sellerLogin(s.phone, 'fcm-device-a');
    await sellerLogin(s.phone, 'fcm-device-b');
    await sellerLogin(s.phone, 'fcm-device-c');
    await sellerLogin(s.phone, 'fcm-device-b'); // same device signs in again

    const doc = await m.Seller.findById(s.id).select('fcmTokens fcmTokenMobile').lean();
    const all = [...(doc.fcmTokens || []), ...(doc.fcmTokenMobile || [])];
    assert.deepEqual([...all].sort(), ['fcm-device-a', 'fcm-device-b', 'fcm-device-c']);
});

test('logout frees one slot; logout-all signs every device out', async () => {
    const s = await newSeller();
    const devices = [];
    for (let i = 0; i < 3; i++) devices.push(await sellerLogin(s.phone));

    ok(await call('POST', '/auth/logout', { body: { refreshToken: devices[0].refreshToken } }), 'logout');
    let doc = await m.Seller.findById(s.id).lean();
    assert.equal(doc.sessionVersions.length, 2);
    ok(await me(devices[1].accessToken), 'other device survives a single logout');

    ok(await call('POST', '/auth/logout-all', { as: devices[1].accessToken }), 'logout-all');
    doc = await m.Seller.findById(s.id).lean();
    assert.deepEqual(doc.sessionVersions, []);
    for (const d of devices) {
        const res = await me(d.accessToken);
        assert.equal(res.status, 401);
        assert.equal(res.body?.message, REVOKED);
        assert.equal((await refresh(d.refreshToken)).status, 401);
    }

    // Signing in again afterwards works normally.
    ok(await me((await sellerLogin(s.phone)).accessToken), 'login after logout-all');
});

test('admin blocking a seller signs every device out', async () => {
    const s = await newSeller();
    const devices = [];
    for (let i = 0; i < 3; i++) devices.push(await sellerLogin(s.phone));

    ok(await call('PATCH', `/admin/sellers/${s.id}/status`, { as: admin, body: { status: 'rejected' } }), 'admin block');
    const doc = await m.Seller.findById(s.id).lean();
    assert.deepEqual(doc.sessionVersions, []);
    for (const d of devices) {
        assert.equal((await me(d.accessToken)).status, 401);
        assert.equal((await refresh(d.refreshToken)).status, 401);
    }
});
