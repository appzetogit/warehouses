/**
 * The shopping assistant shows real products instead of asking in circles:
 * word-based matching, follow-ups that refine the search, and Gemini told what
 * the store really sells. Gemini is mocked; no key is used unless a test sets one.
 */
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { startDb, stopDb, clearDb } from './helpers/db.js';

const { handleAssistantChat } = await import('../src/modules/commerce/ai/services/geminiAssistant.service.js');
const { setGeminiTransport } = await import('../src/modules/commerce/ai/services/geminiClient.js');
const { Product } = await import('../src/modules/commerce/admin/models/product.model.js');
const { Category } = await import('../src/modules/commerce/admin/models/category.model.js');

const oid = () => new mongoose.Types.ObjectId();
const womenId = oid();
const topsId = oid();
const kurtasId = oid();

const product = (name, categoryId, categoryName, price, extra = {}) => ({
    _id: oid(), name, categoryId, categoryName, price, mrp: price + 100,
    isAvailable: true, approvalStatus: 'approved', sellerId: oid(), createdAt: new Date(), ...extra,
});

before(startDb);
after(stopDb);
beforeEach(async () => {
    await clearDb();
    delete process.env.GEMINI_API_KEY;
    setGeminiTransport();
    await Category.collection.insertMany([
        { _id: womenId, name: 'Women', parentId: null, isActive: true },
        { _id: topsId, name: 'Tops', parentId: womenId, isActive: true },
        { _id: kurtasId, name: 'Kurtas', parentId: womenId, isActive: true },
    ]);
    await Product.collection.insertMany([
        product('Pink Print T Shirt for Women', topsId, 'Tops', 499),
        product('Oversized T-Shirt Teal', topsId, 'Tops', 899),
        product('Floral Straight Kurta', kurtasId, 'Kurtas', 1299),
        product('Hidden Pending Kurta', kurtasId, 'Kurtas', 10, { approvalStatus: 'pending' }),
    ]);
});

const names = (r) => (r.products || []).map((p) => p.name).sort();
const user = (text) => ({ role: 'user', text });
const bot = (text) => ({ role: 'assistant', text });

test('"find the tshirt" shows t-shirts, whatever the spelling', async () => {
    for (const message of ['find the tshirt', 'show me t-shirts', 'T Shirt', 'any tees?  show']) {
        const r = await handleAssistantChat({ message });
        assert.deepEqual(names(r), ['Oversized T-Shirt Teal', 'Pink Print T Shirt for Women'], message);
    }
});

test('a follow-up refines the search instead of starting over', async () => {
    const history = [user('find the tshirt'), bot('Here are 2 options')];
    const women = await handleAssistantChat({ message: 'women', history });
    assert.equal(names(women).length, 2, 'women covers the Women subcategories');
    assert.match(women.reply, /t-shirts women/);

    const oversized = await handleAssistantChat({ message: 'oversized', history: [...history, user('women'), bot('...')] });
    assert.deepEqual(names(oversized), ['Oversized T-Shirt Teal']);

    const cheap = await handleAssistantChat({ message: 'under 500', history });
    assert.deepEqual(names(cheap), ['Pink Print T Shirt for Women']);
});

test('a new product word replaces the old search', async () => {
    const r = await handleAssistantChat({ message: 'kurta', history: [user('find the tshirt'), bot('...')] });
    assert.deepEqual(names(r), ['Floral Straight Kurta']);
});

test('"women" matches the category and "men" never matches women', async () => {
    assert.equal(names(await handleAssistantChat({ message: 'women' })).length, 3);
    const men = await handleAssistantChat({ message: 'men' });
    assert.equal(names(men).length, 0, 'we sell nothing for men');
    assert.match(men.reply, /couldn't find/);
    assert.match(men.reply, /Tops/, 'offers what the store really has');
    assert.ok(men.suggestions.includes('Tops'));
});

test('"1" picks from the numbered list, it is not searched as text', async () => {
    const history = [user('tops'), bot('Which one?\n1. **Oversized**: roomy\n2. **Kurtas**: long')];
    assert.deepEqual(names(await handleAssistantChat({ message: '1', history })), ['Oversized T-Shirt Teal']);
    assert.deepEqual(names(await handleAssistantChat({ message: '2', history: [bot('1. **Oversized**\n2. **Kurtas**')] })), ['Floral Straight Kurta']);
});

test('unapproved products are never shown', async () => {
    const r = await handleAssistantChat({ message: 'kurta' });
    assert.ok(!names(r).includes('Hidden Pending Kurta'));
});

test('store questions go to the assistant, not the catalogue', async () => {
    const r = await handleAssistantChat({ message: 'What is Quick Delivery?' });
    assert.equal(names(r).length, 0);
});

test('Gemini gets the real categories and the no-repeat rules', async () => {
    process.env.GEMINI_API_KEY = 'test-key';
    let sent = null;
    setGeminiTransport(async (url, body) => {
        sent = body;
        return { data: { candidates: [{ content: { parts: [{ text: 'We do not have jackets yet, try Tops.' }] } }], usageMetadata: {} } };
    });
    const r = await handleAssistantChat({ message: 'jackets', history: [user('jackets please'), bot('...')] });
    assert.equal(r.reply, 'We do not have jackets yet, try Tops.');
    const system = JSON.stringify(sent.systemInstruction || sent.system_instruction);
    assert.match(system, /Tops/);
    assert.match(system, /Kurtas/);
    assert.match(system, /never repeat a question/i);
    assert.match(system, /Never invent products/);
    assert.ok(r.suggestions.includes('Tops'));
});
