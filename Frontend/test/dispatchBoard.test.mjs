// Run: node --test test/dispatchBoard.test.mjs   (from Frontend/)
import { test } from "node:test"
import assert from "node:assert/strict"
import {
  haversineKm,
  formatKm,
  remainingCapacity,
  isRiderFull,
  waitSeverity,
  locationFreshness,
  hasMixedStores,
  groupByStore,
  storeOptions,
  riderDistanceKm,
  sortRiders,
  validateSelection,
  activeTrips,
  pruneSelection,
  statusLabel,
} from "../src/modules/Store/utils/dispatchBoard.js"

const storeA = { id: "s1", name: "Alpha Mart", area: "Kothrud" }
const storeB = { id: "s2", name: "Beta Fresh", area: "Baner" }
const order = (id, store, extra = {}) => ({ id, orderId: `Q${id}`, store, storePoint: { lat: 18.5, lng: 73.8 }, collectsCash: false, ...extra })
const rider = (id, extra = {}) => ({ id, name: `Rider ${id}`, activeOrders: 0, maxOrders: 3, cashBlocked: false, point: null, ...extra })

test("haversineKm: known distance and missing points", () => {
  // Pune to Mumbai is roughly 120 km as the crow flies.
  const km = haversineKm({ lat: 18.5204, lng: 73.8567 }, { lat: 19.076, lng: 72.8777 })
  assert.ok(km > 115 && km < 125, `got ${km}`)
  assert.equal(haversineKm({ lat: 10, lng: 10 }, { lat: 10, lng: 10 }), 0)
  assert.equal(haversineKm(null, { lat: 1, lng: 1 }), null)
  assert.equal(haversineKm({ lat: null, lng: 1 }, { lat: 1, lng: 1 }), null)
  assert.equal(haversineKm({ lat: "x", lng: 1 }, { lat: 1, lng: 1 }), null)
})

test("formatKm", () => {
  assert.equal(formatKm(0.45), "450 m")
  assert.equal(formatKm(3.21), "3.2 km")
  assert.equal(formatKm(12.6), "13 km")
  assert.equal(formatKm(null), "")
})

test("capacity", () => {
  assert.equal(remainingCapacity(rider("a", { activeOrders: 1, maxOrders: 3 })), 2)
  assert.equal(remainingCapacity(rider("a", { activeOrders: 4, maxOrders: 3 })), 0)
  assert.equal(isRiderFull(rider("a", { activeOrders: 1, maxOrders: 1 })), true)
  assert.equal(isRiderFull(rider("a")), false)
})

test("waitSeverity: amber from alert minutes, red from twice", () => {
  assert.equal(waitSeverity(4, 5), "ok")
  assert.equal(waitSeverity(5, 5), "warn")
  assert.equal(waitSeverity(9, 5), "warn")
  assert.equal(waitSeverity(10, 5), "late")
  assert.equal(waitSeverity(1, 0), "warn") // alert floor of 1 minute
})

test("locationFreshness", () => {
  assert.deepEqual(locationFreshness(null), { label: "No location", stale: true })
  assert.deepEqual(locationFreshness(0.2), { label: "Location just now", stale: false })
  assert.deepEqual(locationFreshness(2), { label: "Location 2 min ago", stale: false })
  assert.equal(locationFreshness(11).stale, true)
  assert.equal(locationFreshness(10).stale, false)
  assert.equal(locationFreshness(130).label, "Location 2 h ago")
})

test("mixed stores and grouping", () => {
  const list = [order("1", storeA), order("2", storeB), order("3", storeA)]
  assert.equal(hasMixedStores(list), true)
  assert.equal(hasMixedStores([list[0], list[2]]), false)
  assert.equal(hasMixedStores([]), false)
  const groups = groupByStore(list)
  assert.equal(groups.length, 2)
  assert.deepEqual(groups[0].orders.map((o) => o.id), ["1", "3"])
  assert.deepEqual(groups[1].orders.map((o) => o.id), ["2"])
  assert.deepEqual(storeOptions(list).map((s) => [s.id, s.count]), [["s1", 2], ["s2", 1]])
})

test("riderDistanceKm: own point first, nearestRiders as fallback", () => {
  const o = order("1", storeA, { storePoint: { lat: 18.5, lng: 73.8 }, nearestRiders: [{ riderId: "b", km: 2.5 }] })
  const near = rider("a", { point: { lat: 18.51, lng: 73.8 } })
  const km = riderDistanceKm(near, [o])
  assert.ok(km > 1 && km < 1.2, `got ${km}`)
  assert.equal(riderDistanceKm(rider("b"), [o]), 2.5)
  assert.equal(riderDistanceKm(rider("c"), [o]), null)
  assert.equal(riderDistanceKm(near, []), null)
})

test("sortRiders: free first, then nearest, unknown distance last", () => {
  const o = order("1", storeA)
  const riders = [
    rider("full", { activeOrders: 3, maxOrders: 3, point: { lat: 18.5, lng: 73.8 } }),
    rider("far", { point: { lat: 18.6, lng: 73.8 } }),
    rider("unknown"),
    rider("near", { point: { lat: 18.501, lng: 73.8 } }),
  ]
  assert.deepEqual(sortRiders(riders, [o]).map((x) => x.rider.id), ["near", "far", "unknown", "full"])
})

test("validateSelection", () => {
  const cash = order("1", storeA, { collectsCash: true })
  const prepaid = order("2", storeA)
  const other = order("3", storeB)

  assert.equal(validateSelection({ orders: [], rider: rider("a") }).ok, false)
  assert.equal(validateSelection({ orders: [prepaid], rider: null }).reason, "Pick a rider.")
  assert.equal(validateSelection({ orders: [prepaid], rider: rider("a") }).ok, true)

  // Cash-blocked rider: fine for prepaid, blocked for cash.
  const blocked = rider("a", { cashBlocked: true })
  assert.equal(validateSelection({ orders: [prepaid], rider: blocked }).ok, true)
  const r = validateSelection({ orders: [prepaid, cash], rider: blocked })
  assert.equal(r.ok, false)
  assert.match(r.reason, /cash limit/)

  // Capacity.
  const oneLeft = rider("a", { activeOrders: 2, maxOrders: 3 })
  assert.equal(validateSelection({ orders: [prepaid], rider: oneLeft }).ok, true)
  const over = validateSelection({ orders: [prepaid, other], rider: oneLeft })
  assert.equal(over.ok, false)
  assert.match(over.reason, /can take 1 more order;/)
  assert.match(validateSelection({ orders: [prepaid], rider: rider("a", { activeOrders: 1, maxOrders: 1 }) }).reason, /carrying 1 of 1/)

  // Mixed stores warn but don't block.
  const mixed = validateSelection({ orders: [prepaid, other], rider: rider("a") })
  assert.equal(mixed.ok, true)
  assert.equal(mixed.warnings.length, 1)

  // More than 10 orders.
  const many = Array.from({ length: 11 }, (_, i) => order(String(i), storeA))
  assert.equal(validateSelection({ orders: many, rider: rider("a", { maxOrders: 20 }) }).ok, false)
})

test("activeTrips and pruneSelection", () => {
  const riders = [
    rider("idle"),
    rider("one", { activeOrders: 1, orders: [{ id: "x" }] }),
    rider("two", { activeOrders: 2, orders: [{ id: "y" }, { id: "z" }] }),
  ]
  assert.deepEqual(activeTrips(riders).map((r) => r.id), ["two", "one"])
  assert.deepEqual(pruneSelection(["1", "2", "9"], [{ id: "1" }, { id: "2" }]), ["1", "2"])
})

test("statusLabel", () => {
  assert.equal(statusLabel("preparing"), "Packing")
  assert.equal(statusLabel("ready_for_pickup"), "Ready")
  assert.equal(statusLabel("reached_store"), "Reached Store")
  assert.equal(statusLabel(""), "")
})

test("paymentCollectsCash: cash and QR at the door, not prepaid", async () => {
  const { paymentCollectsCash } = await import("../src/modules/Store/utils/dispatchBoard.js")
  assert.equal(paymentCollectsCash("cash"), true)
  assert.equal(paymentCollectsCash("razorpay_qr"), true)
  assert.equal(paymentCollectsCash("RAZORPAY_QR"), true)
  assert.equal(paymentCollectsCash("razorpay"), false)
  assert.equal(paymentCollectsCash(""), false)
})

test("coalesce: a call made during a load runs after it instead of being dropped", async () => {
  const { coalesce } = await import("../src/modules/Store/utils/dispatchBoard.js")
  const calls = []
  let release
  const first = new Promise((r) => (release = r))
  const load = coalesce(async (tag) => {
    calls.push(tag)
    if (tag === "poll") await first
  })
  const p1 = load("poll")
  load("after-assign-1")
  load("after-assign-2")
  assert.deepEqual(calls, ["poll"], "no overlapping loads")
  release()
  await p1
  assert.deepEqual(calls, ["poll", "after-assign-2"], "one more load, with the latest args")
})
