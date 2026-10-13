import { Fragment } from "react"
import { useStoreMode } from "@store/context/StoreModeContext"
import { useQuickEta, useShopDeliveryEstimate } from "../desktop/useDeliveryEstimates"
import { useBusinessSettings } from "../desktop/useDesktopShell"

/**
 * The app's service strip (shop_home_screen.dart _ServiceStrip): one 36px line
 * of promises gliding left, each followed by an orange star. Only promises the
 * live settings back up are listed — the return window, the courier time, cash
 * on delivery when checkout offers it, and how many local stores sell here.
 */

const daysText = (min, max) => {
  const lo = Number(min) || 0
  const hi = Number(max) || 0
  if (hi <= 0) return ""
  return lo > 0 && lo < hi ? `${lo}–${hi} days` : `${hi} day${hi === 1 ? "" : "s"}`
}

function useServiceItems(storeCount = 0) {
  const { isQuick } = useStoreMode()
  const business = useBusinessSettings()
  const eta = useQuickEta()
  const estimate = useShopDeliveryEstimate({ enabled: !isQuick })
  const s = business.settings
  const configured = s?.standardDeliveryDays
  const courier = daysText(configured?.min, configured?.max) || daysText(estimate?.minDays, estimate?.maxDays)
  return [
    business.returnWindowDays ? `Easy ${business.returnWindowDays}-day returns` : "",
    isQuick ? `Delivered in ${eta} minutes` : courier ? `Delivered in ${courier}` : "",
    s?.payments?.cashOnDelivery === true ? "Cash on Delivery available" : "",
    storeCount > 0 ? `${storeCount} local store${storeCount === 1 ? "" : "s"}` : "",
  ].filter(Boolean)
}

function Line({ items }) {
  return (
    <span className="flex shrink-0 items-center">
      {items.map((m) => (
        <Fragment key={m}>
          <span className="whitespace-nowrap text-[12px] font-semibold text-app-ink">{m}</span>
          <span className="px-4 text-[14px] leading-none text-[#E08A2E]">★</span>
        </Fragment>
      ))}
    </span>
  )
}

export default function ServiceMarquee({ storeCount = 0 }) {
  const items = useServiceItems(storeCount)
  if (!items.length) return null
  // Six copies; the track slides by half (three) and repeats, so even a short
  // line fills the screen. About 27px a second, as in the app.
  const seconds = Math.max(12, Math.round(3 * (items.join("").length * 0.27 + items.length * 1.2)))
  return (
    <section aria-label="Why shop with us" className="mx-1.5 h-9 overflow-hidden font-app">
      <ul className="sr-only">
        {items.map((m) => (
          <li key={m}>{m}</li>
        ))}
      </ul>
      <div
        aria-hidden="true"
        className="animate-scroll flex h-full w-max items-center motion-reduce:animate-none"
        style={{ animationDuration: `${seconds}s` }}
      >
        {[0, 1, 2, 3, 4, 5].map((n) => (
          <Line key={n} items={items} />
        ))}
      </div>
    </section>
  )
}
