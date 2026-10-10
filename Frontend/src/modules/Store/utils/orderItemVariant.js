/**
 * The size / colour the customer picked for an order line, for seller and
 * admin screens. Order items keep the product name in `name`; the variant is
 * in `variantName` (e.g. "M / Red") or `variantAttributes` ([{ name, value }]).
 * Returns "" when the line has no variant.
 */
export function formatItemVariant(item) {
  if (!item || typeof item !== "object") return ""
  const variantName = String(item.variantName || "").trim()
  if (variantName) return variantName
  const attrs = Array.isArray(item.variantAttributes) ? item.variantAttributes : []
  return attrs
    .map((a) => {
      const name = String(a?.name || "").trim()
      const value = String(a?.value ?? "").trim()
      if (!value) return ""
      return name ? `${name}: ${value}` : value
    })
    .filter(Boolean)
    .join(" · ")
}

/** "Product name (M / Red)" for one-line summaries; just the name without a variant. */
export function formatItemNameWithVariant(item, fallbackName = "Item") {
  const name = item?.name || item?.productName || fallbackName
  const variant = formatItemVariant(item)
  return variant ? `${name} (${variant})` : name
}
