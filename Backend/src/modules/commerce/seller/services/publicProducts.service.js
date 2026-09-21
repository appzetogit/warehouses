import mongoose from 'mongoose';
import { Product } from '../../admin/models/product.model.js';
import { Seller } from '../models/seller.model.js';
import { getProductDisplayOtherPrice, getProductDisplayPrice, serializeProductVariants } from '../../admin/services/productVariant.service.js';
import { restoreExpiredProductAvailability } from './productAvailability.service.js';

const escapeRegex = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const buildCategoryKeywords = (categorySlug) => {
    const raw = String(categorySlug || '').trim().toLowerCase();
    if (!raw || raw === 'all') return [];

    const normalized = raw.replace(/&/g, ' and ').replace(/-/g, ' ').trim();
    const words = normalized.split(/\s+/).filter(Boolean);
    return [...new Set([raw, normalized, ...words])];
};

export async function listPublicProducts(query = {}) {
    const limit = Math.min(Math.max(parseInt(query.limit, 10) || 500, 1), 1000);
    const zoneIdRaw = String(query.zoneId || '').trim();
    const categorySlug = String(query.categorySlug || query.category || '').trim().toLowerCase();

    const sellerFilter = { status: 'approved' };
    if (zoneIdRaw && mongoose.Types.ObjectId.isValid(zoneIdRaw)) {
        sellerFilter.zoneId = new mongoose.Types.ObjectId(zoneIdRaw);
    }

    const sellers = await Seller.find(sellerFilter)
        .select('_id sellerName slug zoneId profileImage rating totalRatings ratingCount estimatedDeliveryTime estimatedDeliveryTimeMinutes location coverImages menuImages isActive isAcceptingOrders outletTimings openDays deliveryTimings openingTime closingTime')
        .lean();

    if (!sellers.length) {
        return { products: [], total: 0 };
    }

    const sellerMap = new Map(
        sellers.map((seller) => [String(seller._id), seller])
    );
    const sellerIds = sellers.map((seller) => seller._id);

    await restoreExpiredProductAvailability({ sellerId: { $in: sellerIds } });

    const productFilter = {
        sellerId: { $in: sellerIds },
        approvalStatus: 'approved',
        isAvailable: { $ne: false }
    };

    const keywords = buildCategoryKeywords(categorySlug);
    if (keywords.length > 0) {
        productFilter.$or = keywords.flatMap((keyword) => {
            const rx = escapeRegex(keyword);
            return [
                { name: { $regex: rx, $options: 'i' } },
                { categoryName: { $regex: rx, $options: 'i' } }
            ];
        });
    }

    const list = await Product.find(productFilter)
        .sort({ createdAt: -1 })
        .limit(limit)
        .lean();

    const products = list
        .map((product) => {
        const seller = sellerMap.get(String(product.sellerId));
        const price = getProductDisplayPrice(product);
        return {
            id: product._id,
            _id: product._id,
            sellerId: product.sellerId,
            sellerName: seller?.sellerName || 'Unknown Seller',
            categoryId: product.categoryId || null,
            categoryName: product.categoryName || '',
            category: product.categoryName || '',
            name: product.name,
            description: product.description || '',
            price,
            otherPrice: getProductDisplayOtherPrice(product),
            // Both keys, exactly as the seller-menu payload sends them.
            //
            // These were missing entirely, so a dish with sizes arrived here
            // looking like a plain one. The app added it to the cart with no
            // variant and had nothing to render a size picker from, while
            // checkout — which reads the dish from the database — correctly
            // refused with "please select a size". The customer was left with an
            // error and no control that could clear it.
            variants: serializeProductVariants(product.variants, { productStockQty: product.stockQty ?? null }),
            variations: serializeProductVariants(product.variants, { productStockQty: product.stockQty ?? null }),
            image: product.image || '',
            // Falls back to the single image so a dish saved before galleries
            // existed still returns a one-entry list — the app can then always
            // read `images` without special-casing the old shape.
            images: Array.isArray(product.images) && product.images.length
                ? product.images
                : (product.image ? [product.image] : []),
            foodType: product.foodType || null,
            quickEligible: product.quickEligible !== false,
            tags: Array.isArray(product.tags) ? product.tags : [],
            isAvailable: product.isAvailable !== false,
            preparationTime: product.preparationTime || '',
            approvalStatus: product.approvalStatus || 'approved'
        };
    })
        .filter((product) => product.isAvailable !== false)
        .slice(0, limit);

    return { products, total: products.length };
}

/**
 * One product for its own page: every field a shopper needs, all variants
 * (inactive and sold-out ones marked, so the picker can grey them out), the
 * attribute order from its category, and the store selling it.
 *
 * Only approved products of approved stores; anything else is "not found",
 * so a pending or rejected product never leaks through a guessed id.
 */
export async function getPublicProduct(productId) {
    if (!productId || !mongoose.Types.ObjectId.isValid(String(productId))) return null;
    const product = await Product.findOne({ _id: productId, approvalStatus: 'approved' }).lean();
    if (!product) return null;
    const seller = await Seller.findOne({ _id: product.sellerId, status: 'approved' })
        .select('_id sellerName profileImage rating totalRatings estimatedDeliveryTime estimatedDeliveryTimeMinutes isAcceptingOrders zoneId location.area location.city')
        .lean();
    if (!seller) return null;

    const { getCategoryAttributes } = await import('../../admin/services/attribute.service.js');
    const { attributes } = await getCategoryAttributes(product.categoryId);
    const variants = serializeProductVariants(product.variants, { productStockQty: product.stockQty ?? null });

    // The attributes this product actually uses, in the category's order, with
    // the category's swatches; attributes outside any set come after.
    const used = new Map();
    for (const variant of variants) {
        for (const { name, value } of variant.attributes) {
            if (!used.has(name)) used.set(name, new Set());
            used.get(name).add(value);
        }
    }
    const known = new Map(attributes.map((a) => [a.name, a]));
    const options = [...used].map(([name, values]) => {
        const attribute = known.get(name);
        const ordered = attribute
            ? attribute.values.filter((v) => values.has(v.value)).map((v) => ({ value: v.value, hex: v.hex || '' }))
            : [...values].map((value) => ({ value, hex: '' }));
        return { name, type: attribute?.type || 'select', values: ordered };
    }).sort((a, b) => {
        const ia = attributes.findIndex((x) => x.name === a.name);
        const ib = attributes.findIndex((x) => x.name === b.name);
        return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
    });

    return {
        product: {
            _id: product._id,
            name: product.name,
            description: product.description || '',
            brand: product.brand || '',
            packSize: product.packSize || '',
            categoryId: product.categoryId || null,
            categoryName: product.categoryName || '',
            price: product.price,
            displayPrice: getProductDisplayPrice({ variants }) || product.price,
            otherPrice: getProductDisplayOtherPrice(product),
            mrp: product.mrp ?? null,
            image: product.image || '',
            images: product.images?.length ? product.images : (product.image ? [product.image] : []),
            foodType: product.foodType || null,
            isAvailable: product.isAvailable !== false,
            stockQty: product.stockQty ?? null,
            maxQtyPerOrder: product.maxQtyPerOrder ?? null,
            quickEligible: product.quickEligible !== false,
            rating: product.rating || 0,
            totalRatings: product.totalRatings || 0,
            tags: product.tags || [],
            variants,
            options,
        },
        seller: { ...seller, isAcceptingOrders: seller.isAcceptingOrders !== false },
    };
}
