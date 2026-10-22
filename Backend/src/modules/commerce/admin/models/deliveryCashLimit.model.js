import mongoose from 'mongoose';

const deliveryCashLimitSchema = new mongoose.Schema(
    {
        deliveryCashLimit: { type: Number, default: 0, min: 0 },
        deliveryWithdrawalLimit: { type: Number, default: 100, min: 0 },
        /** Most a rider may withdraw in one request, as a % of the current wallet balance. */
        deliveryWithdrawalMaxPercent: { type: Number, default: 10, min: 1, max: 100 },
        isActive: { type: Boolean, default: true, index: true }
    },
    { collection: 'delivery_cash_limits', timestamps: true }
);

deliveryCashLimitSchema.index({ isActive: 1, createdAt: -1 });

export const DeliveryCashLimit = mongoose.model('DeliveryCashLimit', deliveryCashLimitSchema);

