/**
 * Seller AI image studio: enhance one photo or draw three mannequin shots,
 * against a mocked Gemini. Covers the daily cap, failures handing images back,
 * the billing refusal the admin is told about, and that sellers only see their own jobs.
 */
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import mongoose from 'mongoose';
import sharp from 'sharp';

const uploadRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'wh-ai-images-'));
process.env.UPLOAD_STORAGE_ROOT = uploadRoot;
process.env.GEMINI_API_KEY = 'AIza-test-image-key';

const { startApp, stopApp, call, ok, tokenFor } = await import('./helpers/app.js');

let db;
let gemini;
let studio;
let sourceUrl;
const tokens = {};
const ids = {};
const geminiCalls = [];
/** What the mocked Gemini call does next: 'image' | 'empty' | an Error. */
let nextGemini = () => 'image';
let outputPng;

const settle = async (as, jobId) => {
    for (let i = 0; i < 50; i += 1) {
        const res = ok(await call('GET', `/seller/ai/images/jobs/${jobId}`, { as }), 'job');
        if (res.job.status !== 'running') return res.job;
        await new Promise((r) => setTimeout(r, 20));
    }
    throw new Error('job never finished');
};

const start = (body, as = tokens.seller) => call('POST', '/seller/ai/images/jobs', { as, body });

before(async () => {
    db = await startApp();
    gemini = await import('../src/modules/commerce/ai/services/geminiClient.js');
    studio = await import('../src/modules/commerce/ai/services/imageStudio.service.js');
    outputPng = await sharp({ create: { width: 48, height: 64, channels: 3, background: '#f4f4f4' } }).png().toBuffer();
    gemini.setGeminiTransport(async (url, body, options) => {
        geminiCalls.push({ url, body, options });
        const r = nextGemini(body);
        if (r instanceof Error) throw r;
        const parts = r === 'image' ? [{ inlineData: { mimeType: 'image/png', data: outputPng.toString('base64') } }] : [];
        return { data: { candidates: [{ content: { parts }, finishReason: r === 'image' ? 'STOP' : 'IMAGE_SAFETY' }], usageMetadata: { promptTokenCount: 300, candidatesTokenCount: 1290 } } };
    });

    const { saveImageBuffer } = await import('../src/services/storage.service.js');
    const photo = await sharp({ create: { width: 80, height: 100, channels: 3, background: '#cc2233' } }).jpeg().toBuffer();
    sourceUrl = (await saveImageBuffer(photo, 'sellers/products', { mimeType: 'image/jpeg' })).url;

    const { Seller } = await import('../src/modules/commerce/seller/models/seller.model.js');
    const makeSeller = (name, phone) => Seller.create({
        channels: { quick: { status: 'approved' }, shop: { status: 'approved' } },
        sellerName: name, ownerName: 'O', ownerPhone: phone, status: 'approved',
        location: { type: 'Point', coordinates: [77.59, 12.97], latitude: 12.97, longitude: 77.59 },
    });
    ids.seller = (await makeSeller('Image Store', '9111111121'))._id;
    ids.other = (await makeSeller('Other Store', '9111111122'))._id;
    ids.user = new mongoose.Types.ObjectId();
    ids.admin = new mongoose.Types.ObjectId();
    await db.collection('users').insertOne({ _id: ids.user, name: 'Asha', phone: '9000000031', isActive: true });
    tokens.seller = tokenFor('SELLER', ids.seller);
    tokens.other = tokenFor('SELLER', ids.other);
    tokens.user = tokenFor('USER', ids.user);
    await db.collection('admins').insertOne({ _id: ids.admin, email: 'admin_img@example.com', role: 'ADMIN', adminType: 'super_admin', isActive: true });
    tokens.admin = tokenFor('ADMIN', ids.admin, { adminType: 'super_admin' });
});

beforeEach(async () => {
    geminiCalls.length = 0;
    nextGemini = () => 'image';
    await db.collection('ai_usage_daily').deleteMany({});
    await db.collection('ai_image_jobs').deleteMany({});
    await db.collection('ai_settings').deleteMany({});
    const { clearAiSettingsCache } = await import('../src/modules/commerce/ai/services/aiSettings.service.js');
    clearAiSettingsCache();
});

after(async () => {
    gemini.setGeminiTransport();
    await stopApp();
    await fs.rm(uploadRoot, { recursive: true, force: true });
});

test('status shows the studio on with the default cap of 20', async () => {
    const s = ok(await call('GET', '/seller/ai/images/status', { as: tokens.seller }), 'status');
    assert.equal(s.enabled, true);
    assert.equal(s.dailyCap, 20);
    assert.equal(s.usedToday, 0);
    assert.equal(s.mannequinCount, 3);
    assert.deepEqual(s.styles.map((x) => x.key), ['mannequin', 'invisible', 'flat_lay']);
});

test('enhance makes one image from the uploaded photo, keeping the key out of the URL', async () => {
    const res = await start({ kind: 'enhance', imageUrl: sourceUrl });
    assert.equal(res.status, 202, JSON.stringify(res.body));
    const job = await settle(tokens.seller, res.body.data.job.id);
    assert.equal(job.status, 'done');
    assert.equal(job.results.length, 1);
    assert.match(job.results[0], new RegExp(`/uploads/sellers/ai/${ids.seller}/`));
    await fs.access(path.join(uploadRoot, job.results[0].replace(/^.*\/uploads\//, '')));

    assert.equal(geminiCalls.length, 1);
    const call0 = geminiCalls[0];
    assert.match(call0.url, /gemini-3\.1-flash-image:generateContent$/);
    assert.ok(!call0.url.includes('AIza'), 'the key travels in a header, never the URL');
    assert.equal(call0.options.headers['x-goog-api-key'], 'AIza-test-image-key');
    assert.deepEqual(call0.body.generationConfig.responseModalities, ['IMAGE']);
    assert.equal(call0.body.contents[0].parts[0].inlineData.mimeType, 'image/jpeg');
    assert.match(call0.body.contents[0].parts[1].text, /white background/);

    const s = ok(await call('GET', '/seller/ai/images/status', { as: tokens.seller }), 'status');
    assert.equal(s.usedToday, 1);
});

test('mannequin shots make three images in the chosen style', async () => {
    const res = await start({ kind: 'mannequin', style: 'invisible', imageUrl: sourceUrl });
    const job = await settle(tokens.seller, res.body.data.job.id);
    assert.equal(job.status, 'done');
    assert.equal(job.results.length, 3);
    assert.equal(geminiCalls.length, 3);
    assert.ok(geminiCalls.every((c) => /ghost mannequin/.test(c.body.contents[0].parts[1].text)));
    const s = ok(await call('GET', '/seller/ai/images/status', { as: tokens.seller }), 'status');
    assert.equal(s.usedToday, 3);
});

test('the daily cap is enforced, counting both kinds', async () => {
    await call('PUT', '/admin/ai/settings', { as: tokens.admin, body: { sellerDailyImageCap: 4 } });
    const first = await start({ kind: 'mannequin', imageUrl: sourceUrl });
    await settle(tokens.seller, first.body.data.job.id);
    const second = await start({ kind: 'mannequin', imageUrl: sourceUrl });
    assert.equal(second.status, 400);
    assert.match(second.body.message, /Only 1 AI image left today, and this needs 3/);
    const enhance = await start({ kind: 'enhance', imageUrl: sourceUrl });
    assert.equal(enhance.status, 202);
    await settle(tokens.seller, enhance.body.data.job.id);
    const third = await start({ kind: 'enhance', imageUrl: sourceUrl });
    assert.equal(third.status, 400);
    assert.match(third.body.message, /used all 4 AI images/);
});

test('two clicks at once cannot both get past the cap', async () => {
    await call('PUT', '/admin/ai/settings', { as: tokens.admin, body: { sellerDailyImageCap: 3 } });
    const [a, b] = await Promise.all([
        start({ kind: 'mannequin', imageUrl: sourceUrl }),
        start({ kind: 'mannequin', imageUrl: sourceUrl }),
    ]);
    assert.deepEqual([a.status, b.status].sort(), [202, 400]);
});

test('images that fail are handed back to the allowance', async () => {
    let n = 0;
    nextGemini = () => (n++ === 1 ? 'empty' : 'image');
    const res = await start({ kind: 'mannequin', imageUrl: sourceUrl });
    const job = await settle(tokens.seller, res.body.data.job.id);
    assert.equal(job.status, 'done');
    assert.equal(job.results.length, 2);
    const s = ok(await call('GET', '/seller/ai/images/status', { as: tokens.seller }), 'status');
    assert.equal(s.usedToday, 2);
});

test('a billing refusal gives the seller a plain message and tells the admin why', async () => {
    nextGemini = () => Object.assign(new Error('Request failed with status code 429'), {
        response: { status: 429, data: { error: { message: 'You exceeded your current quota. Quota exceeded for metric: generate_content_free_tier_input_token_count, limit: 0' } } },
    });
    const res = await start({ kind: 'enhance', imageUrl: sourceUrl });
    const job = await settle(tokens.seller, res.body.data.job.id);
    assert.equal(job.status, 'failed');
    assert.match(job.error, /not available for this store yet/);
    const s = ok(await call('GET', '/seller/ai/images/status', { as: tokens.seller }), 'status');
    assert.equal(s.usedToday, 0, 'nothing was made, so nothing is used');

    const settings = ok(await call('GET', '/admin/ai/settings', { as: tokens.admin }), 'settings');
    assert.ok(settings.imageBillingRefusedAt, 'the admin sees the refusal');

    nextGemini = () => 'image';
    const okJob = await start({ kind: 'enhance', imageUrl: sourceUrl });
    await settle(tokens.seller, okJob.body.data.job.id);
    const after = ok(await call('GET', '/admin/ai/settings', { as: tokens.admin }), 'settings');
    assert.equal(after.imageBillingRefusedAt, null, 'it clears once a job succeeds');
});

test('only photos stored on this server are accepted', async () => {
    for (const imageUrl of ['https://example.com/x.jpg', '/uploads/../../etc/passwd', '/uploads/sellers/products/missing.jpg', '']) {
        const res = await start({ kind: 'enhance', imageUrl });
        assert.equal(res.status, 400, imageUrl);
    }
    assert.equal(geminiCalls.length, 0);
});

test('bad kinds and styles are refused', async () => {
    assert.equal((await start({ kind: 'paint', imageUrl: sourceUrl })).status, 400);
    assert.equal((await start({ kind: 'mannequin', style: 'astronaut', imageUrl: sourceUrl })).status, 400);
});

test('switched off by the admin, nothing is generated', async () => {
    await call('PUT', '/admin/ai/settings', { as: tokens.admin, body: { imageStudioEnabled: false } });
    const s = ok(await call('GET', '/seller/ai/images/status', { as: tokens.seller }), 'status');
    assert.equal(s.enabled, false);
    const res = await start({ kind: 'enhance', imageUrl: sourceUrl });
    assert.equal(res.status, 400);
    assert.equal(geminiCalls.length, 0);
});

test('a seller cannot read another seller\'s job, and customers cannot use the studio', async () => {
    const res = await start({ kind: 'enhance', imageUrl: sourceUrl });
    await settle(tokens.seller, res.body.data.job.id);
    const other = await call('GET', `/seller/ai/images/jobs/${res.body.data.job.id}`, { as: tokens.other });
    assert.equal(other.status, 404);
    assert.equal((await start({ kind: 'enhance', imageUrl: sourceUrl }, tokens.user)).status, 403);
});

test('the usage page counts images and prices them', async () => {
    await call('PUT', '/admin/ai/settings', { as: tokens.admin, body: { imageCostUsd: 0.05, inputCostPer1M: 0, outputCostPer1M: 0 } });
    const res = await start({ kind: 'mannequin', imageUrl: sourceUrl });
    await settle(tokens.seller, res.body.data.job.id);
    const usage = ok(await call('GET', '/admin/ai/usage', { as: tokens.admin }), 'usage');
    assert.equal(usage.totals.images, 3);
    assert.equal(usage.totals.estimatedCostUsd, 0.15);
});

test('a job left running by a restart is reported failed and its images handed back', async () => {
    const { AiImageJob } = await import('../src/modules/commerce/ai/models/aiImageJob.model.js');
    const { AiUsageDaily } = await import('../src/modules/commerce/ai/models/aiConversation.model.js');
    const { dayKey } = await import('../src/modules/commerce/ai/services/aiUsage.service.js');
    const created = new Date(Date.now() - 10 * 60 * 1000);
    await AiUsageDaily.create({ day: dayKey(created), userKey: `seller:${ids.seller}`, images: 3 });
    const job = await AiImageJob.create({ sellerId: ids.seller, kind: 'mannequin', style: 'mannequin', sourceUrl, count: 3 });
    await AiImageJob.collection.updateOne({ _id: job._id }, { $set: { createdAt: created } });
    const res = ok(await call('GET', `/seller/ai/images/jobs/${job._id}`, { as: tokens.seller }), 'job');
    assert.equal(res.job.status, 'failed');
    const row = await AiUsageDaily.findOne({ userKey: `seller:${ids.seller}` }).lean();
    assert.equal(row.images, 0);
    assert.ok(studio.MANNEQUIN_COUNT === 3);
});
