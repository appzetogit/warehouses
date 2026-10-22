/**
 * Customer sign-in by email: POST /auth/user/email/request-otp + /verify-otp.
 * Same OTP store, limits and tokens as phone sign-in; the code is mailed. The
 * mailer is mocked so no SMTP is needed, and can be switched "unconfigured".
 */
import { test, before, after, mock } from 'node:test';
import assert from 'node:assert/strict';

let mailerConfigured = true;
let mailerSends = true;
const sent = [];

mock.module(new URL('../src/utils/email.js', import.meta.url).href, {
    namedExports: {
        isEmailConfigured: () => mailerConfigured,
        sendUserLoginOtpEmail: async (to, otp) => {
            if (!mailerSends) return false;
            sent.push({ to, otp });
            return true;
        },
        sendAdminResetOtpEmail: async () => true,
    },
});

const { startApp, stopApp, call, ok } = await import('./helpers/app.js');

let db;
let m;

before(async () => {
    db = await startApp();
    const { config } = await import('../src/config/env.js');
    const { Otp } = await import('../src/core/otp/otp.model.js');
    const { User } = await import('../src/core/users/user.model.js');
    const auth = await import('../src/core/auth/auth.service.js');
    m = { config, Otp, User, auth };
    m.config.useDefaultOtp = false;
});

after(stopApp);

const requestEmail = (email) => call('POST', '/auth/user/email/request-otp', { body: { email } });
const verifyEmail = (body) => call('POST', '/auth/user/email/verify-otp', { body });
const lastCodeFor = (email) => [...sent].reverse().find((s) => s.to === email)?.otp;

test('no mailer configured: a clear 503, never a 500, and no code stored', async () => {
    mailerConfigured = false;
    try {
        const res = await requestEmail('nomailer@example.com');
        assert.equal(res.status, 503);
        assert.match(res.body.message, /Email sign-in isn't available right now/);
        assert.equal(await m.Otp.countDocuments({ phone: 'email:nomailer@example.com' }), 0);
    } finally {
        mailerConfigured = true;
    }
});

test('mailer configured but the send fails: a clear 503', async () => {
    mailerSends = false;
    try {
        const res = await requestEmail('sendfail@example.com');
        assert.equal(res.status, 503);
        assert.match(res.body.message, /couldn't send the email/);
    } finally {
        mailerSends = true;
    }
});

test('bad email is rejected with 400', async () => {
    const res = await requestEmail('not-an-email');
    assert.equal(res.status, 400);
    assert.match(res.body.message, /valid email/);
});

test('new email: code is mailed (not returned), wrong code rejected, right code creates the user', async () => {
    // A database from before email sign-in: plain unique index on phone, which
    // would allow only one phone-less account. The first email sign-up fixes it.
    await m.User.collection.dropIndex('phone_1').catch(() => {});
    await m.User.collection.createIndex({ phone: 1 }, { unique: true, name: 'phone_1' });

    const data = ok(await requestEmail('New.Shopper@Example.com'), 'request');
    assert.equal(data.email, 'new.shopper@example.com');
    assert.equal(data.otp, undefined, 'a real code is never in the response');
    const code = lastCodeFor('new.shopper@example.com');
    assert.match(code, /^\d{4}$/);
    assert.ok(await m.Otp.findOne({ phone: 'email:new.shopper@example.com' }), 'stored under the email key');

    const wrong = code === '0000' ? '1111' : '0000';
    const bad = await verifyEmail({ email: 'new.shopper@example.com', otp: wrong });
    assert.equal(bad.status, 401);
    assert.equal(bad.body.message, 'Invalid OTP');

    const login = ok(await verifyEmail({ email: 'NEW.shopper@example.com', otp: code, name: 'New Shopper' }), 'verify');
    assert.ok(login.accessToken && login.refreshToken, 'tokens issued');
    assert.equal(login.isNewUser, true);
    assert.equal(login.user.email, 'new.shopper@example.com');
    assert.equal(login.user.phone, '');
    assert.equal(login.user.name, 'New Shopper');
    assert.equal(login.user.isVerified, true);

    const me = ok(await call('GET', '/auth/me', { as: login.accessToken }), '/auth/me');
    assert.equal(String(me._id || me.user?._id || me.id), String(login.user._id));

    // The code is single-use.
    assert.equal((await verifyEmail({ email: 'new.shopper@example.com', otp: code })).status, 401);

    // A second phone-less account is allowed now.
    ok(await requestEmail('second@example.com'), 'request 2');
    const second = ok(await verifyEmail({ email: 'second@example.com', otp: lastCodeFor('second@example.com') }), 'verify 2');
    assert.notEqual(String(second.user._id), String(login.user._id));
    assert.equal(second.isNewUser, true, 'no name yet: the app asks for one');

    const phoneIndex = (await m.User.collection.indexes()).find((ix) => ix.key.phone === 1);
    assert.ok(phoneIndex.unique && phoneIndex.partialFilterExpression, 'phone index is unique and partial');
});

test('existing account (phone + email, any case) signs in to the same account', async () => {
    const existing = await m.User.create({ phone: '9876500001', email: 'Old.Customer@Example.com', name: 'Old Customer', isVerified: true });

    ok(await requestEmail('old.customer@example.com'), 'request');
    const login = ok(
        await verifyEmail({ email: 'old.customer@example.com', otp: lastCodeFor('old.customer@example.com') }),
        'verify',
    );
    assert.equal(String(login.user._id), String(existing._id));
    assert.equal(login.user.phone, '9876500001');
    assert.equal(login.isNewUser, false);
    assert.equal(await m.User.countDocuments({ email: /^old\.customer@example\.com$/i }), 1, 'no duplicate created');
});

test('rate limit: more than OTP_RATE_LIMIT requests in the window are refused', async () => {
    const email = 'ratelimit@example.com';
    const limit = m.config.otpRateLimit || 3;
    for (let i = 0; i < limit; i++) await m.auth.requestUserEmailOtp(email);
    await assert.rejects(m.auth.requestUserEmailOtp(email), /Too many OTP requests/);
});

test('max attempts: the code stops working after OTP_MAX_ATTEMPTS wrong tries', async () => {
    const email = 'attempts@example.com';
    await m.auth.requestUserEmailOtp(email);
    const code = lastCodeFor(email);
    const wrong = code === '0000' ? '1111' : '0000';
    for (let i = 0; i < m.config.otpMaxAttempts; i++) {
        await assert.rejects(m.auth.verifyUserEmailOtpAndLogin(email, wrong), /Invalid OTP/);
    }
    await assert.rejects(m.auth.verifyUserEmailOtpAndLogin(email, code), /Max attempts exceeded/);
});

test('USE_DEFAULT_OTP never applies to email: a real code is mailed and 1234 is refused', async () => {
    m.config.useDefaultOtp = true;
    try {
        const email = 'default.otp@example.com';
        const data = ok(await requestEmail(email), 'request');
        assert.equal(data?.otp, undefined, 'no code in the response');
        const code = lastCodeFor(email);
        assert.ok(code && code !== '1234', 'a real code was mailed');
        const bad = await verifyEmail({ email, otp: '1234' });
        assert.notEqual(bad.status, 200, '1234 must not sign in by email');
        const login = ok(await verifyEmail({ email, otp: code }), 'verify');
        assert.equal(login.user.email, email);

        mailerConfigured = false;
        const res = await requestEmail('nomailer.default@example.com');
        assert.equal(res.status, 503, 'no mailer is a 503 even in test-code mode');
    } finally {
        m.config.useDefaultOtp = false;
        mailerConfigured = true;
    }
});

test('phone sign-in is unchanged (request/verify shapes)', async () => {
    m.config.useDefaultOtp = true; // no SMS is sent
    try {
        const req = await call('POST', '/auth/user/request-otp', { body: { phone: '9876500099' } });
        assert.equal(req.status, 200);
        assert.equal(req.body.message, 'OTP sent successfully');
        assert.deepEqual(req.body.data, { phone: '9876500099', otp: '1234' });

        const res = await call('POST', '/auth/user/verify-otp', { body: { phone: '9876500099', otp: '1234', name: 'Phone User' } });
        const data = ok(res, 'phone verify');
        assert.equal(res.body.message, 'Login successful');
        assert.deepEqual(Object.keys(data).sort(), ['accessToken', 'isNewUser', 'refreshToken', 'user']);
        assert.equal(data.user.phone, '9876500099');
        assert.equal(data.isNewUser, true);

        // Same phone again logs into the same account.
        await call('POST', '/auth/user/request-otp', { body: { phone: '9876500099' } });
        const again = ok(await call('POST', '/auth/user/verify-otp', { body: { phone: '9876500099', otp: '1234' } }), 'again');
        assert.equal(String(again.user._id), String(data.user._id));
        assert.equal(again.isNewUser, false);

        // Phone stays unique.
        await assert.rejects(m.User.create({ phone: '9876500099' }), /duplicate key/);
    } finally {
        m.config.useDefaultOtp = false;
    }
});
