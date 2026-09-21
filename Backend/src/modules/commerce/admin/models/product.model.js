import mongoose from 'mongoose';

/** One attribute value a variant carries, e.g. { name: 'Size', value: 'M' }. */
const variantAttributeSchema = new mongoose.Schema(
    {
        name: { type: String, required: true, trim: true },
        value: { type: String, required: true, trim: true },
    },
    { _id: false }
);

/**
 * One sellable version of a product: a size, a colour, a pack.
 *
 * Every field beyond name/price is optional, so the {name, price} variants that
 * already exist are valid as they stand and need no migration.
 *
 * Stock: `stockQty: null` means the variant has no count of its own and draws on
 * the product's `stockQty`, which is how pack-size variants of one shelf item
 * have always worked. A number means the variant is counted separately, as a
 * T-shirt in size M is.
 */
const productVariantSchema = new mongoose.Schema(
    {
        name: { type: String, required: true, trim: true },
        price: { type: Number, required: true, min: 0 },
        otherPrice: { type: Number, min: 0, default: 0 },
        /** Attribute values that identify this variant, in the order the seller picked them. */
        attributes: { type: [variantAttributeSchema], default: [] },
        sku: { type: String, trim: true, default: '' },
        barcode: { type: String, trim: true, default: '' },
        /** Printed MRP for this variant; falls back to the product's `mrp` when null. */
        mrp: { type: Number, min: 0, default: null },
        stockQty: { type: Number, min: 0, default: null },
        lowStockThreshold: { type: Number, min: 0, default: null },
        /** Set when the seller was told this variant ran low; cleared on restock. */
        lowStockNotifiedAt: { type: Date, default: null },
        /** Variant-specific photos, e.g. the red one. Empty means use the product's images. */
        images: { type: [String], default: [] },
        /** The seller's switch. Running out of stock does not change it; see `stockQty`. */
        isActive: { type: Boolean, default: true },
        /** Whether this variant can go by quick delivery; null inherits the product's setting. */
        quickEligible: { type: Boolean, default: null },
    },
    { _id: true }
);

const productSchema = new mongoose.Schema(
    {
        sellerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Seller', required: true, index: true },
        categoryId: { type: mongoose.Schema.Types.ObjectId, ref: 'Category', index: true },
        categoryName: { type: String, trim: true, default: '' },
        name: { type: String, required: true, trim: true, index: true },
        description: { type: String, trim: true, default: '' },
        price: { type: Number, required: true, min: 0 },
        /** Compare-at / other-platform price for strikethrough UI. Existing items stay 0. */
        otherPrice: { type: Number, min: 0, default: 0 },
        variants: { type: [productVariantSchema], default: [] },
        /**
         * The dish's primary image, kept as the first entry of [images].
         *
         * Retained as its own field rather than being derived: every existing
         * document has it, and the user app, admin list, share previews and push
         * payloads all read it. Dropping it would have meant a migration plus a
         * change in four consumers to gain nothing.
         */
        image: { type: String, trim: true, default: '' },

        /**
         * All images for the dish, primary first.
         *
         * Empty on existing documents, which is why every read falls back to
         * `image` rather than assuming this is populated.
         */
        images: { type: [String], default: [] },
        // Optional veg / non-veg mark; null for products it does not apply to. See shared/foodType.js.
        foodType: { type: String, enum: ['Veg', 'Non-Veg', null], default: null },
        /** Manufacturer, for the grocery listing where two sellers stock the same product. */
        brand: { type: String, trim: true, default: '' },
        /** What one unit is: "500 g", "1 L", "pack of 6". Free text, since packs are not standard. */
        packSize: { type: String, trim: true, default: '' },
        /**
         * The seller's own stock-keeping code.
         *
         * Indexed but deliberately not unique: sellers pick their own codes and
         * two of them will collide, so uniqueness could only ever be per-seller,
         * and enforcing it globally would reject a legitimate second seller.
         */
        sku: { type: String, trim: true, default: '', index: true },
        /**
         * Scanned barcode (EAN/UPC). Distinct from `sku`: a barcode identifies
         * the manufactured product, an SKU identifies the seller's shelf entry,
         * and searching by one must not silently match the other.
         */
        barcode: { type: String, trim: true, default: '', index: true },
        /**
         * Batch expiry. Null means non-perishable or simply not tracked — the
         * two are indistinguishable here and both mean "never flag this".
         *
         * Date, not string, so a range query can find what expires this week.
         */
        expiryDate: { type: Date, default: null, index: true },
        /**
         * Printed maximum retail price, shown struck through next to `price`.
         *
         * Kept separate from `otherPrice`, which is a compare-at price against
         * other platforms. Selling above MRP is illegal, so this one is a
         * constraint, not a marketing number, and conflating them would make
         * that check impossible to write.
         */
        mrp: { type: Number, min: 0, default: null },
        /**
         * GST percentage for this product. Groceries span 0/5/12/18, so the
         * single order-wide rate the food flow used is wrong here.
         *
         * `null` falls back to the order-wide rate in fee settings, which is
         * what every item created before this field existed does.
         */
        gstRate: { type: Number, min: 0, max: 100, default: null },
        isAvailable: { type: Boolean, default: true, index: true },
        /**
         * Whether the product can go by quick (~30 min) delivery. Bulky or
         * made-to-order items are standard-delivery only. Defaults to true
         * because every existing product is a quick-commerce product.
         */
        quickEligible: { type: Boolean, default: true },
        /** Free-text search keywords the seller adds ("tee", "cotton", "gift"). */
        tags: { type: [String], default: [] },
        /**
         * Units on hand. `null` means untracked — the item behaves exactly as it
         * did before inventory existed, which is what every already-created
         * document gets, so nothing needs a migration to keep selling.
         *
         * Variants with their own `stockQty` are counted there instead; this
         * count covers the product itself and any variants without one.
         */
        stockQty: { type: Number, default: null, min: 0 },
        /** Below this, the item is flagged to the seller. `null` disables the flag. */
        lowStockThreshold: { type: Number, default: null, min: 0 },
        /** Set when the seller was told this item ran low; cleared on restock. */
        lowStockNotifiedAt: { type: Date, default: null },
        /** Cap per single order, so one buyer cannot clear the shelf. `null` = uncapped. */
        maxQtyPerOrder: { type: Number, default: null, min: 1 },
        /** Running average of per-dish ratings left by customers. */
        rating: { type: Number, default: 0, min: 0, max: 5 },
        totalRatings: { type: Number, default: 0, min: 0 },
        /** When set, item auto-restores to available after this time (server-side). */
        stockResumeAt: { type: Date, index: true },
        stockOffMode: {
            type: String,
            enum: ['manual', 'specific-time', 'next-business-day', 'custom-date-time'],
            default: undefined
        },
        isRecommended: { type: Boolean, default: false, index: true },
        preparationTime: { type: String, trim: true, default: '' },
        approvalStatus: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'approved', index: true },
        rejectionReason: { type: String, trim: true, default: '' },
        requestedAt: { type: Date },
        approvedAt: { type: Date },
        rejectedAt: { type: Date }
    },
    {
        collection: 'products',
        timestamps: true
    }
);

productSchema.index({ sellerId: 1, createdAt: -1 });
productSchema.index({ approvalStatus: 1, createdAt: -1 });
productSchema.index({ approvalStatus: 1, requestedAt: -1 });
productSchema.index({ sellerId: 1, approvalStatus: 1, createdAt: -1 });
// Search: relevance-ranked words over what a shopper types. Weights favour the
// name, then brand and tags; the description only breaks ties.
productSchema.index(
    { name: 'text', brand: 'text', tags: 'text', categoryName: 'text', description: 'text' },
    { name: 'product_text', weights: { name: 10, brand: 5, tags: 5, categoryName: 3, description: 1 }, default_language: 'english' }
);
// Attribute filters ("size M", "colour red") match on variants.
productSchema.index({ 'variants.attributes.name': 1, 'variants.attributes.value': 1 });

export const Product = mongoose.model('Product', productSchema);
