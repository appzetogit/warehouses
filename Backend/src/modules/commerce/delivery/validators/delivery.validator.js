import { z } from 'zod';
import { ValidationError } from '../../../../core/auth/errors.js';
import { normalizePlatform } from '../../../../utils/platform.js';

const phoneSchema = z
    .string()
    .min(8, 'Phone must be at least 8 digits')
    .max(15, 'Phone must be at most 15 digits');

const panRegex = /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/;
const aadharRegex = /^[0-9]{12}$/;
// India-wide DL support (normalized, no spaces/hyphens):
// 2 letters (state) + 8 to 16 alphanumeric characters
const drivingLicenseRegex = /^[A-Z]{2}[0-9A-Z]{8,16}$/;
// Vehicle RC number (normalized): letters/digits only, as printed on the card.
const rcNumberRegex = /^[A-Z0-9]{6,20}$/;
const ifscRegex = /^[A-Z]{4}0[A-Z0-9]{6}$/;
const bankAccountRegex = /^[0-9]{9,18}$/;

const upperNoSpaces = (value) =>
    typeof value === 'string' ? value.replace(/[\s-]/g, '').toUpperCase() : value;
const trimmed = (value) => (typeof value === 'string' ? value.trim() : value);

// Optional at sign-up: vehicle RC and bank details. Older clients (the Flutter
// rider app) never send these, so every one of them may be missing or blank.
const optionalSignupExtras = {
    rcNumber: z.preprocess(
        upperNoSpaces,
        z.string().regex(rcNumberRegex, 'Invalid RC number').optional().or(z.literal(''))
    ),
    bankAccountHolderName: z.preprocess(
        trimmed,
        z.string().regex(/^[a-zA-Z\s.]{2,100}$/, 'Account holder name should only contain letters').optional().or(z.literal(''))
    ),
    bankAccountNumber: z.preprocess(
        upperNoSpaces,
        z.string().regex(bankAccountRegex, 'Account number must be 9 to 18 digits').optional().or(z.literal(''))
    ),
    bankIfscCode: z.preprocess(
        upperNoSpaces,
        z.string().regex(ifscRegex, 'Invalid IFSC code format (e.g., SBIN0012345)').optional().or(z.literal(''))
    ),
    bankName: z.preprocess(
        trimmed,
        z.string().regex(/^[a-zA-Z\s.&()]{2,100}$/, 'Bank name should only contain letters').optional().or(z.literal(''))
    )
};

const deliveryRegisterSchema = z.object({
    name: z.string().min(1, 'Name is required'),
    phone: phoneSchema,
    email: z.string().email().optional().or(z.literal('')),
    countryCode: z.string().optional(),
    address: z.string().optional(),
    city: z.string().optional(),
    state: z.string().optional(),
    vehicleType: z.string().optional(),
    vehicleName: z.string().optional(),
    vehicleNumber: z.string().optional(),
    drivingLicenseNumber: z
        .string()
        .regex(drivingLicenseRegex, 'Invalid driving license format')
        .optional()
        .or(z.literal('')),
    ref: z.string().trim().max(64).optional().or(z.literal('')),
    panNumber: z
        .string()
        .regex(panRegex, 'Invalid PAN format')
        .optional()
        .or(z.literal('')),
    aadharNumber: z
        .string()
        .regex(aadharRegex, 'Invalid Aadhar format')
        .optional()
        .or(z.literal('')),
    ...optionalSignupExtras,
    fcmToken: z.string().optional().nullable(),
    platform: z.preprocess(
        (value) => normalizePlatform(value, { allowUndefined: true }),
        z.enum(['web', 'mobile']).optional().default('web')
    )
});

/**
 * Bank details are optional at sign-up, but once a rider starts filling them
 * the account number and IFSC must both be there and well-formed (same rules
 * as the profile bank page).
 */
const checkSignupBank = (data) => {
    const anyBank = [data.bankAccountHolderName, data.bankAccountNumber, data.bankIfscCode, data.bankName]
        .some((v) => typeof v === 'string' && v.trim());
    if (!anyBank) return;
    if (!data.bankAccountNumber || !data.bankIfscCode) {
        throw new ValidationError('Account number and IFSC code are both required for bank details');
    }
};

export const validateDeliveryRegisterDto = (body) => {
    const result = deliveryRegisterSchema.safeParse(body);
    if (!result.success) {
        throw new ValidationError(result.error.errors[0].message);
    }
    checkSignupBank(result.data);
    return result.data;
};

const deliveryProfileUpdateSchema = z.object({
    name: z.string().min(1).optional(),
    countryCode: z.string().optional(),
    address: z.string().optional(),
    city: z.string().optional(),
    state: z.string().optional(),
    vehicleType: z.string().optional(),
    vehicleName: z.string().optional(),
    vehicleNumber: z.string().optional(),
    drivingLicenseNumber: z
        .string()
        .regex(drivingLicenseRegex, 'Invalid driving license format')
        .optional()
        .or(z.literal('')),
    ...optionalSignupExtras,
    fcmToken: z.string().optional().nullable(),
    platform: z.preprocess(
        (value) => normalizePlatform(value, { allowUndefined: true }),
        z.enum(['web', 'mobile']).optional().default('web')
    )
});

export const validateDeliveryProfileUpdateDto = (body) => {
    const result = deliveryProfileUpdateSchema.safeParse(body);
    if (!result.success) {
        throw new ValidationError(result.error.errors[0].message);
    }
    checkSignupBank(result.data);
    return result.data;
};

const bankDetailsSchema = z.object({
    accountHolderName: z.string().min(1, 'Account holder name is required').optional().or(z.literal('')),
    accountNumber: z.string().min(1, 'Account number is required').optional().or(z.literal('')),
    ifscCode: z.string().min(1, 'IFSC code is required').optional().or(z.literal('')),
    bankName: z.string().min(1, 'Bank name is required').optional().or(z.literal('')),
    upiId: z.string().optional().or(z.literal('')),
    upiQrCode: z.string().optional().or(z.literal(''))
});

const bankDetailsUpdateSchema = z.object({
    documents: z.object({
        bankDetails: bankDetailsSchema.optional(),
        pan: z.object({ number: z.string().optional() }).optional()
    }).optional()
}).optional();

export const validateDeliveryBankDetailsDto = (body) => {
    // If we have flat keys from FormData (multer), reconstruct the nested object for Zod
    const processed = { ...body };
    if (!processed.documents) processed.documents = {};
    if (!processed.documents.bankDetails) {
        processed.documents.bankDetails = {
            accountHolderName: body['documents[bankDetails][accountHolderName]'],
            accountNumber: body['documents[bankDetails][accountNumber]'],
            ifscCode: body['documents[bankDetails][ifscCode]'],
            bankName: body['documents[bankDetails][bankName]'],
            upiId: body['documents[bankDetails][upiId]']
        };
    }
    if (!processed.documents.pan && body['documents[pan][number]']) {
        processed.documents.pan = { number: body['documents[pan][number]'] };
    }

    const result = bankDetailsUpdateSchema.safeParse(processed);
    if (!result.success) {
        throw new ValidationError(result.error.errors[0].message);
    }
    return result.data;
};
