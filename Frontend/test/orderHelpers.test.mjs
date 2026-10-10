// Run: node --test test/orderHelpers.test.mjs   (from Frontend/)
import { test } from "node:test"
import assert from "node:assert/strict"
import {
  isOrderPaid,
  orderStatusLabel,
  priceRows,
  refundDestination,
  refundWhereText,
  reorderPath,
  shopRefund,
  shopStatusLabel,
  totalLabel,
} from "../src/modules/Store/utils/shopOrderFlow.js"

test("price rows add up to the order total", () => {
  const order = {
    coinsDiscount: 20,
    pricing: { subtotal: 1000, tax: 45, deliveryFee: 50, deliveryFeeGst: 9, packagingFee: 10, platformFee: 5, discount: 100, total: 999 },
  }
  const rows = priceRows(order)
  const sum = rows.reduce((n, [, v]) => n + v, 0)
  assert.equal(Math.round(sum * 100) / 100, 999)
  assert.deepEqual(rows.find(([l]) => l === "Delivery").slice(0, 2), ["Delivery", 59])
  assert.deepEqual(rows.find(([l]) => l === "Coins").slice(0, 2), ["Coins", -20])
})

test("free delivery still shows; empty rows are left out", () => {
  const rows = priceRows({ pricing: { subtotal: 500, total: 500 } })
  assert.deepEqual(rows.map(([l]) => l), ["Items", "Delivery"])
})

test("quick orders get friendly labels, shop orders keep theirs", () => {
  assert.equal(orderStatusLabel({ fulfilmentMode: "quick", orderStatus: "ready_for_pickup" }), "Packed, waiting for the rider")
  assert.equal(orderStatusLabel({ fulfilmentMode: "quick", orderStatus: "reached_drop" }), "Rider has arrived")
  assert.equal(orderStatusLabel({ fulfilmentMode: "standard", orderStatus: "created" }), "Waiting for store confirmation")
  assert.equal(orderStatusLabel({ fulfilmentMode: "quick", orderStatus: "something_new" }), "Something new")
})

test("reorder goes to the cart of the order's store mode", () => {
  assert.equal(reorderPath({ _id: "abc", fulfilmentMode: "standard" }), "/cart?reorder=abc")
  assert.equal(reorderPath({ _id: "abc", fulfilmentMode: "quick" }), "/quick/cart?reorder=abc")
})

test("money label follows how and whether it was paid", () => {
  assert.equal(totalLabel({ orderStatus: "confirmed", payment: { method: "cash", status: "cod_pending" } }), "To pay on delivery")
  assert.equal(totalLabel({ orderStatus: "delivered", payment: { method: "cash", status: "cod_pending" } }), "Paid on delivery")
  assert.equal(totalLabel({ orderStatus: "created", payment: { method: "razorpay", status: "paid" } }), "Paid")
  assert.equal(totalLabel({ orderStatus: "pending_payment", payment: { method: "razorpay", status: "created" } }), "Order total")
  assert.equal(totalLabel({ orderStatus: "cancelled_by_user", payment: { method: "razorpay", status: "refunded" } }), "Refunded")
})

test("unpaid online orders were not charged", () => {
  assert.equal(isOrderPaid({ payment: { method: "razorpay", status: "created" } }), false)
  assert.equal(isOrderPaid({ payment: { method: "razorpay", status: "authorized" } }), true)
})

test("a failed refund reads as delayed, not started", () => {
  const order = { orderStatus: "cancelled_by_user", fulfilmentMode: "standard", payment: { method: "razorpay", status: "paid", refund: { status: "failed", amount: 300 } } }
  assert.equal(shopRefund(order).state, "failed")
  assert.equal(shopStatusLabel(order), "Refund delayed")
})

test("refunds say where they go", () => {
  assert.equal(refundDestination({ payment: { method: "wallet" } }), "wallet")
  assert.equal(refundDestination({ payment: { method: "razorpay", refund: { method: "coins" } } }), "coins")
  assert.equal(refundDestination({ payment: { method: "razorpay" } }), "original")
  assert.match(refundWhereText({ payment: { method: "wallet" } }), /wallet/)
  assert.doesNotMatch(refundWhereText({ payment: { method: "wallet" } }), /5–7/)
})
