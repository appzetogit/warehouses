import mongoose from 'mongoose';

/**
 * One seller image-studio request: enhance a product photo, or draw it on a
 * mannequin. The images are generated in the background; the seller polls the job.
 */
const aiImageJobSchema = new mongoose.Schema(
    {
        sellerId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
        kind: { type: String, enum: ['enhance', 'mannequin'], required: true },
        style: { type: String, default: '' },
        sourceUrl: { type: String, required: true },
        /** Images asked for (and reserved against the daily cap). */
        count: { type: Number, required: true, min: 1, max: 4 },
        status: { type: String, enum: ['running', 'done', 'failed'], default: 'running', index: true },
        results: [{ url: String, path: String, _id: false }],
        /** Shown to the seller when nothing could be made. */
        error: { type: String, default: '' },
        /** Why, for the admin: 'billing' | 'quota' | 'safety' | 'error'. */
        errorCode: { type: String, default: '' },
        model: { type: String, default: '' },
        promptTokens: { type: Number, default: 0 },
        outputTokens: { type: Number, default: 0 },
        finishedAt: { type: Date, default: null },
        /** Jobs are only polled for a few minutes; the images themselves are kept. */
        expiresAt: { type: Date, default: () => new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) },
    },
    { collection: 'ai_image_jobs', timestamps: true }
);
aiImageJobSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const AiImageJob = mongoose.models.AiImageJob || mongoose.model('AiImageJob', aiImageJobSchema);
