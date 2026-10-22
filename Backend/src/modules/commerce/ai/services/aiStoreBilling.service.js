import mongoose from 'mongoose';
import { AiUsageCharge, AiUsageCounter } from '../models/aiUsageCharge.model.js';
import { getAiSettings } from './aiSettings.service.js';
import { normalizePlanName } from '../../seller/services/subscriptionPlan.service.js';
import { ValidationError, NotFoundError } from '../../../../core/auth/errors.js';
import { logger } from '../../../../utils/logger.js';

/**
 * Per-store AI access and the usage ledger behind AI image billing.
 *
 * A store's images come out of its plan's monthly allowance first
 * (includedImages<Plan>, 0 by default), then cost extraImagePrice each. The
 * charged amount for a month goes on that month's subscription invoice
 * (subscriptionBilling.service attachAiUsageToInvoice).
 */

const IST_OFFSET_MS = 330 * 60 * 1000;
const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const toOid = (id) => (mongoose.Types.ObjectId.isValid(String(id)) ? new mongoose.Types.ObjectId(String(id)) : null);

let ledgerIndexes = null;
/** Builds the ledger's unique indexes once (the counters rely on them). */
const ledgerReady = () => {
    ledgerIndexes ||= Promise.all([AiUsageCounter.init(), AiUsageCharge.init()]).catch((err) => {
        ledgerIndexes = null;
        throw err;
    });
    return ledgerIndexes;
};

/** 'YYYY-MM' of `now` in India time. */
export const aiBillingMonth = (now = new Date()) => new Date(now.getTime() + IST_OFFSET_MS).toISOString().slice(0, 7);

export const STORE_IMAGES_OFF_MESSAGE = "AI images aren't enabled for your store. Ask the admin to turn them on.";
export const STORE_CHAT_OFF_MESSAGE = "AI Help isn't enabled for your store yet. Ask the admin to turn it on. You can still raise a ticket from Help > Support.";

const PLAN_ALLOWANCE_FIELD = {
    starter: 'includedImagesStarter',
    growth: 'includedImagesGrowth',
    premium: 'includedImagesPremium',
};

/** The store's plan key; no plan (or an unknown one) reads as starter. */
export const planOf = (seller) => normalizePlanName(seller?.subscriptionPlan);

export const includedImagesFor = (settings, plan) => Math.max(0, Math.floor(Number(settings?.[PLAN_ALLOWANCE_FIELD[plan] || 'includedImagesStarter']) || 0));

export const extraImagePriceOf = (settings) => Math.max(0, Number(settings?.extraImagePrice ?? 5) || 0);

/** The store's own cap, else the platform's. 0 = no cap. */
export const monthlyCapFor = (settings, access) => {
    const own = access?.monthlyImageCap;
    if (own !== null && own !== undefined && own !== '' && Number.isFinite(Number(own))) return Math.max(0, Math.floor(Number(own)));
    return Math.max(0, Math.floor(Number(settings?.storeMonthlyImageCap) || 0));
};

export const publicAccess = (access = {}) => ({
    imagesEnabled: access?.imagesEnabled === true,
    chatEnabled: access?.chatEnabled === true,
    monthlyImageCap: access?.monthlyImageCap ?? null,
    updatedAt: access?.updatedAt || null,
    updatedBy: access?.updatedBy || null,
});

async function loadSeller(sellerId, select = 'aiAccess subscriptionPlan sellerName') {
    const oid = toOid(sellerId);
    if (!oid) return null;
    const { Seller } = await import('../../seller/models/seller.model.js');
    return Seller.findById(oid).select(select).lean();
}

/** The store's AI switches and plan, or null when there is no such store. */
export async function getStoreAiAccess(sellerId) {
    const seller = await loadSeller(sellerId);
    if (!seller) return null;
    return { ...publicAccess(seller.aiAccess), plan: planOf(seller) };
}

/** Usage counters for one store and month. */
export async function getStoreMonthUsage(sellerId, billingMonth) {
    const oid = toOid(sellerId);
    if (!oid) return { images: 0, included: 0, chargedImages: 0, chargedExtra: 0, chargedAmount: 0, pendingAmount: 0 };
    const [counter, sums] = await Promise.all([
        AiUsageCounter.findOne({ sellerId: oid, billingMonth }).lean(),
        AiUsageCharge.aggregate([
            { $match: { sellerId: oid, billingMonth, status: { $in: ['reserved', 'charged'] } } },
            { $group: { _id: '$status', images: { $sum: '$images' }, extra: { $sum: '$extraImages' }, amount: { $sum: '$amount' } } },
        ]),
    ]);
    const by = Object.fromEntries(sums.map((r) => [r._id, r]));
    return {
        images: Math.max(0, counter?.images || 0),
        included: Math.max(0, counter?.included || 0),
        chargedImages: by.charged?.images || 0,
        chargedExtra: by.charged?.extra || 0,
        chargedAmount: round2(by.charged?.amount || 0),
        pendingAmount: round2(by.reserved?.amount || 0),
    };
}

/** What the seller's AI usage card and the image studio show for this month. */
export async function getStoreAiSummary(sellerId, { settings = null, now = new Date() } = {}) {
    const s = settings || await getAiSettings();
    const seller = await loadSeller(sellerId);
    const access = publicAccess(seller?.aiAccess);
    const plan = planOf(seller);
    const billingMonth = aiBillingMonth(now);
    const usage = await getStoreMonthUsage(sellerId, billingMonth);
    const included = includedImagesFor(s, plan);
    const cap = monthlyCapFor(s, access);
    return {
        billingMonth,
        access,
        plan,
        includedThisMonth: included,
        usedThisMonth: usage.images,
        includedUsed: Math.min(usage.included, included),
        remainingIncluded: Math.max(included - usage.included, 0),
        extraImagesThisMonth: usage.chargedExtra,
        extraCostThisMonth: usage.chargedAmount,
        pendingCost: usage.pendingAmount,
        extraImagePrice: extraImagePriceOf(s),
        monthlyCap: cap || null,
        remainingThisMonth: cap ? Math.max(cap - usage.images, 0) : null,
    };
}

/**
 * Takes `count` images for one job off the store's month in atomic steps: first
 * the monthly cap (fails when it would be passed), then as many included images
 * as are left. Creates the 'reserved' charge. Throws ValidationError for the seller.
 */
export async function reserveStoreImages({ sellerId, jobId, kind = '', count, settings, seller = null, now = new Date() }) {
    const sellerOid = toOid(sellerId);
    const s = settings || await getAiSettings();
    const store = seller || await loadSeller(sellerOid);
    if (!store) throw new NotFoundError('Store not found');
    const access = publicAccess(store.aiAccess);
    if (!access.imagesEnabled) throw new ValidationError(STORE_IMAGES_OFF_MESSAGE);

    const billingMonth = aiBillingMonth(now);
    const plan = planOf(store);
    const cap = monthlyCapFor(s, access);
    const allowance = includedImagesFor(s, plan);
    const unitPrice = extraImagePriceOf(s);

    const capMessage = async () => {
        const used = (await AiUsageCounter.findOne({ sellerId: sellerOid, billingMonth }).select('images').lean())?.images || 0;
        const left = Math.max(cap - used, 0);
        return left
            ? `Only ${left} AI image${left === 1 ? '' : 's'} left for your store this month, and this needs ${count}.`
            : `Your store has used all ${cap} AI images for this month. It resets on the 1st.`;
    };
    if (cap && count > cap) throw new ValidationError(await capMessage());

    // The unique (sellerId, billingMonth) index must exist before the first row,
    // or two first jobs at once could each create one.
    await ledgerReady();
    const key = { sellerId: sellerOid, billingMonth };
    try {
        await AiUsageCounter.updateOne(key, { $setOnInsert: { images: 0, included: 0 } }, { upsert: true });
    } catch (err) {
        if (err?.code !== 11000) throw err; // created by a concurrent job: fine
    }
    const res = await AiUsageCounter.updateOne(cap ? { ...key, images: { $lte: cap - count } } : key, { $inc: { images: count } });
    if (!res.modifiedCount) throw new ValidationError(await capMessage());

    let included = 0;
    for (let k = Math.min(count, allowance); k > 0; k -= 1) {
        const res = await AiUsageCounter.updateOne({ ...key, included: { $lte: allowance - k } }, { $inc: { included: k } });
        if (res.modifiedCount) {
            included = k;
            break;
        }
    }
    const extra = count - included;
    try {
        return await AiUsageCharge.create({
            sellerId: sellerOid,
            jobId,
            kind,
            images: count,
            includedImages: included,
            extraImages: extra,
            unitPrice,
            amount: round2(extra * unitPrice),
            billingMonth,
            plan,
            status: 'reserved',
        });
    } catch (err) {
        await AiUsageCounter.updateOne(key, { $inc: { images: -count, included: -included } });
        throw err;
    }
}

/**
 * Settles a job's charge for the images actually produced: 'charged' when any
 * were made (included ones first, so a short result drops extras first), else
 * 'released'. Gives the unmade images back to the month. A no-op once settled.
 */
export async function settleStoreImages(jobId, produced) {
    const charge = await AiUsageCharge.findOne({ jobId, status: 'reserved' }).lean();
    if (!charge) return null;
    const made = Math.max(0, Math.min(Number(produced) || 0, charge.images));
    const included = Math.min(made, charge.includedImages);
    const extra = made - included;
    const update = made > 0
        ? { status: 'charged', images: made, includedImages: included, extraImages: extra, amount: round2(extra * charge.unitPrice), settledAt: new Date() }
        : { status: 'released', images: 0, includedImages: 0, extraImages: 0, amount: 0, settledAt: new Date() };
    const settled = await AiUsageCharge.findOneAndUpdate({ _id: charge._id, status: 'reserved' }, { $set: update }, { new: true }).lean();
    if (!settled) return null;
    const giveBack = charge.images - made;
    const giveBackIncluded = charge.includedImages - included;
    if (giveBack || giveBackIncluded) {
        await AiUsageCounter.updateOne(
            { sellerId: charge.sellerId, billingMonth: charge.billingMonth },
            { $inc: { images: -giveBack, included: -giveBackIncluded } }
        );
    }
    // A job that finishes after its month was invoiced still lands on that invoice.
    if (settled.status === 'charged' && settled.amount > 0) {
        try {
            const { attachAiUsageForSellerMonth } = await import('../../seller/services/subscriptionBilling.service.js');
            await attachAiUsageForSellerMonth(settled.sellerId, settled.billingMonth);
        } catch (err) {
            logger.warn(`AI charge ${settled._id} not attached to its invoice yet: ${err.message}`);
        }
    }
    return settled;
}

export const releaseStoreImages = (jobId) => settleStoreImages(jobId, 0);

// ---------- Admin ----------

export async function getStoreAiAccessAdmin(sellerId, { now = new Date() } = {}) {
    const seller = await loadSeller(sellerId);
    if (!seller) throw new NotFoundError('Store not found');
    const summary = await getStoreAiSummary(sellerId, { now });
    return { sellerId: String(seller._id), sellerName: seller.sellerName || '', aiAccess: summary.access, usage: summary };
}

export async function updateStoreAiAccessAdmin(sellerId, body = {}, adminId = null) {
    const oid = toOid(sellerId);
    if (!oid) throw new ValidationError('Invalid store id');
    const $set = {};
    for (const field of ['imagesEnabled', 'chatEnabled']) {
        if (body[field] === undefined) continue;
        if (typeof body[field] !== 'boolean') throw new ValidationError(`${field} must be true or false`);
        $set[`aiAccess.${field}`] = body[field];
    }
    if (body.monthlyImageCap !== undefined) {
        const v = body.monthlyImageCap;
        if (v === null || v === '') $set['aiAccess.monthlyImageCap'] = null;
        else {
            const n = Number(v);
            if (!Number.isInteger(n) || n < 0 || n > 100000) throw new ValidationError('monthlyImageCap must be a whole number from 0 to 100000, or empty to use the platform cap');
            $set['aiAccess.monthlyImageCap'] = n;
        }
    }
    if (!Object.keys($set).length) throw new ValidationError('Nothing to change: send imagesEnabled, chatEnabled or monthlyImageCap');
    $set['aiAccess.updatedAt'] = new Date();
    $set['aiAccess.updatedBy'] = toOid(adminId);
    const { Seller } = await import('../../seller/models/seller.model.js');
    const res = await Seller.updateOne({ _id: oid }, { $set }, { runValidators: true });
    if (!res.matchedCount) throw new NotFoundError('Store not found');
    return getStoreAiAccessAdmin(oid);
}

/** Per-store AI image usage for one IST month (default: this month). */
export async function listStoreAiUsageAdmin(query = {}) {
    const billingMonth = /^\d{4}-\d{2}$/.test(String(query.month || '')) ? String(query.month) : aiBillingMonth();
    const rows = await AiUsageCharge.aggregate([
        { $match: { billingMonth, status: { $in: ['reserved', 'charged'] } } },
        {
            $group: {
                _id: '$sellerId',
                jobs: { $sum: 1 },
                images: { $sum: { $cond: [{ $eq: ['$status', 'charged'] }, '$images', 0] } },
                includedImages: { $sum: { $cond: [{ $eq: ['$status', 'charged'] }, '$includedImages', 0] } },
                extraImages: { $sum: { $cond: [{ $eq: ['$status', 'charged'] }, '$extraImages', 0] } },
                amount: { $sum: { $cond: [{ $eq: ['$status', 'charged'] }, '$amount', 0] } },
                pendingImages: { $sum: { $cond: [{ $eq: ['$status', 'reserved'] }, '$images', 0] } },
                billedAmount: { $sum: { $cond: [{ $and: [{ $eq: ['$status', 'charged'] }, { $ne: ['$invoiceId', null] }] }, '$amount', 0] } },
            },
        },
        { $sort: { amount: -1, images: -1 } },
    ]);
    const { Seller } = await import('../../seller/models/seller.model.js');
    const sellers = await Seller.find({ _id: { $in: rows.map((r) => r._id) } }).select('sellerName ownerName ownerPhone subscriptionPlan aiAccess').lean();
    const byId = new Map(sellers.map((x) => [String(x._id), x]));
    const stores = rows.map((r) => {
        const x = byId.get(String(r._id)) || {};
        return {
            sellerId: String(r._id),
            sellerName: x.sellerName || '',
            ownerName: x.ownerName || '',
            ownerPhone: x.ownerPhone || '',
            plan: planOf(x),
            imagesEnabled: x.aiAccess?.imagesEnabled === true,
            jobs: r.jobs,
            images: r.images,
            includedImages: r.includedImages,
            extraImages: r.extraImages,
            amount: round2(r.amount),
            billedAmount: round2(r.billedAmount),
            pendingImages: r.pendingImages,
        };
    });
    const totals = stores.reduce((a, r) => ({
        images: a.images + r.images,
        extraImages: a.extraImages + r.extraImages,
        amount: round2(a.amount + r.amount),
    }), { images: 0, extraImages: 0, amount: 0 });
    return { month: billingMonth, stores, totals };
}

export async function exportStoreAiUsageAdmin(query = {}) {
    const { month, stores } = await listStoreAiUsageAdmin(query);
    const esc = (v) => {
        const str = String(v ?? '');
        return /^[=+\-@]/.test(str) ? `'${str}` : (/[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str);
    };
    const header = ['Month', 'Store', 'Owner', 'Phone', 'Plan', 'Jobs', 'Images', 'Included', 'Extra', 'Amount (INR)', 'Billed (INR)', 'Pending images'];
    const lines = stores.map((r) => [month, r.sellerName, r.ownerName, r.ownerPhone, r.plan, r.jobs, r.images, r.includedImages, r.extraImages, r.amount, r.billedAmount, r.pendingImages]);
    return [header, ...lines].map((row) => row.map(esc).join(',')).join('\n');
}
