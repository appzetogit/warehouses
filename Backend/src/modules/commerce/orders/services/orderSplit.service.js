import mongoose from 'mongoose';
import { Checkout } from '../models/checkout.model.js';
import { Order } from '../models/order.model.js';
import { Seller } from '../../seller/models/seller.model.js';
import { ValidationError } from '../../../../core/auth/errors.js';
import { logger } from '../../../../utils/logger.js';
import { reserveStockForItems, releaseReservations, restoreOrderStock } from './inventory.service.js';
import { calculateOrderPricing, loadActiveFeeSettings } from './order-pricing.service.js';
import { normalizeDeliveryAddress } from '../../shared/geo.utils.js';
import { readAddressPoint } from '../../shared/zoneServiceability.js';
import { getRedeemableForOrder, redeemCoins } from '../../coins/services/coin.service.js';
import { createOrder } from './order.service.js';
import { UserCart } from '../../user/models/userCart.model.js';

const toOid = (val, field = 'id') => {
    const s = String(val || '');
    if (!mongoose.Types.ObjectId.isValid(s)) throw new ValidationError(`Invalid ${field}`);
    return new mongoose.Types.ObjectId(s);
};

export function generateCheckoutId() {
    const timePart = Date.now().toString(36).toUpperCase();
    const randPart = Math.random().toString(36).substring(2, 6).toUpperCase();
    return `CHK-${timePart}-${randPart}`;
}

/**
 * Calculates itemized pricing per seller and aggregated checkout pricing with platform coins.
 */
export async function calculateCheckoutPricing(userId, dto = {}) {
    const items = Array.isArray(dto.items) ? dto.items : [];
    if (!items.length) {
        throw new ValidationError('Checkout must contain at least one item');
    }

    const fulfilmentMode = dto.fulfilmentMode === 'standard' ? 'standard' : 'quick';
    const deliveryAddress = normalizeDeliveryAddress(dto.deliveryAddress || dto.address || {});

    // Group items by sellerId
    const itemsBySeller = new Map();
    for (const item of items) {
        const sellerId = String(item.sellerId || item.seller?._id || item.seller || '').trim();
        if (!sellerId || !mongoose.Types.ObjectId.isValid(sellerId)) {
            throw new ValidationError(`Item ${item.name || item.itemId || ''} has no valid seller ID`);
        }
        if (!itemsBySeller.has(sellerId)) {
            itemsBySeller.set(sellerId, []);
        }
        itemsBySeller.get(sellerId).push(item);
    }

    const sellerIds = [...itemsBySeller.keys()];
    const childPricings = [];

    let totalSubtotal = 0;
    let totalTax = 0;
    let totalPackagingFee = 0;
    let totalDeliveryFee = 0;
    let totalPlatformFee = 0;
    let totalSellerDiscount = 0;

    for (const sellerId of sellerIds) {
        const sellerItems = itemsBySeller.get(sellerId);
        const pricingResult = await calculateOrderPricing(
            userId,
            {
                sellerId,
                items: sellerItems,
                deliveryAddress,
                couponCode: dto.couponCode || undefined,
                deliveryMode: fulfilmentMode === 'quick' ? 'quick' : 'basic',
            },
            { skipAvailabilityCheck: true }
        );

        const p = pricingResult.pricing;
        totalSubtotal += p.subtotal;
        totalTax += p.tax;
        totalPackagingFee += p.packagingFee || 0;
        totalDeliveryFee += p.deliveryFee;
        totalPlatformFee += p.platformFee || 0;
        totalSellerDiscount += p.discount || 0;

        childPricings.push({
            sellerId,
            items: pricingResult.items,
            pricing: p,
        });
    }

    // Platform Coins Application (Decision B3: Max 50% order payable by coins)
    let coinsUsed = 0;
    let coinsDiscount = 0;
    const requestedCoins = Math.max(0, Math.floor(Number(dto.coins) || 0));

    if (requestedCoins > 0 && userId) {
        const orderSubtotal = Math.max(0, totalSubtotal - totalSellerDiscount);
        const { coins: maxRedeemable, value: maxCoinValue } = await getRedeemableForOrder(userId, orderSubtotal);
        coinsUsed = Math.min(requestedCoins, maxRedeemable);
        coinsDiscount = Math.min(coinsUsed, maxCoinValue);
    }

    // Allocate coins proportionally across child orders
    if (coinsDiscount > 0 && totalSubtotal > 0) {
        let remainingCoinDiscount = coinsDiscount;
        childPricings.forEach((child, index) => {
            if (index === childPricings.length - 1) {
                child.coinsDiscount = remainingCoinDiscount;
            } else {
                const proportion = child.pricing.subtotal / totalSubtotal;
                const allocated = Math.round(coinsDiscount * proportion);
                child.coinsDiscount = Math.min(allocated, remainingCoinDiscount);
                remainingCoinDiscount -= child.coinsDiscount;
            }
            child.coinsUsed = child.coinsDiscount; // 1 coin = 1 INR
        });
    } else {
        childPricings.forEach((child) => {
            child.coinsDiscount = 0;
            child.coinsUsed = 0;
        });
    }

    const totalDiscount = totalSellerDiscount + coinsDiscount;
    const grandTotal = Math.max(
        0,
        Math.round((totalSubtotal + totalTax + totalPackagingFee + totalDeliveryFee + totalPlatformFee - totalDiscount) * 100) / 100
    );

    return {
        fulfilmentMode,
        subtotal: totalSubtotal,
        tax: totalTax,
        packagingFee: totalPackagingFee,
        deliveryFee: totalDeliveryFee,
        platformFee: totalPlatformFee,
        discount: totalDiscount,
        sellerDiscount: totalSellerDiscount,
        coinsUsed,
        coinsDiscount,
        grandTotal,
        childPricings,
    };
}

/**
 * Creates parent Checkout and split child orders atomically across all sellers.
 */
export async function createSplitCheckout(userId, dto = {}) {
    const userOid = toOid(userId, 'user ID');
    const items = Array.isArray(dto.items) ? dto.items : [];
    if (!items.length) {
        throw new ValidationError('No items provided for checkout');
    }

    const deliveryAddress = normalizeDeliveryAddress(dto.deliveryAddress || dto.address || {});
    if (!readAddressPoint(deliveryAddress)) {
        throw new ValidationError('Delivery address is missing geographic coordinates');
    }

    const pricingCalculation = await calculateCheckoutPricing(userId, {
        items,
        deliveryAddress,
        fulfilmentMode: dto.fulfilmentMode,
        couponCode: dto.couponCode,
        coins: dto.coins,
    });

    const checkoutId = generateCheckoutId();
    const sellerIds = pricingCalculation.childPricings.map((c) => toOid(c.sellerId, 'sellerId'));

    // 1. Create parent Checkout record
    const checkout = await Checkout.create({
        checkoutId,
        userId: userOid,
        fulfilmentMode: pricingCalculation.fulfilmentMode,
        sellerIds,
        customerAddress: deliveryAddress,
        pricing: {
            subtotal: pricingCalculation.subtotal,
            tax: pricingCalculation.tax,
            packagingFee: pricingCalculation.packagingFee,
            deliveryFee: pricingCalculation.deliveryFee,
            platformFee: pricingCalculation.platformFee,
            discount: pricingCalculation.discount,
            coinsUsed: pricingCalculation.coinsUsed,
            coinsDiscount: pricingCalculation.coinsDiscount,
            couponCode: dto.couponCode || null,
            grandTotal: pricingCalculation.grandTotal,
            currency: 'INR',
        },
        payment: {
            method: dto.paymentMethod || 'cash',
            status: dto.paymentMethod === 'cash' ? 'cod_pending' : 'pending',
            gatewayOrderId: '',
            gatewayPaymentId: '',
        },
        status: 'confirmed',
        appliedCoupon: dto.appliedCoupon || null,
    });

    // 2. Create Child Orders for each seller with rollback protection
    const createdChildOrders = [];
    const childOrderIds = [];
    const childOrderCodes = [];

    try {
        for (const childPricing of pricingCalculation.childPricings) {
            const childResult = await createOrder(userId, {
                sellerId: String(childPricing.sellerId),
                items: childPricing.items,
                address: deliveryAddress,
                paymentMethod: dto.paymentMethod || 'cash',
                deliveryMode: pricingCalculation.fulfilmentMode === 'quick' ? 'quick' : 'basic',
                pricing: {
                    couponCode: dto.couponCode,
                },
                scheduledAt: dto.scheduledAt,
            });

            const childDoc = childResult.order;
            await Order.updateOne(
                { _id: childDoc._id },
                {
                    $set: {
                        checkoutId: checkout._id,
                        orderGroupId: checkoutId,
                        fulfilmentMode: pricingCalculation.fulfilmentMode,
                        coinsUsed: childPricing.coinsUsed || 0,
                        coinsDiscount: childPricing.coinsDiscount || 0,
                    },
                }
            );

            childDoc.checkoutId = checkout._id;
            childDoc.orderGroupId = checkoutId;
            childDoc.coinsUsed = childPricing.coinsUsed || 0;
            childDoc.coinsDiscount = childPricing.coinsDiscount || 0;

            createdChildOrders.push(childDoc);
            childOrderIds.push(childDoc._id);
            childOrderCodes.push(childDoc.order_id || childDoc.orderId);
        }

        // Update checkout with child order references
        checkout.childOrderIds = childOrderIds;
        checkout.childOrderCodes = childOrderCodes;
        await checkout.save();

        // 3. Redeem coins if applied
        if (pricingCalculation.coinsUsed > 0) {
            await redeemCoins({
                userId,
                orderId: checkout._id,
                coins: pricingCalculation.coinsUsed,
            });
        }

        // 4. Clear Cart for the user
        await UserCart.deleteOne({ userId: userOid });

        return {
            checkout,
            childOrders: createdChildOrders,
            pricing: pricingCalculation,
        };
    } catch (err) {
        // Roll back any child orders created so far
        for (const ord of createdChildOrders) {
            try {
                await restoreOrderStock(ord);
                await Order.deleteOne({ _id: ord._id });
            } catch (rbErr) {
                logger.error(`Failed to rollback child order ${ord._id}: ${rbErr.message}`);
            }
        }
        await Checkout.deleteOne({ _id: checkout._id });
        logger.error(`[CRITICAL] Split checkout creation failed, rolled back: ${err.message}`);
        throw err;
    }
}

/**
 * Get checkout by human checkoutId with child order details.
 */
export async function getCheckoutById(checkoutId, userId) {
    const query = { checkoutId: String(checkoutId) };
    if (userId) {
        query.userId = toOid(userId, 'user ID');
    }
    const checkout = await Checkout.findOne(query).populate('childOrderIds').lean();
    if (!checkout) {
        throw new ValidationError('Checkout not found');
    }
    return checkout;
}
