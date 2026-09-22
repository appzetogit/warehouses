import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { startApp, stopApp, tokenFor, call, ok } from './helpers/app.js';

// The admin is split into /admin/quick and /admin/shop. Each panel passes
// fulfilmentMode to the order, badge, dashboard and product endpoints.

let adminToken;
const labelById = new Map();

const baseOrder = (orderId, extra = {}) => {
    const _id = new mongoose.Types.ObjectId();
    labelById.set(String(_id), orderId);
    return {
        _id,
        orderId,
        orderStatus: 'delivered',
        items: [{ itemId: 'x', name: 'Item', price: 100, quantity: 1 }],
        pricing: { subtotal: 100, total: 100 },
        payment: { method: 'cash', status: 'paid' },
        createdAt: new Date(),
        updatedAt: new Date(),
        ...extra,
    };
};

before(async () => {
    const db = await startApp();
    const adminId = new mongoose.Types.ObjectId();
    await db.collection('admins').insertOne({
        _id: adminId,
        email: 'admin_panels@example.com',
        role: 'ADMIN',
        adminType: 'super_admin',
        isActive: true,
    });
    adminToken = tokenFor('ADMIN', adminId, { adminType: 'super_admin' });

    await db.collection('orders').insertMany([
        baseOrder('Q-1', { fulfilmentMode: 'quick' }),
        // Written before fulfilmentMode existed: counts as quick.
        baseOrder('Q-LEGACY'),
        baseOrder('S-1', { fulfilmentMode: 'standard' }),
        baseOrder('Q-PENDING', { fulfilmentMode: 'quick', orderStatus: 'pending' }),
        baseOrder('S-PENDING', { fulfilmentMode: 'standard', orderStatus: 'pending' }),
        baseOrder('S-PENDING-2', { fulfilmentMode: 'standard', orderStatus: 'pending' }),
    ]);

    const sellerId = new mongoose.Types.ObjectId();
    await db.collection('products').insertMany([
        { name: 'Milk', sellerId, approvalStatus: 'approved', channels: { quick: true, shop: true }, createdAt: new Date() },
        { name: 'Bread', sellerId, approvalStatus: 'approved', createdAt: new Date() },
        { name: 'Sofa', sellerId, approvalStatus: 'approved', channels: { quick: false, shop: true }, createdAt: new Date() },
    ]);
});

after(stopApp);

const orderIds = (data) => (data.orders || data.data || []).map((o) => labelById.get(String(o._id || o.id)) || o.orderId).sort();

test('admin order list filters by fulfilmentMode', async () => {
    const all = ok(await call('GET', '/admin/orders?status=delivered', { as: adminToken }), 'all orders');
    assert.deepEqual(orderIds(all), ['Q-1', 'Q-LEGACY', 'S-1']);

    const quick = ok(
        await call('GET', '/admin/orders?status=delivered&fulfilmentMode=quick', { as: adminToken }),
        'quick orders'
    );
    assert.deepEqual(orderIds(quick), ['Q-1', 'Q-LEGACY']);

    const shop = ok(
        await call('GET', '/admin/orders?status=delivered&fulfilmentMode=standard', { as: adminToken }),
        'standard orders'
    );
    assert.deepEqual(orderIds(shop), ['S-1']);
});

test('unknown fulfilmentMode is rejected with 400', async () => {
    for (const path of ['/admin/orders', '/admin/dashboard-stats', '/admin/sidebar-badges', '/admin/products']) {
        const res = await call('GET', `${path}?fulfilmentMode=express`, { as: adminToken });
        assert.equal(res.status, 400, `${path}: ${res.status} ${JSON.stringify(res.body)}`);
    }
});

test('sidebar badges count pending orders per mode', async () => {
    const badges = async (qs) => {
        const res = await call('GET', `/admin/sidebar-badges${qs}`, { as: adminToken });
        assert.equal(res.status, 200, JSON.stringify(res.body));
        return res.body.counts.orders;
    };
    assert.equal(await badges(''), 3);
    assert.equal(await badges('?fulfilmentMode=quick'), 1);
    assert.equal(await badges('?fulfilmentMode=standard'), 2);
});

test('dashboard stats count orders per mode', async () => {
    const stats = async (qs) => ok(await call('GET', `/admin/dashboard-stats${qs}`, { as: adminToken }), 'stats');
    const all = await stats('');
    const quick = await stats('?fulfilmentMode=quick');
    const shop = await stats('?fulfilmentMode=standard');
    const total = (s) => s.orders?.total ?? s.totalOrders ?? s.orderStats?.total;
    assert.equal(total(all), 6);
    assert.equal(total(quick), 3);
    assert.equal(total(shop), 3);
});

test('admin product list: quick panel hides standard-only products, shop sees all', async () => {
    const names = (data) => (data.products || data.data || []).map((p) => p.name).sort();
    const quick = ok(await call('GET', '/admin/products?fulfilmentMode=quick', { as: adminToken }), 'quick products');
    assert.deepEqual(names(quick), ['Bread', 'Milk']);
    const shop = ok(await call('GET', '/admin/products?fulfilmentMode=standard', { as: adminToken }), 'shop products');
    assert.deepEqual(names(shop), ['Bread', 'Milk', 'Sofa']);
});
