import { useMemo } from "react"
import { Link } from "react-router-dom"
import { useStoreMode } from "@store/context/StoreModeContext"
import { slugifyCategory } from "@store/utils/categorySlug"
import { mediaUrl } from "../desktop/desktopCart"

/**
 * Shop home sections in the "What's the plan?" style, built from the catalogue
 * on the page so every ribbon is true:
 * - Find your fit / Accessorise it: a category grid, each tile one of the
 *   category's own photos with its best deal ("Up to 82% off", or "From ₹79").
 * - Deals on repeat: discount levels that open the matching search, shown
 *   only where enough products qualify.
 */

const CLOTHING = ["Kurtas", "Tops", "Dresses", "Co-ord Sets", "Skirts", "Pants"]
const ACCESSORIES = ["Earrings", "Neckpieces", "Rings", "Bracelets", "Watches"]
const DEAL_LEVELS = [40, 50, 60, 70]
const MIN_PER_DEAL = 6

const imageOf = (p) => {
  const raw = p?.image || (Array.isArray(p?.images) ? (typeof p.images[0] === "string" ? p.images[0] : p.images[0]?.url) : "")
  return raw ? mediaUrl(raw) : ""
}
const priceOf = (p) => Number(p?.displayPrice ?? p?.price) || 0
const offOf = (p) => {
  const price = priceOf(p)
  const mrp = Number(p?.mrp) || 0
  return mrp > price && price > 0 ? Math.round((1 - price / mrp) * 100) : 0
}
const rupees = (n) => `₹${Math.round(n).toLocaleString("en-IN")}`

export function SectionHeading({ title, subtitle }) {
  return (
    <div className="mb-4 text-center">
      <h2 className="text-[22px] font-black uppercase italic tracking-tight text-[#0F766E] lg:text-3xl">{title}</h2>
      {subtitle ? <p className="mt-0.5 text-[13px] font-extrabold uppercase tracking-wide text-[#EA580C] lg:text-[15px]">{subtitle}</p> : null}
      <span aria-hidden="true" className="mx-auto mt-1.5 block h-1 w-12 rounded-full bg-[#F97316]" />
    </div>
  )
}

/** Per category: a photo (best-rated with an image), lowest price, best discount. */
function useCategoryStats(products, names) {
  return useMemo(() => {
    const stats = new Map()
    for (const p of products) {
      const name = String(p?.categoryName || "").trim()
      if (!names.includes(name)) continue
      const s = stats.get(name) || { name, count: 0, minPrice: Infinity, maxOff: 0, cover: null }
      s.count += 1
      const price = priceOf(p)
      if (price > 0) s.minPrice = Math.min(s.minPrice, price)
      s.maxOff = Math.max(s.maxOff, offOf(p))
      if (imageOf(p) && (!s.cover || (Number(p.totalRatings) || 0) > (Number(s.cover.totalRatings) || 0))) s.cover = p
      stats.set(name, s)
    }
    return names.map((n) => stats.get(n)).filter((s) => s?.cover)
  }, [products, names])
}

const ribbonFor = (s) => (s.maxOff >= 30 ? `Up to ${s.maxOff}% off` : Number.isFinite(s.minPrice) ? `From ${rupees(s.minPrice)}` : "")

function CategoryGrid({ title, products, names, className = "" }) {
  const { storePath } = useStoreMode()
  const stats = useCategoryStats(products, names)
  const bestOff = stats.reduce((m, s) => Math.max(m, s.maxOff), 0)
  if (stats.length < 2) return null
  return (
    <section aria-label={title} className={`px-4 lg:px-0 ${className}`}>
      <SectionHeading title={title} subtitle={bestOff >= 30 ? `Up to ${bestOff}% off` : ""} />
      <div className="grid grid-cols-3 gap-2.5 lg:grid-cols-6 lg:gap-4">
        {stats.map((s) => (
          <Link key={s.name} to={storePath(`/category/${slugifyCategory(s.name)}`)} className="group block overflow-hidden rounded-2xl border-2 border-[#14B8A6] bg-white shadow-sm">
            <span className="relative block">
              <img
                src={imageOf(s.cover)}
                alt=""
                loading="lazy"
                className="aspect-[3/4] w-full object-cover object-top transition-transform duration-300 group-hover:scale-[1.03]"
              />
              <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-2 pb-1.5 pt-6 text-center text-[12px] font-extrabold uppercase tracking-wide text-white lg:text-[14px]">
                {s.name}
              </span>
            </span>
            <span className="block bg-[#F97316] px-1 py-1 text-center text-[10.5px] font-black uppercase tracking-wide text-white lg:text-[12px]">
              {ribbonFor(s)}
            </span>
          </Link>
        ))}
      </div>
    </section>
  )
}

export function FindYourFit({ products = [], className = "" }) {
  return <CategoryGrid title="Find your fit" products={products} names={CLOTHING} className={className} />
}

export function AccessoriseIt({ products = [], className = "" }) {
  return <CategoryGrid title="Accessorise it" products={products} names={ACCESSORIES} className={className} />
}

const DEAL_STYLES = [
  "from-[#0D9488] to-[#14B8A6]",
  "from-[#EA580C] to-[#F97316]",
  "from-[#0F766E] to-[#0D9488]",
  "from-[#C2410C] to-[#EA580C]",
]

export function DealsOnRepeat({ products = [], className = "" }) {
  const { storePath } = useStoreMode()
  const levels = useMemo(
    () =>
      DEAL_LEVELS.map((level) => ({ level, count: products.filter((p) => offOf(p) >= level).length })).filter(
        (l) => l.count >= MIN_PER_DEAL,
      ),
    [products],
  )
  if (levels.length < 2) return null
  return (
    <section aria-label="Deals on repeat" className={`px-4 lg:px-0 ${className}`}>
      <SectionHeading title="Deals on repeat" subtitle="Grab them before they go" />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
        {levels.map((l, i) => (
          <Link
            key={l.level}
            to={`${storePath("/search")}?minDiscount=${l.level}`}
            className={`flex aspect-[5/3] flex-col items-center justify-center rounded-2xl bg-gradient-to-br ${DEAL_STYLES[i % DEAL_STYLES.length]} text-white shadow-sm ring-2 ring-white transition active:scale-[0.98] lg:aspect-[2/1]`}
          >
            <span className="text-[11px] font-extrabold uppercase tracking-[0.2em] opacity-90">Min</span>
            <span className="text-[34px] font-black leading-none lg:text-[44px]">{l.level}%</span>
            <span className="text-[13px] font-black uppercase tracking-wide">Off</span>
            <span className="mt-1 text-[10.5px] font-semibold opacity-90">{l.count} styles</span>
          </Link>
        ))}
      </div>
    </section>
  )
}
