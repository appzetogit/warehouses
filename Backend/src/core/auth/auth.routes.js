import express from 'express';
import {
    requestUserOtpController,
    verifyUserOtpController,
    requestUserEmailOtpController,
    verifyUserEmailOtpController,
    adminLoginController,
    refreshTokenController,
    requestSellerOtpController,
    verifySellerOtpController,
    requestDeliveryOtpController,
    verifyDeliveryOtpController,
    logoutController,
    logoutAllController,
    getMeController,
    updateAdminProfileController,
    changeAdminPasswordController,
    requestAdminForgotPasswordOtpController,
    resetAdminPasswordWithOtpController
} from './auth.controller.js';
import { authMiddleware, requireAdmin } from './auth.middleware.js';
import { authRateLimiter } from '../../middleware/rateLimit.js';

const router = express.Router();

// router.use(authRateLimiter); // Removed global application to avoid rate-limiting /me or /refresh-token too strictly

// User OTP login
router.post('/user/request-otp', authRateLimiter, requestUserOtpController);
router.post('/user/verify-otp', authRateLimiter, verifyUserOtpController);

// User email OTP login (website); same tokens and response as the phone flow
router.post('/user/email/request-otp', authRateLimiter, requestUserEmailOtpController);
router.post('/user/email/verify-otp', authRateLimiter, verifyUserEmailOtpController);

// Seller OTP login
router.post('/seller/request-otp', authRateLimiter, requestSellerOtpController);
router.post('/seller/verify-otp', authRateLimiter, verifySellerOtpController);

// Delivery partner OTP login
router.post('/delivery/request-otp', authRateLimiter, requestDeliveryOtpController);
router.post('/delivery/verify-otp', authRateLimiter, verifyDeliveryOtpController);

// Admin login
router.post('/admin/login', authRateLimiter, adminLoginController);

// Admin forgot password (no auth required)
router.post('/admin/forgot-password/request-otp', authRateLimiter, requestAdminForgotPasswordOtpController);
router.post('/admin/forgot-password/reset', authRateLimiter, resetAdminPasswordWithOtpController);

// Refresh token
router.post('/refresh-token', refreshTokenController);

// Logout (invalidates refresh token)
router.post('/logout', logoutController);

// Logout on every device (Bearer token): revokes all sessions for the caller
router.post('/logout-all', authMiddleware, logoutAllController);

// Authenticated user profile (requires Bearer token)
router.get('/me', authMiddleware, getMeController);

// Admin-only: profile update & change password (Bearer + ADMIN role)
router.patch('/admin/profile', authMiddleware, requireAdmin, updateAdminProfileController);
router.post('/admin/change-password', authMiddleware, requireAdmin, changeAdminPasswordController);

export default router;

