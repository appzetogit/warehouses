import { test, before, after, beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { startDb, stopDb, clearDb } from './helpers/db.js';

// Razorpay as the wallet sees it: orders and payments looked up by id.
const rz = { orders: new Map(), payments: new Map() };
mock.module(new URL('../src/modules/commerce/orders/helpers/razorpay.helper.js', import.meta.url).href, {
    namedExports: {
        isRazorpayConfigured: () => true,
        getRazorpayKeyId: () => 'rzp_test_key',
        verifyPaymentSignature: (orderId, paymentId, signature) => signature === `sig:${orderId}|${paymentId}`,
        createRazorpayOrder: async (amount, currency, receipt, notes) => {
            const order = { id: `order_${rz.orders.size + 1}`, amount, currency, receipt, notes: notes || {} };
            rz.orders.set(order.id, order);
            return order;
        },
        fetchRazorpayOrder: async (id) => rz.orders.get(id),
        fetchRazorpayPayment: async (id) => rz.payments.get(id)
    }
});

const { createWalletTopupOrder, verifyWalletTopupPayment, getUserWallet } =
    await import('../src/modules/commerce/user/services/userWallet.service.js');

before(startDb);
after(stopDb);
beforeEach(async () => {
    await clearDb();
    rz.orders.clear();
    rz.payments.clear();
});

const pay = (orderId, paise, status = 'captured') => {
    const id = `pay_${rz.payments.size + 1}`;
    rz.payments.set(id, { id, order_id: orderId, amount: paise, status });
    return { razorpayOrderId: orderId, razorpayPaymentId: id, razorpaySignature: `sig:${orderId}|${id}` };
};

test('credits what Razorpay captured, not what the client claims', async () => {
    const userId = new mongoose.Types.ObjectId();
    const { razorpay } = await createWalletTopupOrder(userId, 100);
    const proof = pay(razorpay.orderId, 10000);

    const { wallet } = await verifyWalletTopupPayment(userId, { ...proof, amount: 50000 });
    assert.equal(wallet.balance, 100);
});

test('refuses a payment made for something other than a top-up', async () => {
    const userId = new mongoose.Types.ObjectId();
    rz.orders.set('order_product', { id: 'order_product', amount: 50000, receipt: 'ORD-123', notes: {} });
    const proof = pay('order_product', 50000);

    await assert.rejects(verifyWalletTopupPayment(userId, { ...proof, amount: 500 }), /not a wallet top-up/);
    assert.equal((await getUserWallet(userId)).balance, 0);
});

test('refuses a top-up created for a different user', async () => {
    const owner = new mongoose.Types.ObjectId();
    const other = new mongoose.Types.ObjectId();
    const { razorpay } = await createWalletTopupOrder(owner, 100);
    const proof = pay(razorpay.orderId, 10000);

    await assert.rejects(verifyWalletTopupPayment(other, { ...proof, amount: 100 }), /not a wallet top-up/);
});

test('accepts top-ups created before notes were added, by receipt', async () => {
    const userId = new mongoose.Types.ObjectId();
    const receipt = `wallet_topup_${String(userId).slice(-8)}_1700000000000`;
    rz.orders.set('order_old', { id: 'order_old', amount: 20000, receipt });
    const proof = pay('order_old', 20000);

    const { wallet } = await verifyWalletTopupPayment(userId, { ...proof, amount: 200 });
    assert.equal(wallet.balance, 200);
});

test('refuses a bad signature and an uncaptured payment', async () => {
    const userId = new mongoose.Types.ObjectId();
    const { razorpay } = await createWalletTopupOrder(userId, 100);
    const proof = pay(razorpay.orderId, 10000, 'failed');

    await assert.rejects(
        verifyWalletTopupPayment(userId, { ...proof, razorpaySignature: 'forged', amount: 100 }),
        /verification failed/
    );
    await assert.rejects(verifyWalletTopupPayment(userId, { ...proof, amount: 100 }), /not captured/);
});

test('verifying the same payment twice credits once', async () => {
    const userId = new mongoose.Types.ObjectId();
    const { razorpay } = await createWalletTopupOrder(userId, 100);
    const proof = pay(razorpay.orderId, 10000);

    await Promise.all([
        verifyWalletTopupPayment(userId, { ...proof, amount: 100 }),
        verifyWalletTopupPayment(userId, { ...proof, amount: 100 }),
        verifyWalletTopupPayment(userId, { ...proof, amount: 100 })
    ]);
    const wallet = await getUserWallet(userId);
    assert.equal(wallet.balance, 100);
    assert.equal(wallet.transactions.length, 1);
});
