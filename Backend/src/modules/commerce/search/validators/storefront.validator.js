import { ValidationError } from '../../../../core/auth/errors.js';

/**
 * The customer site has two storefronts: the e-commerce shop (courier-shipped,
 * fulfilmentMode "standard") and the quick store (rider, "quick"). Catalogue
 * reads take an optional `fulfilmentMode` so each storefront only lists what it
 * can actually deliver.
 */
export const FULFILMENT_MODES = ['quick', 'standard'];

/** `undefined`/'' -> null (no filter); 'quick' | 'standard'; anything else is a 400. */
export function parseFulfilmentMode(value) {
    if (value === undefined || value === null || value === '') return null;
    const mode = String(value).trim().toLowerCase();
    if (!FULFILMENT_MODES.includes(mode)) {
        throw new ValidationError(`fulfilmentMode must be one of: ${FULFILMENT_MODES.join(', ')}`);
    }
    return mode;
}

/**
 * Product filter for a storefront.
 *
 * quick: the product can go by quick delivery (product-level `quickEligible`
 *   not false), or at least one variant explicitly opts in.
 * standard: every approved product can be shipped by courier; there is no
 *   "not shippable" flag on products, so this adds no restriction.
 */
export function fulfilmentModeProductFilter(mode) {
    if (mode === 'quick') {
        return {
            $or: [
                { quickEligible: { $ne: false } },
                { variants: { $elemMatch: { quickEligible: true } } },
            ],
        };
    }
    return null;
}
