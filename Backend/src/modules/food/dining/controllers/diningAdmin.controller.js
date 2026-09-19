import mongoose from 'mongoose';
import * as diningService from '../services/dining.service.js';

export async function getDiningCategories(req, res, next) {
    try {
        const data = await diningService.listDiningCategoriesAdmin();
        res.status(200).json({ success: true, message: 'Dining categories fetched successfully', data });
    } catch (error) {
        next(error);
    }
}

export async function createDiningCategory(req, res, next) {
    try {
        const category = await diningService.createDiningCategory(req.body || {});
        res.status(201).json({ success: true, message: 'Dining category created successfully', data: { category } });
    } catch (error) {
        next(error);
    }
}

export async function updateDiningCategory(req, res, next) {
    try {
        const { id } = req.params;
        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ success: false, message: 'Invalid dining category id' });
        }
        const category = await diningService.updateDiningCategory(id, req.body || {});
        if (!category) {
            return res.status(404).json({ success: false, message: 'Dining category not found' });
        }
        res.status(200).json({ success: true, message: 'Dining category updated successfully', data: { category } });
    } catch (error) {
        next(error);
    }
}

export async function deleteDiningCategory(req, res, next) {
    try {
        const { id } = req.params;
        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ success: false, message: 'Invalid dining category id' });
        }
        const result = await diningService.deleteDiningCategory(id);
        if (!result) {
            return res.status(404).json({ success: false, message: 'Dining category not found' });
        }
        res.status(200).json({ success: true, message: 'Dining category deleted successfully', data: result });
    } catch (error) {
        next(error);
    }
}

export async function getDiningSellers(req, res, next) {
    try {
        const data = await diningService.listDiningSellersAdmin();
        res.status(200).json({ success: true, message: 'Dining stores fetched successfully', data });
    } catch (error) {
        next(error);
    }
}

export async function updateDiningSeller(req, res, next) {
    try {
        const { sellerId } = req.params;
        if (!mongoose.Types.ObjectId.isValid(sellerId)) {
            return res.status(400).json({ success: false, message: 'Invalid store id' });
        }
        const seller = await diningService.updateDiningSeller(sellerId, req.body || {});
        if (!seller) {
            return res.status(404).json({ success: false, message: 'Store not found' });
        }
        res.status(200).json({ success: true, message: 'Dining store updated successfully', data: { seller } });
    } catch (error) {
        next(error);
    }
}
