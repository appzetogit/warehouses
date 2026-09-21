import mongoose from 'mongoose';
import { Product } from '../../admin/models/product.model.js';
import { ValidationError } from '../../../../core/auth/errors.js';

function toObjectIds(ids = []) {
  return [...new Set(ids)]
    .map((id) => String(id || '').trim())
    .filter((id) => mongoose.Types.ObjectId.isValid(id))
    .map((id) => new mongoose.Types.ObjectId(id));
}

function resolveProductPrice(productDoc, rawItem) {
  const variantId = String(rawItem?.variantId || '').trim();
  const variants = Array.isArray(productDoc?.variants) ? productDoc.variants : [];

  if (variantId) {
    const variant = variants.find((entry) => String(entry?._id) === variantId);
    if (!variant || variant.isActive === false) {
      throw new ValidationError(`${productDoc.name} is no longer available in the selected option`);
    }
    const price = Number(variant.price) || 0;
    const otherPrice = Number(variant.otherPrice) || 0;
    return {
      price,
      otherPrice: otherPrice > price ? otherPrice : 0,
      variantId,
      variantName: String(variant.name || rawItem?.variantName || '').trim(),
      variantPrice: price,
      variantAttributes: Array.isArray(variant.attributes)
        ? variant.attributes.map((a) => ({ name: a.name, value: a.value }))
        : [],
      sku: String(variant.sku || productDoc.sku || ''),
      variant,
    };
  }

  if (variants.length > 0) {
    throw new ValidationError(`Please select an option for ${productDoc.name}`);
  }

  const price = Number(productDoc.price) || 0;
  const otherPrice = Number(productDoc.otherPrice) || 0;
  return {
    price,
    otherPrice: otherPrice > price ? otherPrice : 0,
    variantId: '',
    variantName: '',
    variantPrice: price,
    variantAttributes: [],
    sku: String(productDoc.sku || ''),
    variant: null,
  };
}

export async function resolveOrderCartItems(sellerId, rawItems = []) {
  const items = Array.isArray(rawItems) ? rawItems : [];
  if (!items.length) throw new ValidationError('At least one item required');

  const rId = new mongoose.Types.ObjectId(String(sellerId));
  const itemIds = toObjectIds(items.map((item) => item.itemId || item.id));

  const productDocs = itemIds.length
    ? await Product.find({
        sellerId: rId,
        _id: { $in: itemIds },
        approvalStatus: 'approved',
      }).lean()
    : [];

  const productById = new Map(productDocs.map((doc) => [String(doc._id), doc]));

  const resolved = [];

  for (const rawItem of items) {
    const itemId = String(rawItem?.itemId || rawItem?.id || '').trim();
    const quantity = Math.max(1, Number(rawItem?.quantity) || 1);

    if (!itemId || !mongoose.Types.ObjectId.isValid(itemId)) {
      throw new ValidationError('One or more cart items are invalid');
    }

    const productDoc = productById.get(itemId);
    if (productDoc) {
      if (productDoc.isAvailable === false) {
        throw new ValidationError(`${productDoc.name} is currently unavailable`);
      }

      // Cheap pre-checks so the customer is told at checkout rather than after
      // the reservation fails. Stock is still claimed atomically at order
      // creation -- this read is a courtesy, not the guard.
      const cap = Number(productDoc.maxQtyPerOrder);
      if (Number.isFinite(cap) && cap > 0 && quantity > cap) {
        throw new ValidationError(`You can order at most ${cap} of ${productDoc.name}`);
      }

      const { variant, ...pricing } = resolveProductPrice(productDoc, rawItem);

      // A variant with its own count is checked against that; otherwise the
      // product's count applies.
      const counted = variant && variant.stockQty !== null && variant.stockQty !== undefined;
      const onHand = counted ? variant.stockQty : productDoc.stockQty;
      const label = variant ? `${productDoc.name} (${variant.name})` : productDoc.name;
      if (onHand !== null && onHand !== undefined && Number(onHand) < quantity) {
        throw new ValidationError(
          Number(onHand) > 0
            ? `Only ${Number(onHand)} left of ${label}. Please reduce the quantity.`
            : `${label} just went out of stock`,
        );
      }

      resolved.push({
        itemId,
        name: String(productDoc.name || rawItem?.name || 'Item').trim(),
        ...pricing,
        quantity,
        // Carried onto the line so tax is computed per product rather than at
        // one rate for the whole basket. null defers to the order-wide rate.
        gstRate:
          productDoc.gstRate === null || productDoc.gstRate === undefined
            ? null
            : Number(productDoc.gstRate),
        brand: String(productDoc.brand || ''),
        packSize: String(productDoc.packSize || ''),
        // Snapshotted so category reporting survives a rename or a delete.
        categoryId: productDoc.categoryId || null,
        categoryName: String(productDoc.categoryName || ''),
        // true / false for the veg / non-veg mark, null where the product has none.
        isVeg: productDoc.foodType ? productDoc.foodType === 'Veg' : null,
        image: String(variant?.images?.[0] || productDoc.image || rawItem?.image || ''),
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
    const foreign = await Product.findById(itemId).select('name sellerId').lean();
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
