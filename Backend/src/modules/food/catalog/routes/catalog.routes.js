import express from 'express';
import { optionalAuth } from '../../../../core/auth/auth.middleware.js';
import { cacheResponse } from '../../../../middleware/cache.js';
import {
    listApprovedSellersController,
    getApprovedSellerController,
    listPublicOffersController
} from '../../seller/controllers/seller.controller.js';
import { listCategoriesController } from '../../seller/controllers/sellerCategory.controller.js';
import { getPublicSellerMenuController } from '../../seller/controllers/sellerMenu.controller.js';
import { listPublicFoodsController } from '../../seller/controllers/publicFoods.controller.js';
import { getOutletTimingsBySellerIdController } from '../../seller/controllers/outletTimings.controller.js';
import searchRoutes from '../../search/routes/search.routes.js';

/**
 * What a shopper browses, signed in or not: stores, their products, categories,
 * offers and search. Every read here is public and cached.
 *
 * The cache names are the ones the seller and admin write paths invalidate
 * (sellers:*, seller_menu:*, ...), so they must not change without them.
 */
const router = express.Router();

router.get('/stores', cacheResponse(300, 'sellers'), listApprovedSellersController);
router.get('/stores/:id', cacheResponse(600, 'seller_detail'), getApprovedSellerController);
router.get('/stores/:id/products', cacheResponse(600, 'seller_menu'), getPublicSellerMenuController);
router.get('/stores/:id/timings', cacheResponse(600, 'seller_timings'), getOutletTimingsBySellerIdController);
router.get('/products', cacheResponse(300, 'public_foods'), listPublicFoodsController);
router.get('/categories', cacheResponse(600, 'categories'), listCategoriesController);
router.get('/offers', optionalAuth, listPublicOffersController);
router.use('/search', searchRoutes);

export default router;
