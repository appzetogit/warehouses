/**
 * Category -> Subcategory picker on the seller and admin product forms.
 *
 * The category lists expose the tree (mains with `children`) next to the flat
 * list older apps read. The new forms send `requireSubcategory: true`, which
 * refuses a main category that has subcategories; without the flag (older
 * apps) nothing changes, and keeping a product's current category on an edit
 * is never blocked. Duplicate-named mains are both listed.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';

const { startApp, stopApp, tokenFor, call, ok, oid } = await import('./helpers/app.js');

const ids = {};
let Category;

before(async () => {
    ids.db = await startApp();
    ({ Category } = await import('../src/modules/commerce/admin/models/category.model.js'));
    const { Seller } = await import('../src/modules/commerce/seller/models/seller.model.js');

    const sellerDoc = (name, phone) => ({
        channels: { quick: { status: 'approved' }, shop: { status: 'approved' } },
        sellerName: name,
        ownerName: 'Owner',
        ownerPhone: phone,
        phone,
        status: 'approved',
        isAcceptingOrders: true,
        location: { type: 'Point', coordinates: [77.5946, 12.9716], latitude: 12.9716, longitude: 77.5946 },
    });
    const seller = await Seller.create(sellerDoc('Subcat Store', '9000000701'));
    const other = await Seller.create(sellerDoc('Other Store', '9000000702'));
    ids.seller = seller._id;
    ids.other = other._id;
    ids.sellerToken = tokenFor('SELLER', seller._id);

    const adminId = new mongoose.Types.ObjectId();
    await ids.db.collection('admins').insertOne({
        _id: adminId,
        email: 'admin_subcat@example.com',
        role: 'ADMIN',
        adminType: 'super_admin',
        isActive: true,
    });
    ids.adminToken = tokenFor('ADMIN', adminId, { adminType: 'super_admin' });

    // The live tree's shape: two "Women" mains (one with subcategories), a
    // main without children, and a main whose only child is inactive.
    const women = await Category.create({ name: 'Women', sortOrder: 1 });
    const womenOld = await Category.create({ name: 'Women', sortOrder: 2 });
    const jackets = await Category.create({ name: 'Jackets', sortOrder: 3 });
    const gadgets = await Category.create({ name: 'Gadgets', sortOrder: 4 });
    const dresses = await Category.create({ name: 'Dresses', parentId: women._id, sortOrder: 1 });
    const kurtas = await Category.create({ name: 'Kurtas', parentId: women._id, sortOrder: 2 });
    await Category.create({ name: 'Old Gadgets', parentId: gadgets._id, isActive: false });
    const privateOther = await Category.create({ name: 'Other Private', sellerId: other._id });
    Object.assign(ids, {
        women: String(women._id),
        womenOld: String(womenOld._id),
        jackets: String(jackets._id),
        gadgets: String(gadgets._id),
        dresses: String(dresses._id),
        kurtas: String(kurtas._id),
        privateOther: String(privateOther._id),
    });
});

after(stopApp);

const sellerCreate = (body) =>
    call('POST', '/seller/products', {
        as: ids.sellerToken,
        body: { name: 'Item', price: 499, channels: { quick: false, shop: true }, ...body },
    });

const adminCreate = (body) =>
    call('POST', '/admin/products', {
        as: ids.adminToken,
        body: { sellerId: String(ids.seller), name: 'Admin item', price: 599, channels: { quick: false, shop: true }, ...body },
    });

test('seller category list keeps the flat list and adds the tree', async () => {
    const data = ok(await call('GET', '/seller/categories?compact=true', { as: ids.sellerToken }), 'list');
    assert.ok(Array.isArray(data.categories), 'flat list kept');
    const dresses = data.categories.find((c) => String(c.id) === ids.dresses);
    assert.equal(String(dresses.parentId), ids.women, 'flat entries carry parentId');
    assert.equal(typeof dresses.parentId, 'string', 'parentId is a string id');
    assert.ok(data.categories.every((c) => 'parentId' in c), 'every flat entry has parentId');
    assert.equal(data.categories.find((c) => String(c.id) === ids.women).parentId, null, 'mains have parentId null');
    for (const sub of [ids.dresses, ids.kurtas]) {
        assert.ok(data.categories.some((c) => String(c.id) === sub), 'subcategories stay in the flat list');
    }
    // The full (non-compact) list the seller Categories page uses carries it too.
    const full = ok(await call('GET', '/seller/categories?includeInactive=true&withCounts=true', { as: ids.sellerToken }), 'full list');
    assert.equal(String(full.categories.find((c) => String(c.id) === ids.kurtas).parentId), ids.women);
    assert.ok(full.categories.every((c) => 'parentId' in c));

    assert.ok(Array.isArray(data.tree), 'tree added');
    const womenRoots = data.tree.filter((c) => c.name === 'Women');
    assert.equal(womenRoots.length, 2, 'both duplicate-named mains listed');
    const withKids = womenRoots.find((c) => String(c.id) === ids.women);
    assert.deepEqual(withKids.children.map((c) => c.name), ['Dresses', 'Kurtas']);
    assert.equal(String(withKids.children[0].parentId), ids.women);
    assert.ok('image' in withKids.children[0]);
    assert.deepEqual(womenRoots.find((c) => String(c.id) === ids.womenOld).children, []);
    assert.ok(data.tree.every((c) => !c.parentId), 'only mains at the top');
    assert.ok(!data.categories.some((c) => String(c.id) === ids.privateOther), 'another store\'s category hidden');
});

test('requireSubcategory refuses a main with subcategories and accepts its child', async () => {
    const refused = await sellerCreate({ categoryId: ids.women, requireSubcategory: true });
    assert.equal(refused.status, 400);
    assert.equal(refused.body.message, 'Choose a subcategory');

    const created = ok(await sellerCreate({ categoryId: ids.dresses, categoryName: 'Dresses', requireSubcategory: true }), 'child', 201).product;
    assert.equal(String(created.categoryId), ids.dresses);
    assert.equal(created.categoryName, 'Dresses');
});

test('a main without (active) subcategories is accepted with the flag', async () => {
    const jackets = ok(await sellerCreate({ categoryId: ids.jackets, requireSubcategory: true }), 'jackets', 201).product;
    assert.equal(String(jackets.categoryId), ids.jackets);
    const gadgets = ok(await sellerCreate({ categoryId: ids.gadgets, requireSubcategory: true }), 'gadgets', 201).product;
    assert.equal(String(gadgets.categoryId), ids.gadgets, 'inactive child does not count');
});

test('old payload without the flag behaves as before', async () => {
    const created = ok(await sellerCreate({ categoryId: ids.women }), 'old app', 201).product;
    assert.equal(String(created.categoryId), ids.women);
    assert.equal(created.categoryName, 'Women');
    ids.productInMain = String(created._id);
});

test('editing without changing the category is not blocked; changing to a main is', async () => {
    const same = ok(await call('PATCH', `/seller/products/${ids.productInMain}`, {
        as: ids.sellerToken,
        body: { name: 'Renamed', categoryId: ids.women, requireSubcategory: true },
    }), 'same category');
    assert.ok(same);
    const stored = await ids.db.collection('products').findOne({ _id: oid(ids.productInMain) });
    assert.equal(stored.name, 'Renamed');
    assert.equal(String(stored.categoryId), ids.women, 'category untouched');

    const jacket = ok(await sellerCreate({ categoryId: ids.jackets }), 'jacket', 201).product;
    const moved = await call('PATCH', `/seller/products/${jacket._id}`, {
        as: ids.sellerToken,
        body: { categoryId: ids.women, requireSubcategory: true },
    });
    assert.equal(moved.status, 400);
    assert.equal(moved.body.message, 'Choose a subcategory');

    ok(await call('PATCH', `/seller/products/${jacket._id}`, {
        as: ids.sellerToken,
        body: { categoryId: ids.kurtas, requireSubcategory: true },
    }), 'to child');
    const after = await ids.db.collection('products').findOne({ _id: oid(jacket._id) });
    assert.equal(String(after.categoryId), ids.kurtas);
    assert.equal(after.categoryName, 'Kurtas');
});

test('admin category list scoped to a seller exposes parentId and the tree', async () => {
    const data = ok(await call('GET', `/admin/categories?limit=1000&sellerId=${ids.seller}`, { as: ids.adminToken }), 'admin list');
    assert.ok(!data.categories.some((c) => String(c.id) === ids.privateOther), 'other store\'s private category excluded');
    assert.ok(!data.categories.some((c) => c.name === 'Old Gadgets'), 'inactive excluded');
    assert.equal(String(data.categories.find((c) => String(c.id) === ids.kurtas).parentId), ids.women);
    const womenRoots = data.tree.filter((c) => c.name === 'Women');
    assert.equal(womenRoots.length, 2, 'both duplicate-named mains listed');
    assert.equal(womenRoots.find((c) => String(c.id) === ids.women).children.length, 2);

    const all = ok(await call('GET', '/admin/categories?limit=1000', { as: ids.adminToken }), 'admin list unscoped');
    assert.ok(all.categories.some((c) => String(c.id) === ids.privateOther), 'unscoped list unchanged');
    assert.ok(Array.isArray(all.tree));

    const bad = await call('GET', '/admin/categories?sellerId=nope', { as: ids.adminToken });
    assert.equal(bad.status, 400);
});

test('admin create/update follow the same rule', async () => {
    const refused = await adminCreate({ categoryId: ids.women, categoryName: 'Women', requireSubcategory: true });
    assert.equal(refused.status, 400);
    assert.equal(refused.body.message, 'Choose a subcategory');

    const legacy = ok(await adminCreate({ categoryId: ids.women, categoryName: 'Women' }), 'admin old payload', 201).product;
    assert.equal(String(legacy.categoryId), ids.women);

    const child = ok(await adminCreate({ categoryId: ids.dresses, categoryName: 'Dresses', requireSubcategory: true }), 'admin child', 201).product;
    assert.equal(String(child.categoryId), ids.dresses);

    ok(await call('PATCH', `/admin/products/${legacy._id}`, {
        as: ids.adminToken,
        body: { name: 'Admin renamed', categoryId: ids.women, categoryName: 'Women', requireSubcategory: true },
    }), 'admin same category');

    const moved = await call('PATCH', `/admin/products/${child._id}`, {
        as: ids.adminToken,
        body: { categoryId: ids.women, categoryName: 'Women', requireSubcategory: true },
    });
    assert.equal(moved.status, 400);
    assert.equal(moved.body.message, 'Choose a subcategory');
    ids.adminLegacy = String(legacy._id);
});

test('admin "needs subcategory" filter and bulk move', async () => {
    const data = ok(await call('GET', `/admin/products?sellerId=${ids.seller}&needsSubcategory=true&limit=1000`, { as: ids.adminToken }), 'needs sub');
    assert.ok(data.products.length >= 2);
    assert.ok(data.products.every((p) => String(p.categoryId) === ids.women), 'only products under a main with children');

    const jacketRow = await ids.db.collection('products').findOne({ categoryId: oid(ids.jackets) });
    const moved = ok(await call('PATCH', '/admin/products/bulk-move-category', {
        as: ids.adminToken,
        body: { productIds: [ids.adminLegacy, String(jacketRow._id)], categoryId: ids.dresses },
    }), 'bulk move');
    assert.equal(moved.movedCount, 1);
    assert.equal(moved.skippedCount, 1, 'a product outside the parent is left alone');
    const legacy = await ids.db.collection('products').findOne({ _id: oid(ids.adminLegacy) });
    assert.equal(String(legacy.categoryId), ids.dresses);
    assert.equal(legacy.categoryName, 'Dresses');
    const jacket = await ids.db.collection('products').findOne({ _id: jacketRow._id });
    assert.equal(String(jacket.categoryId), ids.jackets);

    const toMain = await call('PATCH', '/admin/products/bulk-move-category', {
        as: ids.adminToken,
        body: { productIds: [ids.productInMain], categoryId: ids.jackets },
    });
    assert.equal(toMain.status, 400, 'target must be a subcategory');
});
