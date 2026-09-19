import mongoose from 'mongoose';

const diningSellerSchema = new mongoose.Schema(
    {
        sellerId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'FoodSeller',
            required: true,
            unique: true
        },
        categoryIds: [
            {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'FoodDiningCategory'
            }
        ],
        primaryCategoryId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'FoodDiningCategory',
            default: null
        },
        isEnabled: {
            type: Boolean,
            default: false
        },
        maxGuests: {
            type: Number,
            default: 6,
            min: 1
        },
        pureVegSeller: {
            type: Boolean,
            required: true,
            default: false
        }
    },
    {
        collection: 'food_dining_sellers',
        timestamps: true
    }
);

diningSellerSchema.index({ sellerId: 1 }, { unique: true });
diningSellerSchema.index({ isEnabled: 1, primaryCategoryId: 1 });

export const FoodDiningSeller = mongoose.model('FoodDiningSeller', diningSellerSchema);
