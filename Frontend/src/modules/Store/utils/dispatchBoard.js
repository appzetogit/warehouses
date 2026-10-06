/**
 * Pure helpers for the admin "Assign Orders" board (manual dispatch of Quick
 * orders). No React or Vite imports so they can be unit tested with node:test.
 */

const EARTH_RADIUS_KM = 6371

const isNum = (n) => typeof n === "number" && Number.isFinite(n)

/** A {lat,lng} point with finite numbers, or null. */
export function validPoint(p) {
  if (!p || p.lat === null || p.lng === null || p.lat === "" || p.lng === "") return null
  const lat = Number(p.lat)
  const lng = Number(p.lng)
  if (!isNum(lat) || !isNum(lng)) return null
  return { lat, lng }
}

/** Great-circle distance in km between two {lat,lng} points; null when either is missing. */
export function haversineKm(a, b) {
  const p = validPoint(a)
  const q = validPoint(b)
  if (!p || !q) return null
  const rad = (d) => (d * Math.PI) / 180
  const dLat = rad(q.lat - p.lat)
  const dLng = rad(q.lng - p.lng)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(p.lat)) * Math.cos(rad(q.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)))
}

/** "850 m" / "3.2 km" / "" */
export function formatKm(km) {
  if (!isNum(km)) return ""
  if (km < 1) return `${Math.round(km * 1000)} m`
  return `${km < 10 ? km.toFixed(1) : Math.round(km)} km`
}

/** How many more orders the rider can take right now. */
export function remainingCapacity(rider) {
  const max = Number(rider?.maxOrders) || 0
  const active = Number(rider?.activeOrders) || 0
  return Math.max(0, max - active)
}

export function isRiderFull(rider) {
  return remainingCapacity(rider) === 0
}

/** "ok" below the alert time, "warn" from it, "late" from twice it. */
export function waitSeverity(waitingMinutes, alertMinutes) {
  const w = Number(waitingMinutes) || 0
  const a = Math.max(1, Number(alertMinutes) || 0)
  if (w >= a * 2) return "late"
  if (w >= a) return "warn"
  return "ok"
}

/** Location freshness of a rider: label plus whether it should be flagged. */
export function locationFreshness(ageMinutes, staleAfter = 10) {
  if (ageMinutes === null || ageMinutes === undefined || !isNum(Number(ageMinutes))) {
    return { label: "No location", stale: true }
  }
  const m = Math.max(0, Math.round(Number(ageMinutes)))
  const label = m < 1 ? "Location just now" : m < 60 ? `Location ${m} min ago` : `Location ${Math.floor(m / 60)} h ago`
  return { label, stale: m > staleAfter }
}

const storeKey = (o) => String(o?.store?.id ?? "")

/** Distinct store ids of the orders, in first-seen order. */
export function storeIdsOf(orders = []) {
  const seen = []
  for (const o of orders) {
    const k = storeKey(o)
    if (!seen.includes(k)) seen.push(k)
  }
  return seen
}

export function hasMixedStores(orders = []) {
  return storeIdsOf(orders).length > 1
}

/** Waiting orders grouped by store: [{ store, orders }], stores in first-seen order. */
export function groupByStore(orders = []) {
  const groups = new Map()
  for (const o of orders) {
    const k = storeKey(o)
    if (!groups.has(k)) groups.set(k, { store: o?.store || { id: k, name: "", area: "" }, orders: [] })
    groups.get(k).orders.push(o)
  }
  return [...groups.values()]
}

/** Stores for the filter, sorted by name, with how many orders each has waiting. */
export function storeOptions(orders = []) {
  return groupByStore(orders)
    .map((g) => ({ id: String(g.store?.id ?? ""), name: g.store?.name || "Store", area: g.store?.area || "", count: g.orders.length }))
    .sort((a, b) => a.name.localeCompare(b.name))
}

/**
 * Rider's distance (km) to the store of the first selected order: from the
 * rider's last point, or from the order's nearestRiders list when either point
 * is missing. null when unknown.
 */
export function riderDistanceKm(rider, selectedOrders = []) {
  const first = selectedOrders[0]
  if (!rider || !first) return null
  const km = haversineKm(rider.point, first.storePoint)
  if (km !== null) return km
  const hit = (first.nearestRiders || []).find((n) => String(n.riderId) === String(rider.id))
  return hit && isNum(Number(hit.km)) ? Number(hit.km) : null
}

/** Riders ordered for picking: free capacity first, then nearest, then name. */
export function sortRiders(riders = [], selectedOrders = []) {
  return riders
    .map((r) => ({ rider: r, km: riderDistanceKm(r, selectedOrders), full: isRiderFull(r) }))
    .sort((a, b) => {
      if (a.full !== b.full) return a.full ? 1 : -1
      if (a.km !== null && b.km !== null && a.km !== b.km) return a.km - b.km
      if ((a.km === null) !== (b.km === null)) return a.km === null ? 1 : -1
      return String(a.rider.name || "").localeCompare(String(b.rider.name || ""))
    })
}

/** Why a rider can't take the selected orders right now, or "" when they can. */
export function riderBlockReason(rider, selectedOrders = []) {
  if (!rider) return ""
  if (rider.cashBlocked && selectedOrders.some((o) => o.collectsCash)) {
    return `${rider.name || "This rider"} has reached the cash limit and can't take cash orders.`
  }
  const left = remainingCapacity(rider)
  if (left === 0) {
    return `${rider.name || "This rider"} is carrying ${rider.activeOrders} of ${rider.maxOrders} orders already.`
  }
  if (selectedOrders.length > left) {
    return `${rider.name || "This rider"} can take ${left} more order${left === 1 ? "" : "s"}; you picked ${selectedOrders.length}.`
  }
  return ""
}

/**
 * Whether "Assign" can go ahead.
 * Returns { ok, reason, warnings } where reason explains a block and
 * warnings are shown but don't block (e.g. orders from several stores).
 */
export function validateSelection({ orders = [], rider = null } = {}) {
  const warnings = []
  if (hasMixedStores(orders)) warnings.push("These orders are from more than one store; the rider will make several pickups.")
  if (!orders.length) return { ok: false, reason: "Pick at least one waiting order.", warnings }
  if (orders.length > 10) return { ok: false, reason: "You can assign up to 10 orders at a time.", warnings }
  if (!rider) return { ok: false, reason: "Pick a rider.", warnings }
  const reason = riderBlockReason(rider, orders)
  return { ok: !reason, reason, warnings }
}

/** Riders that have orders on them, busiest first. */
export function activeTrips(riders = []) {
  return riders
    .filter((r) => (Number(r.activeOrders) || 0) > 0 || (r.orders || []).length > 0)
    .sort((a, b) => (b.orders?.length || 0) - (a.orders?.length || 0) || String(a.name || "").localeCompare(String(b.name || "")))
}

/** Keep only selected ids that are still on the board. */
export function pruneSelection(selectedIds = [], waiting = []) {
  const live = new Set(waiting.map((o) => String(o.id)))
  return selectedIds.filter((id) => live.has(String(id)))
}

const STATUS_LABELS = {
  confirmed: "Confirmed",
  preparing: "Packing",
  ready_for_pickup: "Ready",
  picked_up: "Picked Up",
  out_for_delivery: "On The Way",
}

export function statusLabel(status) {
  const s = String(status || "")
  if (STATUS_LABELS[s]) return STATUS_LABELS[s]
  return s ? s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) : ""
}
