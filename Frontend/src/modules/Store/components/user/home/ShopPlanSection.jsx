import { useEffect, useMemo, useState } from "react"
import { Link } from "react-router-dom"
import { toast } from "sonner"
import { Copy } from "lucide-react"
import { sellerAPI } from "@/services/api"
import { useStoreMode } from "@store/context/StoreModeContext"
import { slugifyCategory } from "@store/utils/categorySlug"
import { mediaUrl } from "../desktop/desktopCart"

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
    <section aria-label="What's the plan?" className={className}>
      <div className="mx-4 rounded-3xl bg-gradient-to-b from-[#E6FAF7] to-white px-3 pb-4 pt-5 ring-1 ring-[#14B8A6]/15 lg:mx-0 lg:px-6">
        <div className="mb-4 text-center">
          <h2 className="text-[22px] font-black uppercase italic tracking-tight text-[#0F766E] lg:text-3xl">What&apos;s the plan?</h2>
          <span aria-hidden="true" className="mx-auto mt-1 block h-1 w-12 rounded-full bg-[#F97316]" />
        </div>

        {tiles.length ? (
          <div className="flex snap-x snap-mandatory gap-3 overflow-x-auto pb-1 [scrollbar-width:none] lg:grid lg:grid-cols-7 lg:overflow-visible [&::-webkit-scrollbar]:hidden">
            {tiles.map((t) => (
              <Link
                key={t.label}
                to={storePath(`/category/${slugifyCategory(t.category)}`)}
                className="group w-[26%] shrink-0 snap-start text-center lg:w-auto"
              >
                <span className="block overflow-hidden rounded-2xl border-2 border-[#14B8A6] bg-white p-0.5 shadow-sm">
                  <img
                    src={t.image}
                    alt=""
                    loading="lazy"
                    className="aspect-[4/5] w-full rounded-xl object-cover object-top transition-transform duration-300 group-hover:scale-[1.03]"
                  />
                </span>
                <span className="mt-1.5 block text-[11px] font-extrabold uppercase leading-tight tracking-wide text-gray-900 lg:text-[13px]">
                  {t.label}
                </span>
              </Link>
            ))}
          </div>
        ) : null}

        {coupons.length ? (
          <div className="mt-4 flex snap-x snap-mandatory gap-3 overflow-x-auto [scrollbar-width:none] lg:grid lg:grid-cols-3 lg:overflow-visible [&::-webkit-scrollbar]:hidden">
            {coupons.map((c) => {
              const head = couponHeadline(c)
              const note = couponNote(c)
              return (
                <button
                  key={c.couponCode}
                  type="button"
                  onClick={() => onCoupon(c.couponCode)}
                  aria-label={`${head.big} ${head.small}: copy code ${c.couponCode}`}
                  className="flex w-[88%] shrink-0 snap-start items-stretch overflow-hidden rounded-xl border-2 border-dashed border-[#14B8A6] bg-white text-left active:scale-[0.99] lg:w-auto"
                >
                  <span className="flex items-center gap-1 bg-[#F0FDFA] px-3 py-2">
                    <span className="text-[10px] font-bold uppercase leading-none text-gray-600">Extra</span>
                    <span className="text-[24px] font-black leading-none text-[#0F766E]">{head.big}</span>
                    <span className="text-[10px] font-bold uppercase leading-none text-gray-600">{head.small}</span>
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col justify-center border-l-2 border-dashed border-[#14B8A6]/60 px-3 py-2">
                    <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase text-gray-500">
                      Code
                      <span className="text-[15px] font-black tracking-wide text-gray-900">{c.couponCode}</span>
                      <Copy className="h-3.5 w-3.5 text-[#F97316]" aria-hidden="true" />
                    </span>
                    {note ? <span className="line-clamp-2 text-[11px] leading-snug text-gray-500">{note}</span> : null}
                  </span>
                </button>
              )
            })}
          </div>
        ) : null}
      </div>
    </section>
  )
}
