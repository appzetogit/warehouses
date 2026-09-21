import { logger } from '../../utils/logger.js';

/**
 * BullMQ processor for automated maintenance tasks.
 * @param {import('bullmq').Job} job
 */
export const processMaintenanceJob = async (job) => {
    const data = job?.data || {};
    const type = data.type || 'unknown';

    logger.info(`[BullMQ:maintenance] type=${type} jobId=${job.id}`);

    if (type === 'MONTHLY_SUBSCRIPTION_BILLING') {
        try {
            const { runBillingCatchUp } = await import('../../modules/commerce/seller/services/subscriptionBilling.service.js');
            const results = await runBillingCatchUp();
            logger.info(`[BullMQ:maintenance] MONTHLY_SUBSCRIPTION_BILLING complete: ${JSON.stringify(results)}`);
        } catch (err) {
            logger.error(`[BullMQ:maintenance] MONTHLY_SUBSCRIPTION_BILLING failed: ${err.message}`);
            throw err;
        }
    }

    if (type === 'FSSAI_EXPIRY_CHECK') {
        try {
            const { syncExpiredFssaiNotifications } = await import('../../modules/commerce/seller/services/fssaiExpiry.service.js');
            const results = await syncExpiredFssaiNotifications();
            logger.info(`[BullMQ:maintenance] FSSAI_EXPIRY_CHECK complete. Total Expired: ${results.totalExpired}, Notifications: ${results.createdCount}`);
        } catch (err) {
            logger.error(`[BullMQ:maintenance] FSSAI_EXPIRY_CHECK failed: ${err.message}`);
            throw err;
        }
    }

    if (type === 'COIN_EXPIRY_CHECK') {
        try {
            const { expireDueLots } = await import('../../modules/commerce/coins/services/coin.service.js');
            const results = await expireDueLots();
            logger.info(`[BullMQ:maintenance] COIN_EXPIRY_CHECK complete: ${JSON.stringify(results)}`);
        } catch (err) {
            logger.error(`[BullMQ:maintenance] COIN_EXPIRY_CHECK failed: ${err.message}`);
            throw err;
        }
    }

    if (type === 'DAILY_METRICS_AGGREGATION') {
        try {
            const { aggregateDailyMetrics } = await import('../../modules/commerce/admin/services/dailyMetrics.service.js');
            const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
            const results = await aggregateDailyMetrics(yesterday);
            logger.info(`[BullMQ:maintenance] DAILY_METRICS_AGGREGATION complete for date=${results?.date}`);
        } catch (err) {
            logger.error(`[BullMQ:maintenance] DAILY_METRICS_AGGREGATION failed: ${err.message}`);
            throw err;
        }
    }

    return { processed: true, type, jobId: job.id };
};
