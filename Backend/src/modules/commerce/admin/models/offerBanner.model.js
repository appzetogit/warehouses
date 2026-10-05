import mongoose from 'mongoose';

/**
 * Offer banners on the customer storefront (admin -> Promotions). Each one
 * shows on Quick, Shop or both, and can carry a coupon code: tapping the
 * banner copies the code. Without a code, ctaLink is opened instead.
 */
export const OFFER_BANNER_CHANNELS = ['quick', 'shop'];

const offerBannerSchema = new mongoose.Schema(
    {
        imageUrl: { type: String, required: true },
        title: { type: String, default: '', trim: true },
        subtitle: { type: String, default: '', trim: true },
        /** Optional coupon this banner promotes (an existing Offer's couponCode). */
        couponCode: { type: String, default: '', trim: true, uppercase: true },
        /** Optional in-app path or URL opened on tap when there is no coupon. */
        ctaLink: { type: String, default: '', trim: true },
        /** Storefronts that show it: 'quick', 'shop' or both. */
        channels: {
            type: [{ type: String, enum: OFFER_BANNER_CHANNELS }],
            default: OFFER_BANNER_CHANNELS,
        },
        startDate: { type: Date, default: null },
        endDate: { type: Date, default: null },
        sortOrder: { type: Number, default: 0 },
        isActive: { type: Boolean, default: true },
    },
    { collection: 'offer_banners', timestamps: true }
);

offerBannerSchema.index({ isActive: 1, channels: 1, sortOrder: 1 });

export const OfferBanner = mongoose.model('OfferBanner', offerBannerSchema);

/** Design size: a wide card, 3:1. */
export const OFFER_BANNER_SIZE = { width: 1200, height: 400 };
