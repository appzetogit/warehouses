/**
 * Store-review demo numbers (config.reviewLoginPhones) always get the fixed
 * code 1234 and no SMS, even when real OTPs are on; every other number keeps
 * a random code. Email keys never match.
 */
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { startDb, stopDb, clearDb } from './helpers/db.js';

const { config } = await import('../src/config/env.js');
const { createOrUpdateOtp, verifyOtp, isReviewLoginPhone } = await import('../src/core/otp/otp.service.js');

before(startDb);
after(stopDb);
beforeEach(async () => {
    await clearDb();
    config.useDefaultOtp = false;
    config.reviewLoginPhones = ['9301988718'];
});

test('the review number gets 1234 with no SMS, in any format', async () => {
    for (const phone of ['9301988718', '+91 93019 88718', '919301988718']) {
        assert.equal(isReviewLoginPhone(phone), true, phone);
    }
    const sent = [];
    const otp = await createOrUpdateOtp('9301988718', { deliver: async (p, code) => sent.push([p, code]) });
    assert.equal(otp, '1234');
    assert.equal(sent.length, 0, 'no SMS for the review number');
    assert.deepEqual(await verifyOtp('9301988718', '1234'), { valid: true });
});

test('other numbers keep a random code that is sent by SMS', async () => {
    const sent = [];
    const otp = await createOrUpdateOtp('9876500011', { deliver: async (p, code) => sent.push([p, code]) });
    assert.equal(sent.length, 1);
    assert.equal(sent[0][1], otp);
    assert.equal(isReviewLoginPhone('9876500011'), false);
    assert.equal((await verifyOtp('9876500011', '1234')).valid, otp === '1234');
});

test('email keys and realOnly requests never use the review code', async () => {
    assert.equal(isReviewLoginPhone('email:9301988718@example.com'), false);
    const sent = [];
    await createOrUpdateOtp('9301988718', { realOnly: true, deliver: async (p, code) => sent.push(code) });
    assert.equal(sent.length, 1, 'realOnly always sends a real code');
});

test('the review number is not rate limited', async () => {
    for (let i = 0; i < 6; i++) {
        assert.equal(await createOrUpdateOtp('9301988718', { deliver: async () => {} }), '1234');
    }
});
