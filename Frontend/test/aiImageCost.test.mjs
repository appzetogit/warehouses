// Run: node --test test/aiImageCost.test.mjs   (from Frontend/)
import { test } from "node:test"
import assert from "node:assert/strict"
import { aiImageCost, aiUsageSummary } from "../src/modules/Store/components/seller/aiImageCost.js"

test("no included allowance: every image is priced", () => {
  const r = aiImageCost({ includedThisMonth: 0, remainingIncluded: 0, extraImagePrice: 5, remainingThisMonth: 300 }, 3)
  assert.equal(r.text, "3 images — ₹15 will be added to your monthly bill.")
  assert.equal(r.blocked, false)
  assert.equal(r.amount, 15)
})

test("included images are mentioned only when the plan has some", () => {
  assert.equal(
    aiImageCost({ includedThisMonth: 10, remainingIncluded: 4, extraImagePrice: 5 }, 3).text,
    "Uses 3 of your 10 included images this month.",
  )
  assert.equal(
    aiImageCost({ includedThisMonth: 10, remainingIncluded: 1, extraImagePrice: 5 }, 3).text,
    "Uses your last 1 included image; 2 extra images — ₹10 will be added to your monthly bill.",
  )
  assert.equal(
    aiImageCost({ includedThisMonth: 10, remainingIncluded: 0, extraImagePrice: 5 }, 1).text,
    "1 extra image — ₹5 will be added to your monthly bill.",
  )
})

test("the monthly cap blocks generating", () => {
  const r = aiImageCost({ extraImagePrice: 5, remainingThisMonth: 2 }, 3)
  assert.equal(r.blocked, true)
  assert.match(r.text, /Only 2 AI images left/)
  assert.equal(aiImageCost({ extraImagePrice: 5, remainingThisMonth: 0 }, 1).blocked, true)
  assert.equal(aiImageCost({ extraImagePrice: 5, remainingThisMonth: null }, 3).blocked, false)
})

test("usage card summary", () => {
  assert.equal(aiUsageSummary({ usedThisMonth: 4, includedThisMonth: 0, extraCostThisMonth: 20 }), "4 images made · ₹20 on this month's bill")
  assert.equal(aiUsageSummary({ usedThisMonth: 4, includedThisMonth: 10, extraCostThisMonth: 0 }), "4 images made · 4 of 10 included · ₹0 on this month's bill")
})
