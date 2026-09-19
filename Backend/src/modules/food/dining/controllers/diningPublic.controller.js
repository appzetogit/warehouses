import * as diningService from '../services/dining.service.js';

export async function getPublicDiningCategories(req, res, next) {
    try {
        const categories = await diningService.listDiningCategoriesPublic();
        res.status(200).json({ success: true, message: 'Dining categories fetched successfully', data: categories });
    } catch (error) {
        next(error);
    }
}

export async function getPublicDiningSellers(req, res, next) {
    try {
        const sellers = await diningService.listDiningSellersPublic(req.query || {});
        res.status(200).json({ success: true, message: 'Dining stores fetched successfully', data: sellers });
    } catch (error) {
        next(error);
    }
}
