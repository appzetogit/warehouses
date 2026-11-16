// Run: node --test test/categoryPicker.test.mjs   (from Frontend/)
import { test } from "node:test"
import assert from "node:assert/strict"
import { buildCategoryPicker, childrenOf, splitCategoryId } from "../src/modules/Store/utils/categoryPicker.js"

const list = [
  { id: "w1", name: "Women", parentId: null },
  { id: "w2", name: "Women", parentId: null },
  { id: "d", name: "Dresses", parentId: "w1" },
  { id: "k", name: "Kurtas", parentId: "w1" },
  { id: "j1", name: "Jackets", parentId: null },
  { id: "j2", name: "Jackets", parentId: null },
  { id: "o", name: "Orphan", parentId: "missing" },
]

test("mains keep every category, duplicates are labelled", () => {
  const p = buildCategoryPicker(list)
  assert.deepEqual(p.mains.map((m) => m.label), ["Women (2 subcategories)", "Women", "Jackets", "Jackets #2", "Orphan"])
  assert.deepEqual(childrenOf(p, "w1").map((c) => c.name), ["Dresses", "Kurtas"])
  assert.deepEqual(childrenOf(p, "w2"), [])
})

test("splits a stored categoryId into main + sub", () => {
  const p = buildCategoryPicker(list)
  assert.deepEqual(splitCategoryId(p, "k"), { mainId: "w1", subId: "k" })
  assert.deepEqual(splitCategoryId(p, "w1"), { mainId: "w1", subId: "" })
  assert.deepEqual(splitCategoryId(p, "o"), { mainId: "o", subId: "" })
  assert.deepEqual(splitCategoryId(p, "nope"), { mainId: "", subId: "" })
})
