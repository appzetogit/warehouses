import { useEffect, useState } from "react"
import { catalogAPI, zoneAPI } from "@store/api"
import { useDeliveryLocation } from "@store/context/DeliveryLocationContext"

export const DEFAULT_QUICK_ETA = 10

/** The Quick delivery time for the customer's zone (admin-set per zone), 10 when unknown. */
export function useQuickEta() {
  const { zone } = useDeliveryLocation()
  const n = Number(zone?.etaMinutes)
  return Number.isFinite(n) && n > 0 ? Math.round(n) : DEFAULT_QUICK_ETA
}

/** A 6-digit pincode from the delivery location (saved address or live location). */
export function locationPincode(location) {
  const direct = [
    location?.deliveryAddress?.zipCode,
    location?.deliveryAddress?.pincode,
    location?.postalCode,
    location?.zipCode,
    location?.pincode,
  ].map((v) => String(v || "").trim()).find((v) => /^\d{6}$/.test(v))
  if (direct) return direct
  const match = String(location?.formattedAddress || location?.address || "").match(/\b(\d{6})\b/)
  return match ? match[1] : ""
}

// One request per pincode for the session; every tile shares the answer.
const estimateCache = new Map() // pincode|"" -> estimate
const estimateInFlight = new Map()

function fetchEstimate(pincode) {
  if (estimateCache.has(pincode)) return Promise.resolve(estimateCache.get(pincode))
  if (estimateInFlight.has(pincode)) return estimateInFlight.get(pincode)
  const p = catalogAPI
    .getDeliveryEstimate({ fulfilmentMode: "standard", ...(pincode ? { pincode } : {}) })
    .then((res) => {
      const data = res?.data?.data || null
      if (data) estimateCache.set(pincode, data)
      return data
    })
    .catch(() => null)
    .finally(() => estimateInFlight.delete(pincode))
  estimateInFlight.set(pincode, p)
  return p
}

/**
 * Shop (courier) delivery window for the customer's pincode:
 * `{ minDays, maxDays, fromDate, toDate }` or null while loading/failed.
 */
export function useShopDeliveryEstimate({ enabled = true } = {}) {
  const { effectiveLocation } = useDeliveryLocation()
  const pincode = locationPincode(effectiveLocation)
  const [estimate, setEstimate] = useState(() => estimateCache.get(pincode) || null)
  useEffect(() => {
    if (!enabled) return undefined
    let alive = true
    const cached = estimateCache.get(pincode)
    if (cached) {
      setEstimate(cached)
      return undefined
    }
    fetchEstimate(pincode).then((data) => alive && setEstimate(data))
    return () => {
      alive = false
    }
  }, [pincode, enabled])
  return estimate
}

const parseYmd = (ymd) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(ymd || ""))
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null
}

const dayLabel = (d) => d.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" })

/** "Delivery by Thu, 24 Sep" or "Delivery Wed, 23 Sep – Fri, 25 Sep"; fallback text when unknown. */
export function formatDeliveryWindow(estimate, fallback = "Delivered in 2–4 days") {
  const from = parseYmd(estimate?.fromDate)
  const to = parseYmd(estimate?.toDate)
  if (!to) return fallback
  if (!from || from.getTime() === to.getTime()) return `Delivery by ${dayLabel(to)}`
  return `Delivery ${dayLabel(from)} – ${dayLabel(to)}`
}

// Quick zone per saved address, cached for the session by rounded coordinates.
const addressZoneCache = new Map() // "lat,lng" -> { inService, eta }
const addressZoneInFlight = new Map()

function addressCoords(address) {
  const c = address?.location?.coordinates
  const lng = Number(Array.isArray(c) ? c[0] : address?.longitude)
  const lat = Number(Array.isArray(c) ? c[1] : address?.latitude)
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || (lat === 0 && lng === 0)) return null
  return { lat, lng, key: `${lat.toFixed(4)},${lng.toFixed(4)}` }
}

function fetchAddressZone({ lat, lng, key }) {
  if (addressZoneCache.has(key)) return Promise.resolve(addressZoneCache.get(key))
  if (addressZoneInFlight.has(key)) return addressZoneInFlight.get(key)
  const p = zoneAPI
    .detectZone(lat, lng)
    .then((res) => {
      const data = res?.data?.data || null
      const inService = data?.status === "IN_SERVICE" && Boolean(data?.zoneId)
      const n = Number(data?.zone?.etaMinutes)
      const value = { inService, eta: inService ? (Number.isFinite(n) && n > 0 ? Math.round(n) : DEFAULT_QUICK_ETA) : null }
      addressZoneCache.set(key, value)
      return value
    })
    .catch(() => null)
    .finally(() => addressZoneInFlight.delete(key))
  addressZoneInFlight.set(key, p)
  return p
}

/**
 * Delivery time for each saved address, for the cart's address list.
 * Quick: the zone's rider ETA ("In 10 min") or "Not serviceable" outside every zone.
 * Shop: the courier window for the address pincode ("Get by 2-4 days").
 * Returns `{ [addressId]: { text, ok } }`; addresses still loading are absent.
 */
export function useAddressDeliveryTimes(addresses, { quick = false, getId = (a) => a?.id || a?._id } = {}) {
  const [times, setTimes] = useState({})
  const list = Array.isArray(addresses) ? addresses : []
  const signature = list
    .map((a) => `${getId(a)}|${addressCoords(a)?.key || ""}|${locationPincode(a)}`)
    .join(";")
  useEffect(() => {
    let alive = true
    setTimes({})
    list.forEach((address) => {
      const id = getId(address)
      if (!id) return
      const done = (value) => alive && value && setTimes((prev) => ({ ...prev, [String(id)]: value }))
      if (quick) {
        const coords = addressCoords(address)
        if (!coords) return
        fetchAddressZone(coords).then((zone) => {
          if (!zone) return
          done(zone.inService ? { text: `In ${zone.eta} min`, ok: true } : { text: "Not serviceable", ok: false })
        })
      } else {
        fetchEstimate(locationPincode(address)).then((estimate) => {
          if (!estimate?.maxDays) return
          done({ text: `Get by ${estimate.minDays}-${estimate.maxDays} days`, ok: true })
        })
      }
    })
    return () => {
      alive = false
    }
    // signature covers the address list contents
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature, quick])
  return times
}
