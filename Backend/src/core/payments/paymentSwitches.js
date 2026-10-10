/**
 * Which ways to pay checkout offers, switched on the server without a deploy.
 */

/**
 * Whether customers may pay online at checkout. Off (ONLINE_PAYMENTS_ENABLED=false)
 * while only test keys are configured: the store takes cash on delivery, and
 * refunds of earlier online payments keep working.
 */
export function onlinePaymentsEnabled() {
    return String(process.env.ONLINE_PAYMENTS_ENABLED ?? 'true').trim().toLowerCase() !== 'false';
}

/** Whether customers may choose cash on delivery (COD_ENABLED, on unless set to anything but "true"). */
export function cashOnDeliveryEnabled() {
    return String(process.env.COD_ENABLED || 'true') === 'true';
}
