import { useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"
import { toast } from "sonner"
import { Copy, Tag } from "lucide-react"
import { sellerAPI } from "@/services/api"
import { useStoreMode } from "@store/context/StoreModeContext"
import { mediaUrl } from "../desktop/desktopCart"

/**
 * "Offers For You": the admin's offer banners for this storefront (Quick or
 * Shop). A banner with a coupon copies the code to apply in the cart; one
 * without opens its link. Renders nothing when there are no live banners.
 */

const cache = new Map() // mode -> banners, for this page load

async function copy(text) {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    // Older browsers and some webviews: fall back to a hidden field.
    const el = document.createElement("textarea")
    el.value = text
    el.setAttribute("readonly", "")
    el.style.position = "fixed"
    el.style.opacity = "0"
    document.body.appendChild(el)
    el.select()
    const ok = document.execCommand?.("copy")
    el.remove()
    return Boolean(ok)
  }
}

export default function OfferBannerStrip({ className = "", title = "Offers For You", layout = "rail", padded = true }) {
  const { mode, storePath } = useStoreMode()
  const navigate = useNavigate()
  const [banners, setBanners] = useState(() => cache.get(mode) || [])

  useEffect(() => {
    let alive = true
    if (cache.has(mode)) setBanners(cache.get(mode))
    sellerAPI
      .getOfferBannersPublic(mode)
      .then((res) => {
        const list = (res?.data?.data?.banners || []).filter((b) => b?.imageUrl)
        cache.set(mode, list)
        if (alive) setBanners(list)
      })
      .catch(() => {
        if (alive) setBanners([])
      })
    return () => {
      alive = false
    }
  }, [mode])

  if (!banners.length) return null

  const open = async (b) => {
    if (b.couponCode) {
      const copied = await copy(b.couponCode)
      toast.success(copied ? `Code ${b.couponCode} copied` : `Use code ${b.couponCode}`, {
        description: "Apply it in your cart at checkout.",
      })
      return
    }
    const link = String(b.ctaLink || "").trim()
    if (!link) return
    if (/^https?:\/\//i.test(link)) window.open(link, "_blank", "noopener,noreferrer")
    else navigate(link.startsWith("/offers") ? link : storePath(link))
  }

  const tappable = (b) => Boolean(b.couponCode || b.ctaLink)
  const grid = layout === "grid"
  const pad = padded ? "px-4 lg:px-0" : ""

  return (
    <section aria-label={title} className={className}>
      <h2 className={`mb-3 text-[17px] font-bold text-gray-900 lg:text-xl ${pad}`}>{title}</h2>
      <div
        className={
          grid
            ? `grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 ${pad}`
            : `flex snap-x snap-mandatory gap-3 overflow-x-auto pb-1 [scrollbar-width:none] lg:grid lg:grid-cols-3 lg:gap-4 lg:overflow-visible [&::-webkit-scrollbar]:hidden ${pad}`
        }
      >
        {banners.map((b) => {
          const Tagged = tappable(b) ? "button" : "div"
          return (
            <Tagged
              key={b.id}
              {...(tappable(b) ? { type: "button", onClick: () => open(b) } : {})}
              aria-label={b.couponCode ? `${b.title || "Offer"}: copy code ${b.couponCode}` : b.title || "Offer"}
              className={`group relative block shrink-0 overflow-hidden rounded-2xl bg-[#FFF1E7] text-left ${grid ? "w-full" : "w-[85%] snap-start lg:w-full"}`}
            >
              <img src={mediaUrl(b.imageUrl)} alt="" loading="lazy" className="aspect-[3/1] w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]" />
              {b.title || b.couponCode ? (
                <span className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-2 bg-gradient-to-t from-black/70 via-black/30 to-transparent px-3 pb-2 pt-6">
                  <span className="min-w-0">
                    {b.title ? <span className="block truncate text-[14px] font-bold text-white drop-shadow">{b.title}</span> : null}
                    {b.subtitle ? <span className="block truncate text-[11px] text-white/85">{b.subtitle}</span> : null}
                  </span>
                  {b.couponCode ? (
                    <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-dashed border-white/80 bg-white/95 px-2.5 py-1 text-[11px] font-bold tracking-wide text-[#C2410C]">
                      <Tag className="h-3 w-3" aria-hidden="true" />
                      {b.couponCode}
                      <Copy className="h-3 w-3 opacity-70" aria-hidden="true" />
                    </span>
                  ) : null}
                </span>
              ) : null}
            </Tagged>
          )
        })}
      </div>
    </section>
  )
}
