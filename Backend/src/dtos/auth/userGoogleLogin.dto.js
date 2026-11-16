import { z } from "zod";
import { ValidationError } from "../../core/auth/errors.js";
import { normalizePlatform } from "../../utils/platform.js";

const schema = z.object({
  idToken: z.string().min(1, "Google ID token is required"),
  email: z.string().email().optional(),
  name: z.string().optional(),
  photoUrl: z.string().optional(),
  ref: z.string().trim().max(64).optional().or(z.literal("")),
  fcmToken: z.string().optional(),
  platform: z.preprocess(
    (value) => normalizePlatform(value, { allowUndefined: true }),
    z.enum(["web", "mobile"]).optional(),
  ),
});

export const validateUserGoogleLoginDto = (body) => {
  const result = schema.safeParse(body);
  if (!result.success) {
    throw new ValidationError(result.error.errors[0]?.message || "Invalid Google login payload");
  }
  return result.data;
};
