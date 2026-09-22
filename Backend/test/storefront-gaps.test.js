import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { startApp, stopApp, tokenFor, call, ok } from './helpers/app.js';

// Storefront gaps: category tree, per-zone Quick ETA, Shop delivery dates,
// social links in Business Settings.

let db;
let adminToken;
const ids = {};

// A lat/lng square around Bengaluru for the zone polygon.
const square = [
    { latitude: 12.9, longitude: 77.5 },
    { latitude: 12.9, longitude: 77.7 },
    { latitude: 13.1, longitude: 77.7 },
    { latitude: 13.1, longitude: 77.5 },
];

before(async () => {
    db = await startApp();
    const adminId = new mongoose.Types.ObjectId();
    await db.collection('admins').insertOne({
        _id: adminId, email: 'storefront_gaps@example.com', role: 'ADMIN', adminType: 'super_admin', isActive: true,
    });
    adminToken = tokenFor('ADMIN', adminId, { adminType: 'super_admin' });

    // Dairy (no products of its own) > Milk, Curd (with products); Snacks top level.
    ids.dairy = new mongoose.Types.ObjectId();
    ids.milk = new mongoose.Types.ObjectId();
    ids.curd = new mongoose.Types.ObjectId();
    ids.snacks = new mongoose.Types.ObjectId();
    const cat = (_id, name, extra = {}) => ({ _id, name, isActive: true, approvalStatus: 'approved', isApproved: true, sortOrder: 0, ...extra });
    await db.collection('categories').insertMany([
        cat(ids.dairy, 'Gaps Dairy'),
        cat(ids.milk, 'Gaps Milk', { parentId: ids.dairy, sortOrder: 2 }),
        cat(ids.curd, 'Gaps Curd', { parentId: ids.dairy, sortOrder: 1 }),
        cat(ids.snacks, 'Gaps Snacks'),
    ]);
    const sellerId = new mongoose.Types.ObjectId();
    await db.collection('products').insertMany([
        { name: 'Gaps Milk 1L', sellerId, categoryId: ids.milk, approvalStatus: 'approved' },
        { name: 'Gaps Curd', sellerId, categoryId: ids.curd, approvalStatus: 'approved' },
        { name: 'Gaps Chips', sellerId, categoryId: ids.snacks, approvalStatus: 'approved' },
    ]);
});

after(stopApp);

// ----- 1. Category tree -----

test('public categories carry parentId, include product-less parents, and a tree', async () => {
    const data = ok(await call('GET', '/catalog/categories'), 'categories');
    const mine = data.categories.filter((c) => c.name.startsWith('Gaps '));
    const byName = Object.fromEntries(mine.map((c) => [c.name, c]));
    assert.ok(byName['Gaps Dairy'], 'the parent is listed although it has no products of its own');
    assert.equal(byName['Gaps Dairy'].parentId, null);
    assert.equal(String(byName['Gaps Milk'].parentId), String(ids.dairy));

    const dairy = data.tree.find((c) => c.name === 'Gaps Dairy');
    assert.deepEqual(dairy.children.map((c) => c.name), ['Gaps Curd', 'Gaps Milk'], 'children in sortOrder');
    assert.ok(data.tree.find((c) => c.name === 'Gaps Snacks'), 'a childless top-level category is a root');
    assert.ok(!data.tree.find((c) => c.name === 'Gaps Milk'), 'a subcategory is not a root');
});

// ----- 2. Zone ETA -----

test('zones: etaMinutes defaults to 10, is editable, validated 5-120, and returned by detect', async () => {
    const created = ok(await call('POST', '/admin/zones', {
        as: adminToken, body: { name: 'Gaps Zone', coordinates: square },
    }), 'create zone', 201);
    assert.equal(created.zone.etaMinutes, 10);
    const id = created.zone._id;

    for (const bad of [4, 121, 'soon', 12.5]) {
        const res = await call('PATCH', `/admin/zones/${id}`, { as: adminToken, body: { etaMinutes: bad } });
        assert.equal(res.status, 400, `etaMinutes ${bad} is refused`);
    }
    const badCreate = await call('POST', '/admin/zones', { as: adminToken, body: { name: 'Bad', coordinates: square, etaMinutes: 200 } });
    assert.equal(badCreate.status, 400);

    const updated = ok(await call('PATCH', `/admin/zones/${id}`, { as: adminToken, body: { etaMinutes: 25 } }), 'update zone');
    assert.equal(updated.zone.etaMinutes, 25);

    const detected = ok(await call('GET', '/content/zones/detect?lat=13.0&lng=77.6'), 'detect');
    assert.equal(detected.status, 'IN_SERVICE');
    assert.equal(detected.etaMinutes, 25);
    assert.equal(detected.zone.etaMinutes, 25);
});

test('zones: a legacy zone without etaMinutes is detected as 10', async () => {
    await db.collection('zones').insertOne({
        name: 'Gaps Legacy', country: 'India', isActive: true,
        coordinates: [
            { latitude: 20.0, longitude: 70.0 }, { latitude: 20.0, longitude: 70.2 },
            { latitude: 20.2, longitude: 70.2 }, { latitude: 20.2, longitude: 70.0 },
        ],
    });
    const detected = ok(await call('GET', '/content/zones/detect?lat=20.1&lng=70.1'), 'detect legacy');
    assert.equal(detected.etaMinutes, 10);
});

// ----- 3. Delivery estimate -----

const localToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: process.env.STORE_TIMEZONE?.trim() || 'Asia/Kolkata' }).format(new Date());
const plusDays = (ymd, n) => {
    const [y, m, d] = ymd.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
};

test('delivery-estimate: falls back to the 2-4 day default, then to the admin setting', async () => {
    const def = ok(await call('GET', '/catalog/delivery-estimate?pincode=560001&fulfilmentMode=standard'), 'estimate');
    assert.equal(def.minDays, 2);
    assert.equal(def.maxDays, 4);
    assert.equal(def.fromDate, plusDays(localToday(), 2));
    assert.equal(def.toDate, plusDays(localToday(), 4));
    assert.equal(def.source, 'default');

    const bad = await call('PATCH', '/admin/business-settings', {
        as: adminToken, body: { data: JSON.stringify({ ...settingsBase, standardDeliveryDays: { min: 5, max: 3 } }) },
    });
    assert.equal(bad.status, 400);
    ok(await call('PATCH', '/admin/business-settings', {
        as: adminToken, body: { data: JSON.stringify({ ...settingsBase, standardDeliveryDays: { min: 3, max: 6 } }) },
    }), 'save delivery days');
    const set = ok(await call('GET', '/catalog/delivery-estimate?fulfilmentMode=standard'), 'estimate without pincode');
    assert.deepEqual([set.minDays, set.maxDays], [3, 6]);
});

test('delivery-estimate: a configured courier answers per pincode, cached; outage falls back', async () => {
    const { setShippingProvider } = await import('../src/modules/commerce/delivery/services/shipping/index.js');
    const { MockShippingProvider } = await import('../src/modules/commerce/delivery/services/shipping/mockShipping.provider.js');
    const { clearDeliveryEstimateCache } = await import('../src/modules/commerce/catalog/services/deliveryEstimate.service.js');
    const calls = [];
    const courier = new MockShippingProvider();
    courier.name = 'test-courier';
    courier.checkServiceability = async (pincode) => {
        calls.push(pincode);
        if (pincode === '110001') throw new Error('courier down');
        return { serviceable: true, estimatedDays: 5, couriers: ['X'] };
    };
    setShippingProvider(courier);
    clearDeliveryEstimateCache();
    try {
        const a = ok(await call('GET', '/catalog/delivery-estimate?pincode=400001&fulfilmentMode=standard'), 'courier estimate');
        assert.deepEqual([a.minDays, a.maxDays, a.source], [5, 5, 'courier']);
        assert.equal(a.toDate, plusDays(localToday(), 5));
        ok(await call('GET', '/catalog/delivery-estimate?pincode=400001&fulfilmentMode=standard'), 'cached');
        assert.deepEqual(calls, ['400001'], 'second request for the pincode is served from cache');

        const down = ok(await call('GET', '/catalog/delivery-estimate?pincode=110001&fulfilmentMode=standard'), 'outage');
        assert.equal(down.source, 'default');
    } finally {
        setShippingProvider(new MockShippingProvider());
        clearDeliveryEstimateCache();
    }
});

test('delivery-estimate: bad pincode and quick mode are 400', async () => {
    assert.equal((await call('GET', '/catalog/delivery-estimate?pincode=12ab&fulfilmentMode=standard')).status, 400);
    assert.equal((await call('GET', '/catalog/delivery-estimate?fulfilmentMode=quick')).status, 400);
});

// ----- 4. Social links -----

const settingsBase = { companyName: 'Gaps Co', email: 'gaps@example.com', phoneNumber: '9876543210' };

test('social links: https only, saved per key, served publicly', async () => {
    const insecure = await call('PATCH', '/admin/business-settings', {
        as: adminToken, body: { data: JSON.stringify({ ...settingsBase, socialLinks: { facebook: 'http://facebook.com/gaps' } }) },
    });
    assert.equal(insecure.status, 400);
    const junk = await call('PATCH', '/admin/business-settings', {
        as: adminToken, body: { data: JSON.stringify({ ...settingsBase, socialLinks: { x: 'javascript:alert(1)' } }) },
    });
    assert.equal(junk.status, 400);

    ok(await call('PATCH', '/admin/business-settings', {
        as: adminToken,
        body: { data: JSON.stringify({ ...settingsBase, socialLinks: { instagram: 'https://instagram.com/gaps', whatsapp: 'https://wa.me/919876543210' } }) },
    }), 'save links');
    // A later save that leaves a key out keeps it; an empty string removes it.
    ok(await call('PATCH', '/admin/business-settings', {
        as: adminToken, body: { data: JSON.stringify({ ...settingsBase, socialLinks: { whatsapp: '' } }) },
    }), 'remove whatsapp');

    const pub = ok(await call('GET', '/settings/business'), 'public settings');
    assert.equal(pub.socialLinks.instagram, 'https://instagram.com/gaps');
    assert.equal(pub.socialLinks.whatsapp, '');
    assert.equal(pub.socialLinks.facebook, '');
});
