import { useMemo } from "react"
import { Link } from "react-router-dom"
import { useStoreMode } from "@store/context/StoreModeContext"
import { slugifyCategory } from "@store/utils/categorySlug"
import { ArrowRight } from "lucide-react"
import { mediaUrl } from "../desktop/desktopCart"
import AppSectionHeading from "./AppSectionHeading"

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

/** The app's section heading; kept under this name for existing imports. */
export function SectionHeading({ title, subtitle }) {
  return <AppSectionHeading title={title} subtitle={subtitle} />
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

// Pastel wash behind each photo and its ribbon colour (warehouse_user _tilePalette).
const TILE_PALETTE = [
  ["#FCE3A6", "#D9674A"],
  ["#EBCBD0", "#B02A4A"],
  ["#F8D2C2", "#D9674A"],
  ["#D4DFF3", "#5C74B4"],
  ["#D6E6DA", "#5E8C4A"],
  ["#EBD5BC", "#C08A1E"],
]

function CategoryGrid({ title, products, names, className = "" }) {
  const { storePath } = useStoreMode()
  const stats = useCategoryStats(products, names)
  const bestOff = stats.reduce((m, s) => Math.max(m, s.maxOff), 0)
  if (stats.length < 2) return null
  return (
    <section aria-label={title} className={`font-app ${className}`}>
      <AppSectionHeading title={title} />
      {bestOff >= 30 ? (
        <p className="mx-auto mb-3.5 w-fit rounded-full bg-app-sand px-4 py-1 text-[14px] font-medium text-app-brown-deep">
          Up to {bestOff}% Off
        </p>
      ) : null}
      <div className="grid grid-cols-3 gap-2.5 px-4 lg:grid-cols-6 lg:gap-4 lg:px-0">
        {stats.map((s, i) => {
          const [wash, ribbon] = TILE_PALETTE[i % TILE_PALETTE.length]
          return (
            <Link
              key={s.name}
              to={storePath(`/category/${slugifyCategory(s.name)}`)}
              className="group flex aspect-[3/5] flex-col overflow-hidden rounded-[10px] bg-gradient-to-b from-white to-[#FBF3EA] shadow-[0_4px_10px_rgba(25,20,17,0.10)]"
            >
              <span className="relative block min-h-0 flex-1" style={{ backgroundColor: wash }}>
                {/* The photo takes on the tile's pastel, as in the app. */}
                <img
                  src={imageOf(s.cover)}
                  alt=""
                  loading="lazy"
                  className="absolute inset-0 h-full w-full object-cover object-top mix-blend-multiply transition-transform duration-300 group-hover:scale-[1.03]"
                />
              </span>
              <span className="block px-2 pb-2 pt-2">
                <span className="block truncate font-app-display text-[14px] font-bold uppercase text-app-brown-deep">{s.name}</span>
                <span className="mt-1.5 flex items-center gap-1.5">
                  <span
                    className="min-w-0 flex-1 truncate rounded-md px-1.5 py-1 text-center text-[10px] font-extrabold uppercase text-white"
                    style={{ backgroundColor: ribbon }}
                  >
                    {ribbonFor(s)}
                  </span>
                  <span aria-hidden="true" className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-app-brown-deep text-white">
                    <ArrowRight className="h-3.5 w-3.5" />
                  </span>
                </span>
              </span>
            </Link>
          )
        })}
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

// Brown diagonals, as in the app.
const DEAL_STYLES = [
  "from-[#58321D] to-[#8A5A3C]",
  "from-[#58321D] to-[#8A5A3C]",
  "from-[#3A2619] to-[#58321D]",
  "from-[#3A2619] to-[#58321D]",
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
    <section aria-label="Deals on repeat" className={`font-app ${className}`}>
      <AppSectionHeading title="Deals on repeat" subtitle="Grab them before they go" />
      <div className="grid grid-cols-2 gap-3 px-4 lg:grid-cols-4 lg:gap-4 lg:px-0">
        {levels.map((l, i) => (
          <Link
            key={l.level}
            to={`${storePath("/search")}?minDiscount=${l.level}`}
            className={`flex aspect-[5/3] flex-col items-center justify-center rounded-2xl bg-gradient-to-br ${DEAL_STYLES[i % DEAL_STYLES.length]} text-white shadow-[0_4px_10px_rgba(25,20,17,0.12)] transition active:scale-[0.98] lg:aspect-[2/1]`}
          >
            <span className="text-[11px] font-extrabold uppercase tracking-[2px] opacity-90">Min</span>
            <span className="text-[34px] font-black leading-none lg:text-[44px]">{l.level}%</span>
            <span className="text-[13px] font-black uppercase tracking-wide">Off</span>
            <span className="mt-1 text-[10.5px] font-semibold opacity-90">{l.count} styles</span>
          </Link>
        ))}
      </div>
    </section>
  )
}
