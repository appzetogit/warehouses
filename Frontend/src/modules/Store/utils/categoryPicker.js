/**
 * Category -> Subcategory picker for the seller and admin product forms.
 *
 * Built from the flat category list the APIs return (each entry has
 * `parentId`, null for a main category). A subcategory whose main is not in the
 * list is shown as a main, so nothing a store may use is hidden. Mains that
 * share a name ("Women" twice on the live store) get a distinguishing label
 * instead of one being dropped.
 */

const idOf = (c) => String(c?.id || c?._id || "")

export function buildCategoryPicker(list = []) {
  const items = (Array.isArray(list) ? list : [])
    .map((c) => ({
      id: idOf(c),
      name: String(c?.name || "").trim(),
      parentId: c?.parentId ? String(c.parentId?._id || c.parentId) : "",
      image: c?.image || "",
    }))
    .filter((c) => c.id && c.name)
  const byId = new Map(items.map((c) => [c.id, c]))
  const isChild = (c) => Boolean(c.parentId && byId.has(c.parentId) && !byId.get(c.parentId).parentId)

  const mains = items
    .filter((c) => !isChild(c))
    .map((c) => ({ ...c, children: items.filter((k) => isChild(k) && k.parentId === c.id) }))

  // Disambiguate duplicate names: "Women (6 subcategories)" vs "Women".
  const counts = new Map()
  for (const m of mains) {
    const key = m.name.toLowerCase()
    counts.set(key, (counts.get(key) || 0) + 1)
  }
  const used = new Map()
  for (const m of mains) {
    let label = m.name
    if (counts.get(m.name.toLowerCase()) > 1 && m.children.length) {
      label = `${m.name} (${m.children.length} subcategor${m.children.length === 1 ? "y" : "ies"})`
    }
    const key = label.toLowerCase()
    const n = (used.get(key) || 0) + 1
    used.set(key, n)
    m.label = n > 1 ? `${label} #${n}` : label
  }

  const mainById = new Map(mains.map((m) => [m.id, m]))
  return { mains, byId, mainById }
}

/** { mainId, subId } for a stored categoryId ("" when unknown / none). */
export function splitCategoryId(picker, categoryId) {
  const id = String(categoryId || "")
  if (!id || !picker?.byId?.has(id)) return { mainId: "", subId: "" }
  if (picker.mainById.has(id)) return { mainId: id, subId: "" }
  return { mainId: picker.byId.get(id).parentId, subId: id }
}

/** Subcategories of a main (empty when it has none or is unknown). */
export function childrenOf(picker, mainId) {
  return picker?.mainById?.get(String(mainId || ""))?.children || []
}
