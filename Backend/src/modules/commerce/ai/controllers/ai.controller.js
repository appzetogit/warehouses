import { sendResponse, sendError } from '../../../../utils/response.js';

// Bounds what one message can cost when it reaches the model.
const MAX_MESSAGE_LENGTH = 500;
import * as geminiService from '../services/geminiAssistant.service.js';

export const chatAssistantController = async (req, res, next) => {
    try {
        const { message, history } = req.body || {};
        if (String(message || '').length > MAX_MESSAGE_LENGTH) {
            return sendError(res, 400, `Please keep messages under ${MAX_MESSAGE_LENGTH} characters`);
        }
        const userId = req.user?.userId || null;
        const result = await geminiService.handleAssistantChat({ message, userId, history });
        return sendResponse(res, 200, 'AI response generated successfully', result);
    } catch (error) {
        next(error);
    }
};
