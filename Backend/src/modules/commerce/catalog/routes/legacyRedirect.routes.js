import express from 'express';
import { Product } from '../../admin/models/product.model.js';

/**
 * Old thewarehousess.com (WooCommerce) links, kept working after the domain
 * moved to this platform: nginx hands /product/<slug>/ and
 * /product-category/<...>/ here, and each answers with a permanent redirect to
 * the same product or category, so search rankings and shared links carry
 * over. Imported products remember their old slug (legacy.slug).
 */
const router = express.Router();

/** Old category slug -> this platform's category page slug. */
export const LEGACY_CATEGORY_SLUGS = {
    accessories: 'accessories',
    bracelets: 'bracelets',
    'co-ord-set': 'co-ord-sets',
    earrings: 'earrings',
    'kurta-set': 'kurtas',
    neckpiece: 'neckpieces',
    pants: 'pants',
    rings: 'rings',
    'short-kurti': 'kurtas',
    skirts: 'skirts',
    watch: 'watches',
    'western-dresses': 'dresses',
    'western-shirt-for-women': 'tops',
    'western-tops-for-women': 'tops',
};

const permanent = (res, location) => {
    res.set('Cache-Control', 'public, max-age=86400');
    return res.redirect(301, location);
};

/** "black-lace-tie-front-top-for-women" -> "black lace tie front top for women". */
const wordsOf = (slug) => String(slug || '').replace(/-the-warehousess$/, '').replace(/[-_]+/g, ' ').trim();

router.get('/product/:slug', async (req, res, next) => {
    try {
        const slug = String(req.params.slug || '').toLowerCase().slice(0, 200);
        const product = await Product.collection.findOne(
            { 'legacy.slug': slug, approvalStatus: 'approved' },
            { projection: { _id: 1 } },
        );
        if (product) return permanent(res, `/product/${product._id}`);
        const q = wordsOf(slug);
        return permanent(res, q ? `/search?q=${encodeURIComponent(q)}` : '/');
    } catch (err) {
        return next(err);
    }
});

// /product-category/accessories/earrings/ -> the last segment decides.
router.get(/^\/product-category\/(.+?)\/?$/, (req, res) => {
    const last = String(req.params[0] || '').split('/').filter(Boolean).pop()?.toLowerCase() || '';
    const ours = LEGACY_CATEGORY_SLUGS[last];
    return permanent(res, ours ? `/category/${ours}` : '/categories');
});

export default router;
