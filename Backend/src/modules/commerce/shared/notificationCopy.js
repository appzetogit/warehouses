/**
 * Wording for every order notification, in one place, per audience.
 *
 * The platform sells clothes: no meals, kitchens or cooking. Orders are named
 * by the number the customer sees (ORD-...), never the database id, and money
 * is shown in rupees with the ₹ sign.
 */

/** The order number a person recognises; the database id only as a last resort. */
export function orderNo(order) {
  const readable = order?.order_id || order?.orderId;
  if (readable && typeof readable === 'string') return readable;
  const raw = String(order?._id || order?.id || '');
  return raw ? `#${raw.slice(-6).toUpperCase()}` : '';
}

/** ₹1,198 or ₹599.50, in Indian grouping. */
export function rupees(amount) {
  const n = Number(amount) || 0;
  return `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
}

const storeName = (order, seller) =>
  String(seller?.sellerName || order?.sellerId?.sellerName || order?.sellerName || '').trim() || 'The store';

const isShop = (order) => String(order?.fulfilmentMode || '') === 'standard';

/** Customer: order placed. */
export function orderPlacedForCustomer(order, seller) {
  const store = storeName(order, seller);
  return {
    title: `Order ${orderNo(order)} placed 🛍️`,
    body: `${store} will confirm it shortly. We'll keep you posted.`,
  };
}

/** Customer: a status the store or support set. Returns null when the customer needn't be told. */
export function statusForCustomer(order, status, { seller, bySupport = false, note = '', storeRejected = false } = {}) {
  const no = orderNo(order);
  const store = storeName(order, seller);
  switch (String(status)) {
    case 'confirmed':
      return {
        title: `Order ${no} accepted`,
        body: isShop(order)
          ? `${store} accepted your order and will pack it for shipping.`
          : `${store} accepted your order and is packing it now.`,
      };
    case 'preparing':
      return { title: `Packing order ${no}`, body: `${store} is packing your order.` };
    case 'ready_for_pickup':
      return {
        title: `Order ${no} is packed`,
        body: isShop(order)
          ? 'It will be handed to the courier shortly.'
          : 'A rider will pick it up shortly.',
      };
    default:
      if (String(status).includes('cancel')) {
        const why = String(note || '').trim();
        // A Shop order the store turned down before accepting it.
        if (storeRejected) {
          return {
            title: `${store} couldn't accept order ${no}`,
            body: why ? `Reason: ${why}.` : 'The store could not take this order.',
          };
        }
        return {
          title: `Order ${no} cancelled`,
          body: why || (bySupport ? 'Support cancelled your order. Any payment will be refunded.' : 'Your order was cancelled. Any payment will be refunded.'),
        };
      }
      return null;
  }
}

/** Rider: a status the store or support set on an order they carry. */
export function statusForRider(order, status) {
  const no = orderNo(order);
  if (String(status).includes('cancel')) {
    return { title: `Order ${no} cancelled`, body: "Stop this order: you don't need to pick it up or deliver it." };
  }
  if (String(status) === 'ready_for_pickup') {
    return { title: `Order ${no} is packed`, body: 'It is ready at the store for pickup.' };
  }
  return { title: `Order ${no} updated`, body: `Status: ${String(status).replace(/_/g, ' ')}.` };
}

/** Store: support changed one of its orders' status. */
export function statusForStore(order, status) {
  const no = orderNo(order);
  if (String(status).includes('cancel')) return { title: `Order ${no} cancelled`, body: 'This order was cancelled. Stop packing it.' };
  return { title: `Order ${no} updated by support`, body: `Status: ${String(status).replace(/_/g, ' ')}.` };
}

/** Delivery milestones, per audience. `riderName` is optional. */
export function deliveryMilestone(order, status, { riderName = '' } = {}) {
  const no = orderNo(order);
  const rider = String(riderName || '').trim() || 'Your rider';
  const riderOrThe = String(riderName || '').trim() || 'The rider';
  const cash = String(order?.payment?.method || order?.paymentMethod || '').toLowerCase() === 'cash';
  const total = order?.pricing?.total ?? order?.amounts?.totalCustomerPaid ?? 0;

  if (status === 'picked_up') {
    return {
      customer: { title: 'Your order is on the way 🛵', body: `${rider} picked up order ${no} and is heading to you.` },
      store: { title: `Order ${no} picked up`, body: `${riderOrThe} picked up the order.` },
      rider: { title: `Picked up ${no}`, body: 'Head to the customer.' },
    };
  }
  if (status === 'reached_drop') {
    return {
      customer: {
        title: 'Your rider is here',
        body: `${rider} has reached your address with order ${no}.${cash ? ` Keep ${rupees(total)} ready.` : ''}`,
      },
      store: null,
      rider: { title: `At the customer for ${no}`, body: 'Collect the handover OTP to complete the delivery.' },
    };
  }
  if (status === 'delivered') {
    return {
      customer: {
        title: `Order ${no} delivered ✅`,
        body: "Hope you love it! Rate your order, and if something doesn't fit, returns are easy from Orders.",
      },
      store: { title: `Order ${no} delivered`, body: 'Delivered to the customer.' },
      rider: cash
        ? { title: `Collected ${rupees(total)} for ${no}`, body: 'Cash collected and delivery completed.' }
        : { title: `Delivered ${no}`, body: 'Delivery completed. Nice work!' },
    };
  }
  return null;
}

/** A rider took the order (accepted an offer, or an admin assigned it). */
export function riderAssigned(order, { riderName = '' } = {}) {
  const no = orderNo(order);
  const rider = String(riderName || '').trim();
  return {
    customer: {
      title: rider ? `${rider} will deliver order ${no}` : `A rider will deliver order ${no}`,
      body: 'They will pick it up from the store once it is packed.',
    },
    store: {
      title: `Rider assigned to ${no}`,
      body: rider ? `${rider} will pick up this order.` : 'A rider will pick up this order.',
    },
    rider: { title: `Order ${no} accepted`, body: 'Head to the store to pick it up.' },
  };
}

/** Delivered by support from the admin panel. */
export function deliveredBySupport(order) {
  return {
    title: `Order ${orderNo(order)} delivered ✅`,
    body: 'Support marked your order as delivered. Hope you love it!',
  };
}

/** Customer cancelled; `refundDetail` is a sentence or ''. */
export function cancelledByCustomer(order, refundDetail = '') {
  return {
    title: `Order ${orderNo(order)} cancelled`,
    body: `Your order has been cancelled.${refundDetail ? ` ${String(refundDetail).trim()}` : ''}`,
  };
}

/** Words that belong to food delivery, not a clothing store. Used by tests. */
export const FOOD_WORDS = /\b(meal|food|kitchen|chef|cook(ing|ed)?|dish(es)?|delicious|hungry|tasty|restaurant|bon app[eé]tit)\b|🍔|🍳|🧑‍🍳|🍕|🍽/i;
