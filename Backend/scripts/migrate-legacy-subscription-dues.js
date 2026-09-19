/**
 * One-time migration: carries forward pre-redesign subscription dues
 * (seller.subscriptionDueAmount) into the new postpaid billing ledger
 * as a labeled 'legacy' invoice per seller.
 *
 * Idempotent: the unique {sellerId, billingMonth} index prevents duplicates.
 * Legacy seller fields are left untouched (frozen for audit).
 *
 * Usage:
 *   node scripts/migrate-legacy-subscription-dues.js             (dry run — reports only)
 *   node scripts/migrate-legacy-subscription-dues.js --live      (writes legacy invoices)
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import { connectDB, disconnectDB } from '../src/config/db.js';
import { Seller } from '../src/modules/commerce/seller/models/seller.model.js';
import { SubscriptionInvoice } from '../src/modules/commerce/seller/models/subscriptionInvoice.model.js';
import { SubscriptionTransaction } from '../src/modules/commerce/seller/models/subscriptionTransaction.model.js';

const isLive = process.argv.includes('--live');

const main = async () => {
    await connectDB();
    try {
        const sellers = await Seller.find({ subscriptionDueAmount: { $gt: 0 } })
            .select('sellerName subscriptionPlan subscriptionAmount subscriptionPaidAmount subscriptionDueAmount subscriptionStatus subscriptionValidTill subscriptionAutoDeductedAmount onboardingFeePaid')
            .lean();

        console.log(`[migrate-legacy-dues] ${isLive ? 'LIVE' : 'DRY RUN'} — ${sellers.length} sellers with legacy dues`);

        let created = 0;
        let skipped = 0;
        let totalCarried = 0;

        for (const seller of sellers) {
            const due = Math.round((Number(seller.subscriptionDueAmount) || 0) * 100) / 100;
            if (due <= 0) continue;

            const existing = await SubscriptionInvoice.findOne({
                sellerId: seller._id,
                billingMonth: 'legacy',
            }).select('_id').lean();

            if (existing) {
                skipped += 1;
                continue;
            }

            console.log(`  ${seller.sellerName || seller._id}: ₹${due}`);
            totalCarried += due;

            if (!isLive) continue;

            const invoice = await SubscriptionInvoice.create({
                sellerId: seller._id,
                billingMonth: 'legacy',
                periodStart: null,
                periodEnd: null,
                gmv: 0,
                orderCount: 0,
                planName: 'legacy',
                planAmount: due,
                gstAmount: 0,
                totalAmount: due,
                outstandingAmount: due,
                status: 'pending',
                isLegacyCarryForward: true,
                generatedBy: 'migration',
                notes: 'Outstanding due carried forward from the purchase-based subscription system',
                settingsSnapshot: {},
            });

            await SubscriptionTransaction.create({
                sellerId: seller._id,
                invoiceId: invoice._id,
                billingMonth: 'legacy',
                type: 'legacy_carryforward',
                amount: due,
                outstandingAfter: due,
                invoiceStatusAfter: 'pending',
                processedBy: { role: 'SYSTEM' },
                remarks: 'Pre-migration subscription due carried forward',
                metadata: {
                    legacySnapshot: {
                        subscriptionPlan: seller.subscriptionPlan || '',
                        subscriptionAmount: seller.subscriptionAmount || 0,
                        subscriptionPaidAmount: seller.subscriptionPaidAmount || 0,
                        subscriptionDueAmount: seller.subscriptionDueAmount || 0,
                        subscriptionStatus: seller.subscriptionStatus || '',
                        subscriptionValidTill: seller.subscriptionValidTill || null,
                        subscriptionAutoDeductedAmount: seller.subscriptionAutoDeductedAmount || 0,
                        onboardingFeePaid: Boolean(seller.onboardingFeePaid),
                    },
                },
            });

            created += 1;
        }

        console.log(`[migrate-legacy-dues] done: created=${created}, alreadyMigrated=${skipped}, totalCarried=₹${totalCarried}${isLive ? '' : ' (dry run — nothing written; re-run with --live)'}`);
    } finally {
        await disconnectDB().catch(() => mongoose.disconnect());
    }
};

main().catch((err) => {
    console.error('[migrate-legacy-dues] failed:', err);
    process.exit(1);
});
