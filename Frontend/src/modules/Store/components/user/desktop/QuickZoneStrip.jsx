import { useDeliveryLocation } from "@store/context/DeliveryLocationContext"
import { useLocationSelector } from "../UserLayout"
import { useQuickEta } from "./useDeliveryEstimates"

/** Thin brown strip under the desktop header on /quick: delivery area + ETA, or out of zone. */
export default function QuickZoneStrip() {
  const { effectiveLocation, zone, zoneLoading, isOutOfService } = useDeliveryLocation()
  const { openLocationSelector } = useLocationSelector()
  const quickEta = useQuickEta()
  if (zoneLoading) return null
  const area =
    effectiveLocation?.area?.trim() || effectiveLocation?.city || zone?.zoneName || zone?.name || "your location"
  const eta = quickEta

  if (isOutOfService) {
    return (
      <div className="wh-desktop bg-app-sand" role="status">
        <div className="mx-auto flex h-[32px] max-w-[1500px] items-center gap-2 px-[20px] text-[13px] text-app-ink">
          <span>Quick delivery isn&apos;t available at {area} yet.</span>
          <button type="button" onClick={openLocationSelector} className="font-semibold text-app-brown hover:underline">
            Change Location
          </button>
        </div>
      </div>
    )
  }
  return (
    <div className="wh-desktop bg-app-brown" role="status">
      <div className="mx-auto flex h-[32px] max-w-[1500px] items-center gap-2 px-[20px] text-[13px] text-white">
        <span>
          <span aria-hidden="true" className="text-app-champagne">⚡</span> Delivering to <strong className="text-app-champagne">{area}</strong> in ~{eta} min
        </span>
        <button type="button" onClick={openLocationSelector} className="underline-offset-2 hover:underline">
          Change
        </button>
      </div>
    </div>
  )
}
