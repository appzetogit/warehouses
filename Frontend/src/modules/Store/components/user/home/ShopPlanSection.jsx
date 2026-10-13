import { useEffect, useMemo, useState } from "react"
import { Link } from "react-router-dom"
import { toast } from "sonner"
import { Copy } from "lucide-react"
import { sellerAPI } from "@/services/api"
import { useStoreMode } from "@store/context/StoreModeContext"
import { slugifyCategory } from "@store/utils/categorySlug"
import { mediaUrl } from "../desktop/desktopCart"
import AppSectionHeading from "./AppSectionHeading"

/**
 * "What's the plan?": occasion tiles that open a category, each showing one of
 * that category's own products, then the live coupons as tickets that copy
 * their code. Everything comes from the catalogue and the coupons the admin
 * has running, so an occasion with no products, or no coupons, simply hides.
 */

// Occasion -> categories it opens (first one that has products wins).
const PLANS = [
  { label: "Festive Ready", categories: ["Kurtas"] },
  { label: "Brunch Plans", categories: ["Co-ord Sets"] },
  { label: "Date Night", categories: ["Dresses"] },
  { label: "Everyday Easy", categories: ["Tops"] },
  { label: "Twirl Mode", categories: ["Skirts"] },
  { label: "Office Smart", categories: ["Pants"] },
  { label: "Finishing Touch", categories: ["Earrings", "Neckpieces", "Bracelets", "Rings", "Watches"] },
]

const productImage = (p) => {
  const raw = p?.image || (Array.isArray(p?.images) ? (typeof p.images[0] === "string" ? p.images[0] : p.images[0]?.url) : "")
  return raw ? mediaUrl(raw) : ""
}

const rupees = (n) => `₹${Number(n || 0).toLocaleString("en-IN")}`

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}

function couponHeadline(c) {
  if (c.discountType === "percentage") return { big: `${c.discountValue}%`, small: "OFF" }
  return { big: rupees(c.discountValue), small: "OFF" }
}

function couponNote(c) {
  const parts = []
  if (Number(c.minOrderValue) > 0) parts.push(`On orders above ${rupees(c.minOrderValue)}`)
  if (c.discountType === "percentage" && Number(c.maxDiscount) > 0) parts.push(`up to ${rupees(c.maxDiscount)}`)
  if (c.isFirstOrderOnly) parts.push("first order")
  return parts.join(" · ")
}

export default function ShopPlanSection({ products = [], className = "" }) {
  const { storePath } = useStoreMode()
  const [coupons, setCoupons] = useState([])

  const tiles = useMemo(() => {
    const byCategory = new Map()
    for (const p of products) {
      const name = String(p?.categoryName || "").trim()
      if (!name || byCategory.has(name) || !productImage(p)) continue
      byCategory.set(name, p)
    }
    return PLANS.map((plan) => {
      const category = plan.categories.find((c) => byCategory.has(c))
      return category ? { ...plan, category, image: productImage(byCategory.get(category)) } : null
    }).filter(Boolean)
  }, [products])

  const sellerId = useMemo(() => {
    const p = products.find((x) => x?.sellerId)
    return p ? String(p.sellerId?._id || p.sellerId) : ""
  }, [products])

  useEffect(() => {
    if (!sellerId) return undefined
    let alive = true
    sellerAPI
      .getPublicOffers({ sellerId, subtotal: 0 })
      .then((res) => {
        const now = Date.now()
        const list = (res?.data?.data?.allOffers || []).filter(
          (c) => c?.couponCode && (!c.endDate || new Date(c.endDate).getTime() > now),
        )
        if (alive) setCoupons(list.slice(0, 6))
      })
      .catch(() => {
        if (alive) setCoupons([])
      })
    return () => {
      alive = false
    }
  }, [sellerId])

  if (!tiles.length && !coupons.length) return null

  const onCoupon = async (code) => {
    const copied = await copyText(code)
    toast.success(copied ? `Code ${code} copied` : `Use code ${code}`, { description: "Apply it in your cart at checkout." })
  }

  return (
    <section aria-label="What's the plan?" className={`font-app ${className}`}>
      <AppSectionHeading title="What's the plan?" />

      {tiles.length ? (
        <div className="flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-1 [scrollbar-width:none] lg:grid lg:grid-cols-7 lg:overflow-visible lg:px-0 [&::-webkit-scrollbar]:hidden">
          {tiles.map((t) => (
            <Link
              key={t.label}
              to={storePath(`/category/${slugifyCategory(t.category)}`)}
              className="group relative block h-[196px] w-[136px] shrink-0 snap-start overflow-hidden rounded-2xl bg-app-alt shadow-[0_4px_10px_rgba(25,20,17,0.10)] lg:h-auto lg:w-auto lg:aspect-[136/196]"
            >
              <img
                src={t.image}
                alt=""
                loading="lazy"
                className="absolute inset-0 h-full w-full object-cover object-top transition-transform duration-300 group-hover:scale-[1.03]"
              />
              <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 via-black/30 to-transparent px-2 pb-2.5 pt-10 text-center text-[12.5px] font-extrabold uppercase leading-tight text-white">
                {t.label}
              </span>
            </Link>
          ))}
        </div>
      ) : null}

      {coupons.length ? (
        <div className="mt-3 flex snap-x snap-mandatory gap-2.5 overflow-x-auto px-4 [scrollbar-width:none] lg:grid lg:grid-cols-3 lg:overflow-visible lg:px-0 [&::-webkit-scrollbar]:hidden">
          {coupons.map((c) => {
            const head = couponHeadline(c)
            const note = couponNote(c)
            return (
              <button
                key={c.couponCode}
                type="button"
                onClick={() => onCoupon(c.couponCode)}
                aria-label={`${head.big} ${head.small}: copy code ${c.couponCode}`}
                className="flex min-h-16 w-[78%] shrink-0 snap-start items-stretch overflow-hidden rounded-xl border-[1.5px] border-[#8A5A3C] bg-white text-left active:scale-[0.99] lg:w-auto"
              >
                <span className="flex items-center gap-1 bg-app-cream px-2.5">
                  <span className="text-[9px] font-extrabold uppercase leading-none text-[#52525B]">Extra</span>
                  <span className="text-[22px] font-black leading-none text-app-brown-deep">{head.big}</span>
                  <span className="text-[9px] font-extrabold uppercase leading-none text-[#52525B]">{head.small}</span>
                </span>
                <span className="flex min-w-0 flex-1 flex-col justify-center border-l-[1.5px] border-[#8A5A3C]/50 px-2.5 py-1.5">
                  <span className="flex items-center gap-1.5">
                    <span className="text-[10px] font-bold uppercase text-[#71717A]">Code</span>
                    <span className="truncate text-[14px] font-black text-app-ink">{c.couponCode}</span>
                    <Copy className="h-3.5 w-3.5 shrink-0 text-[#8A5A3C]" aria-hidden="true" />
                  </span>
                  {note ? <span className="line-clamp-2 text-[10.5px] leading-snug text-[#71717A]">{note}</span> : null}
                </span>
              </button>
            )
          })}
        </div>
      ) : null}
    </section>
  )
}
