import { sendResponse, sendError } from '../../../../utils/response.js';
import { getAdminAiSettingsView, updateAiSettings } from '../services/aiSettings.service.js';
import { listConversations, getConversation, getUsage } from '../services/aiAdmin.service.js';
import {
    getStoreAiAccessAdmin,
    updateStoreAiAccessAdmin,
    listStoreAiUsageAdmin,
    exportStoreAiUsageAdmin,
} from '../services/aiStoreBilling.service.js';
import { validateAiAccessDto } from '../../admin/validators/aiAccess.validator.js';

const wrap = (fn) => async (req, res, next) => {
    try {
        await fn(req, res);
    } catch (e) {
        next(e);
    }
};

export const getSettings = wrap(async (_req, res) => sendResponse(res, 200, 'AI settings', await getAdminAiSettingsView()));
export const putSettings = wrap(async (req, res) => sendResponse(res, 200, 'AI settings saved', await updateAiSettings(req.body || {})));
export const listConversationsController = wrap(async (req, res) => sendResponse(res, 200, 'Conversations', await listConversations(req.query)));
export const getConversationController = wrap(async (req, res) => {
    const doc = await getConversation(req.params.id);
    if (!doc) return sendError(res, 404, 'Conversation not found');
    return sendResponse(res, 200, 'Conversation', { conversation: doc });
});
export const getUsageController = wrap(async (req, res) => sendResponse(res, 200, 'AI usage', await getUsage(req.query)));

// ----- Per-store AI access and AI image usage -----

export const getStoreAiAccessController = wrap(async (req, res) =>
    sendResponse(res, 200, 'Store AI access', await getStoreAiAccessAdmin(req.params.id)));

export const updateStoreAiAccessController = wrap(async (req, res) => {
    const body = validateAiAccessDto(req.body);
    return sendResponse(res, 200, 'Store AI access saved', await updateStoreAiAccessAdmin(req.params.id, body, req.user?.userId));
});

export const listStoreAiUsageController = wrap(async (req, res) =>
    sendResponse(res, 200, 'Store AI usage', await listStoreAiUsageAdmin(req.query)));

export const exportStoreAiUsageController = wrap(async (req, res) => {
    const csv = await exportStoreAiUsageAdmin(req.query);
    const month = /^\d{4}-\d{2}$/.test(String(req.query.month || '')) ? req.query.month : 'current';
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="ai-store-usage-${month}.csv"`);
    return res.status(200).send(csv);
});
