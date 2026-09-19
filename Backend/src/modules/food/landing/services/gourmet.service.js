import { FoodGourmetSeller } from '../models/gourmetSeller.model.js';
import { FoodSeller } from '../../seller/models/seller.model.js';
import mongoose from 'mongoose';

export const getPublicGourmetSellers = async (zoneId) => {
    const docs = await FoodGourmetSeller.find({ isActive: true })
        .sort({ priority: 1, createdAt: -1 })
        .lean();

    const sellerIds = docs.map((d) => d.sellerId);
    
    const query = { _id: { $in: sellerIds }, status: 'approved' };
    if (zoneId && mongoose.Types.ObjectId.isValid(zoneId)) {
        query.zoneId = new mongoose.Types.ObjectId(zoneId);
    }

    const sellers = await FoodSeller.find(query)
        .select('sellerName area city profileImage rating cuisines slug pureVegSeller location estimatedDeliveryTime zoneId')
        .lean();

    const sellerMap = new Map(sellers.map((r) => [r._id.toString(), r]));

    return docs.map((item) => {
        const r = sellerMap.get(item.sellerId.toString());
        return {
            ...item,
            seller: r ? {
                _id: r._id,
                name: r.sellerName,
                sellerName: r.sellerName,
                rating: r.rating || 0,
                profileImage: r.profileImage ? { url: r.profileImage } : null,
                area: r.area,
                city: r.city,
                cuisines: r.cuisines || [],
                slug: r.slug,
                pureVegSeller: r.pureVegSeller,
                location: r.location,
                estimatedDeliveryTime: r.estimatedDeliveryTime,
                zoneId: r.zoneId
            } : null
        };
    });
};

