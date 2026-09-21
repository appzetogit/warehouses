import {
    calculateCheckoutPricing,
    createSplitCheckout,
    getCheckoutById,
} from '../services/orderSplit.service.js';

export async function calculateCheckoutController(req, res, next) {
    try {
        const userId = req.user?.userId || req.user?.id || req.user?._id;
        const result = await calculateCheckoutPricing(userId, req.body);
        return res.status(200).json({
            success: true,
            data: result,
        });
    } catch (err) {
        next(err);
    }
}

export async function createCheckoutController(req, res, next) {
    try {
        const userId = req.user?.userId || req.user?.id || req.user?._id;
        const result = await createSplitCheckout(userId, req.body);
        return res.status(201).json({
            success: true,
            data: {
                checkout: result.checkout,
                childOrders: result.childOrders,
                pricing: result.pricing,
            },
        });
    } catch (err) {
        next(err);
    }
}

export async function getCheckoutByIdController(req, res, next) {
    try {
        const userId = req.user?.userId || req.user?.id || req.user?._id;
        const { checkoutId } = req.params;
        const checkout = await getCheckoutById(checkoutId, userId);
        return res.status(200).json({
            success: true,
            data: checkout,
        });
    } catch (err) {
        next(err);
    }
}
