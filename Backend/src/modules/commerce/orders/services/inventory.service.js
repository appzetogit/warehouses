import mongoose from 'mongoose';
import { Product } from '../../admin/models/product.model.js';
import { Order } from '../models/order.model.js';
import { ValidationError } from '../../../../core/auth/errors.js';
import { logger } from '../../../../utils/logger.js';

/**
 * Stock reservation.
 *
 * An order claims units when it is created, or two customers can both buy the
 * last one and the second finds out only after paying.
 *
 * Where stock lives:
 *   - a product without variants, or a variant with `stockQty: null`, draws on
 *     the product's `stockQty` (pack sizes of one shelf item);
 *   - a variant with its own `stockQty` is counted separately (size M of a shirt).
 * A `null` count at either level means "not counted": always in stock, never
 * decremented. That is every document created before inventory existed.
 */

const toId = (value) => new mongoose.Types.ObjectId(String(value));

/** An active variant counts as in stock, as Mongo filters see it. */
const ACTIVE = { isActive: { $ne: false } };

/**
 * Hides a product once nothing on it can be sold, and shows it again when
 * something can. Both are single conditional updates whose filter is the whole
 * "is anything in stock" test, so they cannot act on a stale read when orders
 * and restocks race.
 *
 * Unhiding skips products the seller switched off by hand (`stockOffMode`):
 * that decision outranks a restock.
 */
export async function syncProductAvailability(productId) {
  const _id = toId(productId);

  const soldOut = {
    $or: [
      // No variants: the product's own count ran out.
      { 'variants.0': { $exists: false }, stockQty: 0 },
      // Variants: none active with stock of its own, and the shared count (used
      // by variants without their own) is empty too.
      {
        'variants.0': { $exists: true },
        variants: { $not: { $elemMatch: { ...ACTIVE, stockQty: { $gt: 0 } } } },
        $or: [
          { stockQty: 0 },
          { variants: { $not: { $elemMatch: { ...ACTIVE, stockQty: null } } } },
        ],
      },
    ],
  };
  const hidden = await Product.updateOne({ _id, isAvailable: true, ...soldOut }, { $set: { isAvailable: false } });
  if (hidden.modifiedCount) return;

  const sellable = {
    $or: [
      { 'variants.0': { $exists: false }, stockQty: { $gt: 0 } },
      { variants: { $elemMatch: { ...ACTIVE, stockQty: { $gt: 0 } } } },
      { stockQty: { $ne: 0 }, variants: { $elemMatch: { ...ACTIVE, stockQty: null } } },
    ],
  };
  await Product.updateOne(
    { _id, isAvailable: false, stockOffMode: { $in: [null, undefined] }, ...sellable },
    { $set: { isAvailable: true } },
  );
}

/**
 * Where each cart line's units come from, summed: the same shelf can appear on
 * several lines (two pack sizes sharing one count), and it is the sum that has
 * to be available.
 *
 * Returns [{ itemId, variantId, qty }] where variantId is '' for the product's
 * own count.
 */
export function planReservations(items = [], productById = new Map()) {
  const totals = new Map();
  for (const item of items) {
    const itemId = String(item?.itemId || '');
    if (!itemId || !mongoose.Types.ObjectId.isValid(itemId)) continue;
    const qty = Math.max(1, Number(item?.quantity) || 1);

    const product = productById.get(itemId);
    const variantId = String(item?.variantId || '');
    const variant = variantId && product
      ? (product.variants || []).find((v) => String(v._id) === variantId)
      : null;
    const ownCount = variant && variant.stockQty !== null && variant.stockQty !== undefined;
    const key = `${itemId}:${ownCount ? variantId : ''}`;

    const entry = totals.get(key) || { itemId, variantId: ownCount ? variantId : '', qty: 0 };
    entry.qty += qty;
    totals.set(key, entry);
  }
  return [...totals.values()];
}

/** Kept for callers that only need per-item totals (legacy restock). */
export function totalQuantityByItem(items = []) {
  const totals = new Map();
  for (const item of items) {
    const id = String(item?.itemId || '');
    if (!id || !mongoose.Types.ObjectId.isValid(id)) continue;
    const qty = Math.max(1, Number(item?.quantity) || 1);
    totals.set(id, (totals.get(id) || 0) + qty);
  }
  return totals;
}

const describe = (product, variantId) => {
  const variant = variantId ? (product.variants || []).find((v) => String(v._id) === variantId) : null;
  return variant ? `${product.name} (${variant.name})` : product.name;
};

/**
 * Decrements stock for every counted shelf on the order.
 *
 * Each decrement is a conditional update, so the check and the write are one
 * atomic operation and concurrent orders cannot both pass a "do we have enough"
 * read. If any line comes up short, what was already taken is put back before
 * throwing: a rejected order must leave the shelves exactly as it found them.
 *
 * Returns what was taken, to be stored on the order for the restock.
 */
export async function reserveStockForItems(items = []) {
  const ids = [...new Set(items.map((i) => String(i?.itemId || '')))].filter((id) => mongoose.Types.ObjectId.isValid(id));
  if (!ids.length) return [];

  const products = await Product.find({ _id: { $in: ids.map(toId) } })
    .select('name stockQty variants._id variants.name variants.stockQty')
    .lean();
  const productById = new Map(products.map((p) => [String(p._id), p]));

  const taken = [];
  for (const plan of planReservations(items, productById)) {
    const product = productById.get(plan.itemId);
    if (!product) {
      await releaseReservations(taken);
      throw new ValidationError('One or more items are no longer available');
    }
    const _id = toId(plan.itemId);

    let res;
    if (plan.variantId) {
      // `$gte` never matches null, so a variant that stopped being counted
      // since the read above falls through to the re-check below.
      res = await Product.updateOne(
        { _id, variants: { $elemMatch: { _id: toId(plan.variantId), stockQty: { $gte: plan.qty } } } },
        { $inc: { 'variants.$.stockQty': -plan.qty } },
      );
    } else {
      res = await Product.updateOne({ _id, stockQty: { $gte: plan.qty } }, { $inc: { stockQty: -plan.qty } });
    }

    if (res.modifiedCount === 1) {
      taken.push(plan);
      await syncProductAvailability(plan.itemId);
      continue;
    }

    const fresh = await Product.findById(_id).select('name stockQty variants._id variants.name variants.stockQty').lean();
    const count = plan.variantId
      ? (fresh?.variants || []).find((v) => String(v._id) === plan.variantId)?.stockQty
      : fresh?.stockQty;
    if (fresh && (count === null || count === undefined)) continue; // not counted

    await releaseReservations(taken);
    if (!fresh) throw new ValidationError('One or more items are no longer available');
    const left = Number(count) || 0;
    const label = describe(fresh, plan.variantId);
    throw new ValidationError(
      left > 0 ? `Only ${left} left of ${label}. Please reduce the quantity.` : `${label} just went out of stock`,
    );
  }

  return taken;
}

/** Returns units to a shelf. A variant that has since been deleted cannot take them back. */
async function incrementStock(itemId, variantId, qty) {
  const _id = toId(itemId);
  if (variantId) {
    const res = await Product.updateOne(
      { _id, variants: { $elemMatch: { _id: toId(variantId), stockQty: { $ne: null } } } },
      { $inc: { 'variants.$.stockQty': qty } },
    );
    if (!res.matchedCount) {
      logger.warn(`restock skipped: variant ${variantId} of ${itemId} is gone or no longer counted (+${qty})`);
    }
  } else {
    await Product.updateOne({ _id, stockQty: { $ne: null } }, { $inc: { stockQty: qty } });
  }
  await syncProductAvailability(itemId);
}

/** Puts back a partial reservation after a failed line. Never throws. */
export async function releaseReservations(taken = []) {
  for (const entry of taken) {
    try {
      await incrementStock(entry.itemId, entry.variantId || '', entry.qty);
    } catch (err) {
      logger.error(
        `[CRITICAL] stock rollback failed for item ${entry.itemId}/${entry.variantId || '-'} (+${entry.qty}): ${err?.message || err}`,
      );
    }
  }
}

/**
 * Returns an order's reserved stock to the shelf.
 *
 * Safe to call from anywhere an order dies: cancellation by user, seller,
 * admin or the acceptance timeout, and the two delete paths. The claim on
 * `stockRestoredAt` is what makes that safe: several of those paths can fire
 * for the same order, and a double restock would quietly invent inventory.
 */
export async function restoreOrderStock(orderLike) {
  const orderId = orderLike?._id;
  if (!orderId) return false;
  if (!orderLike?.stockReservedAt) return false; // never reserved

  const claimed = await Order.findOneAndUpdate(
    { _id: orderId, stockReservedAt: { $ne: null }, stockRestoredAt: null },
    { $set: { stockRestoredAt: new Date() } },
    { new: true, projection: { items: 1, stockReservations: 1 } },
  ).lean();

  if (!claimed) return false; // already restored, or nothing to restore

  // Orders placed before reservations were recorded took from product counts.
  const entries = claimed.stockReservations?.length
    ? claimed.stockReservations
    : [...totalQuantityByItem(claimed.items)].map(([itemId, qty]) => ({ itemId, variantId: '', qty }));

  for (const entry of entries) {
    try {
      await incrementStock(entry.itemId, entry.variantId || '', entry.qty);
    } catch (err) {
      logger.error(
        `[CRITICAL] restock failed for order ${orderId} item ${entry.itemId}/${entry.variantId || '-'} (+${entry.qty}): ${err?.message || err}`,
      );
    }
  }

  return true;
}
