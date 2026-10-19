import { MockShippingProvider } from './mockShipping.provider.js';
import { ShiprocketProvider } from './shiprocket.provider.js';
import { BusinessSettings, SHIPROCKET_SELECT } from '../../../admin/models/businessSettings.model.js';
import { logger } from '../../../../../utils/logger.js';

let provider = null;
let overridden = false;
let mock = null;
/** The Shiprocket credentials the current provider was built from (to spot changes). */
let builtFrom = '';
/** Credentials saved in the admin panel, as last read from the database. */
let adminConfig = null;
let refreshTimer = null;
const REFRESH_MS = 60 * 1000;

const envConfig = () => ({
    enabled: true,
    email: process.env.SHIPROCKET_EMAIL || '',
    password: process.env.SHIPROCKET_PASSWORD || '',
    pickupLocation: process.env.SHIPROCKET_PICKUP_LOCATION || '',
    pickupPincode: process.env.SHIPROCKET_DEFAULT_PICKUP_PINCODE || '',
});

/**
 * Which Shiprocket account to use, and where it came from: the admin panel's
 * saved credentials win; the .env ones apply until an admin has saved some.
 * { source: 'admin' | 'env' | 'none', config }.
 */
export function resolveShiprocketConfig() {
    if (adminConfig?.email && adminConfig?.password) {
        return { source: 'admin', config: adminConfig };
    }
    const env = envConfig();
    if (env.email && env.password) return { source: 'env', config: env };
    return { source: 'none', config: null };
}

function build() {
    const forced = String(process.env.SHIPPING_PROVIDER || '').toLowerCase();
    const { config } = resolveShiprocketConfig();
    const live = forced !== 'mock' && config && config.enabled !== false;
    const key = live ? JSON.stringify([config.email, config.password, config.pickupLocation, config.pickupPincode]) : 'mock';
    if (provider && key === builtFrom) return provider;
    builtFrom = key;
    if (live) {
        provider = new ShiprocketProvider({
            email: config.email,
            password: config.password,
            pickupLocation: config.pickupLocation,
            pickupPincode: config.pickupPincode,
        });
    } else {
        mock ||= new MockShippingProvider();
        provider = mock;
    }
    return provider;
}

/**
 * Shiprocket when credentials are set (admin panel, else .env), the mock
 * otherwise (local development and tests). SHIPPING_PROVIDER=mock forces the mock.
 */
export function getShippingProvider() {
    if (overridden) return provider;
    return build();
}

/**
 * Reads the admin panel's Shiprocket settings and rebuilds the provider when
 * they changed. Called at startup, after an admin saves, and every minute.
 */
export async function refreshShippingConfig() {
    try {
        const doc = await BusinessSettings.findOne().select(SHIPROCKET_SELECT).lean();
        const s = doc?.shiprocket || {};
        adminConfig = {
            enabled: s.enabled !== false,
            email: String(s.email || '').trim(),
            password: String(s.password || ''),
            pickupLocation: String(s.pickupLocation || '').trim(),
            pickupPincode: String(s.pickupPincode || '').trim(),
        };
    } catch (err) {
        // Keep the last good settings: a database blip must not drop live shipping to the mock.
        logger.warn(`Shipping settings could not be read: ${err.message}`);
        return getShippingProvider();
    }
    return getShippingProvider();
}

/** Starts the once-a-minute refresh (no-op if already running). */
export function startShippingConfigRefresh() {
    if (refreshTimer) return;
    refreshTimer = setInterval(() => { refreshShippingConfig(); }, REFRESH_MS);
    refreshTimer.unref?.();
}

/** Tests swap providers with this; pass nothing to go back to the configured one. */
export function setShippingProvider(p) {
    overridden = Boolean(p);
    provider = p || null;
    builtFrom = '';
}
