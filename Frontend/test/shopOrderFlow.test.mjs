// Run: node --test test/shopOrderFlow.test.mjs   (from Frontend/)
import { test } from "node:test"
import assert from "node:assert/strict"
import {
  arrivalText,
  expectedDelivery,
  isShopOrder,
  isShopOrderFinished,
  shopRefund,
  shopStatusLabel,
  shopTimeline,
} from "../src/modules/Store/utils/shopOrderFlow.js"

const h = (to, at, from = "") => ({ to, from, at, byRole: "SELLER" })
const order = (over = {}) => ({
  _id: "o1",
  fulfilmentMode: "standard",
  orderStatus: "created",
  createdAt: "2026-10-09T10:00:00Z",
  statusHistory: [h("created", "2026-10-09T10:00:00Z")],
  payment: { method: "razorpay", status: "paid", refund: { status: "none", amount: 0 } },
  pricing: { total: 999 },
  shipment: null,
  ...over,
})

test("only standard orders are Shop orders", () => {
  assert.equal(isShopOrder(order()), true)
  assert.equal(isShopOrder(order({ fulfilmentMode: "quick" })), false)
  assert.equal(isShopOrder({}), false)
})

test("a new order waits for the store", () => {
  const steps = shopTimeline(order())
  assert.deepEqual(steps.map((s) => s.key), ["placed", "confirmed", "packed", "shipped", "out_for_delivery", "delivered"])
  assert.equal(steps[0].done, true)
  assert.equal(steps[0].current, true)
  assert.equal(steps[0].at.toISOString(), "2026-10-09T10:00:00.000Z")
  assert.equal(steps[1].done, false)
  assert.equal(shopStatusLabel(order()), "Waiting for store confirmation")
  assert.equal(isShopOrderFinished(order()), false)
})

test("steps follow the status and take their dates from the history", () => {
  const o = order({
    orderStatus: "ready_for_pickup",
    statusHistory: [h("created", "2026-10-09T10:00:00Z"), h("confirmed", "2026-10-09T11:00:00Z"), h("preparing", "2026-10-09T11:05:00Z"), h("ready_for_pickup", "2026-10-10T09:00:00Z")],
  })
  const steps = shopTimeline(o)
  assert.deepEqual(steps.map((s) => s.done), [true, true, true, false, false, false])
  assert.equal(steps[1].at.toISOString(), "2026-10-09T11:00:00.000Z")
  assert.equal(steps[2].current, true)
  assert.equal(shopStatusLabel(o), "Packed")
  assert.equal(shopStatusLabel(order({ orderStatus: "preparing" })), "Confirmed")
})

test("an AWB means shipped; the courier's status can mean out for delivery", () => {
  const shipped = order({ orderStatus: "ready_for_pickup", shipment: { awb: "AWB1", courierName: "Delhivery", status: "in_transit" } })
  assert.equal(shopStatusLabel(shipped), "Shipped")
  assert.equal(shopTimeline(shipped)[3].current, true)
  const out = order({ orderStatus: "picked_up", shipment: { awb: "AWB1", status: "OUT_FOR_DELIVERY" } })
  assert.equal(shopStatusLabel(out), "Out for delivery")
  assert.equal(shopStatusLabel(order({ orderStatus: "reached_drop" })), "Out for delivery")
})

test("delivered is the last step and finished", () => {
  const o = order({ orderStatus: "delivered", statusHistory: [h("created", "2026-10-09T10:00:00Z"), h("delivered", "2026-10-12T15:00:00Z")] })
  const steps = shopTimeline(o)
  assert.equal(steps.every((s) => s.done), true)
  assert.equal(steps[5].current, true)
  assert.equal(steps[5].at.toISOString(), "2026-10-12T15:00:00.000Z")
  assert.equal(shopStatusLabel(o), "Delivered")
  assert.equal(isShopOrderFinished(o), true)
})

test("a store that never confirmed rejected it", () => {
  const o = order({
    orderStatus: "cancelled_by_seller",
    cancellationReason: "Out of stock",
    payment: { method: "cash", status: "cod_pending" },
    statusHistory: [h("created", "2026-10-09T10:00:00Z"), h("cancelled_by_seller", "2026-10-09T12:00:00Z")],
  })
  const steps = shopTimeline(o)
  assert.deepEqual(steps.map((s) => s.key), ["placed", "cancelled"])
  assert.equal(steps[1].label, "Rejected by store")
  assert.equal(steps[1].current, true)
  assert.equal(steps[1].at.toISOString(), "2026-10-09T12:00:00.000Z")
  assert.equal(shopStatusLabel(o), "Rejected by store")
  assert.equal(shopRefund(o).state, "none")
})

test("a cancellation after confirming keeps the steps reached", () => {
  const o = order({
    orderStatus: "cancelled_by_seller",
    payment: { method: "cash" },
    statusHistory: [h("created", "2026-10-09T10:00:00Z"), h("confirmed", "2026-10-09T11:00:00Z"), h("cancelled_by_seller", "2026-10-09T12:00:00Z")],
  })
  const steps = shopTimeline(o)
  assert.deepEqual(steps.map((s) => s.key), ["placed", "confirmed", "cancelled"])
  assert.equal(steps[2].label, "Cancelled")
  assert.equal(shopStatusLabel(o), "Cancelled")
  assert.equal(shopStatusLabel(order({ orderStatus: "cancelled_by_user", payment: { method: "cash" } })), "Cancelled")
})

test("refunds on a paid order that was cancelled", () => {
  const started = order({ orderStatus: "cancelled_by_user", cancelledAt: "2026-10-09T12:00:00Z", payment: { method: "razorpay", status: "paid", refund: { status: "pending", amount: 999 } } })
  assert.equal(shopStatusLabel(started), "Refund started")
  assert.deepEqual(shopRefund(started).state, "pending")
  assert.equal(shopRefund(started).amount, 999)
  const done = order({ orderStatus: "cancelled_by_seller", payment: { method: "razorpay", status: "refunded", refund: { status: "processed", amount: 500, processedAt: "2026-10-10T10:00:00Z" } } })
  assert.equal(shopStatusLabel(done), "Refunded")
  assert.equal(shopRefund(done).amount, 500)
})

test("expected delivery counts from the order date, or uses the courier's date", () => {
  const range = expectedDelivery(order(), { min: 2, max: 4 })
  assert.equal(range.from.toISOString(), "2026-10-11T10:00:00.000Z")
  assert.equal(range.to.toISOString(), "2026-10-13T10:00:00.000Z")
  const fallback = expectedDelivery(order(), {})
  assert.equal(fallback.to.toISOString(), "2026-10-13T10:00:00.000Z")
  const etd = expectedDelivery(order({ shipment: { awb: "A", etd: "2026-10-12T00:00:00Z" } }), { min: 2, max: 4 })
  assert.equal(etd.from.toISOString(), "2026-10-12T00:00:00.000Z")
  assert.equal(expectedDelivery({}, { min: 2, max: 4 }), null)
  assert.match(arrivalText(range), /^Arrives by \w{3}, \d{1,2} \w{3} – \w{3}, \d{1,2} \w{3}$/)
})
