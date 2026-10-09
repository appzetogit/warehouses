// Run: node --test test/homeRails.test.mjs   (from Frontend/)
import { test } from "node:test"
import assert from "node:assert/strict"
import { buildHomeRails, categoryGroups, railSubtitle } from "../src/modules/Store/utils/homeRails.js"

const p = (id, categoryName, price, mrp, createdAt = "2026-10-09T10:00:00Z") => ({ _id: id, categoryName, categoryId: `c-${categoryName}`, price, mrp, createdAt })

const catalogue = [
  ...Array.from({ length: 5 }, (_, i) => p(`e${i}`, "Earrings", 99 + i, 500)),
  ...Array.from({ length: 4 }, (_, i) => p(`k${i}`, "Kurtas", 899 + i, 1999, "2026-10-10T10:00:00Z")),
  p("r1", "Rings", 89, 429),
  p("x1", "", 50, 0),
]

test("categories are grouped by name, busiest first, with price and discount", () => {
  const groups = categoryGroups([...catalogue, p("e9", "earrings ", 79, 0)])
  assert.deepEqual(groups.map((g) => [g.name, g.items.length]), [["Earrings", 6], ["Kurtas", 4], ["Rings", 1]])
  assert.equal(groups[0].fromPrice, 79)
  assert.equal(groups[0].maxOff, 80)
})

test("new arrivals: newest first, keeping the API order for ties, with a tab per busy category", () => {
  const { newArrivals } = buildHomeRails(catalogue, { perRail: 6 })
  assert.deepEqual(newArrivals.all.map((x) => x._id), ["k0", "k1", "k2", "k3", "e0", "e1"])
  assert.deepEqual(newArrivals.tabs.map((t) => [t.label, t.products.length]), [["Earrings", 5], ["Kurtas", 4]])
})

test("category rows need enough products and lead with the best discount", () => {
  const { categoryRails } = buildHomeRails(catalogue)
  assert.deepEqual(categoryRails.map((r) => r.name), ["Earrings", "Kurtas"])
  assert.equal(categoryRails[0].products[0]._id, "e0")
  assert.equal(categoryRails[0].count, 5)
})

test("the budget row holds products at or under the ceiling", () => {
  const { budget } = buildHomeRails([...catalogue, p("t1", "Tops", 499, 899), p("t2", "Tops", 549, 899)])
  assert.ok(budget.some((x) => x._id === "t1"))
  assert.ok(!budget.some((x) => x._id === "t2" || x._id.startsWith("k")))
  assert.equal(budget[0]._id, "e0")
})

test("row subtitles say only what is known", () => {
  assert.equal(railSubtitle({ count: 36, fromPrice: 79, maxOff: 82 }), "36 styles · from ₹79 · up to 82% off")
  assert.equal(railSubtitle({ count: 1, fromPrice: 0, maxOff: 0 }), "1 style")
})
