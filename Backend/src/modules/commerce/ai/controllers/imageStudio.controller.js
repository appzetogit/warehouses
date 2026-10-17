import { sendResponse, sendError } from '../../../../utils/response.js';
import { getImageJob, getImageStudioStatus, startImageJob } from '../services/imageStudio.service.js';

const wrap = (fn) => async (req, res, next) => {
    try {
        await fn(req, res);
    } catch (e) {
        next(e);
    }
};

export const imageStudioStatusController = wrap(async (req, res) =>
    sendResponse(res, 200, 'AI image studio', await getImageStudioStatus(req.user.userId)));

export const startImageJobController = wrap(async (req, res) => {
    const { kind, style, imageUrl } = req.body || {};
    const job = await startImageJob({ sellerId: req.user.userId, kind, style, imageUrl });
    return sendResponse(res, 202, 'AI images are being made', { job });
});

export const getImageJobController = wrap(async (req, res) => {
    const job = await getImageJob(req.user.userId, req.params.id);
    if (!job) return sendError(res, 404, 'Image job not found');
    return sendResponse(res, 200, 'AI image job', { job });
});
