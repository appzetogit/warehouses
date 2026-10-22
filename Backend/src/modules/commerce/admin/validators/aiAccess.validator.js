import { z } from 'zod';
import { ValidationError } from '../../../../core/auth/errors.js';

/** PATCH /admin/sellers/:id/ai-access. monthlyImageCap: null (or '') = use the platform cap. */
const aiAccessSchema = z.object({
    imagesEnabled: z.boolean().optional(),
    chatEnabled: z.boolean().optional(),
    monthlyImageCap: z.union([z.number().int().min(0).max(100000), z.null()]).optional(),
}).strict();

export const validateAiAccessDto = (body = {}) => {
    const input = { ...(body || {}) };
    if (input.monthlyImageCap === '') input.monthlyImageCap = null;
    else if (typeof input.monthlyImageCap === 'string') input.monthlyImageCap = Number(input.monthlyImageCap);
    const parsed = aiAccessSchema.safeParse(input);
    if (!parsed.success) {
        const issue = parsed.error.issues[0];
        const field = issue?.path?.join('.') || 'body';
        throw new ValidationError(issue?.code === 'unrecognized_keys'
            ? `Unknown field: ${issue.keys.join(', ')}`
            : `${field}: ${field === 'monthlyImageCap' ? 'must be a whole number from 0 to 100000, or empty to use the platform cap' : 'must be true or false'}`);
    }
    if (!Object.keys(parsed.data).length) throw new ValidationError('Nothing to change: send imagesEnabled, chatEnabled or monthlyImageCap');
    return parsed.data;
};
