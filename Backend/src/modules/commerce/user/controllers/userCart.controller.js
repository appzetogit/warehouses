import { sendResponse } from '../../../../utils/response.js';
import { syncUserCart } from '../services/userCart.service.js';

export const syncUserCartController = async (req, res, next) => {
    try {
        const userId = req.user?.userId;
        const items = Array.isArray(req.body?.items) ? req.body.items : [];
        const pricing = req.body?.pricing || null;
        const firstItem = items[0] || {};

        const payload = items.map((item) => ({
            ...item,
            sellerId: item?.sellerId || firstItem?.sellerId || req.body?.sellerId || '',
            sellerName: item?.seller || item?.sellerName || firstItem?.seller || req.body?.sellerName || '',
        }));

        const mode = req.body?.mode ?? req.query?.mode;
        const result = await syncUserCart(userId, payload, pricing, mode);
        return sendResponse(res, 200, 'Cart synced successfully', {
            synced: Boolean(result),
            mode: result?.mode || (String(mode) === 'quick' ? 'quick' : 'shop'),
            itemCount: result?.itemCount || 0,
        });
    } catch (error) {
        next(error);
    }
};

