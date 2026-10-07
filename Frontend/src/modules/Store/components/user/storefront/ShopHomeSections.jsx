import { Link } from "react-router-dom"
import { ArrowUpRight, BadgeCheck, Lock, RotateCcw, Truck } from "lucide-react"
import { useStoreMode } from "@store/context/StoreModeContext"
import { ImagePlaceholder, isRealImage } from "../desktop/ui"
import { mediaUrl } from "../desktop/desktopCart"
import Reveal from "./Reveal"
import SectionHeading from "./SectionHeading"

/**
 * Shop (courier) home sections for desktop, after the fashion-app layout of a
 * category circle strip, priced category tiles, stores on sale and a closing
 * promise row. Every figure on them comes from the catalogue the page loaded.
 */

const money = (n) => `₹${Math.round(Number(n) || 0).toLocaleString("en-IN")}`

/** The deal line a tile or card shows: a real discount first, else the lowest price. */
export function dealLabel({ maxOff = 0, fromPrice = 0 }) {
  if (maxOff >= 10) return `Up to ${maxOff}% off`
  if (fromPrice > 0) return `From ${money(fromPrice)}`
  return ""
}

/** Circle photos of the departments, right under the header. */
export function CategoryCircleStrip({ items = [] }) {
  if (items.length < 3) return null
  return (
    <nav aria-label="Shop by department" className="overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      <ul className="mx-auto flex w-max gap-5 px-1 py-1 lg:gap-7">
        {items.map((c) => {
          const image = mediaUrl(c.image)
          return (
            <li key={c.id}>
              <Link to={c.to} className="group flex w-[76px] flex-col items-center gap-1.5 focus-visible:outline-none">
                <span className="relative block h-[68px] w-[68px] overflow-hidden rounded-full bg-[#F4F0EC] ring-2 ring-transparent ring-offset-2 transition group-hover:ring-wh-brand group-focus-visible:ring-wh-brand">
                  {isRealImage(image) ? (
                    <img src={image} alt="" loading="lazy" className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-110" />
                  ) : (
                    <ImagePlaceholder name={c.label} />
                  )}
                </span>
                <span className="w-full truncate text-center text-[12px] font-semibold text-wh-text group-hover:text-wh-brand-ink">{c.label}</span>
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}

/** Two rows of category photos, each with its best deal from real prices. */
export function ShopByCategoryGrid({ title = "Shop by Category", subtitle, tiles = [] }) {
  const { storePath } = useStoreMode()
  if (!tiles.length) return null
  return (
    <Reveal as="section" aria-label={title}>
      <SectionHeading title={title} subtitle={subtitle} />
      <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-7">
        {tiles.slice(0, 14).map((t) => {
          const image = mediaUrl(t.image)
          const deal = dealLabel(t)
          return (
            <Link
              key={t.id}
              to={t.to}
              className="wh-lift group relative block aspect-[4/5] overflow-hidden rounded-2xl bg-[#F4F0EC] hover:shadow-lg focus-visible:outline-2 focus-visible:outline-wh-brand"
            >
              {isRealImage(image) ? (
                <img src={image} alt="" loading="lazy" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" />
              ) : (
                <ImagePlaceholder name={t.label} />
              )}
              <span aria-hidden="true" className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/10 to-transparent" />
              <span className="absolute left-2.5 top-2.5 right-2.5 text-[14px] font-extrabold leading-tight text-white drop-shadow">{t.label}</span>
              <span className="absolute inset-x-2.5 bottom-2.5 flex items-end justify-between gap-2">
                {deal ? (
                  <span className="rounded-md bg-wh-brand px-1.5 py-0.5 text-[11px] font-extrabold uppercase tracking-wide text-white">{deal}</span>
                ) : (
                  <span />
                )}
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white/90 text-wh-text transition group-hover:bg-white">
                  <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
                </span>
              </span>
            </Link>
          )
        })}
      </div>
      <div className="mt-4 text-center">
        <Link to={storePath("/categories")} className="text-[13px] font-bold text-wh-brand-ink hover:underline">
          See all categories
        </Link>
      </div>
    </Reveal>
  )
}

/** Stores and their best discount right now, from their listed products. */
export function StoreDealsSection({ stores = [] }) {
  if (stores.length < 2) return null
  return (
    <Reveal as="section" aria-label="Stores on sale">
      <SectionHeading title="Stores on Sale" subtitle="The biggest savings from local stores this week" />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {stores.slice(0, 6).map((s) => {
          const image = mediaUrl(s.image)
          const deal = dealLabel(s)
          return (
            <Link
              key={s.id}
              to={s.to}
              className="wh-lift group flex flex-col overflow-hidden rounded-2xl border border-wh-border bg-wh-surface hover:shadow-lg focus-visible:outline-2 focus-visible:outline-wh-brand"
            >
              <span className="relative block aspect-square overflow-hidden bg-[#F4F0EC]">
                {isRealImage(image) ? (
                  <img src={image} alt="" loading="lazy" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" />
                ) : (
                  <ImagePlaceholder name={s.name} />
                )}
                {deal ? (
                  <span className="absolute inset-x-0 bottom-0 bg-wh-nav/90 py-1.5 text-center text-[12px] font-extrabold uppercase tracking-wide text-white">
                    {deal}
                  </span>
                ) : null}
              </span>
              <span className="px-3 py-2.5">
                <span className="block truncate text-[14px] font-bold text-wh-text">{s.name}</span>
                <span className="block text-[11px] text-wh-muted">
                  {s.count} {s.count === 1 ? "style" : "styles"}
                  {s.fromPrice > 0 ? ` · from ${money(s.fromPrice)}` : ""}
                </span>
              </span>
            </Link>
          )
        })}
      </div>
    </Reveal>
  )
}

/** The closing promises before the footer; only what the store backs up. */
export function ShopPromiseRow({ returnDays }) {
  const items = [
    { icon: Lock, title: "Secure Payments", note: "UPI, cards and wallets via Razorpay" },
    { icon: BadgeCheck, title: "Genuine Products", note: "Every store is verified before it sells" },
    { icon: RotateCcw, title: "Easy Returns", note: returnDays ? `Within ${returnDays} days of delivery` : "On eligible items" },
    { icon: Truck, title: "Delivered Across India", note: "Tracked courier to your door" },
  ]
  return (
    <section aria-label="Shopping with us" className="grid grid-cols-2 gap-4 rounded-2xl border border-wh-border bg-wh-surface px-4 py-5 lg:grid-cols-4">
      {items.map(({ icon: Icon, title, note }) => (
        <div key={title} className="flex flex-col items-center gap-1.5 text-center">
          <Icon className="h-6 w-6 text-wh-brand-ink" aria-hidden="true" />
          <span className="text-[13px] font-bold text-wh-text">{title}</span>
          <span className="text-[11px] text-wh-muted">{note}</span>
        </div>
      ))}
    </section>
  )
}
