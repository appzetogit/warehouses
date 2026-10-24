import crypto from 'crypto';
import ms from 'ms';
import { Otp } from './otp.model.js';
import { config } from '../../config/env.js';
import { logger } from '../../utils/logger.js';
import { ValidationError } from '../auth/errors.js';

const generateOtpCode = () => {
    const code = crypto.randomInt(1000, 9999);
    return String(code);
};

/**
 * Sends SMS via SMS India Hub API
 * @param {string} phone - 10-digit mobile number (will be prefixed with 91)
 * @param {string} otp
 */
const sendSmsViaIndiaHub = async (phone, otp) => {
    try {
        // Normalize phone: strip non-digits, ensure 91 country code prefix
        const digits = String(phone || '').replace(/\D/g, '');
        const msisdn = digits.startsWith('91') ? digits : `91${digits}`;

        // Must match the DLT-registered template exactly; see config.otpSmsTemplate.
        const message = config.otpSmsTemplate.replace('{otp}', otp);

        // SMS India Hub HTTP GET API — query param names are case-sensitive per SOP.
        // With a panel username + password use /api/mt/SendSMS; otherwise the legacy APIKey endpoint.
        let url;
        if (config.smsIndiaHubUsername && config.smsIndiaHubPassword) {
            url = new URL('http://cloud.smsindiahub.in/api/mt/SendSMS');
            url.searchParams.append('user', config.smsIndiaHubUsername);
            url.searchParams.append('password', config.smsIndiaHubPassword);
            url.searchParams.append('senderid', config.smsSenderId);
            url.searchParams.append('channel', 'Trans');
            url.searchParams.append('DCS', '0');
            url.searchParams.append('flashsms', '0');
            url.searchParams.append('number', msisdn);
            url.searchParams.append('text', message);
            url.searchParams.append('DLTTemplateId', config.smsDltTemplateId);
            url.searchParams.append('PEId', config.smsPeId);
            url.searchParams.append('route', '0');
        } else {
            url = new URL('http://cloud.smsindiahub.in/vendorsms/pushsms.aspx');
            url.searchParams.append('APIKey', config.smsApiKey);
            url.searchParams.append('sid', config.smsSenderId);
            url.searchParams.append('msisdn', msisdn);
            url.searchParams.append('msg', message);
            url.searchParams.append('gwid', '2');
            url.searchParams.append('fl', '0');
            if (config.smsIndiaHubUsername) {
                url.searchParams.append('uname', config.smsIndiaHubUsername);
            }
            if (config.smsDltTemplateId) {
                url.searchParams.append('DLT_TE_ID', config.smsDltTemplateId);
            }
        }

        logger.info(`[SMS] Sending OTP to ${msisdn} via SMS India Hub...`);
        const response = await fetch(url.toString());
        const resultText = await response.text();
        logger.info(`[SMS] Raw response for ${msisdn}: ${resultText}`);

        // SMS India Hub often returns HTTP 200 OK even for errors — check response body
        let parsed = null;
        try { parsed = JSON.parse(resultText); } catch (_) { /* plain text response is OK */ }

        if (parsed && parsed.ErrorCode && parsed.ErrorCode !== '000') {
            const errMsg = `SMS India Hub ERROR for ${phone}: [${parsed.ErrorCode}] ${parsed.ErrorMessage || resultText}`;
            logger.error(errMsg);
            // eslint-disable-next-line no-console
            console.error(`❌ [SMS ERROR] ${errMsg}`);
            if (parsed.ErrorCode === '006') {
                // eslint-disable-next-line no-console
                console.error('❌ [SMS ERROR] ErrorCode 006 = DLT Template mismatch. The message text must EXACTLY match your registered TRAI DLT template. Login to https://cloud.smsindiahub.in and verify the approved template text.');
            }
        } else if (/^\s*failed/i.test(resultText)) {
            // Plain-text failures such as "Failed#Invalid Login" (wrong API key / username).
            logger.error(`SMS India Hub ERROR for ${phone}: ${resultText}`);
        } else if (!response.ok) {
            logger.error(`SMS API HTTP error for ${phone}: ${response.status} – ${resultText}`);
        } else {
            logger.info(`✅ SMS sent successfully to ${msisdn}`);
        }
    } catch (error) {
        logger.error(`Error sending SMS to ${phone}: ${error.message}`);
        // Do NOT throw — OTP is already stored in DB; SMS failure should not block the flow
    }
};

/**
 * Stores a fresh code for `phone` (an OTP key: a phone number, or `email:<address>`
 * for email sign-in) and delivers it. `deliver(key, otp)` replaces the SMS sender;
 * it may throw to report that the code could not be sent.
 */
/** True for a store-review demo number (config.reviewLoginPhones), never for email keys. */
export const isReviewLoginPhone = (key) => {
    const raw = String(key || '');
    if (!raw || raw.startsWith('email:')) return false;
    const last10 = raw.replace(/\D/g, '').slice(-10);
    return last10.length === 10 && (config.reviewLoginPhones || []).includes(last10);
};

export const createOrUpdateOtp = async (phone, { deliver, realOnly = false } = {}) => {
    // realOnly: never the fixed test code (email sign-in must always send a real one).
    const reviewLogin = !realOnly && isReviewLoginPhone(phone);
    const useTestCode = (config.useDefaultOtp && !realOnly) || reviewLogin;
    const existing = await Otp.findOne({ phone });
    const now = new Date();

    // Rate Limiting Logic
    if (existing) {
        const windowMs = (config.otpRateWindow || 600) * 1000;
        const isInWindow = now - existing.lastRequestAt < windowMs;

        if (isInWindow) {
            if (!reviewLogin && existing.requestCount >= (config.otpRateLimit || 3)) {
                logger.warn(`Rate limit exceeded for phone ${phone}`);
                throw new ValidationError(`Too many OTP requests. Please try again after ${Math.ceil(windowMs / 60000)} minutes.`);
            }
            existing.requestCount += 1;
        } else {
            // Reset count if window has passed
            existing.requestCount = 1;
        }
    }

    let otp;
    if (useTestCode) {
        otp = '1234';
        logger.info(reviewLogin
            ? `Store-review login – fixed OTP for phone ${phone}`
            : `Default OTP mode enabled – OTP is ${otp} for phone ${phone}`);
    } else {
        otp = generateOtpCode();
    }

    // Expiry calculation: prioritize seconds, then minutes, then fallback to MS string
    let ttlMs;
    if (config.otpExpirySeconds) {
        ttlMs = config.otpExpirySeconds * 1000;
    } else if (config.otpExpiryMinutes) {
        ttlMs = config.otpExpiryMinutes * 60 * 1000;
    } else {
        ttlMs = ms(config.otpExpiry || '5m');
    }
    const expiresAt = new Date(now.getTime() + ttlMs);

    if (existing) {
        existing.otp = otp;
        existing.expiresAt = expiresAt;
        existing.attempts = 0;
        existing.lastRequestAt = now;
        await existing.save();
    } else {
        await Otp.create({ 
            phone, 
            otp, 
            expiresAt,
            requestCount: 1,
            lastRequestAt: now
        });
    }

    // Only send the code if not in default OTP mode
    if (!useTestCode) {
        await (deliver || sendSmsViaIndiaHub)(phone, otp);
    }

    return otp;
};

export const verifyOtp = async (phone, otp) => {
    const record = await Otp.findOne({ phone });
    if (!record) {
        return { valid: false, reason: 'OTP not found' };
    }

    if (record.expiresAt < new Date()) {
        return { valid: false, reason: 'OTP expired' };
    }

    if (record.attempts >= config.otpMaxAttempts) {
        return { valid: false, reason: 'Max attempts exceeded' };
    }

    record.attempts += 1;

    if (record.otp !== otp) {
        await record.save();
        return { valid: false, reason: 'Invalid OTP' };
    }

    await record.deleteOne();
    return { valid: true };
};

