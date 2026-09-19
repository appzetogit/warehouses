import mongoose from 'mongoose';

const sellerMenuSchema = new mongoose.Schema(
    {
        sellerId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'FoodSeller',
            required: true,
            unique: true,
            index: true
        },
        // Stored as-is for UI; validated at service layer.
        sections: {
            type: [mongoose.Schema.Types.Mixed],
            default: []
        }
    },
    {
        collection: 'food_seller_menus',
        timestamps: true
    }
);

export const FoodSellerMenu = mongoose.model('FoodSellerMenu', sellerMenuSchema);

