import mongoose from 'mongoose';
import { OfferBanner, OFFER_BANNER_CHANNELS, OFFER_BANNER_SIZE } from '../models/offerBanner.model.js';
import { Offer } from '../models/offer.model.js';
import { ValidationError } from '../../../../core/auth/errors.js';
import { uploadImageBuffer } from '../../../../services/cloudinary.service.js';

const serialize = (doc) => {
    const b = doc?.toObject ? doc.toObject() : doc;
    return {
        id: String(b._id),
        imageUrl: b.imageUrl,
        title: b.title || '',
        subtitle: b.subtitle || '',
        couponCode: b.couponCode || '',
        ctaLink: b.ctaLink || '',
        channels: Array.isArray(b.channels) ? b.channels : [],
        startDate: b.startDate || null,
        endDate: b.endDate || null,
        sortOrder: Number(b.sortOrder) || 0,
        isActive: b.isActive !== false,
        createdAt: b.createdAt,
        updatedAt: b.updatedAt,
    };
};

const assertId = (id) => {
    if (!id || !mongoose.Types.ObjectId.isValid(String(id))) throw new ValidationError('Invalid banner id');
};

const toBool = (v) => !(v === false || v === 'false' || v === '0' || v === 0);

/** Form fields arrive as strings (multipart): "quick,shop", '["quick"]' or an array. */
const parseChannels = (raw) => {
    let list = raw;
    if (typeof raw === 'string') {
        try {
            list = JSON.parse(raw);
        } catch {
            list = raw.split(',');
        }
    }
    const picked = [...new Set((Array.isArray(list) ? list : [list]).map((c) => String(c || '').trim().toLowerCase()))]
        .filter((c) => OFFER_BANNER_CHANNELS.includes(c));
    if (!picked.length) throw new ValidationError('Pick where the banner shows: Quick, Shop or both');
    return picked;
};

const parseDate = (raw, label) => {
    if (raw === undefined) return undefined;
    if (raw === null || raw === '' || raw === 'null') return null;
    const d = new Date(raw);
    if (Number.isNaN(d.getTime())) throw new ValidationError(`${label} is not a valid date`);
    return d;
};

/** A coupon code must belong to an existing admin or seller offer. */
const parseCouponCode = async (raw) => {
    const code = String(raw || '').trim().toUpperCase();
    if (!code) return '';
    const exists = await Offer.exists({ couponCode: code });
    if (!exists) throw new ValidationError(`No coupon with the code ${code}`);
    return code;
};

const checkDates = (start, end) => {
    if (start && end && end < start) throw new ValidationError('End date is before the start date');
};

/** Admin: every banner; `channel` narrows to the ones shown on that storefront. */
export const listOfferBannersAdmin = async ({ channel } = {}) => {
    const filter = OFFER_BANNER_CHANNELS.includes(channel) ? { channels: channel } : {};
    const docs = await OfferBanner.find(filter).sort({ sortOrder: 1, createdAt: -1 }).lean();
    return { banners: docs.map(serialize), recommendedSize: OFFER_BANNER_SIZE };
};

/** Storefront: live banners for one channel, in display order. */
export const listOfferBannersPublic = async ({ channel } = {}) => {
    const mode = OFFER_BANNER_CHANNELS.includes(channel) ? channel : 'shop';
    const now = new Date();
    const docs = await OfferBanner.find({
        isActive: true,
        channels: mode,
        $and: [
            { $or: [{ startDate: null }, { startDate: { $lte: now } }] },
            { $or: [{ endDate: null }, { endDate: { $gte: now } }] },
        ],
    })
        .sort({ sortOrder: 1, createdAt: -1 })
        .limit(20)
        .lean();
    return { banners: docs.map(serialize) };
};

export const createOfferBanner = async (file, body = {}) => {
    if (!file?.buffer) throw new ValidationError('Banner image is required');
    const channels = parseChannels(body.channels ?? OFFER_BANNER_CHANNELS);
    const startDate = parseDate(body.startDate, 'Start date') ?? null;
    const endDate = parseDate(body.endDate, 'End date') ?? null;
    checkDates(startDate, endDate);
    const couponCode = await parseCouponCode(body.couponCode);

    const imageUrl = await uploadImageBuffer(file.buffer, 'offer-banners');
    if (!imageUrl) throw new ValidationError('Image upload failed');

    const last = await OfferBanner.findOne({}).sort({ sortOrder: -1 }).select('sortOrder').lean();
    const doc = await OfferBanner.create({
        imageUrl,
        title: String(body.title || '').trim(),
        subtitle: String(body.subtitle || '').trim(),
        couponCode,
        ctaLink: String(body.ctaLink || '').trim(),
        channels,
        startDate,
        endDate,
        sortOrder: body.sortOrder !== undefined && body.sortOrder !== '' ? Number(body.sortOrder) || 0 : (Number(last?.sortOrder) || 0) + 1,
        isActive: body.isActive === undefined ? true : toBool(body.isActive),
    });
    return serialize(doc);
};

export const updateOfferBanner = async (id, body = {}, file = null) => {
    assertId(id);
    const doc = await OfferBanner.findById(id);
    if (!doc) throw new ValidationError('Banner not found');

    if (file?.buffer) {
        const imageUrl = await uploadImageBuffer(file.buffer, 'offer-banners');
        if (!imageUrl) throw new ValidationError('Image upload failed');
        doc.imageUrl = imageUrl;
    }
    if (body.title !== undefined) doc.title = String(body.title || '').trim();
    if (body.subtitle !== undefined) doc.subtitle = String(body.subtitle || '').trim();
    if (body.ctaLink !== undefined) doc.ctaLink = String(body.ctaLink || '').trim();
    if (body.couponCode !== undefined) doc.couponCode = await parseCouponCode(body.couponCode);
    if (body.channels !== undefined) doc.channels = parseChannels(body.channels);
    const startDate = parseDate(body.startDate, 'Start date');
    const endDate = parseDate(body.endDate, 'End date');
    if (startDate !== undefined) doc.startDate = startDate;
    if (endDate !== undefined) doc.endDate = endDate;
    checkDates(doc.startDate, doc.endDate);
    if (body.sortOrder !== undefined && body.sortOrder !== '') doc.sortOrder = Number(body.sortOrder) || 0;
    if (body.isActive !== undefined) doc.isActive = toBool(body.isActive);

    await doc.save();
    return serialize(doc);
};

export const deleteOfferBanner = async (id) => {
    assertId(id);
    const doc = await OfferBanner.findByIdAndDelete(id);
    if (!doc) throw new ValidationError('Banner not found');
    return { id: String(id) };
};
