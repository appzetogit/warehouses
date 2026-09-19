import { sendResponse, sendError } from '../../../../utils/response.js';
import {
    createSellerFood,
    deleteSellerFood,
    updateSellerFood,
    updateSellerFoodStock,
    listLowStockFoods
} from '../services/sellerFood.service.js';
import { getSellerAnalytics } from '../services/sellerAnalytics.service.js';

export const createSellerFoodController = async (req, res, next) => {
    try {
        const sellerId = req.user?.userId;
        const food = await createSellerFood(sellerId, req.body || {});
        return sendResponse(res, 201, 'Food created successfully', { food });
    } catch (error) {
        next(error);
    }
};

/** PATCH /foods/stock — set counts on many products in one call. */
export const updateSellerFoodStockController = async (req, res, next) => {
    try {
        const sellerId = req.user?.userId;
        const entries = Array.isArray(req.body) ? req.body : req.body?.items;
        const result = await updateSellerFoodStock(sellerId, entries);
        return sendResponse(res, 200, 'Stock updated successfully', result);
    } catch (error) {
        next(error);
    }
};

/** GET /foods/low-stock — what needs reordering. */
export const listLowStockFoodsController = async (req, res, next) => {
    try {
        const sellerId = req.user?.userId;
        const result = await listLowStockFoods(sellerId);
        return sendResponse(res, 200, 'Low stock items fetched successfully', result);
    } catch (error) {
        next(error);
    }
};

/** GET /analytics?from=&to= — sales figures over a date range. */
export const getAnalyticsController = async (req, res, next) => {
    try {
        const sellerId = req.user?.userId;
        const result = await getSellerAnalytics(sellerId, req.query || {});
        return sendResponse(res, 200, 'Analytics fetched successfully', result);
    } catch (error) {
        next(error);
    }
};

/** DELETE /foods/:id — removes one of the seller's own products. */
export const deleteSellerFoodController = async (req, res, next) => {
    try {
        const sellerId = req.user?.userId;
        const deleted = await deleteSellerFood(sellerId, req.params.id);
        if (!deleted) return sendError(res, 404, 'Product not found');
        return sendResponse(res, 200, 'Product deleted successfully', deleted);
    } catch (error) {
        next(error);
    }
};

export const updateSellerFoodController = async (req, res, next) => {
    try {
        const sellerId = req.user?.userId;
        const food = await updateSellerFood(sellerId, req.params.id, req.body || {});
        if (!food) return sendError(res, 404, 'Food not found');
        return sendResponse(res, 200, 'Food updated successfully', { food });
    } catch (error) {
        next(error);
    }
};

