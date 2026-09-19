import { sendResponse } from '../../../../utils/response.js';
import { listPublicProducts } from '../services/publicProducts.service.js';

export const listPublicProductsController = async (req, res, next) => {
    try {
        const data = await listPublicProducts(req.query || {});
        return sendResponse(res, 200, 'Products fetched successfully', data);
    } catch (error) {
        next(error);
    }
};
