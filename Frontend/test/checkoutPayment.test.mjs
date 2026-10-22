// Run: node --test test/checkoutPayment.test.mjs   (from Frontend/)
import { test } from "node:test"
import assert from "node:assert/strict"
import {
  isOnlinePayChoice,
  toBackendPaymentMethod,
  razorpayCheckoutConfig,
  payChoiceLabel,
} from "../src/modules/Store/utils/checkoutPayment.js"

test("Pay Later and Pay Online are both sent to the server as razorpay", () => {
  assert.equal(toBackendPaymentMethod("paylater"), "razorpay")
  assert.equal(toBackendPaymentMethod("razorpay"), "razorpay")
  assert.equal(toBackendPaymentMethod("cash"), "cash")
  assert.equal(toBackendPaymentMethod("wallet"), "wallet")
  // The order validator accepts only these.
  for (const c of ["cash", "wallet", "razorpay", "paylater", undefined]) {
    assert.ok(["razorpay", "razorpay_qr", "card", "wallet", "cash"].includes(toBackendPaymentMethod(c)))
  }
})

test("only the Razorpay choices open Checkout", () => {
  assert.equal(isOnlinePayChoice("paylater"), true)
  assert.equal(isOnlinePayChoice("razorpay"), true)
  assert.equal(isOnlinePayChoice("cash"), false)
  assert.equal(isOnlinePayChoice("wallet"), false)
})

test("Pay Later puts the paylater block first and keeps the defaults", () => {
  const cfg = razorpayCheckoutConfig("paylater")
  assert.deepEqual(cfg.display.blocks.paylater.instruments, [{ method: "paylater" }])
  assert.deepEqual(cfg.display.sequence, ["block.paylater"])
  assert.equal(cfg.display.preferences.show_default_blocks, true)
})

test("Pay Online lists UPI, wallet, card and netbanking first and keeps the defaults", () => {
  const cfg = razorpayCheckoutConfig("razorpay")
  assert.deepEqual(
    cfg.display.blocks.online.instruments.map((i) => i.method),
    ["upi", "wallet", "card", "netbanking"],
  )
  assert.deepEqual(cfg.display.sequence, ["block.online"])
  assert.equal(cfg.display.preferences.show_default_blocks, true)
})

test("cash and wallet have no Checkout config", () => {
  assert.equal(razorpayCheckoutConfig("cash"), undefined)
  assert.equal(razorpayCheckoutConfig("wallet"), undefined)
})

test("labels", () => {
  assert.equal(payChoiceLabel("paylater"), "Pay Later")
  assert.equal(payChoiceLabel("razorpay"), "Pay Online")
  assert.equal(payChoiceLabel("cash"), "Cash on Delivery")
  assert.equal(payChoiceLabel("wallet"), "Wallet")
})
