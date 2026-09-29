import { useEffect, useMemo, useRef, useState } from "react"
import { Loader } from "@googlemaps/js-api-loader"
import { Crosshair, Loader2, MapPin } from "lucide-react"
import { getGoogleMapsApiKey } from "@store/utils/googleMapsApiKey"

/**
 * Quick stores pick a delivery zone (the ones the admin draws), then pin the
 * exact shop door on a map of that zone. The pin can only sit inside the zone:
 * riders are dispatched from it, and approval checks it. Moving the pin fills
 * the address from Google.
 *
 * zones: [{ _id, name, coordinates: [{ latitude, longitude }] }]
 * onZoneChange(zone) / onPick({ latitude, longitude, formattedAddress, area, city, state, pincode })
 */

const zoneName = (z) => z?.name || z?.zoneName || z?.serviceLocation || "Zone"
const ring = (z) => (Array.isArray(z?.coordinates) ? z.coordinates : []).map((c) => ({ lat: Number(c.latitude), lng: Number(c.longitude) }))

function inside(point, path) {
  if (path.length < 3) return false
  let isIn = false
  for (let i = 0, j = path.length - 1; i < path.length; j = i++) {
    const xi = path[i].lng
    const yi = path[i].lat
    const xj = path[j].lng
    const yj = path[j].lat
    if (yi > point.lat !== yj > point.lat && point.lng < ((xj - xi) * (point.lat - yi)) / (yj - yi) + xi) isIn = !isIn
  }
  return isIn
}

const centre = (path) => ({
  lat: path.reduce((s, p) => s + p.lat, 0) / (path.length || 1),
  lng: path.reduce((s, p) => s + p.lng, 0) / (path.length || 1),
})

function addressFrom(result) {
  const comps = Array.isArray(result?.address_components) ? result.address_components : []
  const get = (types) => comps.find((c) => types.some((t) => c.types?.includes(t)))?.long_name || ""
  return {
    formattedAddress: result?.formatted_address || "",
    area: get(["sublocality_level_1", "sublocality", "neighborhood"]) || get(["locality"]),
    city: get(["locality"]) || get(["administrative_area_level_2"]),
    state: get(["administrative_area_level_1"]),
    pincode: get(["postal_code"]),
  }
}

export default function ZonePinPicker({ zones = [], zoneId = "", value = null, onZoneChange, onPick, disabled = false }) {
  const active = useMemo(() => zones.filter((z) => z?.isActive !== false && ring(z).length >= 3), [zones])
  const zone = active.find((z) => String(z._id || z.id) === String(zoneId)) || null
  const mapEl = useRef(null)
  const map = useRef(null)
  const marker = useRef(null)
  const polygon = useRef(null)
  const geocoder = useRef(null)
  const [state, setState] = useState("idle") // idle | loading | ready | nokey | failed
  const [hint, setHint] = useState("")
  const [locating, setLocating] = useState(false)

  // Place the pin, if it's inside the zone, and fill the address from it.
  const place = (lat, lng, { pan = false } = {}) => {
    if (!zone) return
    const point = { lat, lng }
    if (!inside(point, ring(zone))) {
      setHint(`That spot is outside ${zoneName(zone)}. Pin a place inside the orange area.`)
      if (marker.current && value?.latitude) marker.current.setPosition({ lat: value.latitude, lng: value.longitude })
      return
    }
    setHint("")
    marker.current?.setPosition(point)
    if (pan) map.current?.panTo(point)
    const done = (address) =>
      onPick?.({ latitude: Number(lat.toFixed(6)), longitude: Number(lng.toFixed(6)), ...address })
    if (!geocoder.current) return done({})
    geocoder.current.geocode({ location: point }, (results, status) => {
      done(status === "OK" && results?.[0] ? addressFrom(results[0]) : {})
    })
  }

  // The map's listeners are added once; they call the latest `place` through this.
  const placeRef = useRef(place)
  placeRef.current = place

  // Load the map once a zone is chosen; redraw the zone when it changes.
  useEffect(() => {
    if (!zone || !mapEl.current) return undefined
    let cancelled = false
    setState("loading")
    ;(async () => {
      const key = await getGoogleMapsApiKey().catch(() => "")
      if (cancelled) return
      if (!key) return setState("nokey")
      try {
        if (!window.google?.maps?.Map) await new Loader({ apiKey: key, version: "weekly", libraries: ["places"] }).load()
        if (cancelled) return
        const g = window.google.maps
        const path = ring(zone)
        if (!map.current) {
          map.current = new g.Map(mapEl.current, {
            center: centre(path),
            zoom: 12,
            mapTypeControl: false,
            streetViewControl: false,
            fullscreenControl: false,
            clickableIcons: false,
            gestureHandling: "greedy",
          })
          geocoder.current = new g.Geocoder()
          marker.current = new g.Marker({ map: map.current, draggable: !disabled, position: centre(path) })
          marker.current.addListener("dragend", (e) => placeRef.current(e.latLng.lat(), e.latLng.lng()))
          map.current.addListener("click", (e) => placeRef.current(e.latLng.lat(), e.latLng.lng()))
        }
        polygon.current?.setMap(null)
        polygon.current = new g.Polygon({
          map: map.current,
          paths: path,
          strokeColor: "#EA580C",
          strokeWeight: 2,
          fillColor: "#EA580C",
          fillOpacity: 0.08,
          clickable: false,
        })
        const bounds = new g.LatLngBounds()
        path.forEach((p) => bounds.extend(p))
        map.current.fitBounds(bounds, 24)
        const start =
          value?.latitude && inside({ lat: value.latitude, lng: value.longitude }, path)
            ? { lat: value.latitude, lng: value.longitude }
            : centre(path)
        marker.current.setPosition(start)
        setState("ready")
      } catch {
        if (!cancelled) setState("failed")
      }
    })()
    return () => {
      cancelled = true
    }
    // Redraw only when the zone changes; the pin follows clicks and drags.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zone?._id])

  const useMyLocation = () => {
    if (!navigator.geolocation) return setHint("This browser can't share its location; pin the shop on the map instead.")
    setLocating(true)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false)
        place(pos.coords.latitude, pos.coords.longitude, { pan: true })
      },
      () => {
        setLocating(false)
        setHint("Couldn't get your location. Pin the shop on the map instead.")
      },
      { enableHighAccuracy: true, timeout: 10000 },
    )
  }

  return (
    <div className="space-y-3 rounded-xl border border-orange-200 bg-orange-50/40 p-3">
      <div>
        <p className="text-sm font-semibold text-gray-900">Delivery Zone for Quick*</p>
        <p className="text-xs text-gray-600">Quick orders reach customers in your zone by rider. Pick the zone your shop is in.</p>
      </div>

      {active.length ? (
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Delivery zone">
          {active.map((z) => {
            const on = String(z._id || z.id) === String(zoneId)
            return (
              <button
                key={z._id || z.id}
                type="button"
                role="radio"
                aria-checked={on}
                disabled={disabled}
                onClick={() => onZoneChange?.(z)}
                className={`rounded-full border px-3 py-1.5 text-sm font-semibold ${
                  on ? "border-[#EA580C] bg-[#EA580C] text-white" : "border-gray-300 bg-white text-gray-800"
                }`}
              >
                {zoneName(z)}
              </button>
            )
          })}
        </div>
      ) : (
        <p className="rounded-md bg-white px-3 py-2 text-xs text-gray-700">
          Quick isn't running in any city yet. Choose Shop for now; you can apply for Quick once it reaches you.
        </p>
      )}

      {zone ? (
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <p className="flex items-center gap-1 text-xs font-semibold text-gray-800">
              <MapPin className="h-3.5 w-3.5 text-[#EA580C]" aria-hidden="true" /> Pin your shop door inside {zoneName(zone)}
            </p>
            <button
              type="button"
              onClick={useMyLocation}
              disabled={disabled || locating || state !== "ready"}
              className="flex items-center gap-1 rounded-full border border-gray-300 bg-white px-2.5 py-1 text-xs font-semibold text-gray-800 disabled:opacity-50"
            >
              {locating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Crosshair className="h-3.5 w-3.5" />}
              Use My Location
            </button>
          </div>
          <div className="relative h-72 overflow-hidden rounded-lg border border-gray-200 bg-gray-100">
            <div ref={mapEl} className="h-full w-full" />
            {state !== "ready" ? (
              <div className="absolute inset-0 flex items-center justify-center p-4 text-center text-xs text-gray-600">
                {state === "loading"
                  ? "Loading the map…"
                  : state === "nokey"
                    ? "The map isn't set up yet. Search your address below instead."
                    : state === "failed"
                      ? "The map couldn't load. Search your address below instead."
                      : ""}
              </div>
            ) : null}
          </div>
          <p className="text-[11px] text-gray-600">Tap the map or drag the pin. The address below fills in from the pin.</p>
          {hint ? <p className="rounded-md bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">{hint}</p> : null}
        </div>
      ) : null}
    </div>
  )
}
