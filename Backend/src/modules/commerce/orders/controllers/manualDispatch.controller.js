import { sendResponse } from '../../../../utils/response.js';
import * as manual from '../services/manualDispatch.service.js';

export async function getDispatchBoardController(req, res, next) {
    try {
        return sendResponse(res, 200, 'Dispatch board', await manual.getDispatchBoard({ zoneId: req.query?.zoneId }));
    } catch (err) {
        next(err);
    }
}

export async function assignOrdersController(req, res, next) {
    try {
        const result = await manual.assignOrdersToRider({
            riderId: req.body?.riderId,
            orderIds: req.body?.orderIds,
            adminId: req.user?.userId,
        });
        const message = result.assigned.length
            ? `${result.assigned.length} order${result.assigned.length === 1 ? '' : 's'} assigned to ${result.rider.name || 'the rider'}`
            : 'No orders were assigned';
        return sendResponse(res, 200, message, result);
    } catch (err) {
        next(err);
    }
}

export async function unassignOrderController(req, res, next) {
    try {
        const result = await manual.unassignOrder({ orderId: req.params.orderId, adminId: req.user?.userId });
        return sendResponse(res, 200, 'Order taken off the rider', result);
    } catch (err) {
        next(err);
    }
}

export async function moveOrderController(req, res, next) {
    try {
        const result = await manual.moveOrderToRider({
            orderId: req.params.orderId,
            riderId: req.body?.riderId,
            adminId: req.user?.userId,
        });
        return sendResponse(res, 200, `Order moved to ${result.rider.name || 'the rider'}`, result);
    } catch (err) {
        next(err);
    }
}
