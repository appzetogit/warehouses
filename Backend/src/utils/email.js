import nodemailer from 'nodemailer';
import { config } from '../config/env.js';
import { logger } from './logger.js';

let transporter = null;

function getTransporter() {
    if (transporter) return transporter;
    const { emailHost, emailPort, emailUser, emailPass } = config;
    if (!emailHost || !emailUser || !emailPass) {
        logger.warn('Email not configured: EMAIL_HOST, EMAIL_USER, EMAIL_PASS required');
        return null;
    }
    transporter = nodemailer.createTransport({
        host: emailHost,
        port: emailPort || 587,
        secure: emailPort === 465,
        auth: {
            user: emailUser,
            pass: emailPass
        }
    });
    return transporter;
}

/**
 * Send OTP email for admin forgot password.
 * @param {string} to - Recipient email
 * @param {string} otp - 6-digit OTP
 * @returns {Promise<boolean>} true if sent, false if skipped/failed
 */
export async function sendAdminResetOtpEmail(to, otp) {
    const trans = getTransporter();
    if (!trans) {
        logger.warn('Admin OTP email skipped: SMTP not configured');
        return false;
    }
    const from = config.emailFrom || config.emailUser;
    const subject = `Your password reset code – ${config.brand.name} Admin`;
    const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 480px; margin: 0 auto; padding: 20px;">
  <h2 style="color: #111;">Password reset code</h2>
  <p>Use the code below to reset your admin password. It is valid for 10 minutes.</p>
  <p style="font-size: 24px; font-weight: bold; letter-spacing: 4px; background: #f5f5f5; padding: 12px 16px; border-radius: 8px;">${otp}</p>
  <p style="color: #666; font-size: 14px;">If you did not request this, you can ignore this email.</p>
  <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
  <p style="color: #999; font-size: 12px;">${config.brand.name} Admin</p>
</body>
</html>`;
    const text = `Your password reset code is: ${otp}. It is valid for 10 minutes. If you did not request this, ignore this email.`;

    try {
        await trans.sendMail({
            from: typeof from === 'string' && from.includes('<') ? from : `${config.brand.name} <${from}>`,
            to,
            subject,
            text,
            html
        });
        logger.info(`Admin reset OTP email sent to ${to}`);
        return true;
    } catch (err) {
        logger.error(`Failed to send admin OTP email to ${to}:`, err.message);
        return false;
    }
}

/** True when SMTP credentials are set, so an email can actually go out. */
export function isEmailConfigured() {
    const { emailHost, emailUser, emailPass } = config;
    return Boolean(emailHost && emailUser && emailPass);
}

/**
 * Send the customer sign-in code by email.
 * @param {string} to - Recipient email
 * @param {string} otp - 4-digit code
 * @param {number} validMinutes - how long the code works, for the message
 * @returns {Promise<boolean>} true if sent, false if skipped/failed
 */
export async function sendUserLoginOtpEmail(to, otp, validMinutes = 5) {
    const trans = getTransporter();
    if (!trans) {
        logger.warn('User login OTP email skipped: SMTP not configured');
        return false;
    }
    const from = config.emailFrom || config.emailUser;
    const brand = config.brand.name;
    const subject = `${otp} is your ${brand} sign-in code`;
    const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 480px; margin: 0 auto; padding: 20px;">
  <h2 style="color: #58321D;">Your sign-in code</h2>
  <p>Use this code to sign in to ${brand}. It is valid for ${validMinutes} minutes.</p>
  <p style="font-size: 26px; font-weight: bold; letter-spacing: 6px; background: #F7F1EC; color: #58321D; padding: 12px 16px; border-radius: 8px; display: inline-block;">${otp}</p>
  <p style="color: #666; font-size: 14px;">If you did not try to sign in, you can ignore this email. Never share this code with anyone.</p>
  <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
  <p style="color: #999; font-size: 12px;">${brand}</p>
</body>
</html>`;
    const text = `Your ${brand} sign-in code is ${otp}. It is valid for ${validMinutes} minutes. If you did not try to sign in, ignore this email.`;

    try {
        await trans.sendMail({
            from: typeof from === 'string' && from.includes('<') ? from : `${brand} <${from}>`,
            to,
            subject,
            text,
            html
        });
        logger.info(`User login OTP email sent to ${to}`);
        return true;
    } catch (err) {
        logger.error(`Failed to send user login OTP email to ${to}:`, err.message);
        return false;
    }
}
