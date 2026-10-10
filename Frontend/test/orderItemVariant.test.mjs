// Run: node --test test/orderItemVariant.test.mjs   (from Frontend/)
import { test } from "node:test"
import assert from "node:assert/strict"
import { formatItemVariant, formatItemNameWithVariant } from "../src/modules/Store/utils/orderItemVariant.js"

test("variantName wins", () => {
  assert.equal(formatItemVariant({ variantName: "M / Red", variantAttributes: [{ name: "Size", value: "L" }] }), "M / Red")
})

test("falls back to variantAttributes", () => {
  assert.equal(
    formatItemVariant({ variantAttributes: [{ name: "Size", value: "M" }, { name: "Colour", value: "Red" }] }),
    "Size: M · Colour: Red",
  )
})

test("no variant gives empty string", () => {
  assert.equal(formatItemVariant({ name: "Tee" }), "")
  assert.equal(formatItemVariant(null), "")
  assert.equal(formatItemVariant({ variantAttributes: [{ name: "Size", value: "" }] }), "")
})

test("name with variant", () => {
  assert.equal(formatItemNameWithVariant({ name: "Tee", variantName: "XL" }), "Tee (XL)")
  assert.equal(formatItemNameWithVariant({ name: "Tee" }), "Tee")
})
