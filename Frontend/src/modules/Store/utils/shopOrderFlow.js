/**
 * How a Shop order (sent by courier, fulfilmentMode "standard") reads to the
 * customer: its steps, a one-line status and when it should arrive. Quick
 * orders keep their own wording; nothing here applies to them.
 */

const CANCELLED = ["cancelled_by_user", "cancelled_by_seller", "cancelled_by_admin"]

const STEPS = [
  { key: "placed", label: "Placed", statuses: ["created"] },
  { key: "confirmed", label: "Confirmed by store", statuses: ["confirmed", "preparing"] },
  { key: "packed", label: "Packed", statuses: ["ready_for_pickup", "reached_pickup"] },
  { key: "shipped", label: "Shipped", statuses: ["picked_up"] },
  { key: "out_for_delivery", label: "Out for delivery", statuses: ["reached_drop"] },
  { key: "delivered", label: "Delivered", statuses: ["delivered"] },
]

const LABELS = ["Waiting for store confirmation", "Confirmed", "Packed", "Shipped", "Out for delivery", "Delivered"]

const statusOf = (order) => String(order?.orderStatus || order?.status || "").toLowerCase()
const historyOf = (order) => (Array.isArray(order?.statusHistory) ? order.statusHistory : [])

const toDate = (value) => {
  if (!value) return null
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? null : d
}

/** Index of a raw status in STEPS, or -1. */
const rankOfStatus = (status) => STEPS.findIndex((s) => s.statuses.includes(String(status || "").toLowerCase()))

const courierOutForDelivery = (order) => {
  const s = String(order?.shipment?.status || order?.shipment?.currentStatus || "").toLowerCase()
  return s.includes("out_for_delivery") || s.includes("out for delivery")
}

export const isShopOrder = (order) => order?.fulfilmentMode === "standard"

export const isCancelledStatus = (status) => CANCELLED.includes(String(status || "").toLowerCase())

/** Nothing more will happen to it: delivered or cancelled. */
export const isShopOrderFinished = (order) => statusOf(order) === "delivered" || isCancelledStatus(statusOf(order))

/** Furthest step the order has reached (0 placed … 5 delivered), -1 while unpaid. */
function reachedRank(order) {
  const status = statusOf(order)
  let rank = status === "pending_payment" ? -1 : 0
  if (!isCancelledStatus(status)) rank = Math.max(rank, rankOfStatus(status))
  for (const h of historyOf(order)) {
    if (!isCancelledStatus(h?.to)) rank = Math.max(rank, rankOfStatus(h?.to))
  }
  if (order?.shipment?.awb) rank = Math.max(rank, 3)
  if (courierOutForDelivery(order)) rank = Math.max(rank, 4)
  return rank
}

/** When the order first moved into one of these statuses. */
function firstAt(order, statuses) {
  const hit = historyOf(order).find((h) => statuses.includes(String(h?.to || "").toLowerCase()))
  return toDate(hit?.at)
}

const isRejected = (order) => statusOf(order) === "cancelled_by_seller" && reachedRank(order) < 1

/**
 * Steps for the order page. Each is { key, label, done, current, at }; the
 * current step is the furthest one reached. A cancelled order lists the
 * steps it got through, then the cancellation.
 */
export function shopTimeline(order) {
  const status = statusOf(order)
  const cancelled = isCancelledStatus(status)
  const rank = reachedRank(order)
  const stepAt = (step, i) => {
    const at = firstAt(order, step.statuses)
    if (at) return at
    if (i === 0) return toDate(order?.createdAt)
    if (step.key === "delivered") return toDate(order?.deliveredAt || order?.deliveryState?.deliveredAt)
    return null
  }

  if (cancelled) {
    const reached = STEPS.slice(0, Math.max(rank, 0) + 1).map((step, i) => ({
      key: step.key,
      label: step.label,
      done: true,
      current: false,
      at: stepAt(step, i),
    }))
    const hit = [...historyOf(order)].reverse().find((h) => isCancelledStatus(h?.to))
    return [
      ...reached,
      {
        key: "cancelled",
        label: isRejected(order) ? "Rejected by store" : "Cancelled",
        done: true,
        current: true,
        at: toDate(order?.cancelledAt) || toDate(hit?.at),
      },
    ]
  }

  return STEPS.map((step, i) => ({
    key: step.key,
    label: step.label,
    done: i <= rank,
    current: i === Math.max(rank, 0),
    at: i <= rank ? stepAt(step, i) : null,
  }))
}

/**
 * Where the money stands on a cancelled order paid online:
 * { state: "none" | "pending" | "processed", amount, at }.
 */
export function shopRefund(order) {
  const payment = order?.payment || {}
  const refund = payment.refund || {}
  const amount = Number(refund.amount) || Number(order?.pricing?.total) || 0
  if (!payment.method || payment.method === "cash") return { state: "none", amount: 0, at: null }
  if (refund.status === "processed" || payment.status === "refunded") {
    return { state: "processed", amount, at: toDate(refund.processedAt) }
  }
  if (refund.status === "pending" || refund.status === "failed") {
    return { state: "pending", amount, at: toDate(refund.processedAt) || toDate(order?.cancelledAt) }
  }
  return { state: "none", amount: 0, at: null }
}

/** One line for the customer: what is happening to this order now. */
export function shopStatusLabel(order) {
  const status = statusOf(order)
  if (status === "pending_payment") return "Waiting for payment"
  if (isCancelledStatus(status)) {
    const refund = shopRefund(order)
    if (refund.state === "processed") return "Refunded"
    if (refund.state === "pending") return "Refund started"
    return isRejected(order) ? "Rejected by store" : "Cancelled"
  }
  return LABELS[Math.max(reachedRank(order), 0)]
}

/**
 * The window the order should arrive in: the courier's date once it has
 * one, otherwise placed date + the store-wide standard delivery days.
 */
export function expectedDelivery(order, days = {}) {
  const etd = toDate(order?.shipment?.etd)
  if (etd) return { from: etd, to: etd }
  const placed = toDate(order?.createdAt)
  if (!placed) return null
  const min = Math.max(0, Number(days?.min) || 2)
  const max = Math.max(min, Number(days?.max) || 4)
  const plus = (n) => {
    const d = new Date(placed)
    d.setDate(d.getDate() + n)
    return d
  }
  return { from: plus(min), to: plus(max) }
}

/** "Tue, 14 Oct" */
export const formatShopDay = (date) =>
  date ? new Date(date).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" }) : ""

/** "Arrives by Tue, 14 Oct – Thu, 16 Oct", or a single date. */
export function arrivalText(range, prefix = "Arrives by") {
  if (!range?.from) return ""
  const from = formatShopDay(range.from)
  const to = formatShopDay(range.to)
  return from === to || !to ? `${prefix} ${from}` : `${prefix} ${from} – ${to}`
}

/** "₹1,299" */
export const rupees = (value) => `₹${(Number(value) || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`

/** How the customer paid, in their words. */
export function paymentMethodLabel(order) {
  const method = String(order?.payment?.method || order?.paymentMethod || "").toLowerCase()
  if (method === "cash" || method === "cod") return "Cash on delivery"
  if (method === "wallet") return "Wallet"
  if (method === "razorpay_qr") return "UPI (QR)"
  if (method === "razorpay") return "Paid online"
  return method ? method.replace(/_/g, " ") : "—"
}

/** "Size: M · Colour: Red", falling back to the variant's name. */
export function variantText(item) {
  const attrs = (Array.isArray(item?.variantAttributes) ? item.variantAttributes : [])
    .filter((a) => a?.name && a?.value)
    .map((a) => `${a.name}: ${a.value}`)
  return attrs.length ? attrs.join(" · ") : String(item?.variantName || "")
}

/** The store's name on an order whose seller may or may not be populated. */
export const storeNameOf = (order) =>
  (order?.sellerId && typeof order.sellerId === "object" ? order.sellerId.sellerName || order.sellerId.name : "") ||
  order?.sellerName ||
  (typeof order?.seller === "string" ? order.seller : order?.seller?.sellerName) ||
  ""
