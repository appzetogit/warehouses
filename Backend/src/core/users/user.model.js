import mongoose from 'mongoose';
import { logger } from '../../utils/logger.js';

const userAddressSchema = new mongoose.Schema(
    {
        label: {
            type: String,
            enum: ['Home', 'Office', 'Other'],
            default: 'Home',
            index: true
        },
        street: {
            type: String,
            required: true,
            trim: true
        },
        additionalDetails: {
            type: String,
            default: '',
            trim: true
        },
        city: {
            type: String,
            required: true,
            trim: true
        },
        state: {
            type: String,
            required: true,
            trim: true
        },
        zipCode: {
            type: String,
            default: '',
            trim: true
        },
        phone: {
            type: String,
            default: '',
            trim: true
        },
        location: {
            type: {
                type: String,
                enum: ['Point'],
                default: 'Point'
            },
            coordinates: {
                // [lng, lat]
                type: [Number],
                default: undefined,
                validate: {
                    validator: (v) =>
                        v === undefined ||
                        (Array.isArray(v) && v.length === 2 && v.every((n) => typeof n === 'number' && Number.isFinite(n))),
                    message: 'location.coordinates must be [lng, lat]'
                }
            }
        },
        isDefault: {
            type: Boolean,
            default: false,
            index: true
        }
    },
    { _id: true, timestamps: true }
);

const userSchema = new mongoose.Schema(
    {
        // Empty for an account made by email sign-in; such a user gives a
        // contact number on the delivery address instead.
        phone: {
            type: String,
            default: '',
            trim: true
        },
        countryCode: {
            type: String,
            default: '+91'
        },
        name: {
            type: String
        },
        email: {
            type: String
        },
        profileImage: {
            type: String,
            default: ''
        },
        fcmTokens: {
            type: [String],
            default: []
        },
        fcmTokenMobile: {
            type: [String],
            default: []
        },
        dateOfBirth: {
            type: Date,
            default: null
        },
        anniversary: {
            type: Date,
            default: null
        },
        gender: {
            type: String,
            enum: ['male', 'female', 'other', 'prefer-not-to-say', ''],
            default: ''
        },
        referralCode: {
            type: String
        },
        referredBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            default: null,
            index: true
        },
        referralCount: {
            type: Number,
            default: 0,
            min: 0
        },
        isVerified: {
            type: Boolean,
            default: false
        },
        isActive: {
            type: Boolean,
            default: true,
            index: true
        },
        role: {
            type: String,
            default: 'USER'
        },
        addresses: {
            type: [userAddressSchema],
            default: []
        },
        /** Running average of ratings left by delivery partners. */
        rating: { type: Number, default: 0, min: 0, max: 5 },
        totalRatings: { type: Number, default: 0, min: 0 },
        /**
         * Bumped on every successful login, and embedded in the JWT that login
         * issues. A token whose version is behind the stored one is rejected, so
         * signing in on a new device silently invalidates every older device
         * rather than leaving the account live in two places at once.
         */
        tokenVersion: { type: Number, default: 0 }
    },
    {
        collection: 'users',
        timestamps: true
    }
);

// Unique among accounts that have a phone; email-only accounts (phone '') are
// not indexed, so any number of them can exist.
export const USER_PHONE_INDEX_OPTIONS = { unique: true, partialFilterExpression: { phone: { $gt: '' } } };
userSchema.index({ phone: 1 }, USER_PHONE_INDEX_OPTIONS);
userSchema.index({ email: 1 });
userSchema.index({ 'addresses.location': '2dsphere' });

export const User = mongoose.model('User', userSchema);

let phoneIndexChecked = false;
/**
 * Databases made before email sign-in have a plain unique index on phone, which
 * lets only one account have no phone. Swap it for the partial one, once per
 * process; called before an email-only account is created.
 */
export async function ensureUserPhoneIndex() {
    if (phoneIndexChecked) return;
    // Let Mongoose's own startup index build finish first; on an old database it
    // fails on the legacy index, which is what this replaces.
    await User.init().catch(() => {});
    try {
        const indexes = await User.collection.indexes();
        const legacy = indexes.find(
            (ix) => ix.unique && ix.key && Object.keys(ix.key).length === 1 && ix.key.phone === 1 && !ix.partialFilterExpression
        );
        if (legacy) await User.collection.dropIndex(legacy.name);
        await User.createIndexes();
        phoneIndexChecked = true;
    } catch (err) {
        logger.warn(`User phone index check failed: ${err?.message || err}`);
        // collection may not exist yet; try again next time
    }
}

