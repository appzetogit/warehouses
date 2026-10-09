/**
 * Shop (e-commerce, courier) orders have fulfilmentMode "standard". They have
 * no acceptance deadline: they wait in "created" until the store accepts or
 * rejects. Quick orders ("quick" or no mode) keep the countdown flow.
 */
export const isShopOrder = (orderLike) => orderLike?.fulfilmentMode === "standard";

/** A Shop order still waiting on the store. Uses the raw backend status, since the seller list maps "created" to "confirmed". */
export const isShopOrderAwaitingStore = (orderLike) =>
  isShopOrder(orderLike) &&
  String(orderLike?.orderStatus || "").toLowerCase() === "created";

/** When the order started waiting for the store (older orders: createdAt). */
export const getAwaitingSince = (orderLike) =>
  orderLike?.awaitingSellerSince || orderLike?.createdAt || null;

/** "just now", "12m ago", "3h ago", "2d ago". */
export function formatAgo(value, now = Date.now()) {
  const ms = new Date(value || "").getTime();
  if (!Number.isFinite(ms)) return "";
  const mins = Math.max(0, Math.floor((now - ms) / 60000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 48) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export const SHOP_REJECT_REASONS = [
  { value: "out_of_stock", label: "Out of stock" },
  { value: "size_unavailable", label: "Size not available" },
  { value: "cannot_ship", label: "Can't ship to this address" },
  { value: "other", label: "Other" },
];

export const SHOP_REJECT_NOTE_MAX = 300;

/** Display text for a cancellation reason, whether stored as a code, a sentence or { reason, note }. */
export function getCancellationReasonText(value) {
  if (!value) return "";
  if (typeof value === "string") {
    return SHOP_REJECT_REASONS.find((r) => r.value === value)?.label || value;
  }
  const code = value.reason || value.code;
  const label = SHOP_REJECT_REASONS.find((r) => r.value === code)?.label || code || "";
  const note = value.note || value.text || "";
  return [label, note].filter(Boolean).join(" · ");
}
