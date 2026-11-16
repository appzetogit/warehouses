import { User } from '../../../../core/users/user.model.js';
import { AuthError, ValidationError } from '../../../../core/auth/errors.js';
import { uploadImageBuffer } from '../../../../services/cloudinary.service.js';
import { createOrUpdateOtp, verifyOtp, sendSmsOtp } from '../../../../core/otp/otp.service.js';
import { config } from '../../../../config/env.js';

// OTP key for adding a phone to an account that has none (Google/Email sign-in),
// kept apart from the phone-login key so the two codes never overwrite each other.
const phoneLinkOtpKey = (phone) => `phone-link:${phone}`;

/** Checks that `user` (no phone yet) may add `rawPhone`; returns the digits-only number. */
const assertPhoneCanBeAdded = async (user, rawPhone) => {
    if (String(user.phone || '').replace(/\D/g, '')) {
        throw new ValidationError('Phone number cannot be changed');
    }
    const phone = String(rawPhone || '').trim().replace(/\D/g, '');
    if (phone.length < 8 || phone.length > 15) {
        throw new ValidationError('Please enter a valid phone number');
    }
    const existing = await User.findOne({ phone, _id: { $ne: user._id } }).select('_id').lean();
    if (existing) {
        throw new ValidationError('This phone number is already linked to another account');
    }
    return phone;
};

/** Sends an OTP to a phone number the signed-in customer wants to add to their account. */
export const requestPhoneLinkOtp = async (userId, rawPhone) => {
    const user = await User.findById(userId).select('phone').lean();
    if (!user) throw new AuthError('Profile not found');
    const phone = await assertPhoneCanBeAdded(user, rawPhone);
    const otp = await createOrUpdateOtp(phoneLinkOtpKey(phone), {
        deliver: (_key, code) => sendSmsOtp(phone, code),
    });
    // Only the fixed test code (USE_DEFAULT_OTP) is ever returned; a real OTP goes by SMS only.
    return config.useDefaultOtp ? { phone, otp } : { phone };
};

const parseIsoDateOrNull = (value) => {
    if (value === undefined) return undefined;
    if (value === null || value === '') return null;
    const d = new Date(`${String(value)}T00:00:00.000Z`);
    // Keep null for invalid; validation is handled by DTO, but be defensive.
    return Number.isNaN(d.getTime()) ? null : d;
};

export const getCurrentUserProfile = async (userId) => {
    const user = await User.findById(userId).lean();
    if (!user) throw new AuthError('Profile not found');
    return { user };
};

export const updateCurrentUserProfile = async (userId, body) => {
    const user = await User.findById(userId);
    if (!user) throw new AuthError('Profile not found');

    if (body.phone !== undefined) {
        const nextPhone = String(body.phone || '').trim().replace(/\D/g, '');
        const currentPhone = String(user.phone || '').trim().replace(/\D/g, '');
        // Once a phone number is set, prevent changing it from a simple profile update
        if (currentPhone && nextPhone !== currentPhone) {
            throw new ValidationError('Phone number cannot be changed');
        }
        // A Google/Email account without a phone may add one, but only with the OTP sent
        // to it: phone login would otherwise drop the number's real owner into this account.
        if (!currentPhone && nextPhone) {
            const phone = await assertPhoneCanBeAdded(user, nextPhone);
            if (!body.phoneOtp) {
                throw new ValidationError('Please verify your phone number with the OTP');
            }
            const result = await verifyOtp(phoneLinkOtpKey(phone), String(body.phoneOtp).trim());
            if (!result.valid) {
                throw new ValidationError(result.reason || 'OTP verification failed');
            }
            user.phone = phone;
        }
    }

    if (body.name !== undefined) user.name = String(body.name || '').trim();
    if (body.email !== undefined) {
        const nextEmail = String(body.email || '').trim().toLowerCase();
        if (nextEmail) {
            const EMAIL_REGEX = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
            if (!EMAIL_REGEX.test(nextEmail)) {
                throw new ValidationError('Invalid email format');
            }
            const domainParts = nextEmail.split('@')[1].split('.');
            for (let i = 0; i < domainParts.length - 1; i++) {
                if (domainParts[i] === domainParts[i + 1] && domainParts[i].length > 0) {
                    throw new ValidationError('Invalid email domain structure (e.g., .com.com)');
                }
            }
            if (nextEmail.includes('..')) {
                throw new ValidationError('Email cannot contain consecutive dots');
            }
        }
        user.email = nextEmail;
    }
    if (body.profileImage !== undefined) user.profileImage = String(body.profileImage || '').trim();
    if (body.gender !== undefined) user.gender = String(body.gender || '').trim();

    const dob = parseIsoDateOrNull(body.dateOfBirth);
    if (dob !== undefined) user.dateOfBirth = dob;
    const ann = parseIsoDateOrNull(body.anniversary);
    if (ann !== undefined) user.anniversary = ann;

    await user.save();
    return { user: user.toObject() };
};

export const uploadCurrentUserProfileImage = async (userId, file) => {
    if (!file || !file.buffer) {
        throw new ValidationError('File is required');
    }
    const user = await User.findById(userId);
    if (!user) throw new AuthError('Profile not found');

    const url = await uploadImageBuffer(file.buffer, 'users/profile');
    user.profileImage = String(url || '').trim();
    await user.save();
    return { profileImage: user.profileImage, user: user.toObject() };
};

/**
 * Delete a user and their associated wallet data permanently.
 */
export const deleteCurrentUserAccount = async (userId) => {
    // We import dynamically to avoid circular dependencies if any
    const { UserWallet } = await import('../models/userWallet.model.js');
    
    const user = await User.findById(userId);
    if (!user) throw new AuthError('Profile not found');

    // Remove Wallet
    await UserWallet.findOneAndDelete({ userId });

    // Remove User
    await User.findByIdAndDelete(userId);

    return { success: true };
};

