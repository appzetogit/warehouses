import { sendResponse } from '../../../../utils/response.js';
import * as svc from '../services/offerBanner.service.js';

// ── Admin ──
export async function listOfferBannersAdminController(req, res, next) {
    try {
        return sendResponse(res, 200, 'Offer banners fetched', await svc.listOfferBannersAdmin({ channel: req.query?.channel }));
    } catch (e) { next(e); }
}

export async function createOfferBannerController(req, res, next) {
    try {
        const banner = await svc.createOfferBanner(req.file, req.body || {});
        return sendResponse(res, 201, 'Offer banner created', { banner });
    } catch (e) { next(e); }
}

export async function updateOfferBannerController(req, res, next) {
    try {
        const banner = await svc.updateOfferBanner(req.params.id, req.body || {}, req.file);
        return sendResponse(res, 200, 'Offer banner updated', { banner });
    } catch (e) { next(e); }
}

export async function deleteOfferBannerController(req, res, next) {
    try {
        return sendResponse(res, 200, 'Offer banner deleted', await svc.deleteOfferBanner(req.params.id));
    } catch (e) { next(e); }
}

// ── Storefront ──
export async function listOfferBannersPublicController(req, res, next) {
    try {
        return sendResponse(res, 200, 'Offer banners fetched', await svc.listOfferBannersPublic({ channel: req.query?.mode }));
    } catch (e) { next(e); }
}
