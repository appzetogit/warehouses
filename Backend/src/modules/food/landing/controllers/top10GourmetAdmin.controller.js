import { FoodGourmetSeller } from '../models/gourmetSeller.model.js';
import { FoodSeller } from '../../seller/models/seller.model.js';
import { getPublicGourmetSellers } from '../services/gourmet.service.js';

/** GET /hero-banners/gourmet - list Gourmet (admin, all entries). Returns { success, data: { sellers } } */
export const listGourmetAdmin = async (req, res, next) => {
    try {
        const docs = await FoodGourmetSeller.find({}).sort({ priority: 1, createdAt: -1 }).lean();
        const sellerIds = [...new Set(docs.map((d) => d.sellerId))];
        const sellers = await FoodSeller.find({ _id: { $in: sellerIds } })
            .select('sellerName area city profileImage rating')
            .lean();
        const sellerMap = new Map(sellers.map((r) => [r._id.toString(), r]));
        const list = docs.map((d) => {
            const r = sellerMap.get(d.sellerId?.toString());
            return {
                _id: d._id,
                sellerId: d.sellerId,
                priority: d.priority,
                order: d.priority,
                isActive: d.isActive,
                seller: r ? {
                    _id: r._id,
                    name: r.sellerName,
                    rating: r.rating || 0,
                    profileImage: r.profileImage ? { url: r.profileImage } : null,
                    area: r.area,
                    city: r.city
                } : null
            };
        });
        res.status(200).json({
            success: true,
            message: 'Gourmet stores fetched',
            data: { sellers: list }
        });
    } catch (error) {
        next(error);
    }
};

/** POST /hero-banners/gourmet - add seller. Body: { sellerId } */
export const createGourmetAdmin = async (req, res, next) => {
    try {
        const { sellerId } = req.body || {};
        if (!sellerId) {
            return res.status(400).json({ success: false, message: 'sellerId is required' });
        }
        const existing = await FoodGourmetSeller.findOne({ sellerId });
        if (existing) {
            return res.status(400).json({ success: false, message: 'Store already in Gourmet' });
        }
        const count = await FoodGourmetSeller.countDocuments();
        const doc = await FoodGourmetSeller.create({ sellerId, priority: count });
        const list = await getPublicGourmetSellers();
        const sellers = (list || []).map((d) => ({
            _id: d._id,
            sellerId: d.sellerId,
            priority: d.priority,
            order: d.priority,
            isActive: d.isActive,
            seller: d.seller ? {
                _id: d.seller._id,
                name: d.seller.name,
                rating: d.seller.rating || 0,
                profileImage: d.seller.profileImage,
                area: d.seller.area,
                city: d.seller.city
            } : null
        })).filter((r) => r && r._id);
        res.status(201).json({
            success: true,
            message: 'Store added to Gourmet',
            data: { sellers, item: doc.toObject() }
        });
    } catch (error) {
        next(error);
    }
};

/** DELETE /hero-banners/gourmet/:id */
export const deleteGourmetAdmin = async (req, res, next) => {
    try {
        const { id } = req.params;
        const doc = await FoodGourmetSeller.findByIdAndDelete(id);
        if (!doc) {
            return res.status(404).json({ success: false, message: 'Gourmet entry not found' });
        }
        res.status(200).json({ success: true, message: 'Store removed from Gourmet', data: { id } });
    } catch (error) {
        next(error);
    }
};

/** PATCH /hero-banners/gourmet/:id/order - body: { order } */
export const updateGourmetOrderAdmin = async (req, res, next) => {
    try {
        const { id } = req.params;
        const order = parseInt(req.body?.order, 10);
        if (Number.isNaN(order)) {
            return res.status(400).json({ success: false, message: 'order must be a number' });
        }
        const doc = await FoodGourmetSeller.findByIdAndUpdate(id, { priority: order }, { new: true });
        if (!doc) {
            return res.status(404).json({ success: false, message: 'Gourmet entry not found' });
        }
        res.status(200).json({ success: true, message: 'Order updated', data: doc.toObject() });
    } catch (error) {
        next(error);
    }
};

/** PATCH /hero-banners/gourmet/:id/status - toggle isActive */
export const toggleGourmetStatusAdmin = async (req, res, next) => {
    try {
        const { id } = req.params;
        const doc = await FoodGourmetSeller.findById(id);
        if (!doc) {
            return res.status(404).json({ success: false, message: 'Gourmet entry not found' });
        }
        doc.isActive = !doc.isActive;
        await doc.save();
        res.status(200).json({ success: true, message: doc.isActive ? 'Activated' : 'Deactivated', data: doc.toObject() });
    } catch (error) {
        next(error);
    }
};
