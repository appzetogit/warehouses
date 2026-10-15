/**
 * Small pieces shared by the desktop (lg+) listing, categories and product
 * pages in the customer app's look (brown on cream, sand pills, serif titles).
 */
import { useEffect, useState } from "react"
import { catalogAPI } from "@/services/api"
import { useStoreMode } from "@store/context/StoreModeContext"

export const appRing = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app-brown"

/** A sand pill, brown and white when on (the app's sub-category chips). */
export const appPill = (on) =>
  `inline-flex h-9 shrink-0 items-center gap-1.5 rounded-[20px] px-4 text-[13px] transition-colors ${appRing} ${
    on ? "bg-app-brown font-bold text-white" : "bg-app-sand font-medium text-app-ink hover:bg-app-champagne/60"
  }`

export const appOutlinedButton = `inline-flex h-11 items-center justify-center gap-2 rounded-full border border-app-brown bg-white px-6 text-[13.5px] font-bold text-app-brown transition-colors hover:bg-app-tint disabled:opacity-50 ${appRing}`

export const appSolidButton = `inline-flex h-11 items-center justify-center gap-2 rounded-full bg-app-brown px-6 text-[13.5px] font-bold text-white transition-colors hover:bg-app-brown-deep disabled:opacity-50 ${appRing}`

/** The app's empty state: an icon in a sand circle, a line, a hint, actions. */
export function AppEmptyState({ icon: Icon, title, text, children, serif = false }) {
  return (
    <div className="flex flex-col items-center px-6 py-16 text-center font-app">
      {Icon ? (
        <span className="flex h-20 w-20 items-center justify-center rounded-full bg-app-sand text-app-brown" aria-hidden="true">
          <Icon className="h-9 w-9" />
        </span>
      ) : null}
      <p className={serif ? "mt-5 font-app-display text-[28px] font-bold leading-tight text-app-brown" : "mt-5 text-[18px] font-bold text-app-ink"}>
        {title}
      </p>
      {text ? <p className="mt-1.5 max-w-[360px] text-[13.5px] text-app-muted">{text}</p> : null}
      {children ? <div className="mt-6 flex flex-wrap items-center justify-center gap-3">{children}</div> : null}
    </div>
  )
}

/** A section title in the app's serif, with an optional muted count/subtitle. */
export function AppSectionTitle({ id, children, sub = null, className = "" }) {
  return (
    <div className={`flex items-end justify-between gap-4 ${className}`}>
      <h2 id={id} className="font-app-display text-[28px] font-bold leading-[1.1] text-app-brown">
        {children}
      </h2>
      {sub}
    </div>
  )
}

/**
 * Recommendations for a product (catalogAPI, type "similar" or
 * "frequently_bought"), only what this storefront delivers. Empty while
 * loading or on error.
 */
export function useProductRecommendations(productId, type = "similar", limit = 10) {
  const { fulfilmentMode } = useStoreMode()
  const [products, setProducts] = useState([])

  useEffect(() => {
    if (!productId) return undefined
    let cancelled = false
    setProducts([])
    catalogAPI
      .getProductRecommendations(productId, { type, fulfilmentMode, limit })
      .then((res) => {
        const list = (res?.data?.data?.products || []).filter((p) => p && String(p._id) !== String(productId))
        if (!cancelled) setProducts(list)
      })
      .catch(() => {
        if (!cancelled) setProducts([])
      })
    return () => {
      cancelled = true
    }
  }, [productId, type, fulfilmentMode, limit])

  return products
}
