import { Order } from '../models/order.model.js';
import { Seller } from '../../seller/models/seller.model.js';
import { notifyOwnersSafely } from './order.helpers.js';
import { orderNo } from '../../shared/notificationCopy.js';
import { logger } from '../../../../utils/logger.js';

/**
 * Shop (courier) orders wait on the store without a deadline. Instead of
 * cancelling them, the store is reminded after FIRST_REMINDER_HOURS and again
 * after SECOND_REMINDER_HOURS, when support is alerted too and the order shows
 * on the admin "Waiting for store" list.
 */
export const FIRST_REMINDER_HOURS = 2;
export const SECOND_REMINDER_HOURS = 24;

const HOUR_MS = 60 * 60 * 1000;

/** Shop orders still waiting on the store since at or before `before`. */
export function waitingOnStoreFilter(before, extra = {}) {
    return {
        fulfilmentMode: 'standard',
        orderStatus: 'created',
        $or: [
            { awaitingSellerSince: { $lte: before } },
            // Orders placed before awaitingSellerSince existed.
            { awaitingSellerSince: null, createdAt: { $lte: before } },
        ],
        ...extra,
    };
}

const waitingSince = (order) => new Date(order.awaitingSellerSince || order.createdAt);

/** Whole hours an order has waited, at least 1. */
export const hoursWaiting = (order, now = new Date()) =>
    Math.max(1, Math.floor((now - waitingSince(order)) / HOUR_MS));

/**
 * One pass: remind stores about Shop orders left waiting. Each reminder is
 * claimed with a conditional update first, so overlapping runs (several
 * server processes, a slow pass) never send the same one twice.
 */
export async function remindStoresOfWaitingShopOrders(now = new Date()) {
    let first = 0;
    let second = 0;

    const send = async (field, hours, onClaimed) => {
        const due = await Order.find(
            waitingOnStoreFilter(new Date(now.getTime() - hours * HOUR_MS), { [`sellerReminders.${field}`]: null }),
        )
            .select('_id order_id sellerId awaitingSellerSince createdAt fulfilmentMode')
            .limit(100)
            .lean();
        for (const order of due) {
            const claimed = await Order.updateOne(
                { _id: order._id, orderStatus: 'created', [`sellerReminders.${field}`]: null },
                { $set: { [`sellerReminders.${field}`]: now } },
            );
            if (!claimed.modifiedCount) continue;
            await onClaimed(order);
        }
    };

    await send('firstAt', FIRST_REMINDER_HOURS, async (order) => {
        first += 1;
        await notifyOwnersSafely([{ ownerType: 'SELLER', ownerId: order.sellerId }], {
            title: `Order ${orderNo(order)} is waiting for you`,
            body: `The customer has waited ${hoursWaiting(order, now)}h. Accept it, or reject it with a reason so they are refunded.`,
            data: { type: 'shop_order_waiting', orderId: String(order._id) },
        });
    });

    await send('secondAt', SECOND_REMINDER_HOURS, async (order) => {
        second += 1;
        const hours = hoursWaiting(order, now);
        await notifyOwnersSafely([{ ownerType: 'SELLER', ownerId: order.sellerId }], {
            title: `Order ${orderNo(order)} still needs your answer`,
            body: `It has waited ${hours}h. Please accept or reject it today.`,
            data: { type: 'shop_order_waiting', orderId: String(order._id) },
        });
        await notifyOwnersSafely([{ ownerType: 'ADMIN', ownerId: 'GLOBAL' }], {
            title: 'Shop order waiting on a store',
            body: `Order ${orderNo(order)} has waited ${hours}h for the store. See Orders > Waiting for store.`,
            data: { type: 'admin_alert_store_waiting', orderId: String(order._id), link: '/admin/shop/orders/awaiting-store' },
        });
    });

    if (first || second) logger.info(`Shop order reminders: ${first} first, ${second} second`);
    return { first, second };
}

/** Admin: Shop orders that have waited on their store for more than `hours`. */
export async function listOrdersAwaitingStore({ hours = SECOND_REMINDER_HOURS, now = new Date() } = {}) {
    const h = Math.min(Math.max(Number(hours) || SECOND_REMINDER_HOURS, 1), 24 * 30);
    const orders = await Order.find(waitingOnStoreFilter(new Date(now.getTime() - h * HOUR_MS)))
        .select('_id order_id sellerId customerName customerPhone pricing.total payment.method awaitingSellerSince createdAt sellerReminders')
        .sort({ awaitingSellerSince: 1, createdAt: 1 })
        .limit(500)
        .lean();
    const sellers = await Seller.find({ _id: { $in: [...new Set(orders.map((o) => String(o.sellerId)))] } })
        .select('_id sellerName')
        .lean();
    const nameOf = new Map(sellers.map((s) => [String(s._id), s.sellerName]));
    return {
        hours: h,
        orders: orders.map((o) => ({
            _id: o._id,
            order_id: o.order_id,
            sellerId: o.sellerId,
            sellerName: nameOf.get(String(o.sellerId)) || '',
            customerName: o.customerName || '',
            customerPhone: o.customerPhone || '',
            total: Number(o.pricing?.total) || 0,
            paymentMethod: o.payment?.method || '',
            waitingSince: waitingSince(o),
            hoursWaiting: hoursWaiting(o, now),
            reminders: { firstAt: o.sellerReminders?.firstAt || null, secondAt: o.sellerReminders?.secondAt || null },
        })),
    };
}
