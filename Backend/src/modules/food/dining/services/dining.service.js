import mongoose from 'mongoose';
import { ValidationError } from '../../../../core/auth/errors.js';
import { FoodSeller } from '../../seller/models/seller.model.js';
import { FoodDiningCategory } from '../models/diningCategory.model.js';
import { FoodDiningSeller } from '../models/diningSeller.model.js';

const slugify = (value) =>
    String(value || '')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '');

const toObjectIdArray = (values) =>
    Array.from(
        new Set(
            (Array.isArray(values) ? values : [values])
                .map((value) => String(value || '').trim())
                .filter((value) => mongoose.Types.ObjectId.isValid(value))
        )
    ).map((value) => new mongoose.Types.ObjectId(value));

async function syncSellerDiningSettings(sellerId, diningDoc) {
    const primaryCategory = diningDoc?.primaryCategoryId
        ? await FoodDiningCategory.findById(diningDoc.primaryCategoryId).select('slug').lean()
        : null;

    await FoodSeller.findByIdAndUpdate(
        sellerId,
        {
            $set: {
                diningSettings: {
                    isEnabled: Boolean(diningDoc?.isEnabled),
                    maxGuests: Math.max(1, Number(diningDoc?.maxGuests) || 6),
                    diningType: primaryCategory?.slug || 'family-dining'
                }
            }
        },
        { new: false }
    );
}

async function syncCategorySellerLinks(sellerId, categoryIds) {
    await FoodDiningCategory.updateMany(
        { sellerIds: sellerId, _id: { $nin: categoryIds } },
        { $pull: { sellerIds: sellerId } }
    );

    if (categoryIds.length > 0) {
        await FoodDiningCategory.updateMany(
            { _id: { $in: categoryIds } },
            { $addToSet: { sellerIds: sellerId } }
        );
    }
}

function mapCategory(doc) {
    return {
        _id: doc._id,
        name: doc.name,
        slug: doc.slug,
        imageUrl: doc.imageUrl || '',
        isActive: doc.isActive !== false,
        sortOrder: doc.sortOrder || 0,
        sellerCount: Array.isArray(doc.sellerIds) ? doc.sellerIds.length : 0,
        createdAt: doc.createdAt,
        updatedAt: doc.updatedAt
    };
}

function getSellerZone(seller) {
    return (
        seller?.location?.area ||
        seller?.location?.city ||
        seller?.area ||
        seller?.city ||
        'N/A'
    );
}

function getSellerImage(seller) {
    const coverImage = Array.isArray(seller?.coverImages)
        ? seller.coverImages
            .map((image) => (typeof image === 'string' ? image : image?.url || ''))
            .find(Boolean)
        : '';
    if (coverImage) return coverImage;

    const menuImage = Array.isArray(seller?.menuImages)
        ? seller.menuImages
            .map((image) => (typeof image === 'string' ? image : image?.url || ''))
            .find(Boolean)
        : '';
    if (menuImage) return menuImage;

    const value = seller?.profileImage;
    if (!value) return '';
    if (typeof value === 'string') return value;
    return value?.url || '';
}

function mapDiningSeller(seller, diningDoc, categoriesById) {
    const categoryIds = (diningDoc?.categoryIds || []).map((id) => String(id));
    const categories = categoryIds
        .map((id) => categoriesById.get(id))
        .filter(Boolean)
        .map((category) => ({
            _id: category._id,
            name: category.name,
            slug: category.slug,
            imageUrl: category.imageUrl || ''
        }));

    const primaryCategoryId = diningDoc?.primaryCategoryId ? String(diningDoc.primaryCategoryId) : '';
    const primaryCategory = categories.find((category) => String(category._id) === primaryCategoryId) || categories[0] || null;

    return {
        _id: seller._id,
        id: seller._id,
        name: seller.sellerName || seller.name || 'N/A',
        sellerName: seller.sellerName || seller.name || 'N/A',
        ownerName: seller.ownerName || 'N/A',
        ownerPhone: seller.ownerPhone || seller.phone || 'N/A',
        pureVegSeller: diningDoc?.pureVegSeller === true || seller?.pureVegSeller === true,
        zone: getSellerZone(seller),
        city: seller?.location?.city || seller?.city || '',
        status: seller.status,
        isActive: seller.status === 'approved',
        rating: Number(seller.rating || 0),
        logo: getSellerImage(seller),
        categories,
        categoryIds,
        primaryCategoryId: primaryCategory?._id || null,
        diningSettings: {
            isEnabled: Boolean(diningDoc?.isEnabled),
            maxGuests: Math.max(1, Number(diningDoc?.maxGuests) || 6),
            pureVegSeller: diningDoc?.pureVegSeller === true || seller?.pureVegSeller === true,
            diningType: primaryCategory?.slug || seller?.diningSettings?.diningType || ''
        }
    };
}

export async function listDiningCategoriesAdmin() {
    const categories = await FoodDiningCategory.find({})
        .sort({ sortOrder: 1, createdAt: -1 })
        .lean();
    return { categories: categories.map(mapCategory) };
}

export async function createDiningCategory(body = {}) {
    const name = String(body.name || '').trim();
    if (!name) {
        throw new ValidationError('Category name is required');
    }

    const slug = slugify(body.slug || name);
    if (!slug) {
        throw new ValidationError('Category slug is required');
    }

    const existing = await FoodDiningCategory.findOne({ slug }).lean();
    if (existing) {
        throw new ValidationError('Dining category already exists');
    }

    const created = await FoodDiningCategory.create({
        name,
        slug,
        imageUrl: String(body.imageUrl || '').trim(),
        isActive: body.isActive !== false,
        sortOrder: Number(body.sortOrder) || 0
    });

    return mapCategory(created.toObject());
}

export async function updateDiningCategory(id, body = {}) {
    if (!mongoose.Types.ObjectId.isValid(id)) return null;

    const doc = await FoodDiningCategory.findById(id);
    if (!doc) return null;

    if (body.name !== undefined) {
        doc.name = String(body.name || '').trim();
    }
    if (body.slug !== undefined || body.name !== undefined) {
        const nextSlug = slugify(body.slug || doc.name);
        const conflict = await FoodDiningCategory.findOne({ slug: nextSlug, _id: { $ne: doc._id } }).lean();
        if (conflict) {
            throw new ValidationError('Dining category slug already exists');
        }
        doc.slug = nextSlug;
    }
    if (body.imageUrl !== undefined) {
        doc.imageUrl = String(body.imageUrl || '').trim();
    }
    if (body.isActive !== undefined) {
        doc.isActive = body.isActive !== false;
    }
    if (body.sortOrder !== undefined) {
        doc.sortOrder = Number(body.sortOrder) || 0;
    }

    await doc.save();

    const linkedDiningDocs = await FoodDiningSeller.find({ categoryIds: doc._id }).select('_id sellerId').lean();
    await Promise.all(linkedDiningDocs.map(async (item) => {
        await syncSellerDiningSettings(item.sellerId, await FoodDiningSeller.findById(item._id).lean());
    }));

    return mapCategory(doc.toObject());
}

export async function deleteDiningCategory(id) {
    if (!mongoose.Types.ObjectId.isValid(id)) return null;

    const category = await FoodDiningCategory.findByIdAndDelete(id).lean();
    if (!category) return null;

    const categoryId = new mongoose.Types.ObjectId(id);
    const diningDocs = await FoodDiningSeller.find({ categoryIds: categoryId });

    for (const doc of diningDocs) {
        doc.categoryIds = (doc.categoryIds || []).filter((value) => String(value) !== id);
        if (doc.primaryCategoryId && String(doc.primaryCategoryId) === id) {
            doc.primaryCategoryId = doc.categoryIds[0] || null;
        }
        if (typeof doc.pureVegSeller !== 'boolean') {
            const sourceSeller = await FoodSeller.findById(doc.sellerId).select('pureVegSeller').lean();
            doc.pureVegSeller = sourceSeller?.pureVegSeller === true;
        }
        await doc.save();
        await syncSellerDiningSettings(doc.sellerId, doc);
    }

    return { id };
}

export async function listDiningSellersAdmin() {
    const [sellers, diningDocs, categories] = await Promise.all([
        FoodSeller.find({})
            .sort({ createdAt: -1 })
            .select('sellerName ownerName ownerPhone profileImage coverImages menuImages location area city status rating pureVegSeller diningSettings')
            .lean(),
        FoodDiningSeller.find({})
            .select('sellerId categoryIds primaryCategoryId isEnabled maxGuests pureVegSeller')
            .lean(),
        FoodDiningCategory.find({}).select('name slug imageUrl').lean()
    ]);

    const categoriesById = new Map(categories.map((category) => [String(category._id), category]));
    const diningBySellerId = new Map(diningDocs.map((doc) => [String(doc.sellerId), doc]));

    const items = sellers.map((seller) =>
        mapDiningSeller(seller, diningBySellerId.get(String(seller._id)), categoriesById)
    );

    return { sellers: items };
}

export async function updateDiningSeller(sellerId, body = {}) {
    if (!mongoose.Types.ObjectId.isValid(sellerId)) return null;

    const seller = await FoodSeller.findById(sellerId).lean();
    if (!seller) return null;

    let diningDoc = await FoodDiningSeller.findOne({ sellerId });
    if (!diningDoc) {
        diningDoc = new FoodDiningSeller({
            sellerId,
            pureVegSeller: seller.pureVegSeller === true
        });
    }

    const categoryIds = body.categoryIds !== undefined
        ? toObjectIdArray(body.categoryIds)
        : (diningDoc.categoryIds || []);

    const validCategories = categoryIds.length > 0
        ? await FoodDiningCategory.find({ _id: { $in: categoryIds } }).select('_id').lean()
        : [];
    const validCategoryIds = validCategories.map((category) => category._id);

    if (body.categoryIds !== undefined) {
        diningDoc.categoryIds = validCategoryIds;
    }
    if (body.isEnabled !== undefined) {
        diningDoc.isEnabled = body.isEnabled === true;
    }
    if (body.maxGuests !== undefined) {
        diningDoc.maxGuests = Math.max(1, parseInt(body.maxGuests, 10) || 6);
    }
    if (body.pureVegSeller !== undefined) {
        if (typeof body.pureVegSeller === 'boolean') {
            diningDoc.pureVegSeller = body.pureVegSeller;
        } else if (typeof body.pureVegSeller === 'string') {
            const normalized = body.pureVegSeller.trim().toLowerCase();
            if (normalized === 'true' || normalized === '1' || normalized === 'yes') {
                diningDoc.pureVegSeller = true;
            } else if (normalized === 'false' || normalized === '0' || normalized === 'no') {
                diningDoc.pureVegSeller = false;
            }
        }
    }

    if (body.primaryCategoryId !== undefined) {
        diningDoc.primaryCategoryId = mongoose.Types.ObjectId.isValid(body.primaryCategoryId)
            ? new mongoose.Types.ObjectId(body.primaryCategoryId)
            : null;
    }

    const primaryCategoryIsAllowed = diningDoc.primaryCategoryId
        && validCategoryIds.some((categoryId) => String(categoryId) === String(diningDoc.primaryCategoryId));

    if (!primaryCategoryIsAllowed) {
        diningDoc.primaryCategoryId = validCategoryIds[0] || null;
    }
    if (typeof diningDoc.pureVegSeller !== 'boolean') {
        diningDoc.pureVegSeller = seller.pureVegSeller === true;
    }

    await diningDoc.save();
    await syncCategorySellerLinks(seller._id, validCategoryIds);
    await syncSellerDiningSettings(seller._id, diningDoc);

    const categories = await FoodDiningCategory.find({}).select('name slug imageUrl').lean();
    const categoriesById = new Map(categories.map((category) => [String(category._id), category]));

    return mapDiningSeller(seller, diningDoc.toObject(), categoriesById);
}

export async function listDiningCategoriesPublic() {
    const categories = await FoodDiningCategory.find({ isActive: true })
        .sort({ sortOrder: 1, createdAt: -1 })
        .lean();
    return categories.map(mapCategory);
}

export async function listDiningSellersPublic(query = {}) {
    const categoryValue = String(query.category || '').trim();
    const cityValue = String(query.city || '').trim();

    // 1. Build the base filter for FoodSeller
    const sellerFilter = {
        'diningSettings.isEnabled': true,
        status: 'approved'
    };

    // 2. Apply city filter if provided
    if (cityValue) {
        sellerFilter.$or = [
            { city: { $regex: cityValue, $options: 'i' } },
            { 'location.city': { $regex: cityValue, $options: 'i' } }
        ];
    }

    // 3. Apply category filter if provided
    if (categoryValue) {
        const category = await FoodDiningCategory.findOne({
            $or: [
                mongoose.Types.ObjectId.isValid(categoryValue) ? { _id: categoryValue } : null,
                { slug: categoryValue.toLowerCase() }
            ].filter(Boolean)
        }).lean();

        if (!category) {
            return [];
        }
        sellerFilter._id = { $in: category.sellerIds || [] };
    }

    // 4. Fetch sellers
    const sellers = await FoodSeller.find(sellerFilter)
        .select('sellerName sellerNameNormalized ownerName ownerPhone profileImage coverImages menuImages cuisines location area city status rating diningSettings estimatedDeliveryTime estimatedDeliveryTimeMinutes featuredDish featuredPrice offer openingTime closingTime openDays isAcceptingOrders costForTwo pureVegSeller')
        .lean();

    if (sellers.length === 0) {
        return [];
    }

    const sellerIds = sellers.map(r => r._id);

    // 5. Fetch dining metadata from FoodDiningSeller for these sellers
    const diningMetadata = await FoodDiningSeller.find({
        sellerId: { $in: sellerIds }
    })
    .populate('categoryIds', 'name slug imageUrl')
    .lean();

    const metadataMap = new Map();
    diningMetadata.forEach(m => {
        metadataMap.set(String(m.sellerId), m);
    });

    // 6. Map combined results
    return sellers.map((r) => {
        const meta = metadataMap.get(String(r._id));
        return {
            ...r,
            seller: r,
            categories: meta?.categoryIds || [],
            diningSettings: {
                isEnabled: true,
                maxGuests: Math.max(1, Number(meta?.maxGuests || r.diningSettings?.maxGuests) || 6),
                pureVegSeller: r.pureVegSeller === true || meta?.pureVegSeller === true,
                diningType: meta?.categoryIds?.[0]?.slug || r.diningSettings?.diningType || 'family-dining'
            }
        };
    });
}
