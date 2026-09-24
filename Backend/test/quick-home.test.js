import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { startApp, stopApp, tokenFor, call, ok } from './helpers/app.js';

// The Quick phone home's layout (QUICK_MOBILE_SPEC.md §3) and the minDiscount
// search filter its "Minimum N% off" tiles use.

let db;
let adminToken;
let subAdminToken;
const ids = {};

before(async () => {
    db = await startApp();

    const adminId = new mongoose.Types.ObjectId();
    const subId = new mongoose.Types.ObjectId();
    await db.collection('admins').insertMany([
        { _id: adminId, email: 'qh_admin@example.com', role: 'ADMIN', adminType: 'super_admin', isActive: true },
        {
            _id: subId, email: 'qh_sub@example.com', role: 'ADMIN', adminType: 'sub_admin', isActive: true,
            permissions: { order_management: ['view'] },
        },
    ]);
    adminToken = tokenFor('ADMIN', adminId, { adminType: 'super_admin' });
    subAdminToken = tokenFor('ADMIN', subId, { adminType: 'sub_admin' });

    ids.grocery = new mongoose.Types.ObjectId();
    ids.dairy = new mongoose.Types.ObjectId();
    ids.snacks = new mongoose.Types.ObjectId();
    ids.lonely = new mongoose.Types.ObjectId();
    ids.zone = new mongoose.Types.ObjectId();
    const cat = (_id, name, extra = {}) => ({ _id, name, isActive: true, approvalStatus: 'approved', isApproved: true, sortOrder: 0, ...extra });
    await db.collection('categories').insertMany([
        cat(ids.grocery, 'QH Grocery'),
        cat(ids.dairy, 'QH Dairy', { parentId: ids.grocery, image: '/uploads/quick/categories/dairy.webp' }),
        cat(ids.snacks, 'QH Snacks', { parentId: ids.grocery }),
        cat(ids.lonely, 'QH Lonely'),
    ]);
});

after(stopApp);

const theme = (extra = {}) => ({
    slug: 'all',
    label: 'All',
    promoTiles: [{ title: 'Buy 2 Get 1', imageUrl: '/uploads/quick/themes/all/tile-1.webp', link: '/quick/offers' }],
    rewards: { title: 'Win rewards', subtitle: 'Shop ₹249+', thumbs: ['/uploads/quick/r1.webp'], link: '/spin' },
    offerStrip: { text: 'Extra 5% off', link: '/quick/offers' },
    ...extra,
});

test('with nothing saved, the public layout is the default "All" theme and derived category groups', async () => {
    const data = ok(await call('GET', '/content/quick-home'), 'public layout');
    assert.equal(data.themes.length, 1);
    assert.equal(data.themes[0].slug, 'all');
    const grocery = data.categoryGroups.find((g) => g.parentName === 'QH Grocery');
    assert.ok(grocery, 'a top-level category with children becomes a group');
    assert.deepEqual(grocery.children.map((c) => c.name).sort(), ['QH Dairy', 'QH Snacks']);
    assert.ok(!data.categoryGroups.find((g) => g.parentName === 'QH Lonely'), 'a category without children is not a group');
});

test('the admin saves a global layout; the public read returns live items only, in order', async () => {
    const past = new Date(Date.now() - 86400000).toISOString();
    const future = new Date(Date.now() + 86400000).toISOString();
    ok(await call('PUT', '/admin/quick-home-layout', {
        as: adminToken,
        body: {
            themes: [
                theme({ slug: 'festive', label: 'Festive', sortOrder: 1 }),
                theme({ sortOrder: 0 }),
                theme({ slug: 'later', label: 'Later', startsAt: future }),
                theme({ slug: 'over', label: 'Over', endsAt: past }),
                theme({ slug: 'off', label: 'Off', isActive: false }),
            ],
            featured: [
                { title: 'Juice Corner', artUrl: '/uploads/quick/featured/juice.webp', link: '/quick/search?q=juice', sortOrder: 2 },
                { title: 'New in', style: 'launch', badge: 'Newly launched', link: '/quick/offers', sortOrder: 1 },
            ],
            campaigns: [{ title: 'Visarjan', subtitle: 'Farewell', link: '/quick/search?q=pooja', tint: '#3aa6b9' }],
            categoryGroups: [{ title: 'Grocery & Kitchen', parentCategoryId: String(ids.grocery) }],
        },
    }), 'save global');

    const data = ok(await call('GET', '/content/quick-home'), 'public layout');
    assert.deepEqual(data.themes.map((t) => t.slug), ['all', 'festive'], 'hidden, future and ended themes are left out');
    assert.deepEqual(data.featured.map((f) => f.title), ['New in', 'Juice Corner'], 'featured in sortOrder');
    assert.equal(data.campaigns[0].tint, '#3aa6b9');
    assert.equal(data.categoryGroups.length, 1);
    assert.equal(data.categoryGroups[0].title, 'Grocery & Kitchen');
    assert.equal(data.categoryGroups[0].children.find((c) => c.name === 'QH Dairy').image, '/uploads/quick/categories/dairy.webp');
});

test('a zone layout overrides the global one, and resetting it falls back', async () => {
    ok(await call('PUT', `/admin/quick-home-layout?zoneId=${ids.zone}`, {
        as: adminToken,
        body: { themes: [theme({ slug: 'zone-only', label: 'Zone' })] },
    }), 'save zone');

    const zoned = ok(await call('GET', `/content/quick-home?zoneId=${ids.zone}`), 'zone layout');
    assert.deepEqual(zoned.themes.map((t) => t.slug), ['zone-only']);

    const admin = ok(await call('GET', `/admin/quick-home-layout?zoneId=${ids.zone}`, { as: adminToken }), 'admin read');
    assert.equal(admin.inherited, false);

    ok(await call('DELETE', `/admin/quick-home-layout?zoneId=${ids.zone}`, { as: adminToken }), 'reset');
    const fallback = ok(await call('GET', `/content/quick-home?zoneId=${ids.zone}`), 'fallback');
    assert.deepEqual(fallback.themes.map((t) => t.slug), ['all', 'festive'], 'back on the global layout');

    const inherited = ok(await call('GET', `/admin/quick-home-layout?zoneId=${ids.zone}`, { as: adminToken }), 'admin read');
    assert.equal(inherited.inherited, true);
});

test('bad layouts are refused with a reason', async () => {
    const bad = [
        [{ themes: [theme({ slug: 'Has Spaces' })] }, /slug/],
        [{ themes: [theme(), theme()] }, /share the slug/],
        [{ themes: [theme({ promoTiles: [{ title: 'x', link: 'https://evil.example' }] })] }, /app paths/],
        [{ themes: [theme({ backgroundUrl: 'http://insecure.example/a.png' })] }, /uploaded file/],
        [{ themes: [theme({ startsAt: '2026-10-10', endsAt: '2026-10-01' })] }, /end date/],
        [{ featured: [{ title: '' }] }, /needs a title/],
        [{ categoryGroups: [{ title: 'x', parentCategoryId: String(new mongoose.Types.ObjectId()) }] }, /does not exist/],
    ];
    for (const [body, reason] of bad) {
        const res = await call('PUT', '/admin/quick-home-layout', { as: adminToken, body });
        assert.equal(res.status, 400, `refused: ${JSON.stringify(body).slice(0, 60)}`);
        assert.match(JSON.stringify(res.body), reason);
    }
});

test('editing the layout needs banner permission; reading it publicly does not', async () => {
    const denied = await call('PUT', '/admin/quick-home-layout', { as: subAdminToken, body: { themes: [theme()] } });
    assert.equal(denied.status, 403);
    const anon = await call('PUT', '/admin/quick-home-layout', { body: { themes: [theme()] } });
    assert.equal(anon.status, 401);
    const open = await call('GET', '/content/quick-home');
    assert.equal(open.status, 200);
});

test('minDiscount keeps products whose saving on MRP is at least that much', async () => {
    const sellerId = new mongoose.Types.ObjectId();
    await db.collection('sellers').insertOne({
        _id: sellerId, sellerName: 'QH Store', status: 'approved', isActive: true, isAcceptingOrders: true,
        channels: { shop: { status: 'approved' }, quick: { status: 'none' } },
    });
    const product = (name, price, mrp) => ({
        name, sellerId, price, mrp, approvalStatus: 'approved', isActive: true, isAvailable: true,
        channels: { shop: true, quick: false }, availableIn: { shop: true, quick: false }, stock: { shop: 10 },
    });
    await db.collection('products').insertMany([
        product('QH Deep Deal', 60, 100),   // 40% off
        product('QH Small Deal', 90, 100),  // 10% off
        product('QH No MRP', 50, 0),
    ]);

    const hit = ok(await call('GET', '/catalog/search/products?q=QH&fulfilmentMode=standard&minDiscount=35'), 'search');
    assert.deepEqual(hit.products.map((p) => p.name), ['QH Deep Deal']);

    const all = ok(await call('GET', '/catalog/search/products?q=QH&fulfilmentMode=standard'), 'search');
    assert.equal(all.products.length, 3, 'without the filter nothing is dropped');
});
