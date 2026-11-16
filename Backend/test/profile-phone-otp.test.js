/**
 * A Google/Email account without a phone can add one only with the OTP sent to
 * that number; otherwise the number's real owner, logging in by phone OTP,
 * would land in someone else's account.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';

process.env.USE_DEFAULT_OTP = 'true'; // fixed code 1234, no SMS

const { startApp, stopApp, call, ok, tokenFor, oid } = await import('./helpers/app.js');

let db;
const ids = { google: oid('64b000000000000000000001'), owner: oid('64b000000000000000000002') };
const tokens = {};

before(async () => {
    db = await startApp();
    await db.collection('users').insertMany([
        { _id: ids.google, name: 'G User', email: 'g@example.com', phone: '' },
        { _id: ids.owner, name: 'Has Phone', phone: '9000000002' },
    ]);
    tokens.google = tokenFor('USER', ids.google);
    tokens.owner = tokenFor('USER', ids.owner);
});

after(stopApp);

const phoneOf = async (id) => (await db.collection('users').findOne({ _id: id })).phone;

test('setting a phone without an OTP is refused', async () => {
    const res = await call('PATCH', '/user/profile', { as: tokens.google, body: { phone: '9000000009' } });
    assert.equal(res.status, 400, JSON.stringify(res.body));
    assert.match(res.body.message, /verify your phone/i);
    assert.equal(await phoneOf(ids.google), '');
});

test('a wrong OTP is refused, the right one adds the phone', async () => {
    ok(await call('POST', '/user/profile/phone/otp', { as: tokens.google, body: { phone: '9000000009' } }), 'send otp');

    const wrong = await call('PATCH', '/user/profile', { as: tokens.google, body: { phone: '9000000009', phoneOtp: '9999' } });
    assert.equal(wrong.status, 400, JSON.stringify(wrong.body));
    assert.equal(await phoneOf(ids.google), '');

    ok(await call('PATCH', '/user/profile', { as: tokens.google, body: { phone: '9000000009', phoneOtp: '1234' } }), 'verify');
    assert.equal(await phoneOf(ids.google), '9000000009');
});

test('an OTP for one number cannot add a different number', async () => {
    await db.collection('users').updateOne({ _id: ids.google }, { $set: { phone: '' } });
    ok(await call('POST', '/user/profile/phone/otp', { as: tokens.google, body: { phone: '9000000011' } }), 'send otp');
    const res = await call('PATCH', '/user/profile', { as: tokens.google, body: { phone: '9000000012', phoneOtp: '1234' } });
    assert.equal(res.status, 400, JSON.stringify(res.body));
    assert.equal(await phoneOf(ids.google), '');
});

test('no OTP is sent for a taken number or to an account that already has a phone', async () => {
    const taken = await call('POST', '/user/profile/phone/otp', { as: tokens.google, body: { phone: '9000000002' } });
    assert.equal(taken.status, 400);
    assert.match(taken.body.message, /already linked/i);

    const hasPhone = await call('POST', '/user/profile/phone/otp', { as: tokens.owner, body: { phone: '9000000013' } });
    assert.equal(hasPhone.status, 400);
    assert.match(hasPhone.body.message, /cannot be changed/i);
});

test('an account with a phone can still save its profile with the same phone', async () => {
    ok(await call('PATCH', '/user/profile', { as: tokens.owner, body: { name: 'Renamed', phone: '9000000002' } }), 'save');
    assert.equal(await phoneOf(ids.owner), '9000000002');
});
