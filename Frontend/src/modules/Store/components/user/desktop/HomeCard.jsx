import { useState, useEffect } from "react"
import { Link } from "react-router-dom"
import { ArrowRight, ChevronRight, Clock, Star } from "lucide-react"
import { ImagePlaceholder, isRealImage, DealBadge, percentOff } from "./ui"

const focus = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-wh-brand"

/** Standard container for desktop homepage cards */
export function HomeCard({ title, seeMoreTo, seeMoreLabel = "View all", headerBadge, children }) {
  return (
    <section className="flex flex-col justify-between rounded-2xl border border-gray-100 bg-white p-5 text-gray-900 shadow-sm transition-all duration-300 hover:shadow-xl hover:-translate-y-1 hover:border-amber-200/50">
      <div>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-[19px] font-bold text-gray-950 tracking-tight">{title}</h2>
          {headerBadge || (seeMoreTo ? (
            <Link
              to={seeMoreTo}
              className={`flex items-center gap-1 text-[12px] font-medium text-gray-500 hover:text-amber-600 transition-colors ${focus}`}
            >
              {seeMoreLabel} <ArrowRight className="h-3 w-3" />
            </Link>
          ) : null)}
        </div>
        <div>{children}</div>
      </div>
    </section>
  )
}

/** 2x2 Category Grid Card matching screenshot Card 1 */
export function CategoryGridCard({ title = "Shop by category", tiles = [], seeMoreTo = "/categories" }) {
  return (
    <HomeCard title={title} seeMoreTo={seeMoreTo}>
      <div className="grid grid-cols-2 gap-3">
        {tiles.slice(0, 4).map((t, idx) => (
          <Link
            key={t.key || idx}
            to={t.to}
            className={`group relative block aspect-[4/3] w-full overflow-hidden rounded-xl bg-gray-100 shadow-xs hover:shadow-md transition-all duration-300 ${focus}`}
          >
            <img
              src={t.image}
              alt={t.label}
              loading="lazy"
              className="h-full w-full object-cover transition-transform duration-500 ease-out group-hover:scale-110"
            />
            {/* Dark gradient at bottom of card for contrast */}
            <div className="absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-black/50 via-black/20 to-transparent pointer-events-none" />
            {/* Category label pill */}
            <span className="absolute bottom-2 left-2 max-w-[75%] rounded-md bg-white/95 px-2 py-0.5 text-[11px] font-semibold text-gray-900 shadow-sm backdrop-blur-xs truncate group-hover:bg-white group-hover:text-amber-700 transition-colors">
              {t.label}
            </span>
            {/* Chevron button */}
            <div className="absolute bottom-2 right-2 flex h-6 w-6 items-center justify-center rounded-full bg-white shadow-md text-gray-700 transition-all duration-300 group-hover:scale-110 group-hover:bg-amber-500 group-hover:text-gray-950">
              <ChevronRight className="h-3.5 w-3.5" />
            </div>
          </Link>
        ))}
      </div>
    </HomeCard>
  )
}

/** Featured Deal Card with Live Countdown matching screenshot Card 2 */
export function FeaturedDealCard({
  title = "Deal of the day",
  product,
  to,
  seeMoreTo = "/offers",
}) {
  const [timeLeft, setTimeLeft] = useState("10:24:36")

  useEffect(() => {
    const updateTimer = () => {
      const now = new Date()
      const end = new Date()
      end.setHours(23, 59, 59, 999)
      const diff = Math.max(0, end - now)
      const hours = String(Math.floor(diff / (1000 * 60 * 60))).padStart(2, "0")
      const minutes = String(Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60))).padStart(2, "0")
      const seconds = String(Math.floor((diff % (1000 * 60)) / 1000)).padStart(2, "0")
      setTimeLeft(`${hours}:${minutes}:${seconds}`)
    }
    updateTimer()
    const timer = setInterval(updateTimer, 1000)
    return () => clearInterval(timer)
  }, [])

  const headerBadge = (
    <div className="flex items-center gap-1.5 rounded-full bg-red-50 px-2.5 py-0.5 text-[11px] font-bold text-red-600 border border-red-200 shadow-xs">
      <span className="relative flex h-2 w-2">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
        <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500" />
      </span>
      <Clock className="h-3 w-3" /> Ends in {timeLeft}
    </div>
  )

  // Without a real product there is nothing honest to show here.
  if (!product) return null
  const p = product
  const rating = Number(p.rating) > 0 ? Number(p.rating) : null
  const ratingCount = Number(p.ratingCount ?? p.totalRatings ?? p.reviews) || 0
  const discount = p.mrp > p.price ? Math.round(((p.mrp - p.price) / p.mrp) * 100) : 0

  return (
    <HomeCard title={title} headerBadge={headerBadge}>
      <Link to={to} className={`group block ${focus}`}>
        <div className="relative aspect-[16/10] w-full overflow-hidden rounded-xl bg-gray-100 shadow-xs">
          <img
            src={p.image}
            alt={p.name}
            loading="lazy"
            className="h-full w-full object-cover object-top transition-transform duration-500 ease-out group-hover:scale-106"
          />
          {discount > 0 && (
            <div className="absolute bottom-2.5 left-2.5 rounded bg-gradient-to-r from-red-600 to-rose-600 px-2.5 py-0.5 text-[11px] font-black text-white shadow-md">
              {discount}% OFF
            </div>
          )}
        </div>

        <h3 className="mt-3 text-[15px] font-bold text-gray-900 line-clamp-1 group-hover:text-amber-600 transition-colors">
          {p.name}
        </h3>

        <div className="mt-1 flex items-baseline gap-2">
          <span className="text-[20px] font-black text-gray-950">₹{Number(p.price || 0).toLocaleString("en-IN")}</span>
          {p.mrp > p.price && (
            <span className="text-[13px] text-gray-400 line-through">₹{Number(p.mrp).toLocaleString("en-IN")}</span>
          )}
        </div>

        <div className="mt-1 flex items-center justify-between">
          <div className="flex items-center gap-1">
            {rating ? (
              <>
                <div className="flex text-amber-500">
                  {[...Array(5)].map((_, i) => (
                    <Star
                      key={i}
                      className={`h-3.5 w-3.5 ${i < Math.round(rating) ? "fill-amber-500 text-amber-500" : "text-gray-300"}`}
                    />
                  ))}
                </div>
                <span className="ml-1 text-[13px] font-bold text-gray-800">{rating.toFixed(1)}</span>
                {ratingCount > 0 && (
                  <span className="text-[12px] text-gray-500">
                    ({ratingCount.toLocaleString("en-IN")} {ratingCount === 1 ? "rating" : "ratings"})
                  </span>
                )}
              </>
            ) : (
              <span className="text-[12px] text-gray-500">No ratings yet</span>
            )}
          </div>

          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-gray-100 text-gray-700 group-hover:bg-[#f59e0b] group-hover:text-black transition-all duration-300 shadow-xs group-hover:scale-105">
            <ChevronRight className="h-4 w-4" />
          </div>
        </div>
      </Link>
    </HomeCard>
  )
}

/** 2x2 Popular Products Grid Card matching screenshot Cards 3 & 4 */
export function PopularProductsCard({ title, seeMoreTo, items = [] }) {
  return (
    <HomeCard title={title} seeMoreTo={seeMoreTo}>
      <div className="grid grid-cols-2 gap-3">
        {items.slice(0, 4).map((it, idx) => (
          <Link key={it.key || idx} to={it.to} className={`group block ${focus}`}>
            <div className="aspect-[4/3] w-full overflow-hidden rounded-xl bg-gray-50 shadow-xs hover:shadow-md transition-all duration-300">
              <img
                src={it.image}
                alt={it.name}
                loading="lazy"
                className="h-full w-full object-cover transition-transform duration-500 ease-out group-hover:scale-110"
              />
            </div>
            <div className="mt-1.5 flex items-center justify-between gap-1 text-[12px]">
              <span className="truncate font-medium text-gray-800 group-hover:text-amber-600 transition-colors">
                {it.name}
              </span>
              {it.badge ? (
                <span className="flex shrink-0 items-center gap-0.5 font-bold text-gray-900">
                  <Star className="h-3 w-3 fill-amber-500 text-amber-500" />
                  {it.badge}
                </span>
              ) : null}
            </div>
          </Link>
        ))}
      </div>
    </HomeCard>
  )
}

/** Backward compatibility GridCard */
export function GridCard({ title, tiles = [], seeMoreTo }) {
  const list = tiles.slice(0, 4)
  if (!list.length) return null
  return (
    <CategoryGridCard title={title} tiles={list} seeMoreTo={seeMoreTo} />
  )
}

/** Backward compatibility DealCard */
export function DealCard({ title, product, to, seeMoreTo }) {
  if (!product) return null
  return <FeaturedDealCard title={title} product={product} to={to} seeMoreTo={seeMoreTo} />
}
