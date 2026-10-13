import { useEffect, useMemo, useState } from "react"
import { Copy, Store, TicketPercent } from "lucide-react"
import AnimatedPage from "@store/components/user/AnimatedPage"
import AccountAppBar from "@store/components/user/account/AccountAppBar"
import { sellerAPI } from "@store/api"
import { toast } from "sonner"

export default function Coupons() {
  const [loading, setLoading] = useState(true)
  const [offers, setOffers] = useState([])

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        setLoading(true)
        const res = await sellerAPI.getPublicOffers()
        const list = res?.data?.data?.allOffers || res?.data?.allOffers || []
        if (!cancelled) {
          // Only show offers meant to be visible to users (default true)
          const visible = Array.isArray(list) ? list.filter((o) => o?.showInCart !== false) : []
          setOffers(visible)
        }
      } catch (e) {
        if (!cancelled) setOffers([])
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [])

  const sortedOffers = useMemo(() => {
    if (!Array.isArray(offers)) return []
    return [...offers].sort((a, b) => String(a?.couponCode || "").localeCompare(String(b?.couponCode || "")))
  }, [offers])

  const handleCopy = async (code) => {
    const value = String(code || "").trim()
    if (!value) return
    try {
      await navigator.clipboard.writeText(value)
      toast.success("Coupon copied")
    } catch {
      toast.error("Failed to copy")
    }
  }

  return (
    <AnimatedPage className="min-h-screen bg-app-cream font-app text-app-ink dark:bg-[#0a0a0a]">
      <AccountAppBar title="Offers & coupons" backTo="/user/profile" />

      <div className="max-w-md mx-auto px-4 py-4">
        {loading ? (
          <div className="space-y-3" role="status" aria-label="Loading coupons">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-[108px] animate-pulse rounded-2xl border border-app-line bg-white" />
            ))}
          </div>
        ) : sortedOffers.length > 0 ? (
          <div className="space-y-3 pb-6">
            {sortedOffers.map((offer) => {
              const code = offer?.couponCode || ""
              const title = offer?.title || ""
              const sellerName = offer?.sellerName || "All Sellers"
              const endDate = offer?.endDate ? new Date(offer.endDate) : null
              const expiryText =
                endDate && !Number.isNaN(endDate.getTime())
                  ? `Valid till ${endDate.toLocaleDateString()}`
                  : "No expiry"

              return (
                <div
                  key={offer?.id || offer?.offerId || code}
                  className="rounded-2xl border border-app-line bg-white p-4"
                >
                  <div className="flex items-center gap-3">
                    <span className="rounded-lg border border-app-brown/40 bg-app-brown/10 px-3 py-1 text-[16px] font-semibold tracking-wide text-app-brown">
                      {code}
                    </span>
                    <span className="flex-1" />
                    <button
                      type="button"
                      onClick={() => handleCopy(code)}
                      className="flex h-9 items-center gap-1.5 rounded-xl border border-app-brown px-3 text-[13px] font-semibold text-app-brown active:bg-app-brown/10"
                    >
                      <Copy className="h-4 w-4" aria-hidden="true" />
                      Copy
                    </button>
                  </div>
                  {title ? (
                    <p className="mt-3 text-[14.5px] font-semibold text-app-ink">{title}</p>
                  ) : null}
                  <div className="mt-2 flex items-center justify-between gap-3 border-t border-dashed border-app-line pt-2 text-[12px] text-app-muted">
                    <span className="flex min-w-0 items-center gap-1">
                      <Store className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                      <span className="truncate">{sellerName}</span>
                    </span>
                    <span className="shrink-0">{expiryText}</span>
                  </div>
                </div>
              )
            })}
          </div>
        ) : (
          /* Empty State */
          <div className="flex min-h-[60vh] flex-col items-center justify-center px-4 text-center">
            <span className="flex h-20 w-20 items-center justify-center rounded-full bg-app-brown/10">
              <TicketPercent className="h-9 w-9 text-app-brown" aria-hidden="true" />
            </span>
            <h2 className="mt-4 text-[18px] font-semibold text-app-ink">No coupons found</h2>
            <p className="mt-1.5 max-w-xs text-[13px] leading-relaxed text-app-muted">
              New coupons land here regularly. Check back before your next order.
            </p>
          </div>
        )}
      </div>
    </AnimatedPage>
  )
}
