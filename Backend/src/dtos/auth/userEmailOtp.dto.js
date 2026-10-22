import { z } from "zod";
import { ValidationError } from "../../core/auth/errors.js";
import { normalizePlatform } from "../../utils/platform.js";

const email = z
  .string({ required_error: "Email is required", invalid_type_error: "Email is required" })
  .trim()
  .min(1, "Email is required")
  .max(254, "Email is too long")
  .email("Enter a valid email address")
  .transform((value) => value.toLowerCase());

const requestSchema = z.object({ email });

const verifySchema = z.object({
  email,
  otp: z
    .string()
    .length(4, "OTP must be exactly 4 digits")
    .regex(/^\d{4}$/, "OTP must be numeric and exactly 4 digits"),
  ref: z.string().trim().max(64).optional().or(z.literal("")),
  fcmToken: z.string().optional(),
  platform: z.preprocess(
    (value) => normalizePlatform(value, { allowUndefined: true }),
    z.enum(["web", "mobile"]).optional(),
  ),
  name: z.string().trim().min(2, "Name must be at least 2 characters").max(100).optional(),
});

const parse = (schema, body) => {
  const result = schema.safeParse(body ?? {});
  if (!result.success) {
    throw new ValidationError(result.error.errors[0].message);
  }
  return result.data;
};

export const validateUserEmailOtpRequestDto = (body) => parse(requestSchema, body);
export const validateUserEmailOtpVerifyDto = (body) => parse(verifySchema, body);
