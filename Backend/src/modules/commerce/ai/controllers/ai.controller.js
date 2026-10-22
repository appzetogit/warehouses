import { sendResponse, sendError } from '../../../../utils/response.js';
import * as geminiService from '../services/geminiAssistant.service.js';
import { checkAssistantAllowed, recordUsage, appendExchange, userKeyFor } from '../services/aiUsage.service.js';
import { logger } from '../../../../utils/logger.js';
import mongoose from 'mongoose';
import { AiConversation } from '../models/aiConversation.model.js';
import { STORE_CHAT_OFF_MESSAGE } from '../services/aiStoreBilling.service.js';

// Bounds what one message can cost when it reaches the model.
const MAX_MESSAGE_LENGTH = 500;

/**
 * Who the assistant talks to. 'seller' only for a caller signed in as a SELLER
 * (and a SELLER token always gets it); anyone else asking for it stays a customer.
 */
export const resolveAudience = (req) => (String(req.user?.role || '').toUpperCase() === 'SELLER' ? 'seller' : 'customer');

/**
 * The seller behind a SELLER token, when it still exists and the token is from
 * its current session; else null.
 */
async function sellerForSession(user) {
    if (!mongoose.Types.ObjectId.isValid(String(user?.userId))) return null;
    const { Seller } = await import('../../seller/models/seller.model.js');
    const doc = await Seller.findById(user.userId).select('tokenVersion aiAccess').lean();
    if (!doc) return null;
    const current = user.tokenVersion === undefined || Number(user.tokenVersion) === (Number(doc.tokenVersion) || 0);
    return current ? doc : null;
}

export const chatAssistantController = async (req, res, next) => {
    try {
        const { message, history, conversationId } = req.body || {};
        if (String(message || '').length > MAX_MESSAGE_LENGTH) {
            return sendError(res, 400, `Please keep messages under ${MAX_MESSAGE_LENGTH} characters`);
        }
        const audience = resolveAudience(req);
        const userId = req.user?.userId || null;
        const text = String(message || '').trim();
        if (audience === 'seller') {
            if (!text) return sendError(res, 400, 'Please type a message');
            const seller = await sellerForSession(req.user);
            if (!seller) return sendError(res, 401, 'Please log in again');
            // AI Help is free, but only for stores an admin has switched it on for.
            if (seller.aiAccess?.chatEnabled !== true) {
                return sendResponse(res, 200, 'Assistant unavailable', {
                    reply: STORE_CHAT_OFF_MESSAGE,
                    unavailable: true,
                    reason: 'store_disabled',
                    suggestions: [],
                    conversationId: conversationId || null,
                });
            }
        }
        const userKey = userKeyFor({ userId, ip: req.ip, audience });

        const gate = await checkAssistantAllowed({ userKey, audience });
        if (!gate.allowed) {
            // A normal reply, so the widget shows it in the chat instead of an error.
            return sendResponse(res, 200, 'Assistant unavailable', {
                reply: gate.message,
                unavailable: true,
                reason: gate.reason,
                suggestions: [],
                conversationId: conversationId || null,
            });
        }

        const result = await geminiService.handleAssistantChat({ message: text, userId, history, settings: gate.settings, audience });
        const { usage, model, toolCalls, ...publicResult } = result;

        let savedId = conversationId || null;
        if (text) {
            try {
                await recordUsage({
                    userKey,
                    userId,
                    audience,
                    messages: 1,
                    llmCalls: usage ? 1 : 0,
                    promptTokens: usage?.promptTokens || 0,
                    outputTokens: usage?.outputTokens || 0,
                });
                savedId = await appendExchange({
                    conversationId, userId, userKey, audience, userText: text, reply: result.reply,
                    toolCalls: toolCalls || [], usage: usage || {}, model: model || '', settings: gate.settings,
                });
            } catch (err) {
                logger.warn(`AI conversation not saved: ${err.message}`);
            }
        }
        return sendResponse(res, 200, 'AI response generated successfully', { ...publicResult, conversationId: savedId ? String(savedId) : null });
    } catch (error) {
        next(error);
    }
};

/** POST /ai/handoff { conversationId, ticketId }: marks the customer's own conversation as handed to support. */
export const linkHandoffController = async (req, res, next) => {
    try {
        const userId = req.user?.userId;
        const { conversationId, ticketId } = req.body || {};
        if (!userId) return sendError(res, 401, 'Please log in');
        if (!mongoose.Types.ObjectId.isValid(String(conversationId)) || !mongoose.Types.ObjectId.isValid(String(ticketId))) {
            return sendError(res, 400, 'conversationId and ticketId are required');
        }
        const { SupportTicket } = await import('../../user/models/supportTicket.model.js');
        const ticket = await SupportTicket.findOne({ _id: ticketId, userId }).select('_id').lean();
        if (!ticket) return sendError(res, 404, 'Ticket not found');
        const updated = await AiConversation.updateOne({ _id: conversationId, userKey: String(userId) }, { $set: { supportTicketId: ticket._id } });
        if (!updated.matchedCount) return sendError(res, 404, 'Conversation not found');
        return sendResponse(res, 200, 'Conversation linked to support ticket', { conversationId, ticketId });
    } catch (error) {
        next(error);
    }
};
