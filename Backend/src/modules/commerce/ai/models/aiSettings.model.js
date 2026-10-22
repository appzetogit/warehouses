import mongoose from 'mongoose';

/**
 * The assistant's admin-editable settings. One document (key "default").
 * The Gemini API key is NOT here: it stays in GEMINI_API_KEY.
 */
const aiSettingsSchema = new mongoose.Schema(
    {
        key: { type: String, default: 'default', unique: true },
        enabled: { type: Boolean, default: true },
        model: { type: String, trim: true, default: '' },
        systemPromptAddendum: { type: String, trim: true, default: '', maxlength: 2000 },
        /** Messages one user (or anonymous IP) may send per UTC day. 0 = unlimited. */
        dailyUserMessageCap: { type: Number, min: 0, default: 50 },
        /** Tokens the whole platform may spend per UTC month. 0 = unlimited. */
        monthlyTokenBudget: { type: Number, min: 0, default: 2_000_000 },
        retentionDays: { type: Number, min: 1, max: 3650, default: 90 },
        /** Used only for the usage page's cost estimate (USD per 1M tokens). */
        inputCostPer1M: { type: Number, min: 0, default: 0.3 },
        outputCostPer1M: { type: Number, min: 0, default: 2.5 },
        /** Let smart search ask the model when the rule parser finds nothing. */
        searchLlmFallback: { type: Boolean, default: false },
        /** Seller image studio: enhance a product photo, or put it on a mannequin. */
        imageStudioEnabled: { type: Boolean, default: true },
        imageModel: { type: String, trim: true, default: '' },
        /** Images one seller may generate per UTC day. 0 = unlimited. */
        sellerDailyImageCap: { type: Number, min: 0, default: 20 },
        /** Used only for the usage page's cost estimate (USD per generated image). */
        imageCostUsd: { type: Number, min: 0, default: 0.04 },
        /**
         * Store AI image billing. Images a store gets free each month by its
         * subscription plan (0 = none: every image is charged), the price of each
         * image beyond that (rupees, added to the monthly subscription invoice),
         * and the most images one store may make in a month (0 = no cap; a store's
         * own aiAccess.monthlyImageCap overrides it).
         */
        includedImagesStarter: { type: Number, min: 0, default: 0 },
        includedImagesGrowth: { type: Number, min: 0, default: 0 },
        includedImagesPremium: { type: Number, min: 0, default: 0 },
        extraImagePrice: { type: Number, min: 0, default: 5 },
        storeMonthlyImageCap: { type: Number, min: 0, default: 300 },
    },
    { collection: 'ai_settings', timestamps: true }
);

export const AiSettings = mongoose.models.AiSettings || mongoose.model('AiSettings', aiSettingsSchema);
