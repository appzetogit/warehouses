import mongoose from 'mongoose';
import { ValidationError } from '../../../../core/auth/errors.js';
import { FoodItem } from '../models/food.model.js';
import { FoodAddon } from '../../seller/models/foodAddon.model.js';
import { FoodSeller } from '../../seller/models/seller.model.js';
import { syncMenuItemApprovalStatus } from '../../seller/services/sellerMenu.service.js';
import { getFoodDisplayOtherPrice, getFoodDisplayPrice, serializeFoodVariants } from './foodVariant.service.js';

const toSellerDisplayId = (mongoId) => {
    const s = String(mongoId || '');
    return s.length >= 5 ? s.slice(-5) : s;
};

export async function listPendingFoodApprovals(query = {}) {
    const limit = Math.min(Math.max(parseInt(query.limit, 10) || 200, 1), 1000);
    const page = Math.max(parseInt(query.page, 10) || 1, 1);
    const skip = (page - 1) * limit;

    const filter = { approvalStatus: 'pending' };
    if (query.sellerId && mongoose.Types.ObjectId.isValid(String(query.sellerId))) {
        filter.sellerId = query.sellerId;
    }
    if (query.search && String(query.search).trim()) {
        const term = String(query.search).trim().slice(0, 80);
        filter.$or = [
            { name: { $regex: term, $options: 'i' } },
            { categoryName: { $regex: term, $options: 'i' } }
        ];
    }

    const foodList = await FoodItem.find(filter)
        .sort({ requestedAt: -1, createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .select('sellerId categoryName name price variants image foodType approvalStatus requestedAt createdAt')
        .lean();

    const addonList = await FoodAddon.find({ approvalStatus: 'pending' })
        .sort({ requestedAt: -1, createdAt: -1 })
        .limit(limit)
        .select('sellerId draft isAvailable requestedAt createdAt')
        .lean();

    const sellerIds = Array.from(new Set([
        ...foodList.map((f) => String(f.sellerId)),
        ...addonList.map((a) => String(a.sellerId))
    ].filter(Boolean)));

    const sellers = sellerIds.length
        ? await FoodSeller.find({ _id: { $in: sellerIds } }).select('sellerName').lean()
        : [];
    const sellerMap = new Map(sellers.map((r) => [String(r._id), r.sellerName]));

    const foodRequests = foodList.map((f) => ({
        _id: f._id,
        id: f._id,
        entityType: 'food',
        type: 'food',
        sellerName: sellerMap.get(String(f.sellerId)) || 'Unknown Seller',
        sellerId: toSellerDisplayId(f.sellerId),
        category: f.categoryName || '',
        itemName: f.name,
        foodType: f.foodType || 'Non-Veg',
        sectionName: f.categoryName || '',
        subsectionName: '',
        approvalStatus: f.approvalStatus || 'pending',
        price: getFoodDisplayPrice(f),
        otherPrice: getFoodDisplayOtherPrice(f),
        variants: serializeFoodVariants(f.variants),
        image: f.image || '',
        images: f.image ? [f.image] : [],
        requestedAt: f.requestedAt || f.createdAt,
        isActionable: (f.approvalStatus || 'pending') === 'pending'
    }));

    const addonRequests = addonList.map((a) => ({
        _id: a._id,
        id: a._id,
        entityType: 'addon',
        type: 'addon',
        sellerName: sellerMap.get(String(a.sellerId)) || 'Unknown Seller',
        sellerId: toSellerDisplayId(a.sellerId),
        category: 'Add-on',
        itemName: a.draft?.name || 'Unnamed Add-on',
        foodType: 'Add-on',
        sectionName: 'Add-on',
        subsectionName: '',
        approvalStatus: 'pending',
        price: a.draft?.price ?? 0,
        image: a.draft?.image || (a.draft?.images && a.draft.images[0]) || '',
        images: a.draft?.images || (a.draft?.image ? [a.draft.image] : []),
        requestedAt: a.requestedAt || a.createdAt,
        isActionable: true,
        description: a.draft?.description || ''
    }));

    const allRequests = [...foodRequests, ...addonRequests].sort((a, b) => 
        new Date(b.requestedAt).getTime() - new Date(a.requestedAt).getTime()
    );

    return { requests: allRequests, page, limit, total: allRequests.length };
}

export async function approveFoodItem(id) {
    if (!id || !mongoose.Types.ObjectId.isValid(String(id))) {
        throw new ValidationError('Invalid food id');
    }
    const updated = await FoodItem.findOneAndUpdate(
        { _id: id, approvalStatus: 'pending' },
        { $set: { approvalStatus: 'approved', approvedAt: new Date(), rejectedAt: null, rejectionReason: '' } },
        { new: true }
    ).lean();
    if (updated?.sellerId) {
        // Single DB update; makes user-facing menu reflect approval immediately.
        await syncMenuItemApprovalStatus(updated.sellerId, updated._id, 'approved', '');
        
        try {
            const { invalidateCache } = await import('../../../../middleware/cache.js');
            await invalidateCache(`seller_menu:${updated.sellerId}`);
        } catch (cacheErr) {
            console.error('Failed to invalidate cache after food approval:', cacheErr);
        }

        try {
            const { notifyOwnersSafely } = await import('../../../../core/notifications/firebase.service.js');
            await notifyOwnersSafely(
                [{ ownerType: 'SELLER', ownerId: updated.sellerId }],
                {
                    title: 'Dish Approved! 🍲',
                    body: `Your dish "${updated.name}" has been approved and is now visible to customers.`,
                    image: updated.image || 'https://i.ibb.co/5GzXz7r/Switcheats-Brand-Image.png',
                    data: {
                        type: 'food_approved',
                        foodId: String(updated._id),
                        sellerId: String(updated.sellerId)
                    }
                }
            );
        } catch (e) {
            console.error('Failed to send food approval notification:', e);
        }
    }
    return updated;
}

export async function rejectFoodItem(id, reason) {
    if (!id || !mongoose.Types.ObjectId.isValid(String(id))) {
        throw new ValidationError('Invalid food id');
    }
    const r = typeof reason === 'string' ? reason.trim() : '';
    if (!r) throw new ValidationError('Rejection reason is required');
    if (r.length > 500) throw new ValidationError('Rejection reason is too long');

    const updated = await FoodItem.findOneAndUpdate(
        { _id: id, approvalStatus: 'pending' },
        { $set: { approvalStatus: 'rejected', rejectedAt: new Date(), rejectionReason: r, approvedAt: null } },
        { new: true }
    ).lean();
    if (updated?.sellerId) {
        await syncMenuItemApprovalStatus(updated.sellerId, updated._id, 'rejected', r);
        
        try {
            const { invalidateCache } = await import('../../../../middleware/cache.js');
            await invalidateCache(`seller_menu:${updated.sellerId}`);
        } catch (cacheErr) {
            console.error('Failed to invalidate cache after food rejection:', cacheErr);
        }

        try {
            const { notifyOwnersSafely } = await import('../../../../core/notifications/firebase.service.js');
            await notifyOwnersSafely(
                [{ ownerType: 'SELLER', ownerId: updated.sellerId }],
                {
                    title: 'Dish Rejected ❌',
                    body: `Your dish "${updated.name}" was rejected. Reason: ${r}`,
                    image: updated.image || 'https://i.ibb.co/5GzXz7r/Switcheats-Brand-Image.png',
                    data: {
                        type: 'food_rejected',
                        foodId: String(updated._id),
                        sellerId: String(updated.sellerId),
                        reason: r
                    }
                }
            );
        } catch (e) {
            console.error('Failed to send food rejection notification:', e);
        }
    }
    return updated;
}

