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
  { icon: Gift, title: "Gift-ready packing", note: "Notes and boxes" },
  { icon: Truck, title: "Delivered across India", note: "Courier or 10-minute rider" },
  { icon: RotateCcw, title: "Easy returns", note: "Per our returns policy" },
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
          className="flex items-center gap-2 rounded-2xl border border-wh-border bg-wh-surface p-2.5 sm:gap-3 sm:p-3"
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
            <span aria-hidden="true" className="text-wh-brand">
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
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 sm:gap-3 lg:grid-cols-6">
        {tiles.map((tile) => {
          const image = mediaUrl(tile.image)
          return (
            <Link
              key={tile.id}
              to={tile.to}
              className="group relative block aspect-[4/5] overflow-hidden rounded-2xl bg-[#F7F7F7] focus-visible:outline-2 focus-visible:outline-wh-brand"
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
      </div>
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
export function ProductRailSection({ title, subtitle, products = [], onAdd, minimum = 4 }) {
  if (products.length < minimum) return null

  return (
    <Reveal as="section" aria-label={title}>
      <SectionHeading title={title} subtitle={subtitle} />
      <Rail ariaLabel={title}>
        {products.map((product) => (
          <div key={product._id || product.id} className="snap-start">
            <ProductCard product={product} onAction={onAdd} />
          </div>
        ))}
      </Rail>
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
