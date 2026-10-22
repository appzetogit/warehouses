import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { startApp, stopApp, call, ok, tokenFor, oid } from './helpers/app.js';

const FAKE_KEY = 'AIza-test-seller-help-key-123456';
process.env.GEMINI_API_KEY = FAKE_KEY;

const ids = {};
const tokens = {};
let db;
let gemini;
const geminiCalls = [];
/** What the mocked Gemini HTTP call answers next (an Error makes it fail). */
let nextGemini = () => ({ text: 'Open Inventory and tap Add product.', prompt: 80, output: 40 });

before(async () => {
    db = await startApp();
    gemini = await import('../src/modules/commerce/ai/services/geminiClient.js');
    gemini.setGeminiTransport(async (url, body, options) => {
        geminiCalls.push({ url, body, options });
        const r = nextGemini(body);
        if (r instanceof Error) throw r;
        return {
            data: {
                candidates: [{ content: { parts: [{ text: r.text }] } }],
                usageMetadata: { promptTokenCount: r.prompt, candidatesTokenCount: r.output },
            },
        };
    });

    ids.admin = new mongoose.Types.ObjectId();
    ids.user = new mongoose.Types.ObjectId();
    await db.collection('admins').insertOne({ _id: ids.admin, email: 'admin_sh@example.com', role: 'ADMIN', adminType: 'super_admin', isActive: true });
    await db.collection('users').insertOne({ _id: ids.user, name: 'Asha', phone: '9000000011' });
    tokens.admin = tokenFor('ADMIN', ids.admin, { adminType: 'super_admin' });
    tokens.user = tokenFor('USER', ids.user);

    const { Seller } = await import('../src/modules/commerce/seller/models/seller.model.js');
    await Seller.init();
    const seller = await Seller.create({
        channels: { quick: { status: 'approved' }, shop: { status: 'approved' } },
        sellerName: 'Secret Store Name', ownerName: 'Owner', ownerPhone: '9333333333', status: 'approved',
        location: { type: 'Point', coordinates: [77.59, 12.97], latitude: 12.97, longitude: 77.59 },
    });
    ids.seller = seller._id;
    tokens.seller = tokenFor('SELLER', ids.seller);
    tokens.ghostSeller = tokenFor('SELLER', new mongoose.Types.ObjectId());
    tokens.staleSeller = tokenFor('SELLER', ids.seller, { tokenVersion: 7 });

    // An order whose userId is the seller's id, and one for the customer: a
    // seller asking about "my orders" must never be shown either.
    await db.collection('orders').insertMany([
        { _id: new mongoose.Types.ObjectId(), order_id: 'ORD-SELLERID', userId: ids.seller, sellerId: ids.seller, orderStatus: 'placed', items: [{ name: 'Leaky Item' }], pricing: { total: 999 }, createdAt: new Date() },
        { _id: new mongoose.Types.ObjectId(), order_id: 'ORD-CUSTOMER', userId: ids.user, sellerId: ids.seller, orderStatus: 'placed', items: [{ name: 'Customer Item' }], pricing: { total: 111 }, createdAt: new Date() },
    ]);
});

after(async () => {
    gemini?.setGeminiTransport(null);
    process.env.GEMINI_API_KEY = FAKE_KEY;
    await stopApp();
});

beforeEach(async () => {
    await db.collection('ai_usage_daily').deleteMany({});
    process.env.GEMINI_API_KEY = FAKE_KEY;
    nextGemini = () => ({ text: 'Open Inventory and tap Add product.', prompt: 80, output: 40 });
    geminiCalls.length = 0;
});

const setSettings = async (body) => ok(await call('PUT', '/admin/ai/settings', { as: tokens.admin, body }), 'put settings');
const send = (message, as = tokens.seller, extra = {}) => call('POST', '/ai/chat', { as, body: { message, audience: 'seller', ...extra } });
const chat = async (message, as = tokens.seller, extra = {}) => ok(await send(message, as, extra), `chat ${message}`);

test('seller chat with Gemini: seller prompt, reply, how-to chips, conversation saved as a seller one', async () => {
    await setSettings({ enabled: true, dailyUserMessageCap: 0, monthlyTokenBudget: 0, systemPromptAddendum: 'Mention free returns.' });
    const first = await chat('how do I add a product with sizes?');
    assert.equal(first.reply, 'Open Inventory and tap Add product.');
    assert.ok(Array.isArray(first.suggestions) && first.suggestions.length >= 3);
    assert.ok(first.suggestions.some((s) => /product/i.test(s)));
    assert.ok(first.conversationId);
    assert.equal(first.usage, undefined);
    assert.equal(first.products, undefined, 'no product search for sellers');

    assert.equal(geminiCalls.length, 1);
    const sys = geminiCalls[0].body.systemInstruction.parts[0].text;
    assert.match(sys, /seller help assistant/i);
    assert.match(sys, /Store Timings/);
    assert.match(sys, /Support/);
    assert.doesNotMatch(sys, /shopping assistant/i);
    assert.doesNotMatch(sys, /free returns/, 'the shopper addendum is not used for sellers');
    const whole = JSON.stringify(geminiCalls[0].body);
    for (const secret of ['Secret Store Name', '9333333333', String(ids.seller)]) {
        assert.ok(!whole.includes(secret), `no seller data in the prompt (${secret})`);
    }

    const second = await chat('and variants?', tokens.seller, {
        conversationId: first.conversationId,
        history: [{ role: 'user', text: 'how do I add a product with sizes?' }, { role: 'model', text: 'Open Inventory and tap Add product.' }],
    });
    assert.equal(second.conversationId, first.conversationId);
    assert.equal(geminiCalls[1].body.contents.length, 3, 'history is passed on');

    const conv = await db.collection('ai_conversations').findOne({ _id: oid(first.conversationId) });
    assert.equal(conv.audience, 'seller');
    assert.equal(conv.userModel, 'Seller');
    assert.equal(String(conv.userId), String(ids.seller));
    assert.equal(conv.userKey, `sellerchat:${ids.seller}`);
    assert.equal(conv.messages.length, 4);

    const usageRow = await db.collection('ai_usage_daily').findOne({ userKey: `sellerchat:${ids.seller}` });
    assert.equal(usageRow.messages, 2);
    assert.equal(usageRow.audience, 'seller');
    assert.equal(usageRow.promptTokens + usageRow.outputTokens, 240);

    // The admin views show the seller, not a missing customer.
    const list = ok(await call('GET', `/admin/ai/conversations?userId=${ids.seller}`, { as: tokens.admin }), 'list');
    const row = list.conversations.find((c) => String(c._id) === first.conversationId);
    assert.equal(row.audience, 'seller');
    assert.equal(row.user.name, 'Secret Store Name');
    const usage = ok(await call('GET', '/admin/ai/usage', { as: tokens.admin }), 'usage');
    const top = usage.topUsers.find((t) => String(t.userId) === String(ids.seller));
    assert.equal(top.audience, 'seller');
    assert.equal(top.user.name, 'Secret Store Name');
    await setSettings({ systemPromptAddendum: '' });
});

test('seller chat falls back to a plain answer when Gemini is unconfigured or fails', async () => {
    await setSettings({ enabled: true, dailyUserMessageCap: 0, monthlyTokenBudget: 0 });
    delete process.env.GEMINI_API_KEY;
    const off = await chat('how do I set my store timings?');
    assert.match(off.reply, /Store Timings/);
    assert.match(off.reply, /ticket from Help > Support/);
    assert.ok(off.suggestions.length >= 3);
    assert.equal(geminiCalls.length, 0);

    const vague = await chat('hmm something else entirely');
    assert.match(vague.reply, /raise a ticket/i);

    process.env.GEMINI_API_KEY = FAKE_KEY;
    nextGemini = () => Object.assign(new Error('Request failed with status code 500'), { response: { status: 500 } });
    const failed = await send('how do payouts work?');
    assert.equal(failed.status, 200, 'a Gemini error is not a 500');
    assert.match(failed.body.data.reply, /Payouts/);
    assert.match(failed.body.data.reply, /Support/);
});

test('"my orders" for a seller never looks up or shows orders', async () => {
    await setSettings({ enabled: true, dailyUserMessageCap: 0, monthlyTokenBudget: 0 });
    for (const withKey of [false, true]) {
        if (withKey) process.env.GEMINI_API_KEY = FAKE_KEY; else delete process.env.GEMINI_API_KEY;
        const res = await chat('show my orders and track order status');
        assert.equal(res.orders, undefined);
        assert.equal(res.action, undefined);
        assert.ok(!/ORD-SELLERID|ORD-CUSTOMER|Leaky Item|Customer Item/.test(res.reply), res.reply);
        const conv = await db.collection('ai_conversations').findOne({ _id: oid(res.conversationId) });
        assert.deepEqual(conv.messages[1].toolCalls, [], 'no tool calls recorded');
        if (!withKey) assert.match(res.reply, /Live orders/);
    }
    // Coins and offers shortcuts are not used either.
    delete process.env.GEMINI_API_KEY;
    const coins = await chat('my coins balance');
    assert.equal(coins.action, undefined);
    assert.doesNotMatch(coins.reply, /usable coins/);
});

test('validation: empty message 400, overlong message 400 like the customer path', async () => {
    await setSettings({ enabled: true, dailyUserMessageCap: 0, monthlyTokenBudget: 0 });
    const empty = await send('   ');
    assert.equal(empty.status, 400);
    const missing = await call('POST', '/ai/chat', { as: tokens.seller, body: { audience: 'seller' } });
    assert.equal(missing.status, 400);
    const long = await send('x'.repeat(501));
    assert.equal(long.status, 400);
    const customerLong = await call('POST', '/ai/chat', { as: tokens.user, body: { message: 'x'.repeat(501) } });
    assert.equal(customerLong.status, 400);
    assert.equal(geminiCalls.length, 0);
});

test('a seller token whose seller is gone or whose session was replaced is refused', async () => {
    await setSettings({ enabled: true, dailyUserMessageCap: 0, monthlyTokenBudget: 0 });
    assert.equal((await send('how do I add a product?', tokens.ghostSeller)).status, 401);
    assert.equal((await send('how do I add a product?', tokens.staleSeller)).status, 401);
});

test('the enabled switch, daily cap and monthly budget apply to sellers', async () => {
    await setSettings({ enabled: false, dailyUserMessageCap: 0, monthlyTokenBudget: 0 });
    const off = await chat('how do I add a product?');
    assert.equal(off.unavailable, true);
    assert.equal(off.reason, 'disabled');
    assert.match(off.reply, /AI Help is turned off/);
    assert.equal(geminiCalls.length, 0);

    await setSettings({ enabled: true, dailyUserMessageCap: 2, monthlyTokenBudget: 0 });
    await chat('how do I add a product?');
    await chat('how do I accept an order?');
    const third = await chat('how do payouts work?');
    assert.equal(third.reason, 'daily_cap');
    assert.equal(geminiCalls.length, 2);
    // The seller's cap is their own: the customer can still chat.
    const customer = ok(await call('POST', '/ai/chat', { as: tokens.user, body: { message: 'hello there friend' } }), 'customer');
    assert.ok(!customer.unavailable);

    await db.collection('ai_usage_daily').deleteMany({});
    await setSettings({ dailyUserMessageCap: 0, monthlyTokenBudget: 100 });
    await chat('how do I add photos?'); // 120 tokens: over the budget afterwards
    const over = await chat('how do variants work?');
    assert.equal(over.reason, 'budget', 'seller chat tokens count towards the monthly budget');
    await setSettings({ monthlyTokenBudget: 0 });
});

test('a customer sending audience:"seller" still gets the customer assistant', async () => {
    await setSettings({ enabled: true, dailyUserMessageCap: 0, monthlyTokenBudget: 0 });
    const res = ok(await call('POST', '/ai/chat', { as: tokens.user, body: { message: 'track my order', audience: 'seller' } }), 'customer as seller');
    assert.ok(Array.isArray(res.orders), 'the customer order shortcut still runs');
    assert.match(res.reply, /ORD-CUSTOMER/);
    const conv = await db.collection('ai_conversations').findOne({ _id: oid(res.conversationId) });
    assert.equal(conv.audience, 'customer');
    assert.equal(conv.userKey, String(ids.user));

    // Signed out with audience:"seller" is a customer too.
    const anon = ok(await call('POST', '/ai/chat', { body: { message: 'track my order', audience: 'seller' } }), 'anon');
    assert.match(anon.reply, /log in/i);
});
