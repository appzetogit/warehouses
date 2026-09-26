import mongoose from 'mongoose';

/**
 * A customer's request to send back some lines of a delivered, courier-shipped
 * (standard) order. One open request per order at a time (`openKey`).
 *
 * requested -> approved -> received -> refunded   (resolution 'refund')
 *                                    \-> replaced   (resolution 'replacement': a
 *                                        free replacement order is created)
 *           \-> rejected
 */
export const RETURN_STATUSES = ['requested', 'approved', 'rejected', 'received', 'refunded', 'replaced'];
export const RETURN_RESOLUTIONS = ['refund', 'replacement'];
export const OPEN_RETURN_STATUSES = ['requested', 'approved', 'received'];

const returnItemSchema = new mongoose.Schema(
    {
        itemId: { type: String, required: true, trim: true },
        variantId: { type: String, default: '', trim: true },
        name: { type: String, default: '', trim: true },
        image: { type: String, default: '' },
        price: { type: Number, default: 0, min: 0 },
        quantity: { type: Number, required: true, min: 1 },
        /** Replacement only: the variant to send instead (same product; another size or colour), else the same one. */
        replacementVariantId: { type: String, default: '', trim: true },
        replacementVariantName: { type: String, default: '', trim: true },
    },
    { _id: false }
);

const returnRequestSchema = new mongoose.Schema(
    {
        orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', required: true, index: true },
        orderReadableId: { type: String, default: '' },
        userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
        sellerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Seller', required: true, index: true },
        items: { type: [returnItemSchema], validate: (v) => Array.isArray(v) && v.length > 0 },
        reason: { type: String, required: true, trim: true, maxlength: 500 },
        comment: { type: String, default: '', trim: true, maxlength: 1000 },
        photos: { type: [String], default: [] },
        /** 'refund' gives the money back; 'replacement' sends the items (or another size) again. */
        resolution: { type: String, enum: RETURN_RESOLUTIONS, default: 'refund' },
        /** 'original' (payment method of the order) or 'coins'. Also used if a replacement can't be sent. */
        refundTo: { type: String, enum: ['original', 'coins'], default: 'original' },
        /** The free order created for a replacement. */
        replacementOrder: {
            orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', default: null },
            orderReadableId: { type: String, default: '' },
            createdAt: { type: Date, default: null },
        },
        replacedAt: Date,
        status: { type: String, enum: RETURN_STATUSES, default: 'requested', index: true },
        /** Set to the order id while the request is open; unique, so one open return per order. */
        openKey: { type: String, default: undefined },
        /** Money and coins this return gives back, fixed when it is requested. */
        amounts: {
            itemsValue: { type: Number, default: 0 },
            refundAmount: { type: Number, default: 0 },
            coinsBack: { type: Number, default: 0 },
        },
        rejectionReason: { type: String, default: '' },
        /** Set once the returned units went back on the shelf (the order's channel); guards a double restock. */
        restockedAt: { type: Date, default: null },
        reverseShipment: { type: mongoose.Schema.Types.Mixed, default: null },
        refund: {
            status: { type: String, enum: ['none', 'processing', 'processed', 'failed', 'not_applicable'], default: 'none' },
            method: { type: String, default: '' },
            amount: { type: Number, default: 0 },
            refundId: { type: String, default: '' },
            error: { type: String, default: '' },
            processedAt: { type: Date, default: null },
        },
        history: {
            type: [
                {
                    _id: false,
                    at: { type: Date, default: Date.now },
                    status: String,
                    byRole: String,
                    byId: String,
                    note: String,
                },
            ],
            default: [],
        },
        approvedAt: Date,
        rejectedAt: Date,
        receivedAt: Date,
        refundedAt: Date,
    },
    { timestamps: true, collection: 'return_requests' }
);

returnRequestSchema.index({ openKey: 1 }, { unique: true, partialFilterExpression: { openKey: { $type: 'string' } } });
returnRequestSchema.index({ status: 1, createdAt: -1 });

export const ReturnRequest =
    mongoose.models.ReturnRequest || mongoose.model('ReturnRequest', returnRequestSchema);
