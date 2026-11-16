/**
 * Google sign-in accepts only ID tokens issued to our own OAuth clients
 * (GOOGLE_CLIENT_IDS) with a Google-verified email. Google's tokeninfo
 * endpoint is stubbed: each test token maps to the claims Google would return.
 */
import { test, before, after, mock } from 'node:test';
import assert from 'node:assert/strict';

process.env.GOOGLE_CLIENT_IDS = 'our-web.apps.googleusercontent.com, our-android.apps.googleusercontent.com';

const inAnHour = String(Math.floor(Date.now() / 1000) + 3600);
const claims = (over = {}) => ({
    aud: 'our-android.apps.googleusercontent.com',
    iss: 'https://accounts.google.com',
    exp: inAnHour,
    sub: 'google-sub-1',
    email: 'asha@example.com',
    email_verified: 'true',
    name: 'Asha',
    ...over,
});
const TOKENS = {
    good: claims(),
    otherApp: claims({ aud: 'someone-elses-app.apps.googleusercontent.com' }),
    unverified: claims({ email_verified: 'false', sub: 'google-sub-2', email: 'new@example.com' }),
    badIssuer: claims({ iss: 'https://evil.example.com' }),
    expired: claims({ exp: String(Math.floor(Date.now() / 1000) - 10) }),
};

const fakeAxios = {
    get: async (url, opts = {}) => {
        if (String(url).startsWith('https://oauth2.googleapis.com/tokeninfo')) {
            const data = TOKENS[opts.params?.id_token];
            if (!data) {
                const err = new Error('Request failed with status code 400');
                err.response = { status: 400, data: { error: 'invalid_token' } };
                throw err;
            }
            return { status: 200, data };
        }
        throw new Error(`unexpected axios GET ${url}`);
    },
    post: async (url) => { throw new Error(`unexpected axios POST ${url}`); },
    interceptors: { request: { use() {} }, response: { use() {} } },
};
fakeAxios.create = () => fakeAxios;
mock.module('axios', { defaultExport: fakeAxios, namedExports: { default: fakeAxios } });

const { startApp, stopApp, call, oid } = await import('./helpers/app.js');

let db;
before(async () => {
    db = await startApp();
    await db.collection('users').insertOne({ _id: oid('64c000000000000000000001'), name: 'Asha', phone: '9000000001', email: 'asha@example.com' });
});
after(stopApp);

const login = (idToken, extra = {}) => call('POST', '/auth/user/google', { body: { idToken, ...extra } });

test('a token issued to our app signs in to the account with that email', async () => {
    const res = await login('good');
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.ok(res.body.data?.accessToken || res.body.data?.tokens || res.body.data?.user, JSON.stringify(res.body));
    assert.equal(await db.collection('users').countDocuments({ email: 'asha@example.com' }), 1);
});

test('a valid Google token issued to another app is refused', async () => {
    const res = await login('otherApp');
    assert.equal(res.status, 401, JSON.stringify(res.body));
});

test('an unverified Google email is refused and creates no account', async () => {
    const res = await login('unverified');
    assert.equal(res.status, 401, JSON.stringify(res.body));
    assert.equal(await db.collection('users').countDocuments({ email: 'new@example.com' }), 0);
});

test('a wrong issuer, an expired token and a token Google rejects are refused', async () => {
    for (const token of ['badIssuer', 'expired', 'garbage']) {
        const res = await login(token);
        assert.equal(res.status, 401, `${token}: ${JSON.stringify(res.body)}`);
    }
});

test('the email in the request body is ignored', async () => {
    const res = await login('garbage', { email: 'asha@example.com', name: 'Mallory' });
    assert.equal(res.status, 401, JSON.stringify(res.body));
});

test('with no GOOGLE_CLIENT_IDS configured, every token is refused', async () => {
    const { config } = await import('../src/config/env.js');
    const saved = config.googleClientIds;
    config.googleClientIds = [];
    try {
        const res = await login('good');
        assert.equal(res.status, 401, JSON.stringify(res.body));
    } finally {
        config.googleClientIds = saved;
    }
});
