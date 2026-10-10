// Run: node --test test/categorySlug.test.mjs   (from Frontend/)
import { test } from "node:test"
import assert from "node:assert/strict"
import { categorySlugOf, findCategoryBySlug, slugifyCategory } from "../src/modules/Store/utils/categorySlug.js"

const cats = [
  { id: "64b000000000000000000001", name: "Tops & Tees" },
  { id: "64b000000000000000000002", name: "Co-ord Sets" },
  { id: "64b000000000000000000003", name: "Kurtas", slug: "ethnic-kurtas" },
]

test("slugifies names", () => {
  assert.equal(slugifyCategory("Tops & Tees"), "tops-tees")
  assert.equal(slugifyCategory("Co-ord Sets"), "co-ord-sets")
  assert.equal(categorySlugOf(cats[2]), "ethnic-kurtas")
  assert.equal(categorySlugOf(cats[0]), "tops-tees")
})

test("finds by own slug, slugified name, legacy spelling and id", () => {
  assert.equal(findCategoryBySlug(cats, "ethnic-kurtas"), cats[2])
  assert.equal(findCategoryBySlug(cats, "kurtas"), cats[2])
  assert.equal(findCategoryBySlug(cats, "tops-tees"), cats[0])
  assert.equal(findCategoryBySlug(cats, "tops-&-tees"), cats[0])
  assert.equal(findCategoryBySlug(cats, "tops-%26-tees"), cats[0])
  assert.equal(findCategoryBySlug(cats, "co-ord-sets"), cats[1])
  assert.equal(findCategoryBySlug(cats, "Co-ord%20Sets"), cats[1])
  assert.equal(findCategoryBySlug(cats, "64b000000000000000000002"), cats[1])
})

test("unknown slugs find nothing", () => {
  assert.equal(findCategoryBySlug(cats, "sarees"), null)
  assert.equal(findCategoryBySlug(cats, ""), null)
  assert.equal(findCategoryBySlug([], "kurtas"), null)
})
