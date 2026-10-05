/**
 * Offer banners: the admin uploads a banner for Quick, Shop or both, linked to
 * a real coupon; each storefront sees only its own live banners.
 */
import { test, before, after, mock } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';

// Keep uploads off the disk: any image "uploads" to a fixed URL.
let uploads = 0;
mock.module(new URL('../src/services/cloudinary.service.js', import.meta.url).href, {
    namedExports: {
        uploadImageBuffer: async () => `/uploads/offer-banners/test-${++uploads}.webp`,
        uploadImageBufferDetailed: async () => ({ url: '/uploads/x.webp', secure_url: '/uploads/x.webp', public_id: 'x', path: 'x', filename: 'x' }),
    },
});

const { startApp, stopApp, tokenFor, call, callForm, ok } = await import('./helpers/app.js');

let adminToken;

before(async () => {
    const db = await startApp();
    const adminId = new mongoose.Types.ObjectId();
    await db.collection('admins').insertOne({ _id: adminId, email: 'banner_admin@example.com', role: 'ADMIN', adminType: 'super_admin', isActive: true });
    adminToken = tokenFor('ADMIN', adminId, { adminType: 'super_admin' });
    await db.collection('offers').insertOne({ couponCode: 'FEST20', discountType: 'percentage', discountValue: 20, status: 'active', createdByRole: 'ADMIN' });
});

after(stopApp);

const image = () => new Blob([Buffer.from([0x89, 0x50, 0x4e, 0x47])], { type: 'image/png' });
const create = (fields, withImage = true) => {
    const form = new FormData();
    if (withImage) form.append('file', image(), 'banner.png');
    for (const [k, v] of Object.entries(fields)) form.append(k, v);
    return callForm('POST', '/admin/offer-banners', { as: adminToken, form });
};
const publicFor = async (mode) => ok(await call('GET', `/catalog/offer-banners?mode=${mode}`), `public ${mode}`).banners.map((b) => b.title);

test('banners show only on the storefronts they were made for', async () => {
    ok(await create({ title: 'Quick Only', channels: 'quick', couponCode: 'fest20' }), 'quick banner', 201);
    ok(await create({ title: 'Shop Only', channels: 'shop', ctaLink: '/offers' }), 'shop banner', 201);
    const both = ok(await create({ title: 'Everywhere', channels: 'quick,shop' }), 'both banner', 201).banner;
    assert.deepEqual(both.channels, ['quick', 'shop']);

    assert.deepEqual((await publicFor('quick')).sort(), ['Everywhere', 'Quick Only']);
    assert.deepEqual((await publicFor('shop')).sort(), ['Everywhere', 'Shop Only']);

    const quickList = ok(await call('GET', '/admin/offer-banners?channel=quick', { as: adminToken }), 'admin list');
    assert.equal(quickList.banners.length, 2);
    assert.equal(quickList.banners.find((b) => b.title === 'Quick Only').couponCode, 'FEST20');
});

test('switched off, not started yet or ended: not shown', async () => {
    const off = ok(await create({ title: 'Paused', channels: 'shop' }), 'paused', 201).banner;
    ok(await call('PATCH', `/admin/offer-banners/${off.id}`, { as: adminToken, body: { isActive: false } }), 'switch off');
    const tomorrow = new Date(Date.now() + 86400000).toISOString();
    const yesterday = new Date(Date.now() - 86400000).toISOString();
    ok(await create({ title: 'Later', channels: 'shop', startDate: tomorrow }), 'later', 201);
    ok(await create({ title: 'Over', channels: 'shop', endDate: yesterday }), 'over', 201);

    const shop = await publicFor('shop');
    for (const t of ['Paused', 'Later', 'Over']) assert.ok(!shop.includes(t), `${t} should be hidden`);
});

test('bad input is refused', async () => {
    assert.equal((await create({ title: 'No image' }, false)).status, 400, 'image required');
    assert.equal((await create({ title: 'Nowhere', channels: 'nowhere' })).status, 400, 'needs a channel');
    const unknown = await create({ title: 'Ghost', channels: 'shop', couponCode: 'NOPE99' });
    assert.equal(unknown.status, 400);
    assert.match(unknown.body.message, /No coupon with the code NOPE99/);
    const flipped = await create({ title: 'Backwards', channels: 'shop', startDate: '2026-12-10', endDate: '2026-12-01' });
    assert.equal(flipped.status, 400, 'end before start');
});

test('edit and delete', async () => {
    const b = ok(await create({ title: 'Edit Me', channels: 'shop' }), 'create', 201).banner;
    const edited = ok(await call('PATCH', `/admin/offer-banners/${b.id}`, { as: adminToken, body: { title: 'Edited', channels: ['quick'] } }), 'edit').banner;
    assert.equal(edited.title, 'Edited');
    assert.deepEqual(edited.channels, ['quick']);
    ok(await call('DELETE', `/admin/offer-banners/${b.id}`, { as: adminToken }), 'delete');
    assert.ok(!(await publicFor('quick')).includes('Edited'));
});

test('customers and sellers cannot manage banners', async () => {
    const user = tokenFor('USER', new mongoose.Types.ObjectId());
    const res = await call('GET', '/admin/offer-banners', { as: user });
    assert.ok([401, 403].includes(res.status), `got ${res.status}`);
});
