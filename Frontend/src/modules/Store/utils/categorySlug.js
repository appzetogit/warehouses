/**
 * Category slugs, one spelling for every link and one matcher for every page.
 *
 * Links use the category's own `slug` when the API sends one, else
 * slugifyCategory(name): "Co-ord Sets" -> "co-ord-sets", "Tops & Tees" ->
 * "tops-tees". Older links spelled it name.toLowerCase().replace(/\s+/g, "-")
 * ("tops-&-tees"), so findCategoryBySlug still accepts that, and an id.
 */

export const slugifyCategory = (name) =>
  String(name || "")
    .toLowerCase()
    .replace(/&/g, " ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")

/** The slug the old desktop links used. */
export const legacyCategorySlug = (name) => String(name || "").toLowerCase().replace(/\s+/g, "-")

/** The slug to link a category by. */
export const categorySlugOf = (category) =>
  String(category?.slug || "").trim() || slugifyCategory(category?.name)

export const isCategoryId = (value) => /^[a-f0-9]{24}$/i.test(String(value || ""))

const decode = (value) => {
  try {
    return decodeURIComponent(String(value || ""))
  } catch {
    return String(value || "")
  }
}

/**
 * The category a URL slug means, or null: its id, then its own slug, then the
 * slugified name, then the legacy spelling.
 */
export function findCategoryBySlug(categories, slug) {
  const list = Array.isArray(categories) ? categories : []
  const wanted = decode(slug).trim().toLowerCase()
  if (!wanted || !list.length) return null
  const idOf = (c) => String(c?.id || c?._id || "")
  const wantedSlug = slugifyCategory(wanted)
  return (
    list.find((c) => idOf(c) === wanted || idOf(c).toLowerCase() === wanted) ||
    list.find((c) => String(c?.slug || "").trim().toLowerCase() === wanted) ||
    list.find((c) => slugifyCategory(c?.name) === wanted) ||
    list.find((c) => legacyCategorySlug(c?.name) === wanted) ||
    // Same words, different punctuation ("co-ord%20sets", "tops-&-tees").
    (wantedSlug ? list.find((c) => slugifyCategory(c?.slug || "") === wantedSlug || slugifyCategory(c?.name) === wantedSlug) : null) ||
    null
  )
}
