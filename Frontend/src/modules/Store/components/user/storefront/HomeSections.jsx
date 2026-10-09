import { useState } from "react"
import { Link } from "react-router-dom"
import { ArrowRight, BadgeCheck, Gift, RotateCcw, Truck } from "lucide-react"
import { useStoreMode } from "@store/context/StoreModeContext"
import { ImagePlaceholder, isRealImage } from "../desktop/ui"
import { mediaUrl } from "../desktop/desktopCart"
import ProductCard from "./ProductCard"
import Rail from "./Rail"
import Reveal from "./Reveal"
import SectionHeading from "./SectionHeading"

/**
 * The home page's sections, in the reference's order and proportions
 * (MOBILE_UI_SPEC.md). Each one takes data the page already loads; none of
 * them fetch.
 */

const TRUST = [
  { icon: BadgeCheck, title: "Every seller checked", note: "Approved stores only" },
  { icon: Gift, title: "Gift-Ready Packing", note: "Notes and boxes" },
  { icon: Truck, title: "Delivered across India", note: "Courier or 10-minute rider" },
  { icon: RotateCcw, title: "Easy Returns", note: "Per our returns policy" },
]

/** The four promises under the hero: icon chip, title, one-line note. */
export function TrustStrip() {
  return (
    <Reveal
      as="section"
      aria-label="Why shop with us"
      className="grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-4"
    >
      {TRUST.map(({ icon: Icon, title, note }) => (
        <div
          key={title}
          className="wh-lift flex items-center gap-2 rounded-2xl border border-wh-border bg-wh-surface p-2.5 hover:shadow-md sm:gap-3 sm:p-3"
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-wh-brand-50 text-wh-brand-ink">
            <Icon className="h-4 w-4" aria-hidden="true" />
          </span>
          <span className="min-w-0">
            <span className="block truncate text-[12px] font-bold text-wh-text sm:text-[13px]">{title}</span>
            <span className="block truncate text-[10px] text-wh-muted sm:text-[11px]">{note}</span>
          </span>
        </div>
      ))}
    </Reveal>
  )
}

/** The scrolling announcement strip. The text is duplicated so the loop seams. */
export function Marquee({ items = [] }) {
  if (!items.length) return null
  const run = [...items, ...items]
  return (
    <section aria-label="Announcements" className="overflow-hidden rounded-2xl bg-wh-nav py-2">
      <div className="wh-marquee-track flex w-max items-center gap-8 whitespace-nowrap px-4">
        {run.map((text, i) => (
          <span key={i} className="flex items-center gap-2 text-[12px] font-semibold text-white/90">
            <span aria-hidden="true" className="wh-blink text-wh-brand">
              ★
            </span>
            {text}
          </span>
        ))}
      </div>
    </section>
  )
}

/** Category tiles: photo, dark gradient, name and an "Explore" cue. */
export function CollectionTiles({ title, subtitle, tiles = [], seeAllTo }) {
  const { storePath } = useStoreMode()
  if (!tiles.length) return null

  return (
    <Reveal as="section" aria-label={title}>
      <SectionHeading title={title} subtitle={subtitle} />
      {/* The collections drift along on their own, and stop the moment you
          reach for one. */}
      <Rail
        rows={1}
        ariaLabel={title}
        auto={3800}
        cols="auto-cols-[40vw] sm:auto-cols-[26vw] lg:auto-cols-[190px]"
      >
        {tiles.map((tile) => {
          const image = mediaUrl(tile.image)
          return (
            <Link
              key={tile.id}
              to={tile.to}
              className="wh-lift wh-sheen group relative block aspect-[4/5] snap-start overflow-hidden rounded-2xl bg-[#F7F7F7] hover:shadow-lg focus-visible:outline-2 focus-visible:outline-wh-brand"
            >
              {isRealImage(image) ? (
                <img
                  src={image}
                  alt=""
                  loading="lazy"
                  className="h-full w-full object-cover transition-transform duration-500 ease-out group-hover:scale-110"
                />
              ) : (
                <ImagePlaceholder name={tile.label} />
              )}
              <span aria-hidden="true" className="absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-black/80 via-black/30 to-transparent" />
              <span className="absolute inset-x-2 bottom-2">
                <span className="block truncate text-[12px] font-bold text-white drop-shadow sm:text-[13px]">{tile.label}</span>
                <span className="mt-0.5 flex items-center gap-1 text-[10px] font-semibold text-wh-brand">
                  Explore <ArrowRight className="h-3 w-3" aria-hidden="true" />
                </span>
              </span>
            </Link>
          )
        })}
      </Rail>
      {seeAllTo ? (
        <div className="mt-4 text-center">
          <Link
            to={storePath(seeAllTo)}
            className="inline-flex items-center gap-2 rounded-full bg-wh-nav px-5 py-2.5 text-[12px] font-bold uppercase tracking-wide text-white hover:bg-wh-nav-2"
          >
            View more <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </div>
      ) : null}
    </Reveal>
  )
}

/** A titled rail of product cards. */
export function ProductRailSection({ title, subtitle, products = [], onAdd, minimum = 4, auto = 0, seeAllTo = "" }) {
  if (products.length < minimum) return null

  return (
    <Reveal as="section" aria-label={title}>
      <SectionHeading title={title} subtitle={subtitle} />
      <Rail ariaLabel={title} auto={auto}>
        {products.map((product) => (
          <div key={product._id || product.id} className="snap-start">
            <ProductCard product={product} onAction={onAdd} />
          </div>
        ))}
      </Rail>
      {seeAllTo ? <SeeAllLink to={seeAllTo} label={`View all ${title}`} /> : null}
    </Reveal>
  )
}

function SeeAllLink({ to, label }) {
  return (
    <div className="mt-4 text-center">
      <Link
        to={to}
        className="inline-flex items-center gap-1.5 rounded-full border border-wh-text px-5 py-2 text-[13px] font-bold text-wh-text hover:bg-wh-text hover:text-white"
      >
        {label} <ArrowRight className="h-4 w-4" aria-hidden="true" />
      </Link>
    </div>
  )
}

/**
 * A product row with category tabs above it ("All", "Kurtas", "Tops"...),
 * like the old shop's New Arrivals. Tabs only switch what the row shows.
 */
export function TabbedRailSection({ title, subtitle, all = [], tabs = [], onAdd, minimum = 4 }) {
  const [active, setActive] = useState("all")
  if (all.length < minimum) return null
  const current = tabs.find((t) => t.id === active)
  const products = current ? current.products : all

  return (
    <Reveal as="section" aria-label={title}>
      <SectionHeading title={title} subtitle={subtitle} />
      {tabs.length ? (
        <div role="tablist" aria-label={`${title} categories`} className="mb-4 flex flex-wrap justify-center gap-2">
          {[{ id: "all", label: "All" }, ...tabs].map((t) => {
            const selected = t.id === active || (t.id === "all" && !current)
            return (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={selected}
                onClick={() => setActive(t.id)}
                className={`rounded-full px-4 py-1.5 text-[12px] font-bold uppercase tracking-wide transition-colors sm:text-[13px] ${
                  selected ? "bg-wh-text text-white" : "border border-wh-border bg-wh-surface text-wh-text hover:border-wh-text"
                }`}
              >
                {t.label}
              </button>
            )
          })}
        </div>
      ) : null}
      <Rail key={active} ariaLabel={title}>
        {products.map((product) => (
          <div key={product._id || product.id} className="snap-start">
            <ProductCard product={product} onAction={onAdd} />
          </div>
        ))}
      </Rail>
      {current?.to ? <SeeAllLink to={current.to} label={`View all ${current.label}`} /> : null}
    </Reveal>
  )
}

/** The dark band that breaks up the page, with a headline and a call to action. */
export function FeatureBand({ title, subtitle, ctaLabel, ctaTo }) {
  return (
    <Reveal
      as="section"
      className="overflow-hidden rounded-2xl bg-gradient-to-br from-wh-nav via-wh-nav-2 to-wh-nav-3 px-5 py-8 text-center sm:py-10"
    >
      <h2 className="font-display text-[24px] font-semibold leading-tight text-white sm:text-[32px]">{title}</h2>
      {subtitle ? <p className="mx-auto mt-2 max-w-xl text-[12px] text-white/75 sm:text-[14px]">{subtitle}</p> : null}
      {ctaTo ? (
        <Link
          to={ctaTo}
          className="mt-5 inline-flex items-center gap-2 rounded-full bg-wh-brand px-5 py-2.5 text-[13px] font-bold text-wh-text hover:bg-wh-brand-600"
        >
          {ctaLabel} <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </Link>
      ) : null}
    </Reveal>
  )
}

/** Curated style lookbooks and seasonal trend moodboards */
export function CuratedEditsSection() {
  const { storePath } = useStoreMode()

  const edits = [
    {
      id: "linen-casuals",
      badge: "Pure Linens",
      title: "The Linen Studio",
      desc: "Breathable natural weaves & relaxed shirts",
      image: "/uploads/seed/banners/hero-the-linen-cotton-stu.webp",
      to: "/category/shirts",
      accent: "from-stone-950/85 via-black/40 to-transparent",
    },
    {
      id: "streetwear-oversized",
      badge: "New Season Drop",
      title: "Streetwear & Graphic",
      desc: "Heavyweight 240 GSM drop-shoulder tees & cargos",
      image: "/uploads/seed/banners/hero-autumn-winter-contem.webp",
      to: "/category/t-shirts",
      accent: "from-slate-950/85 via-black/40 to-transparent",
    },
    {
      id: "artisanal-festive",
      badge: "Heritage Royal",
      title: "Festive & Ethnic Kurtas",
      desc: "Chanderi silks, handloom weaves & royal anarkalis",
      image: "/uploads/quick/fashion/banners/banner-3-festive-ethnic.webp",
      to: "/category/kurtas",
      accent: "from-rose-950/85 via-black/40 to-transparent",
    },
    {
      id: "indigo-denim",
      badge: "Timeless Essentials",
      title: "Indigo Denim Studio",
      desc: "Raw selvedge slim-tapered jeans & trucker jackets",
      image: "/uploads/seed/banners/hero-timeless-indigo-deni.webp",
      to: "/category/jeans",
      accent: "from-blue-950/85 via-black/40 to-transparent",
    },
  ]

  return (
    <Reveal as="section" aria-label="Curated Fashion Edits">
      <SectionHeading
        title="Curated Style Edits"
        subtitle="Handpicked seasonal moodboards & trending wardrobes"
      />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5">
        {edits.map((item) => (
          <Link
            key={item.id}
            to={storePath(item.to)}
            className="group relative aspect-[3/4] overflow-hidden rounded-2xl bg-neutral-900 shadow-md hover:shadow-xl transition-all duration-300 transform hover:-translate-y-1"
          >
            <img
              src={item.image}
              alt={item.title}
              loading="lazy"
              className="h-full w-full object-cover transition-transform duration-700 ease-out group-hover:scale-110"
            />
            <div className={`absolute inset-0 bg-gradient-to-t ${item.accent}`} />

            <div className="absolute inset-0 p-4 sm:p-5 flex flex-col justify-between">
              <div>
                <span className="inline-block rounded-full bg-white/20 backdrop-blur-md px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-white border border-white/30">
                  {item.badge}
                </span>
              </div>
              <div>
                <h3 className="text-xl sm:text-2xl font-bold text-white tracking-tight leading-snug drop-shadow-md">
                  {item.title}
                </h3>
                <p className="mt-1 text-xs sm:text-sm text-white/80 line-clamp-2">
                  {item.desc}
                </p>
                <div className="mt-3 flex items-center gap-2 text-xs font-bold text-white group-hover:text-wh-brand transition-colors">
                  <span>Shop The Edit</span>
                  <ArrowRight className="h-4 w-4 transform group-hover:translate-x-1 transition-transform" />
                </div>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </Reveal>
  )
}
