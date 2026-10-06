/**
 * Shared field readers for the Quick desktop UI (QUICK_UI_SPEC.md).
 * Products come straight from searchAPI / catalogAPI, so every getter has to
 * cope with the two shapes the catalogue returns (flat product and variant-led).
 */
import { mediaUrl } from "../desktopCart"

export const cx = (...a) => a.filter(Boolean).join(" ")

export const focusRing =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-wh-brand"

const num = (v) => (v == null || v === "" || !Number.isFinite(Number(v)) ? null : Number(v))

export const productId = (p) => String(p?._id || p?.id || "")

export const productName = (p) => p?.name || p?.title || "Product"

export const productPrice = (p) => num(p?.displayPrice) ?? num(p?.price) ?? num(p?.variants?.[0]?.price) ?? 0

/** The struck-through price. 0 means not set; then the MRP of the size the price comes from. */
export const productMrp = (p) => {
  const price = productPrice(p)
  const variants = Array.isArray(p?.variants) ? p.variants : []
  const priceVariant = variants.find((v) => num(v?.price) === price) || variants[0]
  return [p?.mrp, p?.originalPrice, p?.otherPrice, priceVariant?.mrp].map(num).find((n) => n > 0) ?? null
}

export const productImage = (p) =>
  mediaUrl(p?.imageUrl || p?.image || (Array.isArray(p?.images) ? p.images[0] : ""))

/** Pack size / unit line under the name; blank when the catalogue has none. */
export const productPack = (p) => {
  const raw = String(p?.packSize || p?.unit || p?.unitLabel || p?.weight || p?.quantityLabel || "").trim()
  // The seller app saves a bare count ("1"); on its own that reads as a stray number.
  return /^\d+$/.test(raw) ? `Pack of ${raw}` : raw
}

/** Variants mean the customer has to choose, so the card links out to the product page. */
export const productHasOptions = (p) => Array.isArray(p?.variants) && p.variants.length > 0

export const formatMoney = (n) => Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })
