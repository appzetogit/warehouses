import mongoose from 'mongoose';
import { Order } from '../models/order.model.js';
import { DeliveryPartner } from '../../delivery/models/deliveryPartner.model.js';
import { DeliveryWallet } from '../../delivery/models/deliveryWallet.model.js';
import { DeliveryCashLimit } from '../../admin/models/deliveryCashLimit.model.js';
import { OrderTransaction } from '../models/orderTransaction.model.js';
import { ValidationError, NotFoundError } from '../../../../core/auth/errors.js';
import { logger } from '../../../../utils/logger.js';
import { getIO, rooms } from '../../../../config/socket.js';
import { getFirebaseDB } from '../../../../config/firebase.js';
import { parseGeoPoint } from '../../shared/geo.utils.js';
import { TERMINAL_ORDER_STATUSES, haversineKm, notifyOwnersSafely } from './order.helpers.js';
import {
  getDispatchSettings,
  tryAutoAssign,
  RIDER_ASSIGNABLE_STATUSES,
  isRiderDeliveredOrder,
  waitingForRiderFilter,
} from './order-dispatch.service.js';
import { assertCashLimitAllows, runDeliveryAcceptedEffects } from './order-delivery.service.js';

/**
 * Manual dispatch: an admin puts one or more Quick orders on a chosen rider,
 * moves an order to another rider, or takes it off a rider before pickup.
 *
 * Admin-assigned orders skip the rider's accept step and go straight onto
 * their trip. The rider can still ask for an order to be moved through the
 * "can't deliver" request.
 */

const MAX_ORDERS_PER_REQUEST = 10;

const isObjectId = (v) => mongoose.isValidObjectId(String(v || ''));
const oid = (v) => new mongoose.Types.ObjectId(String(v));

const ACTIVE_FOR_RIDER = {
  'dispatch.status': 'accepted',
  orderStatus: { $nin: TERMINAL_ORDER_STATUSES },
};

const orderLabel = (o) => `#${o?.orderId || o?._id}`;
const riderName = (r) => r?.name || 'This rider';

/** Cash the rider collects at the door counts against their cash limit. */
const collectsCash = (order) => {
  const method = String(order?.payment?.method || order?.paymentMethod || '').toLowerCase();
  return method === 'cash' || method === 'razorpay_qr';
};

export async function countActiveOrdersForRider(riderId) {
  return Order.countDocuments({ 'dispatch.deliveryPartnerId': oid(riderId), ...ACTIVE_FOR_RIDER });
}

/**
 * Assign orders to a rider. Each order is claimed atomically, so when two
 * admins assign the same order only one succeeds; the rest are reported back.
 *
 * @returns {{ rider, assigned: string[], failed: {orderId, reason}[], activeOrders: number, maxOrders: number }}
 */
export async function assignOrdersToRider({ riderId, orderIds, adminId }) {
  if (!isObjectId(riderId)) throw new ValidationError('Pick a rider');
  const ids = [...new Set((Array.isArray(orderIds) ? orderIds : []).map(String))];
  if (!ids.length) throw new ValidationError('Pick at least one order');
  if (ids.length > MAX_ORDERS_PER_REQUEST) {
    throw new ValidationError(`Assign at most ${MAX_ORDERS_PER_REQUEST} orders at a time`);
  }
  if (ids.some((id) => !isObjectId(id))) throw new ValidationError('One of the orders is not valid');

  const settings = await getDispatchSettings();
  const rider = await DeliveryPartner.findById(riderId)
    .select('name phone status availabilityStatus')
    .lean();
  if (!rider) throw new NotFoundError('Rider not found');
  if (rider.status !== 'approved') throw new ValidationError(`${riderName(rider)} isn't approved to deliver yet`);
  if (rider.availabilityStatus !== 'online') {
    throw new ValidationError(`${riderName(rider)} is offline. Ask them to go online, then assign.`);
  }

  const maxOrders = settings.effectiveMaxOrdersPerRider;
  const active = await countActiveOrdersForRider(riderId);
  if (active + ids.length > maxOrders) {
    const hint = settings.multiOrderTrips
      ? ''
      : ' Turn on "Rider app shows several orders" in the dispatch settings once riders have the updated app.';
    throw new ValidationError(
      `${riderName(rider)} has ${active} order${active === 1 ? '' : 's'} and can carry ${maxOrders} at a time.${hint}`,
    );
  }

  const orders = await Order.find({ _id: { $in: ids.map(oid) } })
    .select('orderId orderStatus fulfilmentMode dispatch payment paymentMethod')
    .lean();
  const byId = new Map(orders.map((o) => [String(o._id), o]));

  const failed = [];
  const candidates = [];
  for (const id of ids) {
    const o = byId.get(id);
    if (!o) {
      failed.push({ orderId: id, reason: 'Order not found' });
    } else if (!isRiderDeliveredOrder(o)) {
      failed.push({ orderId: id, reason: `${orderLabel(o)} is a Shop order; the courier delivers it` });
    } else if (!RIDER_ASSIGNABLE_STATUSES.includes(o.orderStatus)) {
      failed.push({ orderId: id, reason: `${orderLabel(o)} can't take a rider now (${o.orderStatus.replace(/_/g, ' ')})` });
    } else if (o.dispatch?.status === 'accepted') {
      const same = String(o.dispatch.deliveryPartnerId) === String(riderId);
      failed.push({ orderId: id, reason: same ? `${orderLabel(o)} is already with ${riderName(rider)}` : `${orderLabel(o)} already has a rider` });
    } else {
      candidates.push(o);
    }
  }

  // The same cash rule as when a rider accepts: one check covers every cash order.
  if (candidates.some(collectsCash)) {
    try {
      await assertCashLimitAllows(riderId, candidates.find(collectsCash));
    } catch (err) {
      for (const o of candidates.filter(collectsCash)) {
        failed.push({ orderId: String(o._id), reason: `${riderName(rider)} is at their cash limit, so can't take cash order ${orderLabel(o)}` });
      }
      candidates.splice(0, candidates.length, ...candidates.filter((o) => !collectsCash(o)));
    }
  }

  const now = new Date();
  const assigned = [];
  for (const o of candidates) {
    const claimed = await Order.findOneAndUpdate(
      {
        _id: o._id,
        orderStatus: { $in: RIDER_ASSIGNABLE_STATUSES },
        'dispatch.status': { $in: ['unassigned', 'assigned'] },
      },
      {
        $set: {
          'dispatch.status': 'accepted',
          'dispatch.deliveryPartnerId': oid(riderId),
          'dispatch.assignedAt': now,
          'dispatch.acceptedAt': now,
          'dispatch.assignedBy': 'admin',
          'dispatch.assignedByAdminId': isObjectId(adminId) ? oid(adminId) : null,
        },
        $unset: { 'dispatch.dispatchingAt': '' },
        $push: {
          statusHistory: {
            byRole: 'ADMIN',
            byId: isObjectId(adminId) ? oid(adminId) : undefined,
            from: 'unassigned',
            to: 'accepted',
            note: `Assigned to rider ${riderName(rider)} by admin`,
            at: now,
          },
        },
      },
      { new: true },
    ).populate('sellerId userId');

    if (!claimed) {
      failed.push({ orderId: String(o._id), reason: `${orderLabel(o)} was just taken by another rider or admin` });
      continue;
    }
    // The capacity check above ran before claiming, so two admins assigning
    // different orders to the same rider at once could both pass it. Recount
    // now that the claim is in; whichever claim lands over the limit is undone.
    if ((await countActiveOrdersForRider(riderId)) > maxOrders) {
      await Order.updateOne(
        { _id: claimed._id, 'dispatch.deliveryPartnerId': oid(riderId), 'dispatch.acceptedAt': now, 'dispatch.assignedBy': 'admin' },
        {
          $set: {
            'dispatch.status': 'unassigned',
            'dispatch.deliveryPartnerId': null,
            'dispatch.assignedBy': null,
            'dispatch.assignedByAdminId': null,
          },
          $unset: { 'dispatch.assignedAt': '', 'dispatch.acceptedAt': '' },
          $pull: { statusHistory: { byRole: 'ADMIN', to: 'accepted', at: now } },
        },
      );
      failed.push({ orderId: String(o._id), reason: `${riderName(rider)} can carry ${maxOrders} at a time and just got another order` });
      continue;
    }
    assigned.push(claimed);
    void runDeliveryAcceptedEffects(claimed, String(riderId), { assignedByAdmin: true }).catch((err) =>
      logger.error(`After-assign effects failed for ${claimed._id}: ${err.message}`),
    );
  }

  if (assigned.length) await tellRiderAboutAssignment(riderId, assigned);

  logger.info(
    `[ManualDispatch] Admin ${adminId} assigned ${assigned.length} order(s) to rider ${riderId}; ${failed.length} not assigned.`,
  );

  return {
    rider: { id: String(riderId), name: rider.name || '', phone: rider.phone || '' },
    assigned: assigned.map((o) => String(o._id)),
    failed,
    activeOrders: active + assigned.length,
    maxOrders,
  };
}

async function tellRiderAboutAssignment(riderId, orders) {
  const orderIds = orders.map((o) => String(o._id));
  const stores = [...new Set(orders.map((o) => o.sellerId?.sellerName || o.sellerId?.name).filter(Boolean))];
  const count = orders.length;
  const payload = {
    orderIds,
    count,
    stores,
    assignedBy: 'admin',
    at: new Date().toISOString(),
  };
  try {
    getIO()?.to(rooms.delivery(riderId)).emit('trip_assigned', payload);
  } catch (err) {
    logger.warn(`trip_assigned emit failed: ${err.message}`);
  }
  await notifyOwnersSafely([{ ownerType: 'DELIVERY_PARTNER', ownerId: String(riderId) }], {
    title: count === 1 ? 'New order assigned to you' : `${count} orders assigned to you`,
    body: stores.length ? `Pick up from ${stores.join(', ')}` : 'Open the app to see your trip.',
    data: {
      type: 'trip_assigned',
      orderIds: orderIds.join(','),
      orderId: orderIds[0],
      orderMongoId: orderIds[0],
      count: String(count),
    },
  });
}

/**
 * Take an order off its rider before pickup. The rider is not barred from it,
 * so the admin can give it back. In automatic mode it goes back to dispatch
 * unless `redispatch` is false (used when moving it straight to another rider).
 */
export async function unassignOrder({ orderId, adminId, reason = 'Removed from your trip by admin', redispatch = true }) {
  if (!isObjectId(orderId)) throw new ValidationError('Order not found');
  const existing = await Order.findById(orderId).select('orderId orderStatus dispatch deliveryState').lean();
  if (!existing) throw new NotFoundError('Order not found');
  if (existing.dispatch?.status !== 'accepted' || !existing.dispatch?.deliveryPartnerId) {
    throw new ValidationError(`${orderLabel(existing)} doesn't have a rider`);
  }
  if (existing.deliveryState?.pickedUpAt || ['picked_up', 'reached_drop', 'delivered'].includes(existing.orderStatus)) {
    throw new ValidationError(`${orderLabel(existing)} is already picked up, so it can't be moved`);
  }

  const previousRiderId = String(existing.dispatch.deliveryPartnerId);
  const now = new Date();
  const order = await Order.findOneAndUpdate(
    {
      _id: existing._id,
      'dispatch.status': 'accepted',
      'dispatch.deliveryPartnerId': existing.dispatch.deliveryPartnerId,
      'deliveryState.pickedUpAt': null,
      // The status read above, not just any pre-pickup one: the $set below writes a
      // status derived from it, which would undo a seller marking the order ready
      // (or a rider reaching the store) in the meantime.
      orderStatus: existing.orderStatus,
    },
    {
      $set: {
        orderStatus: existing.orderStatus === 'reached_pickup' ? 'ready_for_pickup' : existing.orderStatus,
        'dispatch.status': 'unassigned',
        'dispatch.deliveryPartnerId': null,
        'dispatch.assignedBy': null,
        'dispatch.manualQueuedAt': now,
        'deliveryState.currentPhase': 'en_route_to_pickup',
        'deliveryState.status': '',
        'deliveryState.reachedPickupAt': null,
        'deliveryState.reachedDropAt': null,
      },
      $unset: {
        'dispatch.assignedAt': '',
        'dispatch.acceptedAt': '',
        'dispatch.dispatchingAt': '',
        'dispatch.waitingAlertAt': '',
        'dispatch.fallbackToAutoAt': '',
      },
      $push: {
        statusHistory: {
          byRole: 'ADMIN',
          byId: isObjectId(adminId) ? oid(adminId) : undefined,
          from: 'accepted',
          to: 'unassigned',
          note: reason,
          at: now,
        },
      },
    },
    { new: true },
  ).lean();
  if (!order) throw new ValidationError(`${orderLabel(existing)} changed just now. Refresh and try again.`);

  await OrderTransaction.findOneAndUpdate({ orderId: order._id }, { $unset: { deliveryPartnerId: '' } }).catch(() => {});
  try {
    await getFirebaseDB()?.ref(`active_orders/${String(order._id)}`).remove();
  } catch {
    /* Realtime Database is optional */
  }

  const payload = { orderId: String(order._id), orderMongoId: String(order._id), reason };
  try {
    const io = getIO();
    io?.to(rooms.delivery(previousRiderId)).emit('order_deassigned', payload);
    io?.to(rooms.seller(order.sellerId)).emit('order_status_update', { ...payload, dispatchStatus: 'unassigned' });
    io?.to(rooms.user(order.userId)).emit('order_status_update', { ...payload, dispatchStatus: 'unassigned' });
  } catch (err) {
    logger.warn(`order_deassigned emit failed: ${err.message}`);
  }
  await notifyOwnersSafely([{ ownerType: 'DELIVERY_PARTNER', ownerId: previousRiderId }], {
    title: 'Order removed from your trip',
    body: `${orderLabel(order)} was moved by the admin. You don't need to pick it up.`,
    data: { type: 'order_deassigned', orderId: String(order._id), orderMongoId: String(order._id) },
  });

  if (redispatch) {
    // Automatic mode sends it out again; manual mode leaves it on the assign board.
    void tryAutoAssign(order._id).catch((err) => logger.warn(`Redispatch after unassign failed: ${err.message}`));
  }

  return { orderId: String(order._id), previousRiderId };
}

/** Move an order (before pickup) from its rider to another one. */
export async function moveOrderToRider({ orderId, riderId, adminId }) {
  const existing = isObjectId(orderId)
    ? await Order.findById(orderId).select('dispatch orderId payment paymentMethod').lean()
    : null;
  if (!existing) throw new NotFoundError('Order not found');
  if (String(existing.dispatch?.deliveryPartnerId || '') === String(riderId)) {
    throw new ValidationError(`${orderLabel(existing)} is already with this rider`);
  }
  // Check the new rider can take it before taking it off the current one.
  await assertRiderCanTakeMore(riderId, 1);
  if (collectsCash(existing)) {
    try {
      await assertCashLimitAllows(riderId, existing);
    } catch {
      throw new ValidationError(`That rider is at their cash limit, so can't take cash order ${orderLabel(existing)}`);
    }
  }
  await unassignOrder({ orderId, adminId, reason: 'Moved to another rider by admin', redispatch: false });
  let result;
  try {
    result = await assignOrdersToRider({ riderId, orderIds: [orderId], adminId });
  } catch (err) {
    // The order is already off its old rider: send it back to dispatch, then report.
    void tryAutoAssign(orderId).catch(() => {});
    throw err;
  }
  if (!result.assigned.length) {
    // Couldn't land on the new rider: put it back into normal dispatch so it isn't lost.
    void tryAutoAssign(orderId).catch(() => {});
  }
  return result;
}

async function assertRiderCanTakeMore(riderId, count) {
  if (!isObjectId(riderId)) throw new ValidationError('Pick a rider');
  const [settings, rider, active] = await Promise.all([
    getDispatchSettings(),
    DeliveryPartner.findById(riderId).select('name status availabilityStatus').lean(),
    countActiveOrdersForRider(riderId),
  ]);
  if (!rider) throw new NotFoundError('Rider not found');
  if (rider.status !== 'approved') throw new ValidationError(`${riderName(rider)} isn't approved to deliver yet`);
  if (rider.availabilityStatus !== 'online') throw new ValidationError(`${riderName(rider)} is offline`);
  if (active + count > settings.effectiveMaxOrdersPerRider) {
    throw new ValidationError(
      `${riderName(rider)} has ${active} order${active === 1 ? '' : 's'} and can carry ${settings.effectiveMaxOrdersPerRider} at a time`,
    );
  }
}

/**
 * Everything the admin's Assign Orders page shows: Quick orders waiting for a
 * rider, riders who are online with their load, and riders' active orders.
 */
export async function getDispatchBoard({ zoneId } = {}) {
  const settings = await getDispatchSettings();
  const zoneFilter = isObjectId(zoneId) ? { zoneId: oid(zoneId) } : {};

  const sellerSelect = 'sellerName name area address location zoneId';
  const [waitingDocs, activeDocs, riders, cashSettings] = await Promise.all([
    Order.find(waitingForRiderFilter(zoneFilter))
      .select('orderId orderStatus createdAt dispatch.manualQueuedAt dispatch.offeredTo deliveryAddress customerName pricing.total payment.method paymentMethod promisedEtaMinutes items.name items.quantity sellerId zoneId tripDistanceKm')
      .populate({ path: 'sellerId', select: sellerSelect })
      .sort({ createdAt: 1 })
      .limit(200)
      .lean(),
    Order.find({ fulfilmentMode: { $ne: 'standard' }, ...ACTIVE_FOR_RIDER, ...zoneFilter })
      .select('orderId orderStatus createdAt deliveryState dispatch.deliveryPartnerId dispatch.assignedBy dispatch.acceptedAt deliveryAddress customerName pricing.total payment.method paymentMethod sellerId promisedEtaMinutes')
      .populate({ path: 'sellerId', select: 'sellerName name area' })
      .limit(500)
      .lean(),
    DeliveryPartner.find({ status: 'approved', availabilityStatus: 'online' })
      .select('name phone vehicleType vehicleNumber lastLat lastLng lastLocationAt')
      .limit(500)
      .lean(),
    DeliveryCashLimit.findOne({ isActive: true }).select('deliveryCashLimit').lean(),
  ]);

  const cashLimit = Number(cashSettings?.deliveryCashLimit) || 0;
  const wallets = cashLimit > 0 && riders.length
    ? await DeliveryWallet.find({ deliveryPartnerId: { $in: riders.map((r) => r._id) } }).select('deliveryPartnerId cashInHand').lean()
    : [];
  const cashByRider = new Map(wallets.map((w) => [String(w.deliveryPartnerId), Number(w.cashInHand) || 0]));

  const activeByRider = new Map();
  for (const o of activeDocs) {
    const key = String(o.dispatch?.deliveryPartnerId || '');
    if (!key) continue;
    if (!activeByRider.has(key)) activeByRider.set(key, []);
    activeByRider.get(key).push(o);
  }

  const now = Date.now();
  const storeOf = (o) => ({
    id: String(o.sellerId?._id || o.sellerId || ''),
    name: o.sellerId?.sellerName || o.sellerId?.name || 'Store',
    area: o.sellerId?.area || '',
  });
  const dropOf = (o) => ({
    area: [o.deliveryAddress?.street, o.deliveryAddress?.city].filter(Boolean).join(', '),
    customer: o.customerName || o.deliveryAddress?.name || o.deliveryAddress?.fullName || '',
  });
  const paymentOf = (o) => String(o.payment?.method || o.paymentMethod || '').toLowerCase();

  const waiting = waitingDocs.map((o) => {
    const since = o.dispatch?.manualQueuedAt || o.createdAt;
    return {
      id: String(o._id),
      orderId: o.orderId || String(o._id),
      status: o.orderStatus,
      store: storeOf(o),
      storePoint: parseGeoPoint(o.sellerId),
      drop: dropOf(o),
      total: Number(o.pricing?.total) || 0,
      payment: paymentOf(o),
      collectsCash: collectsCash(o),
      itemCount: (o.items || []).reduce((n, i) => n + (Number(i.quantity) || 1), 0),
      tripDistanceKm: o.tripDistanceKm ?? null,
      waitingMinutes: Math.max(0, Math.floor((now - new Date(since).getTime()) / 60000)),
      promisedEtaMinutes: o.promisedEtaMinutes ?? null,
      offeredToRiders: (o.dispatch?.offeredTo || []).length,
    };
  });

  const riderRows = riders.map((r) => {
    const mine = activeByRider.get(String(r._id)) || [];
    const cashInHand = cashByRider.get(String(r._id)) || 0;
    const point = Number.isFinite(r.lastLat) && Number.isFinite(r.lastLng) ? { lat: r.lastLat, lng: r.lastLng } : null;
    return {
      id: String(r._id),
      name: r.name || 'Rider',
      phone: r.phone || '',
      vehicle: [r.vehicleType, r.vehicleNumber].filter(Boolean).join(' · '),
      point,
      locationAgeMinutes: r.lastLocationAt ? Math.floor((now - new Date(r.lastLocationAt).getTime()) / 60000) : null,
      activeOrders: mine.length,
      maxOrders: settings.effectiveMaxOrdersPerRider,
      cashInHand,
      cashBlocked: cashLimit > 0 && cashInHand >= cashLimit,
      orders: mine.map((o) => ({
        id: String(o._id),
        orderId: o.orderId || String(o._id),
        status: o.orderStatus,
        phase: o.deliveryState?.currentPhase || '',
        pickedUp: Boolean(o.deliveryState?.pickedUpAt),
        assignedBy: o.dispatch?.assignedBy || 'rider',
        store: storeOf(o),
        drop: dropOf(o),
        payment: paymentOf(o),
      })),
    };
  });

  // Distance from each rider to each waiting order's store, for sorting on the board.
  for (const w of waiting) {
    if (!w.storePoint) continue;
    w.nearestRiders = riderRows
      .filter((r) => r.point)
      .map((r) => ({ riderId: r.id, km: Number(haversineKm(r.point.lat, r.point.lng, w.storePoint.lat, w.storePoint.lng).toFixed(2)) }))
      .sort((a, b) => a.km - b.km)
      .slice(0, 5);
  }

  return {
    settings,
    waiting,
    riders: riderRows.sort((a, b) => a.activeOrders - b.activeOrders || a.name.localeCompare(b.name)),
    cashLimit,
    generatedAt: new Date().toISOString(),
  };
}
