/**
 * The Shop home's product rows, built from the catalogue itself rather than
 * fixed themes: New Arrivals (with a tab per busy category), one row per
 * category that has enough to fill it, and an under-₹499 row.
 */

const num = (v) => {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

const offPercent = (p) => {
  const price = num(p.price)
  const mrp = num(p.mrp)
  return mrp > price && price > 0 ? Math.round(((mrp - price) / mrp) * 100) : 0
}

/** Categories by how many products they hold, busiest first; one entry per name. */
export function categoryGroups(products = []) {
  const byName = new Map()
  for (const p of products) {
    const name = String(p?.categoryName || "").trim()
    if (!name) continue
    const key = name.toLowerCase()
    if (!byName.has(key)) byName.set(key, { id: String(p.categoryId || key), name, items: [], fromPrice: 0, maxOff: 0 })
    const g = byName.get(key)
    g.items.push(p)
    const price = num(p.price)
    if (price > 0 && (!g.fromPrice || price < g.fromPrice)) g.fromPrice = price
    g.maxOff = Math.max(g.maxOff, offPercent(p))
  }
  return [...byName.values()].sort((a, b) => b.items.length - a.items.length || a.name.localeCompare(b.name))
}

const newestFirst = (a, b) => {
  const at = Date.parse(a?.createdAt || "") || 0
  const bt = Date.parse(b?.createdAt || "") || 0
  return bt - at
}

/**
 * @param products catalogue products in the order the API returned them (newest first)
 * @param opts.tabs how many category tabs New Arrivals gets
 * @param opts.rails how many category rows to show
 * @param opts.minimum fewest products a row needs to be shown
 * @param opts.budget the price ceiling of the budget row
 */
export function buildHomeRails(products = [], { tabs = 4, rails = 6, minimum = 4, perRail = 16, budget = 499 } = {}) {
  const list = products.filter((p) => p && (p._id || p.id))
  // A stable sort keeps the API's order for products added at the same moment (an import).
  const newest = [...list].sort(newestFirst)
  const groups = categoryGroups(list)
  const busy = groups.filter((g) => g.items.length >= minimum)

  return {
    newArrivals: {
      all: newest.slice(0, perRail),
      tabs: busy.slice(0, tabs).map((g) => ({
        id: g.id,
        label: g.name,
        products: newest.filter((p) => String(p.categoryName || "").trim().toLowerCase() === g.name.toLowerCase()).slice(0, perRail),
      })),
    },
    categoryRails: busy.slice(0, rails).map((g) => ({
      id: g.id,
      name: g.name,
      fromPrice: g.fromPrice,
      maxOff: g.maxOff,
      count: g.items.length,
      products: [...g.items].sort((a, b) => offPercent(b) - offPercent(a)).slice(0, perRail),
    })),
    budget: list
      .filter((p) => num(p.price) > 0 && num(p.price) <= budget)
      .sort((a, b) => offPercent(b) - offPercent(a))
      .slice(0, perRail),
    groups,
  }
}

/** "From ₹79 · up to 82% off" under a category row's title. */
export function railSubtitle({ fromPrice, maxOff, count }) {
  const parts = []
  if (count) parts.push(`${count} style${count === 1 ? "" : "s"}`)
  if (fromPrice) parts.push(`from ₹${Math.round(fromPrice).toLocaleString("en-IN")}`)
  if (maxOff) parts.push(`up to ${maxOff}% off`)
  return parts.join(" · ")
}
