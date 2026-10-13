import { mediaUrl } from "../desktop/desktopCart"
import { isRealImage, percentOff } from "../desktop/ui"
import { findCategoryBySlug } from "@store/utils/categorySlug"

/**
 * Catalogue helpers for the phone home: which products belong to which public
 * category, and the facts each section prints about them (lowest price, a
 * photo, how many). Everything is read from the products on the page, so a
 * category with nothing for sale here never gets a tile.
 */

export const productImage = (p) => {
  const raw = p?.image || (Array.isArray(p?.images) ? (typeof p.images[0] === "string" ? p.images[0] : p.images[0]?.url) : "")
  return raw ? mediaUrl(raw) : ""
}

export const productPrice = (p) => Number(p?.displayPrice ?? p?.price) || 0
export const productOff = (p) => percentOff(productPrice(p), p?.mrp) || 0
export const rupees = (n) => `₹${Math.round(Number(n) || 0).toLocaleString("en-IN")}`

const norm = (s) => String(s || "").trim().toLowerCase()

/** The category's own photo when it has a real one, else "". */
export const categoryImage = (c) => (isRealImage(c?.image) ? mediaUrl(c.image) : "")

/**
 * Per public category id: the products filed under it (by categoryId, else by
 * name) and, for a parent, under its subcategories too.
 * Returns Map<id, { items, minPrice, cover }>.
 */
export function groupByCategory(categories = [], products = []) {
  const byId = new Map()
  const byName = new Map()
  for (const c of categories) {
    byId.set(String(c.id), c)
    if (!byName.has(norm(c.name))) byName.set(norm(c.name), c)
  }
  const out = new Map(categories.map((c) => [String(c.id), { items: [], minPrice: 0, cover: "" }]))
  const add = (c, p) => {
    const g = out.get(String(c.id))
    if (!g) return
    g.items.push(p)
    const price = productPrice(p)
    if (price > 0 && (!g.minPrice || price < g.minPrice)) g.minPrice = price
    if (!g.cover) g.cover = productImage(p)
  }
  for (const p of products) {
    const own = byId.get(String(p?.categoryId || "")) || byName.get(norm(p?.categoryName))
    if (!own) continue
    add(own, p)
    if (own.parentId && byId.has(String(own.parentId))) add(byId.get(String(own.parentId)), p)
  }
  return out
}

/**
 * The public category a home link points at ("/category/<slug>",
 * "/quick/category/<id>"), or null.
 */
export function categoryFromLink(link, categories) {
  const m = /\/category\/([^/?#]+)/.exec(String(link || ""))
  return m ? findCategoryBySlug(categories, m[1]) : null
}
