/**
 * Which ways to pay checkout offers, switched from the admin panel without a deploy.
 *
 * The admin's choice (business settings `paymentSwitches`) wins. Until an admin
 * has set one, the server's ONLINE_PAYMENTS_ENABLED / COD_ENABLED decide.
 */
import { BusinessSettings } from '../../modules/commerce/admin/models/businessSettings.model.js';

const envOnline = () => String(process.env.ONLINE_PAYMENTS_ENABLED ?? 'true').trim().toLowerCase() !== 'false';
const envCashOnDelivery = () => String(process.env.COD_ENABLED || 'true') === 'true';

let cached = null;
let cachedAt = 0;
const TTL_MS = 30 * 1000;

/** Drops the cached admin switches so the next checkout reads the saved ones. */
export function clearPaymentSwitchCache() {
    cached = null;
    cachedAt = 0;
}

async function adminSwitches() {
    if (cached && Date.now() - cachedAt < TTL_MS) return cached;
    const doc = await BusinessSettings.findOne().select('paymentSwitches').lean();
    cached = doc?.paymentSwitches || {};
    cachedAt = Date.now();
    return cached;
}

/** { online, cashOnDelivery } as checkout applies them right now. */
export async function getPaymentSwitches() {
    const saved = await adminSwitches();
    return {
        online: typeof saved.online === 'boolean' ? saved.online : envOnline(),
        cashOnDelivery: typeof saved.cashOnDelivery === 'boolean' ? saved.cashOnDelivery : envCashOnDelivery(),
    };
}

/** Whether customers may pay online at checkout. Refunds of earlier online payments work either way. */
export async function onlinePaymentsEnabled() {
    return (await getPaymentSwitches()).online;
}

/** Whether customers may choose cash on delivery. */
export async function cashOnDeliveryEnabled() {
    return (await getPaymentSwitches()).cashOnDelivery;
}
