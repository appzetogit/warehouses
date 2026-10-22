import mongoose from 'mongoose';

export const AI_USAGE_CHARGE_STATUSES = ['reserved', 'charged', 'released'];

/**
 * One store AI image job's charge. Reserved when the job starts, then either
 * 'charged' (for the images actually produced) or 'released' (nothing made).
 * Charged rows are added to the store's monthly subscription invoice and linked
 * to it by invoiceId, so each is billed once.
 */
const aiUsageChargeSchema = new mongoose.Schema(
    {
        sellerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Seller', required: true, index: true },
        jobId: { type: mongoose.Schema.Types.ObjectId, required: true, unique: true },
        kind: { type: String, default: '' },
        /** Images reserved, then (once settled) images produced. */
        images: { type: Number, required: true, min: 0 },
        /** Of those, the ones covered by the plan's monthly allowance. */
        includedImages: { type: Number, default: 0, min: 0 },
        extraImages: { type: Number, default: 0, min: 0 },
        /** Rupees per extra image, frozen at reservation. */
        unitPrice: { type: Number, default: 0, min: 0 },
        amount: { type: Number, default: 0, min: 0 },
        /** 'YYYY-MM' in IST. */
        billingMonth: { type: String, required: true },
        plan: { type: String, default: '' },
        status: { type: String, enum: AI_USAGE_CHARGE_STATUSES, default: 'reserved' },
        invoiceId: { type: mongoose.Schema.Types.ObjectId, default: null },
        settledAt: { type: Date, default: null },
    },
    { collection: 'ai_usage_charges', timestamps: true }
);
aiUsageChargeSchema.index({ billingMonth: 1, sellerId: 1, status: 1 });
aiUsageChargeSchema.index({ invoiceId: 1 });

export const AiUsageCharge = mongoose.models.AiUsageCharge || mongoose.model('AiUsageCharge', aiUsageChargeSchema);

/**
 * Per store per month running totals, moved with conditional $inc so two jobs
 * at once can neither pass the monthly cap nor both use the last included images.
 * images = reserved + charged; included = the part of that on the allowance.
 */
const aiUsageCounterSchema = new mongoose.Schema(
    {
        sellerId: { type: mongoose.Schema.Types.ObjectId, required: true },
        billingMonth: { type: String, required: true },
        images: { type: Number, default: 0 },
        included: { type: Number, default: 0 },
    },
    { collection: 'ai_usage_counters', timestamps: true }
);
aiUsageCounterSchema.index({ sellerId: 1, billingMonth: 1 }, { unique: true });

export const AiUsageCounter = mongoose.models.AiUsageCounter || mongoose.model('AiUsageCounter', aiUsageCounterSchema);
