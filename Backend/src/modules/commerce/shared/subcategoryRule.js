import mongoose from 'mongoose';
import { ValidationError } from '../../../core/auth/errors.js';
import { Category } from '../admin/models/category.model.js';
import { GLOBAL_CATEGORY_FILTER } from './categoryWorkflow.js';

/**
 * "Choose a subcategory" rule for the product forms.
 *
 * Opt-in: only the new Category -> Subcategory pickers send
 * `requireSubcategory: true`. Older apps (and the Flutter seller app) send no
 * flag and keep today's behaviour, so a product can still be filed under a
 * main category directly. Nothing here changes a stored product.
 */

const APPROVED = [
    { approvalStatus: 'approved' },
    { approvalStatus: { $exists: false }, isApproved: { $ne: false } }
];

export const wantsSubcategory = (body = {}) =>
    body.requireSubcategory === true || body.requireSubcategory === 'true';

/**
 * Whether `categoryId` has at least one active, approved subcategory the given
 * store could pick (global ones, plus the store's own). Zone-bound children of
 * another zone do not count, as the store's picker never shows them.
 */
export async function categoryHasPickableChildren(categoryId, { sellerId = null, zoneId = null } = {}) {
    if (!categoryId || !mongoose.Types.ObjectId.isValid(String(categoryId))) return false;
    const and = [{ $or: APPROVED }];
    if (sellerId && mongoose.Types.ObjectId.isValid(String(sellerId))) {
        and.push({
            $or: [
                { $or: GLOBAL_CATEGORY_FILTER },
                { sellerId: new mongoose.Types.ObjectId(String(sellerId)) }
            ]
        });
    }
    if (zoneId && mongoose.Types.ObjectId.isValid(String(zoneId))) {
        and.push({
            $or: [
                { zoneId: new mongoose.Types.ObjectId(String(zoneId)) },
                { zoneId: { $exists: false } },
                { zoneId: null }
            ]
        });
    }
    const child = await Category.exists({
        parentId: new mongoose.Types.ObjectId(String(categoryId)),
        isActive: { $ne: false },
        $and: and
    });
    return Boolean(child);
}

/**
 * Throws "Choose a subcategory" when the client asked for the rule and the
 * chosen category is a main category with subcategories.
 *
 * `previousCategoryId` is the product's current category on an edit: keeping
 * it unchanged is never blocked, so unrelated edits to an older product filed
 * under a main category still save.
 */
export async function assertSubcategoryChosen(body, categoryId, { sellerId, zoneId, previousCategoryId } = {}) {
    if (!wantsSubcategory(body) || !categoryId) return;
    if (previousCategoryId && String(previousCategoryId) === String(categoryId)) return;
    if (await categoryHasPickableChildren(categoryId, { sellerId, zoneId })) {
        throw new ValidationError('Choose a subcategory');
    }
}
