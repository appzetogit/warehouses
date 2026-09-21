import { sendResponse } from '../../../../utils/response.js';
import * as spinService from '../services/spin.service.js';

export const getSpinStatusController = async (req, res, next) => {
    try {
        const userId = req.user?.userId;
        const status = await spinService.getSpinStatus(userId);
        return sendResponse(res, 200, 'Spin status fetched successfully', status);
    } catch (error) {
        next(error);
    }
};

export const playSpinController = async (req, res, next) => {
    try {
        const userId = req.user?.userId;
        const ip = req.ip || req.connection?.remoteAddress || '';
        const result = await spinService.playSpin(userId, { ip });
        return sendResponse(res, 200, 'Spin completed successfully', result);
    } catch (error) {
        next(error);
    }
};
