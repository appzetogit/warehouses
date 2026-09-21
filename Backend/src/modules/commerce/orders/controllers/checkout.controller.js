import {
    abandonCheckout,
    calculateCheckoutPricing,
    createSplitCheckout,
    getCheckoutById,
    verifyCheckoutPayment,
} from '../services/orderSplit.service.js';

const userOf = (req) => req.user?.userId || req.user?.id || req.user?._id;

export async function calculateCheckoutController(req, res, next) {
    try {
        const result = await calculateCheckoutPricing(userOf(req), req.body);
        return res.status(200).json({ success: true, data: result });
    } catch (err) {
        next(err);
    }
}

export async function createCheckoutController(req, res, next) {
    try {
        const result = await createSplitCheckout(userOf(req), req.body);
        return res.status(201).json({
            success: true,
            data: {
                checkout: result.checkout,
                childOrders: result.childOrders,
                pricing: result.pricing,
                // Present for an online payment: open it, then call /verify-payment.
                razorpay: result.razorpay,
            },
        });
    } catch (err) {
        next(err);
    }
}

export async function verifyCheckoutPaymentController(req, res, next) {
    try {
        const result = await verifyCheckoutPayment(userOf(req), { ...req.body, checkoutId: req.params.checkoutId });
        return res.status(200).json({ success: true, data: result });
    } catch (err) {
        next(err);
    }
}

export async function abandonCheckoutController(req, res, next) {
    try {
        const result = await abandonCheckout(userOf(req), req.params.checkoutId);
        return res.status(200).json({ success: true, data: result });
    } catch (err) {
        next(err);
    }
}

export async function getCheckoutByIdController(req, res, next) {
    try {
        const checkout = await getCheckoutById(req.params.checkoutId, userOf(req));
        return res.status(200).json({ success: true, data: checkout });
    } catch (err) {
        next(err);
    }
}
