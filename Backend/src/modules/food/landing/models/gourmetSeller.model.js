import mongoose from 'mongoose';

const foodGourmetSellerSchema = new mongoose.Schema(
    {
        sellerId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'FoodSeller',
            required: true
        },
        tags: {
            type: [String],
            default: []
        },
        priority: {
            type: Number,
            default: 0,
            index: true
        },
        isActive: {
            type: Boolean,
            default: true,
            index: true
        }
    },
    {
        collection: 'food_gourmet_sellers',
        timestamps: true
    }
);

foodGourmetSellerSchema.index({ sellerId: 1 });
foodGourmetSellerSchema.index({ isActive: 1, priority: 1 });

export const FoodGourmetSeller = mongoose.model('FoodGourmetSeller', foodGourmetSellerSchema);

