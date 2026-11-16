import { sendResponse } from '../../../../utils/response.js';
import { validateUserProfileUpdateDto } from '../../../../dtos/commerce/userProfileUpdate.dto.js';
import {
    getCurrentUserProfile,
    updateCurrentUserProfile,
    uploadCurrentUserProfileImage,
    deleteCurrentUserAccount,
    requestPhoneLinkOtp
} from '../services/userProfile.service.js';

/** POST /profile/phone/otp { phone } — sends the OTP needed to add a phone to the account. */
export const requestPhoneLinkOtpController = async (req, res, next) => {
    try {
        const userId = req.user?.userId;
        const result = await requestPhoneLinkOtp(userId, req.body?.phone);
        return sendResponse(res, 200, 'OTP sent successfully', result);
    } catch (error) {
        next(error);
    }
};

export const getCurrentUserProfileController = async (req, res, next) => {
    try {
        const userId = req.user?.userId;
        const result = await getCurrentUserProfile(userId);
        return sendResponse(res, 200, 'Profile retrieved successfully', result);
    } catch (error) {
        next(error);
    }
};

export const updateCurrentUserProfileController = async (req, res, next) => {
    try {
        const userId = req.user?.userId;
        const body = validateUserProfileUpdateDto(req.body);
        const result = await updateCurrentUserProfile(userId, body);
        return sendResponse(res, 200, 'Profile updated successfully', result);
    } catch (error) {
        next(error);
    }
};

export const uploadCurrentUserProfileImageController = async (req, res, next) => {
    try {
        const userId = req.user?.userId;
        const result = await uploadCurrentUserProfileImage(userId, req.file);
        return sendResponse(res, 200, 'Profile image uploaded successfully', result);
    } catch (error) {
        next(error);
    }
};

export const deleteCurrentUserAccountController = async (req, res, next) => {
    try {
        const userId = req.user?.userId;
        const result = await deleteCurrentUserAccount(userId);
        return sendResponse(res, 200, 'Account deleted successfully', result);
    } catch (error) {
        next(error);
    }
};

