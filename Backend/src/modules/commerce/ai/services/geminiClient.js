import axios from 'axios';

/**
 * The one place that talks to the Gemini API. The key is read from
 * GEMINI_API_KEY and sent as a header (never in a URL, never logged or returned).
 */
export const DEFAULT_MODEL = 'gemini-3.8-flash';

export const hasGeminiKey = () => Boolean(process.env.GEMINI_API_KEY);

const defaultTransport = (url, body, options) => axios.post(url, body, options);
let transport = defaultTransport;

/** Tests swap the HTTP call out; pass nothing to restore it. */
export function setGeminiTransport(fn) {
    transport = typeof fn === 'function' ? fn : defaultTransport;
}

/**
 * generateContent. Returns { text, usage: { promptTokens, outputTokens }, model }.
 * Throws when there is no key or the call fails; callers fall back.
 */
export async function callGemini({ model, systemText, contents, generationConfig = {}, timeoutMs = 8000 }) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error('Gemini is not configured');
    const useModel = model || process.env.GEMINI_MODEL || DEFAULT_MODEL;
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(useModel)}:generateContent`;
    const body = {
        ...(systemText ? { systemInstruction: { parts: [{ text: systemText }] } } : {}),
        contents,
        generationConfig,
    };
    const resp = await transport(url, body, { timeout: timeoutMs, headers: { 'x-goog-api-key': apiKey } });
    const data = resp?.data || {};
    const text = (data.candidates?.[0]?.content?.parts || []).map((p) => p?.text || '').join('');
    const meta = data.usageMetadata || {};
    return {
        text,
        model: useModel,
        usage: {
            promptTokens: Number(meta.promptTokenCount) || 0,
            outputTokens: Number(meta.candidatesTokenCount) || 0,
        },
    };
}

export const DEFAULT_IMAGE_MODEL = 'gemini-3.1-flash-image';

/**
 * A failed Gemini call, with what callers need to explain it: the HTTP status,
 * and `billing` when Google refuses because the key's project has no image quota
 * (the free tier allows none).
 */
export class GeminiError extends Error {
    constructor(message, { status = 0, billing = false } = {}) {
        super(message);
        this.name = 'GeminiError';
        this.status = status;
        this.billing = billing;
    }
}

const toGeminiError = (err) => {
    if (err instanceof GeminiError) return err;
    const status = Number(err?.response?.status) || 0;
    const apiMessage = String(err?.response?.data?.error?.message || err?.message || 'Gemini request failed');
    const billing = status === 429 && /free_tier|limit: 0|billing/i.test(apiMessage);
    // The API message only; the request config (with its key header) is never kept.
    return new GeminiError(apiMessage.slice(0, 300), { status, billing });
};

/**
 * Image in, image out. Sends one photo plus an instruction and returns the
 * images the model drew: { images: [{ buffer, mimeType }], usage, model }.
 */
export async function callGeminiImage({ model, imageBuffer, mimeType = 'image/jpeg', prompt, aspectRatio = '3:4', timeoutMs = 90000 }) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new GeminiError('Gemini is not configured');
    const useModel = model || process.env.GEMINI_IMAGE_MODEL || DEFAULT_IMAGE_MODEL;
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(useModel)}:generateContent`;
    const body = {
        contents: [{
            role: 'user',
            parts: [
                { inlineData: { mimeType, data: Buffer.from(imageBuffer).toString('base64') } },
                { text: prompt },
            ],
        }],
        generationConfig: { responseModalities: ['IMAGE'], imageConfig: { aspectRatio } },
    };
    let resp;
    try {
        resp = await transport(url, body, { timeout: timeoutMs, maxBodyLength: 50 * 1024 * 1024, headers: { 'x-goog-api-key': apiKey } });
    } catch (err) {
        throw toGeminiError(err);
    }
    const data = resp?.data || {};
    const parts = data.candidates?.[0]?.content?.parts || [];
    const images = parts
        .filter((p) => p?.inlineData?.data)
        .map((p) => ({ buffer: Buffer.from(p.inlineData.data, 'base64'), mimeType: p.inlineData.mimeType || 'image/png' }));
    const meta = data.usageMetadata || {};
    return {
        images,
        model: useModel,
        finishReason: data.candidates?.[0]?.finishReason || '',
        usage: {
            promptTokens: Number(meta.promptTokenCount) || 0,
            outputTokens: Number(meta.candidatesTokenCount) || 0,
        },
    };
}
