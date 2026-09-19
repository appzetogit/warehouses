import mongoose from 'mongoose';
import { FoodItem } from '../../admin/models/food.model.js';
import { ValidationError } from '../../../../core/auth/errors.js';

function toObjectIds(ids = []) {
  return [...new Set(ids)]
    .map((id) => String(id || '').trim())
    .filter((id) => mongoose.Types.ObjectId.isValid(id))
    .map((id) => new mongoose.Types.ObjectId(id));
}

function resolveFoodItemPrice(foodDoc, rawItem) {
  const variantId = String(rawItem?.variantId || '').trim();
  const variants = Array.isArray(foodDoc?.variants) ? foodDoc.variants : [];

  if (variantId) {
    const variant = variants.find((entry) => String(entry?._id) === variantId);
    if (!variant) {
      throw new ValidationError(`${foodDoc.name} is no longer available in the selected size`);
    }
    const price = Number(variant.price) || 0;
    const otherPrice = Number(variant.otherPrice) || 0;
    return {
      price,
      otherPrice: otherPrice > price ? otherPrice : 0,
      variantId,
      variantName: String(variant.name || rawItem?.variantName || '').trim(),
      variantPrice: price,
    };
  }

  if (variants.length > 0) {
    throw new ValidationError(`Please select a size for ${foodDoc.name}`);
  }

  const price = Number(foodDoc.price) || 0;
  const otherPrice = Number(foodDoc.otherPrice) || 0;
  return {
    price,
    otherPrice: otherPrice > price ? otherPrice : 0,
    variantId: '',
    variantName: '',
    variantPrice: price,
  };
}

export async function resolveOrderCartItems(sellerId, rawItems = []) {
  const items = Array.isArray(rawItems) ? rawItems : [];
  if (!items.length) throw new ValidationError('At least one item required');

  const rId = new mongoose.Types.ObjectId(String(sellerId));
  const itemIds = toObjectIds(items.map((item) => item.itemId || item.id));

  const foodDocs = itemIds.length
    ? await FoodItem.find({
        sellerId: rId,
        _id: { $in: itemIds },
        approvalStatus: 'approved',
      }).lean()
    : [];

  const foodById = new Map(foodDocs.map((doc) => [String(doc._id), doc]));

  const resolved = [];

  for (const rawItem of items) {
    const itemId = String(rawItem?.itemId || rawItem?.id || '').trim();
    const quantity = Math.max(1, Number(rawItem?.quantity) || 1);

    if (!itemId || !mongoose.Types.ObjectId.isValid(itemId)) {
      throw new ValidationError('One or more cart items are invalid');
    }

    const foodDoc = foodById.get(itemId);
    if (foodDoc) {
      if (foodDoc.isAvailable === false) {
        throw new ValidationError(`${foodDoc.name} is currently unavailable`);
      }

      // Cheap pre-checks so the customer is told at checkout rather than after
      // the reservation fails. Stock is still claimed atomically at order
      // creation -- this read is a courtesy, not the guard.
      const cap = Number(foodDoc.maxQtyPerOrder);
      if (Number.isFinite(cap) && cap > 0 && quantity > cap) {
        throw new ValidationError(`You can order at most ${cap} of ${foodDoc.name}`);
      }

      const onHand = foodDoc.stockQty;
      if (onHand !== null && onHand !== undefined && Number(onHand) < quantity) {
        throw new ValidationError(
          Number(onHand) > 0
            ? `Only ${Number(onHand)} left of ${foodDoc.name}. Please reduce the quantity.`
            : `${foodDoc.name} just went out of stock`,
        );
      }

      const pricing = resolveFoodItemPrice(foodDoc, rawItem);

      resolved.push({
        itemId,
        name: String(foodDoc.name || rawItem?.name || 'Item').trim(),
        ...pricing,
        quantity,
        // Carried onto the line so tax is computed per product rather than at
        // one rate for the whole basket. null defers to the order-wide rate.
        gstRate:
          foodDoc.gstRate === null || foodDoc.gstRate === undefined
            ? null
            : Number(foodDoc.gstRate),
        brand: String(foodDoc.brand || ''),
        packSize: String(foodDoc.packSize || ''),
        // Snapshotted so category reporting survives a rename or a delete.
        categoryId: foodDoc.categoryId || null,
        categoryName: String(foodDoc.categoryName || ''),
        // true / false for the veg / non-veg mark, null where the product has none.
        isVeg: foodDoc.foodType ? foodDoc.foodType === 'Veg' : null,
        image: String(foodDoc.image || rawItem?.image || ''),
        notes: String(rawItem?.notes || ''),
      });
      continue;
    }

    // An id that exists but belongs to somebody else is a mixed-seller cart,
    // not a missing product. Both used to say "no longer available", which sent
    // the customer looking for a stock problem that was never there.
    //
    // An order carries one sellerId, one delivery fee and one rider, so a
    // basket spanning two sellers cannot be placed as it stands.
    // ponytail: reject and say so. Splitting into an order per seller is the
    // real answer, and it is a much bigger change -- separate fees, separate
    // dispatch, separate cancellation and refund per part.
    const foreign = await FoodItem.findById(itemId).select('name sellerId').lean();
    if (foreign?._id && String(foreign.sellerId) !== String(rId)) {
      throw new ValidationError(
        `${foreign.name} is sold by a different seller. Please order from one seller at a time.`,
      );
    }

    throw new ValidationError(
      `${String(rawItem?.name || 'An item')} is no longer available from this seller`,
    );
  }

  return resolved;
}
