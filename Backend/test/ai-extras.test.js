import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { startApp, stopApp, call, ok, tokenFor, oid } from './helpers/app.js';

const FAKE_KEY = 'AIza-test-secret-key-do-not-leak-123456';
process.env.GEMINI_API_KEY = FAKE_KEY;

const ids = {};
const tokens = {};
let db;
let gemini;
let parser;
const geminiCalls = [];
/** What the mocked Gemini HTTP call answers next. */
let nextGemini = () => ({ text: 'Happy to help!', prompt: 100, output: 50 });

const DAY = 24 * 60 * 60 * 1000;

before(async () => {
    db = await startApp();
    gemini = await import('../src/modules/commerce/ai/services/geminiClient.js');
    parser = await import('../src/modules/commerce/search/services/queryParser.service.js');
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

    ids.admin = oid(new mongoose.Types.ObjectId());
    ids.user = new mongoose.Types.ObjectId();
    ids.user2 = new mongoose.Types.ObjectId();
    await db.collection('admins').insertOne({ _id: ids.admin, email: 'admin_ai@example.com', role: 'ADMIN', adminType: 'super_admin', isActive: true });
    await db.collection('users').insertMany([{ _id: ids.user, name: 'Asha', phone: '9000000001' }, { _id: ids.user2, name: 'Ravi', phone: '9000000002' }]);
    tokens.admin = tokenFor('ADMIN', ids.admin, { adminType: 'super_admin' });
    tokens.user = tokenFor('USER', ids.user);
    tokens.user2 = tokenFor('USER', ids.user2);

    const { Seller } = await import('../src/modules/commerce/seller/models/seller.model.js');
    const { Product } = await import('../src/modules/commerce/admin/models/product.model.js');
    const { Attribute } = await import('../src/modules/commerce/admin/models/attribute.model.js');
    const { Category } = await import('../src/modules/commerce/admin/models/category.model.js');
    await Promise.all([Product.init(), Seller.init()]);

    const seller = await Seller.create({
        channels: { quick: { status: 'approved' }, shop: { status: 'approved' } },
        sellerName: 'AI Store', ownerName: 'O', ownerPhone: '9111111111', status: 'approved',
        location: { type: 'Point', coordinates: [77.59, 12.97], latitude: 12.97, longitude: 77.59 },
    });
    await Attribute.create([
        { name: 'Size', key: 'size', type: 'select', values: [{ value: 'S' }, { value: 'M' }, { value: 'L' }] },
        { name: 'Color', key: 'color', type: 'color', values: [{ value: 'Red' }, { value: 'Blue' }] },
    ]);
    const atta = await Category.create({ name: 'Atta' });
    const tees = await Category.create({ name: 'T-Shirts' });
    ids.attaCat = atta._id;
    ids.teeCat = tees._id;

    const v = (Size, Color, price) => ({ _id: new mongoose.Types.ObjectId(), name: `${Size} / ${Color}`, price, attributes: [{ name: 'Size', value: Size }, { name: 'Color', value: Color }] });
    const product = (fields) => Product.create({ sellerId: seller._id, approvalStatus: 'approved', price: 1, ...fields });

    ids.atta5 = (await product({ name: 'Whole Wheat Atta', brand: 'Aashirvaad', packSize: '5 kg', price: 280, categoryId: atta._id }))._id;
    ids.atta10 = (await product({ name: 'Whole Wheat Atta', brand: 'Aashirvaad', packSize: '10kg', price: 520, categoryId: atta._id }))._id;
    ids.redTee = (await product({ name: 'Cotton Tee', brand: 'Acme', price: 300, categoryId: tees._id, variants: [v('M', 'Red', 300), v('L', 'Blue', 350)] }))._id;
    ids.blueTee = (await product({ name: 'Plain Tee', brand: 'Bolt', price: 320, categoryId: tees._id, variants: [v('M', 'Blue', 320)] }))._id;
    ids.dearTee = (await product({ name: 'Designer Tee', brand: 'Acme', price: 2000, categoryId: tees._id, variants: [v('M', 'Red', 2000)] }))._id;
    ids.shopTee = (await product({ name: 'Shop Only Tee', brand: 'Acme', price: 310, categoryId: tees._id, channels: { quick: false, shop: true }, variants: [v('M', 'Red', 310)] }))._id;
    ids.goneTee = (await product({ name: 'Sold Out Tee', brand: 'Acme', price: 305, categoryId: tees._id, isAvailable: false, variants: [v('M', 'Red', 305)] }))._id;
    ids.jam = (await product({ name: 'Mixed Fruit Jam', brand: 'Farm', price: 150 }))._id;
    ids.butter = (await product({ name: 'Salted Butter', brand: 'Farm', price: 60 }))._id;
    ids.oldPair = (await product({ name: 'Old Bread', brand: 'Farm', price: 40 }))._id;
    ids.cancelled = (await product({ name: 'Cancelled Cheese', brand: 'Farm', price: 90 }))._id;
});

after(async () => {
    gemini?.setGeminiTransport(null);
    await stopApp();
});

const setSettings = async (body) => ok(await call('PUT', '/admin/ai/settings', { as: tokens.admin, body }), 'put settings');
const chat = async (message, as = tokens.user, extra = {}) => ok(await call('POST', '/ai/chat', { as, body: { message, ...extra } }), `chat ${message}`);

/* ------------------------------------------------------------ query parser */

const VOCAB = {
    attributes: [{ name: 'Size', type: 'select', values: ['S', 'M', 'L', 'XL'] }, { name: 'Color', type: 'color', values: ['Red', 'Blue'] }],
    brands: ['Aashirvaad', 'Acme'],
    categories: [{ id: 'c-tee', name: 'T-Shirts' }, { id: 'c-atta', name: 'Atta' }],
};

test('parser: sizes, colours, price and category from a natural query', () => {
    const r = parser.parseSearchQuery('red tshirt under 500 size M', VOCAB);
    assert.equal(r.filters.maxPrice, 500);
    assert.deepEqual(r.filters.attr, { Size: ['M'], Color: ['Red'] });
    assert.equal(r.filters.categoryId, 'c-tee');
    assert.equal(r.q, '');
    assert.deepEqual(r.chips.map((c) => c.id).sort(), ['attr:Color:Red', 'attr:Size:M', 'category:c-tee', 'maxPrice']);
});

test('parser: pack sizes, either order, and Hindi-ish shorthand', () => {
    for (const q of ['atta 5kg', '5kg atta', '5 kilo atta', 'mujhe 5 kg atta chahiye']) {
        const r = parser.parseSearchQuery(q, VOCAB);
        assert.equal(r.filters.packSize, '5 kg', q);
        assert.equal(r.filters.categoryId, 'c-atta', q);
        assert.equal(r.q, '', q);
    }
    assert.equal(parser.parseSearchQuery('tel 1 litre', VOCAB).filters.packSize, '1 L');
    assert.equal(parser.parseSearchQuery('500gm dal', VOCAB).filters.packSize, '500 g');
    const hindi = parser.parseSearchQuery('kurta 500 ke neeche', VOCAB);
    assert.equal(hindi.filters.maxPrice, 500);
    assert.equal(hindi.q, 'kurta');
    assert.equal(parser.parseSearchQuery('dal 200 se upar', VOCAB).filters.minPrice, 200);
    const cheap = parser.parseSearchQuery('sasta aashirvaad atta', VOCAB);
    assert.equal(cheap.sort, 'price_asc');
    assert.deepEqual(cheap.filters.brand, ['Aashirvaad']);
});

test('parser: price phrases', () => {
    const p = (q) => parser.parseSearchQuery(q, VOCAB).filters;
    assert.equal(p('shoes under 500').maxPrice, 500);
    assert.equal(p('shoes below ₹1,000').maxPrice, 1000);
    assert.equal(p('shoes less than rs 750').maxPrice, 750);
    assert.equal(p('shoes under 1k').maxPrice, 1000);
    assert.equal(p('shoes above 2000').minPrice, 2000);
    assert.deepEqual([p('rice between 200 and 400').minPrice, p('rice between 200 and 400').maxPrice], [200, 400]);
    assert.deepEqual([p('rice between ₹400 and ₹200').minPrice, p('rice between ₹400 and ₹200').maxPrice], [200, 400]);
    assert.deepEqual([p('rice 200-400').minPrice, p('rice 200-400').maxPrice], [200, 400]);
    assert.equal(p('rice 2-3 kg').minPrice, undefined, 'a weight range is not a price');
    assert.equal(parser.parseSearchQuery('milk', VOCAB).parsed, false);
});

test('parser: removed chips stay removed; one-letter sizes need "size"', () => {
    const r = parser.parseSearchQuery('red tshirt under 500', VOCAB, { exclude: ['maxPrice'] });
    assert.equal(r.filters.maxPrice, undefined);
    assert.ok(!r.chips.some((c) => c.id === 'maxPrice'));
    assert.equal(parser.parseSearchQuery('m tshirt', VOCAB).filters.attr, undefined);
});

/* ---------------------------------------------------------- smart endpoint */

const smart = async (params) => {
    const qs = new URLSearchParams({ smart: '1', ...params }).toString();
    return ok(await call('GET', `/catalog/search/products?${qs}`), `smart ${qs}`);
};
const names = (res) => res.products.map((p) => p.name).sort();

test('smart search applies parsed filters and returns them as chips', async () => {
    const atta = await smart({ q: '5kg atta' });
    assert.equal(atta.products.length, 1);
    assert.equal(String(atta.products[0]._id), String(ids.atta5));
    assert.equal(atta.smart.source, 'rules');
    assert.deepEqual(atta.smart.appliedFilters.map((c) => c.type).sort(), ['category', 'packSize']);

    const all = await smart({ q: '5kg atta', smartExclude: 'packSize' });
    assert.equal(all.products.length, 2, 'removing the pack-size chip widens the results');

    const tee = await smart({ q: 'red tshirt under 500 size M', fulfilmentMode: 'quick' });
    assert.ok(names(tee).includes('Cotton Tee'));
    assert.ok(!names(tee).includes('Plain Tee'), 'blue only');
    assert.ok(!names(tee).includes('Designer Tee'), 'over 500');
    assert.ok(!names(tee).includes('Shop Only Tee'), 'not in quick');
});

test('smart search asks Gemini only when rules find nothing and it is enabled; answer is validated and cached', async () => {
    await setSettings({ enabled: true, searchLlmFallback: false, dailyUserMessageCap: 0, monthlyTokenBudget: 0 });
    geminiCalls.length = 0;
    await smart({ q: 'something for breakfast rotis' });
    assert.equal(geminiCalls.length, 0, 'fallback off');

    await setSettings({ searchLlmFallback: true });
    nextGemini = () => ({ text: JSON.stringify({ query: 'wheat', maxPrice: 300, brand: 'NotARealBrand', category: 'Atta' }), prompt: 20, output: 10 });
    const res = await smart({ q: 'something for breakfast rotis' , page: '1' });
    assert.equal(geminiCalls.length, 1);
    assert.equal(res.smart.source, 'llm');
    const chipIds = res.smart.appliedFilters.map((c) => c.id);
    assert.ok(chipIds.includes('maxPrice'));
    assert.ok(chipIds.includes(`category:${ids.attaCat}`));
    assert.ok(!chipIds.some((id) => id.startsWith('brand:')), 'brands not in the DB are dropped');
    assert.deepEqual(res.products.map((p) => String(p._id)), [String(ids.atta5)]);
    const body = geminiCalls[0].body;
    assert.equal(body.generationConfig.responseMimeType, 'application/json');
    assert.ok(body.generationConfig.responseSchema);
    assert.ok(geminiCalls[0].options.timeout <= 3000);

    await smart({ q: 'something for breakfast rotis', page: '1', limit: '10' });
    assert.equal(geminiCalls.length, 1, 'cached');
    await smart({ q: 'aashirvaad', page: '1' });
    assert.equal(geminiCalls.length, 1, 'rules parsed a brand, so no model call');
    await setSettings({ searchLlmFallback: false });
    nextGemini = () => ({ text: 'Happy to help!', prompt: 100, output: 50 });
});

/* ------------------------------------------------------------- AI settings */

test('admin settings never expose the API key', async () => {
    const s = ok(await call('GET', '/admin/ai/settings', { as: tokens.admin }), 'get settings');
    assert.equal(s.apiKeyConfigured, true);
    assert.equal(s.retentionDays, 90);
    const saved = await setSettings({ model: 'gemini-2.5-pro', systemPromptAddendum: 'Be brief.', apiKey: 'attempted-overwrite', GEMINI_API_KEY: 'x' });
    assert.equal(saved.model, 'gemini-2.5-pro');
    for (const body of [s, saved]) {
        const json = JSON.stringify(body);
        assert.ok(!json.includes(FAKE_KEY), 'key value');
        assert.ok(!json.includes(FAKE_KEY.slice(-8)), 'key suffix');
        assert.ok(!('apiKey' in body) && !('GEMINI_API_KEY' in body));
    }
    const denied = await call('GET', '/admin/ai/settings', { as: tokens.user });
    assert.notEqual(denied.status, 200);
    const bad = await call('PUT', '/admin/ai/settings', { as: tokens.admin, body: { retentionDays: 0 } });
    assert.equal(bad.status, 400);
    await setSettings({ model: '', systemPromptAddendum: '' });
});

/* ------------------------------------------------- conversations and caps */

beforeEach(async () => {
    await db.collection('ai_usage_daily').deleteMany({});
});

test('conversations are stored with tokens, model and a retention expiry; the key goes in a header', async () => {
    await setSettings({ enabled: true, dailyUserMessageCap: 0, monthlyTokenBudget: 0, retentionDays: 30, systemPromptAddendum: 'Mention free returns.' });
    geminiCalls.length = 0;
    const first = await chat('hello there friend');
    assert.equal(first.reply, 'Happy to help!');
    assert.ok(first.conversationId);
    assert.equal(first.usage, undefined, 'token counts are not sent to shoppers');
    const second = await chat('tell me something nice', tokens.user, { conversationId: first.conversationId, history: [{ role: 'user', text: 'hello there friend' }, { role: 'assistant', text: 'Happy to help!' }] });
    assert.equal(second.conversationId, first.conversationId);

    assert.equal(geminiCalls[0].options.headers['x-goog-api-key'], FAKE_KEY);
    assert.ok(!geminiCalls[0].url.includes(FAKE_KEY));
    assert.match(geminiCalls[0].body.systemInstruction.parts[0].text, /Mention free returns\./);

    const conv = await db.collection('ai_conversations').findOne({ _id: oid(first.conversationId) });
    assert.equal(String(conv.userId), String(ids.user));
    assert.equal(conv.messages.length, 4);
    assert.deepEqual(conv.messages.map((m) => m.role), ['user', 'assistant', 'user', 'assistant']);
    assert.equal(conv.totalTokens, 300);
    assert.ok(conv.model);
    const days = (conv.expiresAt - Date.now()) / DAY;
    assert.ok(days > 29 && days <= 30.01, `expires in ~30 days (${days})`);
    const idx = await db.collection('ai_conversations').indexes();
    assert.ok(idx.some((i) => i.key.expiresAt === 1 && i.expireAfterSeconds === 0), 'TTL index');

    // Someone else cannot append to it.
    const other = await chat('hello from ravi', tokens.user2, { conversationId: first.conversationId });
    assert.notEqual(other.conversationId, first.conversationId);

    // Tool calls are recorded for intent answers.
    const offers = await chat('any coupons today?');
    const offerConv = await db.collection('ai_conversations').findOne({ _id: oid(offers.conversationId) });
    assert.equal(offerConv.messages[1].toolCalls[0].name, 'getActiveOffers');

    const list = ok(await call('GET', `/admin/ai/conversations?userId=${ids.user}`, { as: tokens.admin }), 'list');
    assert.ok(list.conversations.length >= 2);
    assert.ok(list.conversations.every((c) => String(c.userId) === String(ids.user)));
    assert.equal(list.conversations.find((c) => String(c._id) === first.conversationId).user.name, 'Asha');
    const future = ok(await call('GET', '/admin/ai/conversations?from=2099-01-01', { as: tokens.admin }), 'future');
    assert.equal(future.total, 0);
    const one = ok(await call('GET', `/admin/ai/conversations/${first.conversationId}`, { as: tokens.admin }), 'transcript');
    assert.equal(one.conversation.messages.length, 4);
    assert.equal(one.conversation.userKey, undefined);

    const usage = ok(await call('GET', '/admin/ai/usage', { as: tokens.admin }), 'usage');
    assert.ok(usage.totals.totalTokens >= 450);
    assert.ok(usage.daily[0].estimatedCostUsd > 0);
    assert.equal(String(usage.topUsers[0].userId), String(ids.user));
});

test('per-user daily cap', async () => {
    await setSettings({ enabled: true, dailyUserMessageCap: 2, monthlyTokenBudget: 0 });
    await chat('hello there one');
    await chat('hello there two');
    const third = await chat('hello there three');
    assert.equal(third.unavailable, true);
    assert.equal(third.reason, 'daily_cap');
    const other = await chat('hello from another user', tokens.user2);
    assert.ok(!other.unavailable, 'the cap is per user');
});

test('monthly token budget and the enabled switch turn the assistant off gracefully', async () => {
    await setSettings({ enabled: true, dailyUserMessageCap: 0, monthlyTokenBudget: 100 });
    const first = await chat('hello budget one');
    assert.ok(!first.unavailable);
    geminiCalls.length = 0;
    const second = await chat('hello budget two');
    assert.equal(second.reason, 'budget');
    assert.equal(geminiCalls.length, 0, 'no model call once over budget');
    const usage = ok(await call('GET', '/admin/ai/usage', { as: tokens.admin }), 'usage');
    assert.equal(usage.month.exhausted, true);

    await setSettings({ monthlyTokenBudget: 0, enabled: false });
    const off = await chat('hello switched off');
    assert.equal(off.reason, 'disabled');
    await setSettings({ enabled: true });
});

/* ---------------------------------------------------------- recommendations */

const deliveredOrder = ({ items, mode = 'quick', status = 'delivered', daysAgo = 5, group = '' }) => ({
    _id: new mongoose.Types.ObjectId(),
    userId: ids.user,
    sellerId: new mongoose.Types.ObjectId(),
    fulfilmentMode: mode,
    orderStatus: status,
    orderGroupId: group,
    items: items.map((id) => ({ itemId: String(id), name: 'x', price: 1, quantity: 1 })),
    deliveryAddress: {},
    createdAt: new Date(Date.now() - daysAgo * DAY),
    updatedAt: new Date(),
});

test('nightly job builds co-purchase pairs per channel from delivered orders in the last 90 days', async () => {
    await db.collection('orders').insertMany([
        deliveredOrder({ items: [ids.redTee, ids.jam] }),
        deliveredOrder({ items: [ids.redTee, ids.jam, ids.butter] }),
        // One checkout split across two stores is one basket.
        deliveredOrder({ items: [ids.redTee], group: 'G1' }),
        deliveredOrder({ items: [ids.butter], group: 'G1' }),
        deliveredOrder({ items: [ids.redTee, ids.atta5], mode: 'standard' }),
        deliveredOrder({ items: [ids.redTee, ids.cancelled], status: 'cancelled_by_user' }),
        deliveredOrder({ items: [ids.redTee, ids.oldPair], daysAgo: 120 }),
        deliveredOrder({ items: [ids.redTee, ids.goneTee] }),
    ]);
    const { buildCoPurchaseRecommendations } = await import('../src/modules/commerce/recommendations/services/recommendation.service.js');
    const result = await buildCoPurchaseRecommendations({ days: 90 });
    assert.ok(result.products > 0);

    const quick = await db.collection('product_recommendations').findOne({ productId: ids.redTee, channel: 'quick' });
    const related = Object.fromEntries(quick.related.map((r) => [String(r.productId), r.count]));
    assert.equal(related[String(ids.jam)], 2);
    assert.equal(related[String(ids.butter)], 2, 'one direct basket + the split checkout');
    assert.equal(related[String(ids.cancelled)], undefined, 'cancelled orders do not count');
    assert.equal(related[String(ids.oldPair)], undefined, 'older than 90 days');
    assert.equal(related[String(ids.atta5)], undefined, 'shop orders stay in the shop channel');
    const shop = await db.collection('product_recommendations').findOne({ productId: ids.redTee, channel: 'shop' });
    assert.deepEqual(shop.related.map((r) => String(r.productId)), [String(ids.atta5)]);

    const recs = (params) => call('GET', `/catalog/products/${ids.redTee}/recommendations?${new URLSearchParams(params)}`);
    const q = ok(await recs({ type: 'frequently_bought', fulfilmentMode: 'quick' }), 'fbt quick');
    const qIds = q.products.map((p) => String(p._id));
    assert.deepEqual(qIds.slice(0, 2).sort(), [String(ids.jam), String(ids.butter)].sort());
    assert.ok(!qIds.includes(String(ids.atta5)));
    assert.ok(!qIds.includes(String(ids.goneTee)), 'out of stock is left out');
    const s = ok(await recs({ type: 'frequently_bought', fulfilmentMode: 'standard' }), 'fbt shop');
    assert.deepEqual(s.products.map((p) => String(p._id)), [String(ids.atta5)]);
    const bad = await recs({ type: 'nope' });
    assert.equal(bad.status, 400);
});

test('similar: same category, overlapping attributes, price band, channel-aware and in stock', async () => {
    const res = ok(await call('GET', `/catalog/products/${ids.redTee}/recommendations?type=similar&fulfilmentMode=quick`), 'similar quick');
    const got = res.products.map((p) => String(p._id));
    assert.deepEqual(got, [String(ids.blueTee)], 'Plain Tee only: Designer is out of band, Shop Only not in quick, Sold Out out of stock');
    const shop = ok(await call('GET', `/catalog/products/${ids.redTee}/recommendations?type=similar&fulfilmentMode=standard`), 'similar shop');
    const shopIds = shop.products.map((p) => String(p._id));
    assert.equal(shopIds[0], String(ids.shopTee), 'shares Size M and Red, ranks first');
    assert.ok(shopIds.includes(String(ids.blueTee)));
    assert.ok(!shopIds.includes(String(ids.dearTee)));
});
