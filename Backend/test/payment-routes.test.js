import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import mongoose from 'mongoose';
import { startDb, stopDb } from './helpers/db.js';
import paymentRoutes from '../src/core/payments/payment.routes.js';
import { FoodOrder } from '../src/modules/food/orders/models/order.model.js';

// The real router behind a stand-in for authMiddleware, which only sets req.user.
let server;
let baseUrl;

const customer = new mongoose.Types.ObjectId();
const seller = new mongoose.Types.ObjectId();
const rider = new mongoose.Types.ObjectId();
const orderId = new mongoose.Types.ObjectId();

before(async () => {
    await startDb();
    await FoodOrder.collection.insertOne({
        _id: orderId,
        userId: customer,
        restaurantId: seller,
        dispatch: { deliveryPartnerId: rider }
    });

    const app = express();
    app.use(express.json());
    app.use((req, res, next) => {
        const [role, userId] = String(req.headers['x-test-user'] || '').split(':');
        if (role) req.user = { role, userId };
        next();
    });
    app.use('/payments', paymentRoutes);
    await new Promise((resolve) => { server = app.listen(0, resolve); });
    baseUrl = `http://127.0.0.1:${server.address().port}/payments`;
});

after(async () => {
    await new Promise((resolve) => server.close(resolve));
    await stopDb();
});

const call = (path, who, method = 'GET') =>
    fetch(`${baseUrl}${path}`, { method, headers: { 'x-test-user': who } }).then((r) => r.status);

test('admin finance routes are admin-only', async () => {
    const someone = new mongoose.Types.ObjectId();
    assert.equal(await call('/admin/wallet', `USER:${someone}`), 403);
    assert.equal(await call('/admin/settlements', `RESTAURANT:${seller}`, 'POST'), 403);
    assert.equal(await call('/admin/settlements/x/process', `DELIVERY_PARTNER:${rider}`, 'POST'), 403);
    assert.equal(await call('/admin/refunds', `USER:${someone}`), 403);
    assert.equal(await call('/admin/refunds', 'ADMIN:admin1'), 200);
});

test("a seller or rider reads only their own wallet", async () => {
    const otherSeller = new mongoose.Types.ObjectId();
    assert.equal(await call(`/restaurant/${seller}/wallet`, `RESTAURANT:${seller}`), 200);
    assert.equal(await call(`/restaurant/${otherSeller}/wallet`, `RESTAURANT:${seller}`), 403);
    assert.equal(await call(`/restaurant/${seller}/wallet`, `USER:${customer}`), 403);
    assert.equal(await call(`/restaurant/${seller}/wallet`, 'ADMIN:admin1'), 200);

    assert.equal(await call(`/delivery/${rider}/wallet`, `DELIVERY_PARTNER:${rider}`), 200);
    assert.equal(await call(`/delivery/${rider}/wallet`, `USER:${customer}`), 403);
});

test("an order's money trail is visible only to its parties", async () => {
    for (const path of ['payments', 'transactions', 'refunds']) {
        assert.equal(await call(`/orders/${orderId}/${path}`, `USER:${customer}`), 200);
        assert.equal(await call(`/orders/${orderId}/${path}`, `RESTAURANT:${seller}`), 200);
        assert.equal(await call(`/orders/${orderId}/${path}`, `DELIVERY_PARTNER:${rider}`), 200);
        assert.equal(await call(`/orders/${orderId}/${path}`, 'ADMIN:admin1'), 200);
        assert.equal(await call(`/orders/${orderId}/${path}`, `USER:${new mongoose.Types.ObjectId()}`), 404);
    }
    assert.equal(await call('/orders/not-an-id/payments', `USER:${customer}`), 404);
});
