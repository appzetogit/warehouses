/**
 * Razorpay as our code sees it, for the journeys. Every caller goes through
 * the helper module, so one stand-in covers orders, verification and refunds.
 * Call installRazorpayMock() before startApp().
 */
import { mock } from 'node:test';
import assert from 'node:assert/strict';

export function installRazorpayMock() {
    const rz = { orders: new Map(), payments: new Map(), refunds: [] };
    mock.module(new URL('../../../src/modules/commerce/orders/helpers/razorpay.helper.js', import.meta.url).href, {
        namedExports: {
            isRazorpayConfigured: () => true,
            getRazorpayKeyId: () => 'rzp_test_key',
            getRazorpayInstance: () => { throw new Error('journeys use the helper stand-ins only'); },
            createRazorpayOrder: async (amount, currency = 'INR', receipt = '', notes = {}) => {
                const order = { id: `order_${rz.orders.size + 1}`, amount, currency, receipt, notes: notes || {}, status: 'created' };
                rz.orders.set(order.id, order);
                return order;
            },
            fetchRazorpayOrder: async (id) => rz.orders.get(id),
            createPaymentLink: async () => ({ id: 'plink_1', short_url: 'https://rzp.io/test' }),
            fetchRazorpayPaymentLink: async (id) => ({ id, status: 'created' }),
            verifyPaymentSignature: (orderId, paymentId, signature) => signature === `sig:${orderId}|${paymentId}`,
            fetchRazorpayPayment: async (id) => rz.payments.get(id),
            initiateRazorpayRefund: async (paymentId, amount) => {
                const refund = { id: `rfnd_${rz.refunds.length + 1}`, paymentId, amount };
                rz.refunds.push(refund);
                return { success: true, refundId: refund.id, status: 'processed' };
            },
        },
    });

    /** What the Razorpay checkout hands back after the customer pays. */
    const pay = (rzOrderId, extra = {}) => {
        const order = rz.orders.get(rzOrderId);
        assert.ok(order, `Razorpay order ${rzOrderId} exists`);
        const id = `pay_${rz.payments.size + 1}`;
        rz.payments.set(id, { id, order_id: rzOrderId, amount: order.amount, status: 'captured', notes: order.notes, method: 'card', ...extra });
        order.status = 'paid';
        return { razorpayOrderId: rzOrderId, razorpayPaymentId: id, razorpaySignature: `sig:${rzOrderId}|${id}` };
    };
    return { rz, pay };
}
