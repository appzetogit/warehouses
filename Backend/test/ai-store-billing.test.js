/**
 * Per-store AI access and AI image billing: stores are off until an admin turns
 * them on, images come out of the plan's allowance first and then cost
 * extraImagePrice each, only produced images are charged, concurrent jobs
 * cannot overspend, and the monthly billing run puts the charges on the
 * subscription invoice once. Gemini is mocked throughout.
 */
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import mongoose from 'mongoose';
import sharp from 'sharp';

const uploadRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'wh-ai-billing-'));
process.env.UPLOAD_STORAGE_ROOT = uploadRoot;
process.env.GEMINI_API_KEY = 'AIza-test-store-billing-key';

const { startApp, stopApp, call, callText, ok, tokenFor } = await import('./helpers/app.js');

let db;
let gemini;
let studio;
let billing;
let Seller;
let SubscriptionInvoice;
let AiUsageCharge;
let sourceUrl;
let outputPng;
const tokens = {};
const ids = {};
/** What the mocked Gemini call does next: 'image' | 'empty' | an Error. */
let nextGemini = () => 'image';

const waitJob = async (jobId) => {
    const { AiImageJob } = await import('../src/modules/commerce/ai/models/aiImageJob.model.js');
    for (let i = 0; i < 100; i += 1) {
        const job = await AiImageJob.findById(jobId).lean();
        if (job && job.status !== 'running') {
            // The charge settles just before the job reads as finished.
            return job;
        }
        await new Promise((r) => setTimeout(r, 20));
    }
    throw new Error('job never finished');
};

const start = (body, as = tokens.seller) => call('POST', '/seller/ai/images/jobs', { as, body });
const startAndWait = async (body, as = tokens.seller) => {
    const res = await start(body, as);
    assert.equal(res.status, 202, JSON.stringify(res.body));
    return waitJob(res.body.data.job.id);
};
const status = async (as = tokens.seller) => ok(await call('GET', '/seller/ai/images/status', { as }), 'status');
const setSettings = async (body) => ok(await call('PUT', '/admin/ai/settings', { as: tokens.admin, body }), 'put settings');
const setAccess = async (sellerId, body) => ok(await call('PATCH', `/admin/sellers/${sellerId}/ai-access`, { as: tokens.admin, body }), 'patch ai-access');
const charges = (sellerId) => AiUsageCharge.find({ sellerId }).sort({ createdAt: 1 }).lean();

before(async () => {
    db = await startApp();
    gemini = await import('../src/modules/commerce/ai/services/geminiClient.js');
    studio = await import('../src/modules/commerce/ai/services/imageStudio.service.js');
    billing = await import('../src/modules/commerce/seller/services/subscriptionBilling.service.js');
    ({ Seller } = await import('../src/modules/commerce/seller/models/seller.model.js'));
    ({ SubscriptionInvoice } = await import('../src/modules/commerce/seller/models/subscriptionInvoice.model.js'));
    ({ AiUsageCharge } = await import('../src/modules/commerce/ai/models/aiUsageCharge.model.js'));
    await Promise.all([Seller.init(), SubscriptionInvoice.init()]);

    outputPng = await sharp({ create: { width: 48, height: 64, channels: 3, background: '#f4f4f4' } }).png().toBuffer();
    gemini.setGeminiTransport(async (_url, body) => {
        const r = nextGemini(body);
        if (r instanceof Error) throw r;
        const parts = r === 'image' ? [{ inlineData: { mimeType: 'image/png', data: outputPng.toString('base64') } }] : [];
        return { data: { candidates: [{ content: { parts }, finishReason: r === 'image' ? 'STOP' : 'IMAGE_SAFETY' }], usageMetadata: { promptTokenCount: 300, candidatesTokenCount: 1290 } } };
    });

    const { saveImageBuffer } = await import('../src/services/storage.service.js');
    const photo = await sharp({ create: { width: 80, height: 100, channels: 3, background: '#2255cc' } }).jpeg().toBuffer();
    sourceUrl = (await saveImageBuffer(photo, 'sellers/products', { mimeType: 'image/jpeg' })).url;

    const makeSeller = (name, phone, extra = {}) => Seller.create({
        channels: { quick: { status: 'approved' }, shop: { status: 'approved' } },
        sellerName: name, ownerName: 'O', ownerPhone: phone, status: 'approved',
        location: { type: 'Point', coordinates: [77.59, 12.97], latitude: 12.97, longitude: 77.59 },
        ...extra,
    });
    ids.seller = (await makeSeller('Billing Store', '9111111131'))._id;
    ids.growth = (await makeSeller('Growth Store', '9111111132', { subscriptionPlan: 'growth' }))._id;
    ids.premium = (await makeSeller('Premium Store', '9111111133', { subscriptionPlan: 'premium' }))._id;
    ids.exempt = (await makeSeller('Exempt Store', '9111111134', { billingExempt: true }))._id;
    // A store saved before aiAccess existed: no field at all.
    ids.legacy = new mongoose.Types.ObjectId();
    await db.collection('sellers').insertOne({
        _id: ids.legacy, sellerName: 'Legacy Store', ownerPhone: '9111111135', status: 'approved',
        location: { type: 'Point', coordinates: [77.59, 12.97] },
    });
    for (const k of ['seller', 'growth', 'premium', 'exempt', 'legacy']) tokens[k] = tokenFor('SELLER', ids[k]);

    ids.admin = new mongoose.Types.ObjectId();
    await db.collection('admins').insertOne({ _id: ids.admin, email: 'admin_aibill@example.com', role: 'ADMIN', adminType: 'super_admin', isActive: true });
    tokens.admin = tokenFor('ADMIN', ids.admin, { adminType: 'super_admin' });
});

beforeEach(async () => {
    nextGemini = () => 'image';
    for (const c of ['ai_usage_daily', 'ai_image_jobs', 'ai_settings', 'ai_usage_counters', 'ai_usage_charges', 'subscription_invoices', 'subscription_transactions', 'subscription_billing_runs']) {
        await db.collection(c).deleteMany({});
    }
    await Seller.updateMany({}, { $unset: { aiAccess: '' } });
    const { clearAiSettingsCache } = await import('../src/modules/commerce/ai/services/aiSettings.service.js');
    clearAiSettingsCache();
});

after(async () => {
    gemini.setGeminiTransport();
    await stopApp();
    await fs.rm(uploadRoot, { recursive: true, force: true });
});

test('existing and new stores default off: images and chat are refused', async () => {
    for (const k of ['seller', 'legacy']) {
        const s = await status(tokens[k]);
        assert.equal(s.enabled, false, k);
        assert.equal(s.storeEnabled, false, k);
        assert.equal(s.platformEnabled, true, k);
        assert.match(s.disabledMessage, /aren't enabled for your store/);
        const res = await start({ kind: 'enhance', imageUrl: sourceUrl }, tokens[k]);
        assert.equal(res.status, 400, k);
        assert.equal(res.body.message, "AI images aren't enabled for your store. Ask the admin to turn them on.");
    }
    const fresh = await Seller.findById(ids.seller).lean();
    assert.equal(fresh.aiAccess, undefined);
    const access = ok(await call('GET', `/admin/sellers/${ids.legacy}/ai-access`, { as: tokens.admin }), 'get access');
    assert.deepEqual([access.aiAccess.imagesEnabled, access.aiAccess.chatEnabled, access.aiAccess.monthlyImageCap], [false, false, null]);

    const chat = ok(await call('POST', '/ai/chat', { as: tokens.seller, body: { message: 'how do I add a product?' } }), 'chat');
    assert.equal(chat.unavailable, true);
    assert.equal(chat.reason, 'store_disabled');
    assert.match(chat.reply, /AI Help isn't enabled for your store/);
    assert.equal(await AiUsageCharge.countDocuments(), 0);
});

test('admin enables a store: images and chat work, and the switches are validated', async () => {
    const saved = await setAccess(ids.seller, { imagesEnabled: true, chatEnabled: true, monthlyImageCap: 50 });
    assert.equal(saved.aiAccess.imagesEnabled, true);
    assert.equal(saved.aiAccess.chatEnabled, true);
    assert.equal(saved.aiAccess.monthlyImageCap, 50);
    assert.ok(saved.aiAccess.updatedAt);
    assert.equal(String(saved.aiAccess.updatedBy), String(ids.admin));

    const s = await status();
    assert.equal(s.enabled, true);
    assert.equal(s.monthlyCap, 50);
    const job = await startAndWait({ kind: 'enhance', imageUrl: sourceUrl });
    assert.equal(job.status, 'done');

    const chat = ok(await call('POST', '/ai/chat', { as: tokens.seller, body: { message: 'how do I add a product?' } }), 'chat');
    assert.notEqual(chat.reason, 'store_disabled');

    for (const body of [{ imagesEnabled: 'yes' }, { monthlyImageCap: -1 }, { monthlyImageCap: 1.5 }, { surprise: true }, {}]) {
        const res = await call('PATCH', `/admin/sellers/${ids.seller}/ai-access`, { as: tokens.admin, body });
        assert.equal(res.status, 400, JSON.stringify(body));
    }
    // An empty cap goes back to the platform's.
    const cleared = await setAccess(ids.seller, { monthlyImageCap: '' });
    assert.equal(cleared.aiAccess.monthlyImageCap, null);
    assert.equal(cleared.usage.monthlyCap, 300);

    assert.equal((await call('PATCH', `/admin/sellers/${ids.seller}/ai-access`, { as: tokens.seller, body: { imagesEnabled: true } })).status >= 401, true);
    assert.equal((await call('GET', `/admin/sellers/${new mongoose.Types.ObjectId()}/ai-access`, { as: tokens.admin })).status, 404);
});

test('by default every produced image is charged at the extra price', async () => {
    await setAccess(ids.seller, { imagesEnabled: true });
    const s = await status();
    assert.equal(s.includedThisMonth, 0);
    assert.equal(s.extraImagePrice, 5);
    const job = await startAndWait({ kind: 'mannequin', imageUrl: sourceUrl });
    assert.equal(job.results.length, 3);
    const [c] = await charges(ids.seller);
    assert.equal(c.status, 'charged');
    assert.deepEqual([c.images, c.includedImages, c.extraImages, c.unitPrice, c.amount], [3, 0, 3, 5, 15]);
    const after = await status();
    assert.equal(after.usedThisMonth, 3);
    assert.equal(after.extraCostThisMonth, 15);
});

test('included images are used first, then extra images are priced', async () => {
    await setSettings({ includedImagesStarter: 2, extraImagePrice: 7 });
    await setAccess(ids.seller, { imagesEnabled: true });
    await startAndWait({ kind: 'enhance', imageUrl: sourceUrl });
    await startAndWait({ kind: 'mannequin', imageUrl: sourceUrl });
    const [a, b] = await charges(ids.seller);
    assert.deepEqual([a.includedImages, a.extraImages, a.amount], [1, 0, 0]);
    assert.deepEqual([b.includedImages, b.extraImages, b.amount], [1, 2, 14]);
    const s = await status();
    assert.equal(s.remainingIncluded, 0);
    assert.equal(s.usedThisMonth, 4);
    assert.equal(s.extraCostThisMonth, 14);
});

test('plan allowances follow the store plan; no plan reads as Starter', async () => {
    await setSettings({ includedImagesStarter: 1, includedImagesGrowth: 2, includedImagesPremium: 4 });
    for (const [k, plan, n] of [['seller', 'starter', 1], ['growth', 'growth', 2], ['premium', 'premium', 4]]) {
        await setAccess(ids[k], { imagesEnabled: true });
        const s = await status(tokens[k]);
        assert.equal(s.plan, plan, k);
        assert.equal(s.includedThisMonth, n, k);
    }
    await startAndWait({ kind: 'mannequin', imageUrl: sourceUrl }, tokens.growth);
    const [c] = await charges(ids.growth);
    assert.deepEqual([c.plan, c.includedImages, c.extraImages, c.amount], ['growth', 2, 1, 5]);
});

test('a failed job is not charged and is released', async () => {
    await setSettings({ includedImagesStarter: 1 });
    await setAccess(ids.seller, { imagesEnabled: true });
    nextGemini = () => new Error('boom');
    const job = await startAndWait({ kind: 'enhance', imageUrl: sourceUrl });
    assert.equal(job.status, 'failed');
    const [c] = await charges(ids.seller);
    assert.equal(c.status, 'released');
    assert.equal(c.amount, 0);
    const s = await status();
    assert.equal(s.usedThisMonth, 0);
    assert.equal(s.remainingIncluded, 1, 'the included image is handed back');
});

test('a partial result charges only the images produced, dropping extras first', async () => {
    await setSettings({ includedImagesStarter: 1 });
    await setAccess(ids.seller, { imagesEnabled: true });
    let n = 0;
    nextGemini = () => (n++ === 1 ? 'empty' : 'image');
    const job = await startAndWait({ kind: 'mannequin', imageUrl: sourceUrl });
    assert.equal(job.results.length, 2);
    const [c] = await charges(ids.seller);
    assert.deepEqual([c.status, c.images, c.includedImages, c.extraImages, c.amount], ['charged', 2, 1, 1, 5]);
    assert.equal((await status()).usedThisMonth, 2);
});

test('concurrent jobs cannot both use the last included image', async () => {
    await setSettings({ includedImagesStarter: 1 });
    await setAccess(ids.seller, { imagesEnabled: true });
    const results = await Promise.all([1, 2, 3].map(() => start({ kind: 'enhance', imageUrl: sourceUrl })));
    assert.ok(results.every((r) => r.status === 202));
    await Promise.all(results.map((r) => waitJob(r.body.data.job.id)));
    const rows = await charges(ids.seller);
    assert.equal(rows.reduce((a, c) => a + c.includedImages, 0), 1);
    assert.equal(rows.reduce((a, c) => a + c.extraImages, 0), 2);
});

test('the monthly cap is enforced, also against concurrent jobs', async () => {
    await setSettings({ storeMonthlyImageCap: 4 });
    await setAccess(ids.seller, { imagesEnabled: true });
    const pair = await Promise.all([start({ kind: 'mannequin', imageUrl: sourceUrl }), start({ kind: 'mannequin', imageUrl: sourceUrl })]);
    assert.deepEqual(pair.map((r) => r.status).sort(), [202, 400]);
    await waitJob(pair.find((r) => r.status === 202).body.data.job.id);
    const refused = pair.find((r) => r.status === 400);
    assert.match(refused.body.message, /Only 1 AI image left for your store this month/);
    await startAndWait({ kind: 'enhance', imageUrl: sourceUrl });
    const last = await start({ kind: 'enhance', imageUrl: sourceUrl });
    assert.equal(last.status, 400);
    assert.match(last.body.message, /used all 4 AI images for this month/);
    // The store's own cap overrides the platform's.
    await setAccess(ids.seller, { monthlyImageCap: 6 });
    assert.equal((await status()).remainingThisMonth, 2);
    assert.equal((await start({ kind: 'enhance', imageUrl: sourceUrl })).status, 202);
});

test('billing run adds the AI line once and the wallet deduction includes it', async () => {
    const month = billing.previousBillingMonth();
    const [y, m] = month.split('-').map(Number);
    const inMonth = new Date(Date.UTC(y, m - 1, 15, 6));
    await setAccess(ids.seller, { imagesEnabled: true });
    await setAccess(ids.exempt, { imagesEnabled: true });

    // Last month: a real job for the store, and a charge for the billing-exempt one.
    const job = await studio.startImageJob({ sellerId: ids.seller, kind: 'mannequin', imageUrl: sourceUrl, now: inMonth });
    await waitJob(job.id);
    await AiUsageCharge.create({ sellerId: ids.exempt, jobId: new mongoose.Types.ObjectId(), images: 2, extraImages: 2, unitPrice: 5, amount: 10, billingMonth: month, status: 'charged' });
    // A store with a plan invoice already (as if billed for GMV) gets the line added.
    await AiUsageCharge.create({ sellerId: ids.growth, jobId: new mongoose.Types.ObjectId(), images: 1, extraImages: 1, unitPrice: 5, amount: 5, billingMonth: month, status: 'charged' });
    await SubscriptionInvoice.create({ sellerId: ids.growth, billingMonth: month, planName: 'growth', planAmount: 1999, gstAmount: 360, totalAmount: 2359, outstandingAmount: 2359, gmv: 40000 });

    const first = ok(await call('POST', '/admin/seller-subscriptions/run-billing', { as: tokens.admin, body: { billingMonth: month } }), 'run billing');
    assert.ok(first);
    const inv = await SubscriptionInvoice.findOne({ sellerId: ids.seller, billingMonth: month }).lean();
    assert.ok(inv, 'zero-GMV store still gets an invoice for its AI images');
    assert.equal(inv.planAmount, 0);
    assert.deepEqual([inv.aiUsage.images, inv.aiUsage.extra, inv.aiUsage.unitPrice, inv.aiUsage.amount], [3, 3, 5, 15]);
    assert.equal(inv.totalAmount, 15);
    assert.equal(inv.outstandingAmount, 15);
    const exemptInv = await SubscriptionInvoice.findOne({ sellerId: ids.exempt, billingMonth: month }).lean();
    assert.equal(exemptInv.totalAmount, 10, 'billing-exempt store pays only for AI images');
    const growthInv = await SubscriptionInvoice.findOne({ sellerId: ids.growth, billingMonth: month }).lean();
    assert.equal(growthInv.totalAmount, 2364);
    assert.equal(growthInv.outstandingAmount, 2364);
    assert.ok((await charges(ids.seller)).every((c) => String(c.invoiceId) === String(inv._id)));

    // Repeating the run changes nothing.
    ok(await call('POST', '/admin/seller-subscriptions/run-billing', { as: tokens.admin, body: { billingMonth: month } }), 'rerun billing');
    assert.equal(await SubscriptionInvoice.countDocuments({ billingMonth: month }), 3);
    assert.equal((await SubscriptionInvoice.findById(inv._id).lean()).totalAmount, 15);
    assert.equal((await SubscriptionInvoice.findById(growthInv._id).lean()).totalAmount, 2364);

    // A job finishing after the invoice exists lands on it automatically.
    const late = await studio.startImageJob({ sellerId: ids.seller, kind: 'enhance', imageUrl: sourceUrl, now: inMonth });
    await waitJob(late.id);
    for (let i = 0; i < 50 && (await SubscriptionInvoice.findById(inv._id).lean()).totalAmount !== 20; i += 1) await new Promise((r) => setTimeout(r, 20));
    const grown = await SubscriptionInvoice.findById(inv._id).lean();
    assert.equal(grown.totalAmount, 20);
    assert.equal(grown.aiUsage.images, 4);

    // Wallet deduction covers the AI amount; the CSV export shows it.
    const { invoice } = await billing.applyWalletDeduction(inv._id, 20, { id: ids.admin, name: 'A' }, 'monthly');
    assert.equal(invoice.outstandingAmount, 0);
    assert.equal(invoice.status, 'settled');
    const csv = await fetchCsv(`/admin/seller-subscriptions/invoices/export?billingMonth=${month}`);
    assert.match(csv.split('\n')[0], /AI Amount/);
    assert.ok(csv.split('\n').some((l) => l.includes('Billing Store') && l.includes(',20,')));
});

test('per-store usage list and CSV, and the seller subscription overview card', async () => {
    await setAccess(ids.seller, { imagesEnabled: true });
    await startAndWait({ kind: 'mannequin', imageUrl: sourceUrl });
    const list = ok(await call('GET', '/admin/ai/store-usage', { as: tokens.admin }), 'store usage');
    const row = list.stores.find((r) => r.sellerId === String(ids.seller));
    assert.deepEqual([row.images, row.extraImages, row.amount], [3, 3, 15]);
    assert.equal(list.totals.amount, 15);
    const csv = await fetchCsv(`/admin/ai/store-usage/export?month=${list.month}`);
    assert.match(csv, /Billing Store/);

    const overview = ok(await call('GET', '/seller/subscription/overview', { as: tokens.seller }), 'overview');
    assert.equal(overview.aiUsage.usedThisMonth, 3);
    assert.equal(overview.aiUsage.extraCostThisMonth, 15);
    assert.equal(overview.aiUsage.imagesEnabled, true);
});

async function fetchCsv(p) {
    const res = await callText('GET', p, { as: tokens.admin });
    assert.equal(res.status, 200, res.text);
    return res.text;
}
