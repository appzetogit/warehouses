import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { startApp, stopApp, tokenFor, call, ok } from './helpers/app.js';

// The shop ("/") and quick ("/quick") storefronts keep separate carts, so the
// server keeps one cart per user per mode.
let db;
let adminToken;
let UserCart;
let getUserCart;
const users = {};
let phoneSeq = 0;

const makeUser = async (name) => {
    const { User } = await import('../src/core/users/user.model.js');
    const user = await User.create({ name, phone: `92222${String(++phoneSeq).padStart(5, '0')}`, isActive: true });
    return { id: user._id, as: tokenFor('USER', user._id) };
};
const line = (name, price = 10) => ({ id: name, itemId: name, name, price, quantity: 1, sellerId: '', seller: 'S' });
const sync = async (user, mode, items) => ok(
    await call('PUT', '/user/cart', { as: user.as, body: mode ? { items, mode } : { items } }),
    `sync ${mode}`,
);

before(async () => {
    db = await startApp();
    ({ UserCart } = await import('../src/modules/commerce/user/models/userCart.model.js'));
    ({ getUserCart } = await import('../src/modules/commerce/user/services/userCart.service.js'));
    // Simulate a database created with the old schema: unique index on userId alone.
    await db.collection('user_carts').createIndex({ userId: 1 }, { unique: true, name: 'userId_1' }).catch(() => {});
    const adminId = new mongoose.Types.ObjectId();
    await db.collection('admins').insertOne({ _id: adminId, email: 'cart_modes@example.com', role: 'ADMIN', adminType: 'super_admin', isActive: true });
    adminToken = tokenFor('ADMIN', adminId, { adminType: 'super_admin' });
    users.a = await makeUser('Cart A');
    users.legacy = await makeUser('Cart Legacy');
});

after(stopApp);

test('a user can hold a shop cart and a quick cart at the same time', async () => {
    assert.equal((await sync(users.a, 'shop', [line('Sofa')])).mode, 'shop');
    assert.equal((await sync(users.a, 'quick', [line('Milk'), line('Bread')])).mode, 'quick');
    const shop = await getUserCart(users.a.id, 'shop');
    const quick = await getUserCart(users.a.id, 'quick');
    assert.deepEqual(shop.items.map((i) => i.name), ['Sofa']);
    assert.deepEqual(quick.items.map((i) => i.name), ['Milk', 'Bread']);
    assert.equal(await UserCart.countDocuments({ userId: users.a.id }), 2);
});

test('syncing or clearing one mode leaves the other alone; no mode means shop', async () => {
    await sync(users.a, undefined, [line('Table')]);
    assert.deepEqual((await getUserCart(users.a.id, 'shop')).items.map((i) => i.name), ['Table']);
    await sync(users.a, 'quick', []);
    assert.equal(await getUserCart(users.a.id, 'quick'), null);
    assert.deepEqual((await getUserCart(users.a.id, 'shop')).items.map((i) => i.name), ['Table']);
});

test('a legacy cart without mode is the shop cart and is updated in place', async () => {
    await UserCart.collection.insertOne({ userId: users.legacy.id, items: [{ name: 'Old', price: 5, quantity: 1 }], itemCount: 1, subtotal: 5, updatedAt: new Date() });
    assert.equal((await getUserCart(users.legacy.id, 'shop')).mode, 'shop');
    assert.equal(await getUserCart(users.legacy.id, 'quick'), null);
    await sync(users.legacy, 'quick', [line('Eggs')]);
    await sync(users.legacy, 'shop', [line('Chair')]);
    const docs = await UserCart.find({ userId: users.legacy.id }).lean();
    assert.equal(docs.length, 2);
    assert.deepEqual(docs.map((d) => d.mode).sort(), ['quick', 'shop']);
});

test('admin user-carts lists the mode of each cart', async () => {
    const data = ok(await call('GET', '/admin/orders/user-carts?limit=100', { as: adminToken }), 'admin carts');
    const mine = data.carts.filter((c) => c.userId === String(users.legacy.id));
    assert.deepEqual(mine.map((c) => c.mode).sort(), ['quick', 'shop']);
    const quickOnly = ok(await call('GET', '/admin/orders/user-carts?limit=100&mode=quick', { as: adminToken }), 'admin quick carts');
    assert.ok(quickOnly.carts.length > 0 && quickOnly.carts.every((c) => c.mode === 'quick'));
});
