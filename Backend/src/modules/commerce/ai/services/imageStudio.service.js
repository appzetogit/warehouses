import mongoose from 'mongoose';
import sharp from 'sharp';
import { AiImageJob } from '../models/aiImageJob.model.js';
import { AiUsageDaily } from '../models/aiConversation.model.js';
import { getAiSettings, effectiveImageModel } from './aiSettings.service.js';
import { dayKey } from './aiUsage.service.js';
import { callGeminiImage, hasGeminiKey } from './geminiClient.js';
import { readHostedImage, saveImageBuffer } from '../../../../services/storage.service.js';
import { ValidationError } from '../../../../core/auth/errors.js';
import { logger } from '../../../../utils/logger.js';

/**
 * Seller image studio. A seller picks one of their product photos and either
 * enhances it (one cleaned-up studio shot) or has it drawn on a mannequin
 * (three shots from different angles). Prompts are fixed here; sellers choose
 * a style, never free text.
 */

export const MANNEQUIN_COUNT = 3;
/** A job still "running" after this long died with its process. */
const STALE_MS = 5 * 60 * 1000;
/** Longest side sent to the model. Plenty for a product shot, and keeps requests small. */
const SOURCE_MAX_PX = 1536;

const KEEP_PRODUCT = 'Keep the product itself exactly as it is in the photo: the same shape, cut, colours, pattern, print, fabric texture, buttons, logos and any text. Do not add, remove or redesign anything on the product. No watermark, no text, no props that hide the product.';

const ENHANCE_PROMPT = `Turn this product photo into a clean e-commerce studio photo. Put the product on a pure white background with soft, even studio lighting and a subtle natural shadow. Correct the white balance and exposure, sharpen it, remove dust, creases and clutter around it, and centre it with some margin. ${KEEP_PRODUCT}`;

export const MANNEQUIN_STYLES = {
    mannequin: {
        label: 'Mannequin',
        scene: 'worn by a plain white retail display mannequin with no face, standing in a bright studio with a light grey background',
    },
    invisible: {
        label: 'Invisible mannequin',
        scene: 'shown in the "ghost mannequin" style: worn by an invisible mannequin so the garment holds its 3D shape with no visible body, on a pure white background',
    },
    flat_lay: {
        label: 'Flat lay',
        scene: 'laid out neatly flat and smoothed, photographed from directly above on a light neutral background',
    },
};

/** The three shots a mannequin job draws, one model call each. */
const MANNEQUIN_ANGLES = [
    'Front view, full product visible.',
    'Three-quarter view from the left, full product visible.',
    'Close-up detail of the fabric, neckline or most distinctive feature.',
];

const mannequinPrompt = (style, angle) => `Create a professional e-commerce product photo of the product in this image, ${MANNEQUIN_STYLES[style].scene}. ${angle} Soft, even studio lighting. ${KEEP_PRODUCT}`;

const toOid = (id) => (mongoose.Types.ObjectId.isValid(String(id)) ? new mongoose.Types.ObjectId(String(id)) : null);
const sellerKey = (sellerId) => `seller:${sellerId}`;

async function imagesUsedToday(sellerId, now = new Date()) {
    const row = await AiUsageDaily.findOne({ day: dayKey(now), userKey: sellerKey(sellerId) }).select('images').lean();
    return row?.images || 0;
}

/** What the seller panel shows: whether the studio is on, and today's allowance. */
export async function getImageStudioStatus(sellerId, now = new Date()) {
    const settings = await getAiSettings();
    const cap = Number(settings.sellerDailyImageCap) || 0;
    const used = await imagesUsedToday(sellerId, now);
    return {
        enabled: Boolean(settings.imageStudioEnabled) && hasGeminiKey(),
        dailyCap: cap,
        usedToday: used,
        remainingToday: cap ? Math.max(cap - used, 0) : null,
        mannequinCount: MANNEQUIN_COUNT,
        styles: Object.entries(MANNEQUIN_STYLES).map(([key, s]) => ({ key, label: s.label })),
    };
}

/**
 * Takes `count` images off today's allowance in one atomic step, so two clicks
 * at once cannot both squeeze under the cap. Returns false when they would not fit.
 */
async function reserveImages(sellerId, count, cap, now) {
    if (cap && count > cap) return false;
    const day = dayKey(now);
    const userKey = sellerKey(sellerId);
    const filter = cap ? { day, userKey, images: { $lte: cap - count } } : { day, userKey };
    try {
        const res = await AiUsageDaily.updateOne(
            filter,
            { $inc: { images: count }, $setOnInsert: { userId: toOid(sellerId) } },
            { upsert: true }
        );
        return res.modifiedCount + res.upsertedCount > 0;
    } catch (err) {
        // The day's row exists but is over the cap, so the upsert collided with it.
        if (err?.code === 11000) return false;
        throw err;
    }
}

/** Gives back images a job reserved but did not make. */
async function releaseImages(sellerId, count, now) {
    if (count <= 0) return;
    await AiUsageDaily.updateOne({ day: dayKey(now), userKey: sellerKey(sellerId) }, { $inc: { images: -count } });
}

const publicJob = (job) => ({
    id: String(job._id),
    kind: job.kind,
    style: job.style,
    sourceUrl: job.sourceUrl,
    count: job.count,
    status: job.status,
    results: (job.results || []).map((r) => r.url),
    error: job.error || '',
    createdAt: job.createdAt,
});

const SELLER_MESSAGES = {
    billing: 'AI images are not available for this store yet. Please ask the admin to switch them on.',
    quota: 'AI images are busy right now. Please try again in a minute.',
    safety: 'This photo could not be used for AI images. Please try a different photo.',
    error: 'The images could not be made this time. Please try again.',
};

const errorCodeFor = (err) => {
    if (err?.billing) return 'billing';
    if (err?.status === 429) return 'quota';
    return 'error';
};

/** Shrinks the source to a size the model handles well and returns it as JPEG. */
async function prepareSource(buffer) {
    return sharp(buffer, { failOn: 'none' })
        .rotate()
        .resize({ width: SOURCE_MAX_PX, height: SOURCE_MAX_PX, fit: 'inside', withoutEnlargement: true })
        .flatten({ background: '#ffffff' })
        .jpeg({ quality: 90 })
        .toBuffer();
}

/**
 * Starts a job and returns it straight away; the images arrive in the background.
 * Throws ValidationError for anything the seller can fix.
 */
export async function startImageJob({ sellerId, kind, style, imageUrl, now = new Date() }) {
    const sellerOid = toOid(sellerId);
    if (!sellerOid) throw new ValidationError('Store not found');
    if (!['enhance', 'mannequin'].includes(kind)) throw new ValidationError('Choose Enhance or Mannequin shots');
    const useStyle = kind === 'mannequin' ? (style || 'mannequin') : '';
    if (kind === 'mannequin' && !MANNEQUIN_STYLES[useStyle]) throw new ValidationError('Unknown mannequin style');

    const settings = await getAiSettings();
    if (!settings.imageStudioEnabled || !hasGeminiKey()) {
        throw new ValidationError('AI images are switched off right now.');
    }

    const source = await readHostedImage(imageUrl);
    if (!source) throw new ValidationError('Upload this photo first, then try again.');

    const count = kind === 'mannequin' ? MANNEQUIN_COUNT : 1;
    const cap = Number(settings.sellerDailyImageCap) || 0;
    if (!(await reserveImages(sellerOid, count, cap, now))) {
        const left = Math.max(cap - (await imagesUsedToday(sellerOid, now)), 0);
        throw new ValidationError(left
            ? `Only ${left} AI image${left === 1 ? '' : 's'} left today, and this needs ${count}. It resets at midnight (UTC).`
            : `You've used all ${cap} AI images for today. It resets at midnight (UTC).`);
    }

    const job = await AiImageJob.create({
        sellerId: sellerOid,
        kind,
        style: useStyle,
        sourceUrl: String(imageUrl),
        count,
        model: effectiveImageModel(settings),
    });

    // Deliberately not awaited: the request returns the job and the seller polls it.
    runImageJob(job, source.buffer, now).catch((err) => logger.error(`Image job ${job._id} crashed: ${err.message}`));
    return publicJob(job);
}

/** Draws the job's images, saves them, and settles the reservation. Exported for tests. */
export async function runImageJob(job, sourceBuffer, reservedAt = new Date()) {
    const prompts = job.kind === 'enhance'
        ? [ENHANCE_PROMPT]
        : MANNEQUIN_ANGLES.slice(0, job.count).map((angle) => mannequinPrompt(job.style, angle));

    let source;
    try {
        source = await prepareSource(sourceBuffer);
    } catch {
        await releaseImages(job.sellerId, job.count, reservedAt);
        await AiImageJob.updateOne({ _id: job._id }, { $set: { status: 'failed', error: SELLER_MESSAGES.safety, errorCode: 'error', finishedAt: new Date() } });
        return;
    }

    const outcomes = await Promise.allSettled(prompts.map(async (prompt) => {
        const result = await callGeminiImage({ model: job.model, imageBuffer: source, mimeType: 'image/jpeg', prompt });
        if (!result.images.length) {
            const err = new Error(`no image (finish: ${result.finishReason || 'unknown'})`);
            err.safety = /SAFETY|PROHIBITED|IMAGE_SAFETY|BLOCK/i.test(result.finishReason);
            throw err;
        }
        const saved = await saveImageBuffer(result.images[0].buffer, `sellers/ai/${job.sellerId}`, { mimeType: result.images[0].mimeType });
        return { saved, usage: result.usage };
    }));

    const results = [];
    let promptTokens = 0;
    let outputTokens = 0;
    let firstError = null;
    for (const o of outcomes) {
        if (o.status === 'fulfilled') {
            results.push({ url: o.value.saved.url, path: o.value.saved.path });
            promptTokens += o.value.usage.promptTokens;
            outputTokens += o.value.usage.outputTokens;
        } else if (!firstError) {
            firstError = o.reason;
        }
    }

    const failed = prompts.length - results.length;
    const code = firstError ? (firstError.safety ? 'safety' : errorCodeFor(firstError)) : '';
    if (firstError) logger.warn(`Image job ${job._id}: ${failed}/${prompts.length} failed (${code}): ${String(firstError.message).slice(0, 200)}`);

    // Settle the allowance (hand back what was not made) and the token tally
    // before the job reads as finished, so what the seller sees next is right.
    await AiUsageDaily.updateOne(
        { day: dayKey(reservedAt), userKey: sellerKey(job.sellerId) },
        { $inc: { images: -failed, llmCalls: prompts.length, promptTokens, outputTokens } }
    );
    await AiImageJob.updateOne({ _id: job._id }, {
        $set: {
            status: results.length ? 'done' : 'failed',
            results,
            error: results.length ? '' : SELLER_MESSAGES[code] || SELLER_MESSAGES.error,
            errorCode: code,
            promptTokens,
            outputTokens,
            finishedAt: new Date(),
        },
    });
}

/** The seller's own job, or null. A job left running by a restarted process is reported failed. */
export async function getImageJob(sellerId, jobId) {
    const sellerOid = toOid(sellerId);
    const jobOid = toOid(jobId);
    if (!sellerOid || !jobOid) return null;
    let job = await AiImageJob.findOne({ _id: jobOid, sellerId: sellerOid }).lean();
    if (!job) return null;
    if (job.status === 'running' && Date.now() - new Date(job.createdAt).getTime() > STALE_MS) {
        job = await AiImageJob.findOneAndUpdate(
            { _id: job._id, status: 'running' },
            { $set: { status: 'failed', error: SELLER_MESSAGES.error, errorCode: 'error', finishedAt: new Date() } },
            { new: true }
        ).lean() || await AiImageJob.findById(job._id).lean();
        if (job.status === 'failed' && !job.results?.length) await releaseImages(job.sellerId, job.count, job.createdAt);
    }
    return publicJob(job);
}
