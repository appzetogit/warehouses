import { sendResponse, sendError } from '../../../../utils/response.js';
import {
    listPendingProductApprovals,
    approveProduct,
    rejectProduct
} from '../services/productApproval.service.js';

export async function getPendingProductApprovals(req, res, next) {
    try {
        const data = await listPendingProductApprovals(req.query || {});
        return sendResponse(res, 200, 'Pending food approvals fetched successfully', data);
    } catch (error) {
        next(error);
    }
}

export async function approveProductController(req, res, next) {
    try {
        const updated = await approveProduct(req.params.id);
        if (!updated) return sendError(res, 404, 'Food item not found or not pending');
        return sendResponse(res, 200, 'Food item approved successfully', { food: updated });
    } catch (error) {
        next(error);
    }
}

export async function rejectProductController(req, res, next) {
    try {
        const updated = await rejectProduct(req.params.id, req.body?.reason);
        if (!updated) return sendError(res, 404, 'Food item not found or not pending');
        return sendResponse(res, 200, 'Food item rejected successfully', { food: updated });
    } catch (error) {
        next(error);
    }
}

