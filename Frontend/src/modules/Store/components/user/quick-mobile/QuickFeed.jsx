import { Link } from "react-router-dom"
import { ChevronRight } from "lucide-react"
import { useStoreMode } from "@store/context/StoreModeContext"
import { mediaUrl } from "../desktop/desktopCart"
import Rail from "../storefront/Rail"
import Reveal from "../storefront/Reveal"
import AppSectionHeading from "../home/AppSectionHeading"
import AppLink from "./AppLink"

/**
 * The Quick phone home's feed below the themed block (QUICK_MOBILE_SPEC.md §1):
 * frequently bought, featured this week, campaign banners and category groups.
 * Each takes data the page already has; none of them fetch.
 */

const firstImage = (p) =>
  mediaUrl(p?.image || (Array.isArray(p?.images) ? (typeof p.images[0] === "string" ? p.images[0] : p.images[0]?.url) : ""))

/**
 * Groups of three product photos in a tinted container, named for their
 * category. `groups` is `[{ id, name, to, items: [product] }]`.
 */
export function FrequentlyBought({ title, groups = [], seeAllTo }) {
  const { storePath } = useStoreMode()
  const usable = groups.filter((g) => g.items.length)
  if (!usable.length) return null
  const thumbs = usable.flatMap((g) => g.items).slice(0, 3).map(firstImage).filter(Boolean)

  return (
    <Reveal as="section" aria-label={title} className="font-app">
      <AppSectionHeading title={title} />
      <div className="px-4">
      <Rail rows={1} ariaLabel={title} auto={5000} cols="auto-cols-[88%] sm:auto-cols-[60%]">
        {usable.map((group) => (
          <Link
            key={group.id}
            to={group.to}
            className="block snap-start rounded-2xl border border-app-line bg-app-tint p-1.5 pb-2 active:scale-[0.99]"
          >
            <span className="grid grid-cols-3 gap-1.5">
              {group.items.slice(0, 3).map((p) => {
                const src = firstImage(p)
                return (
                  <span key={p._id || p.id} className="flex aspect-square items-center justify-center overflow-hidden rounded-xl bg-white">
                    {src ? <img src={src} alt="" loading="lazy" className="h-full w-full object-cover object-top" /> : null}
                  </span>
                )
              })}
            </span>
            <span className="mt-2 block text-center text-[13.5px] font-semibold text-app-brown">{group.name}</span>
          </Link>
        ))}
      </Rail>
      {seeAllTo ? (
        <Link
          to={storePath(seeAllTo)}
          className="mt-3 flex items-center justify-center gap-3 rounded-full bg-app-brown px-4 py-2 text-[14px] font-semibold text-white active:scale-[0.99]"
        >
          {thumbs.length ? (
            <span className="flex -space-x-2">
              {thumbs.map((src) => (
                <img key={src} src={src} alt="" className="h-8 w-8 rounded-full border-2 border-app-champagne bg-white object-cover" />
              ))}
            </span>
          ) : null}
          See All Products
          <ChevronRight className="h-4 w-4" aria-hidden="true" />
        </Link>
      ) : null}
      </div>
    </Reveal>
  )
}

/** Tall bordered cards with a "Featured" tab notched into the top edge. */
export function FeaturedRail({ items = [] }) {
  if (!items.length) return null
  return (
    <Reveal as="section" aria-label="Featured this week" className="font-app">
      <AppSectionHeading title="Featured This Week" />
      <div className="px-4">
      <Rail rows={1} ariaLabel="Featured This Week" auto={4200} cols="auto-cols-[30%] sm:auto-cols-[22%] lg:auto-cols-[160px]">
        {items.map((item) => {
          const art = mediaUrl(item.artUrl)
          const launch = item.style === "launch"
          return (
            <AppLink
              key={item._id || item.title}
              to={item.link}
              className={`wh-lift relative block aspect-[105/125] snap-start overflow-hidden rounded-2xl border-[3px] ${
                launch ? "border-app-champagne bg-gradient-to-b from-app-brown-deep to-app-brown-mid" : "border-app-brown/70 bg-app-sand"
              }`}
            >
              {art ? (
                <img src={art} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover" />
              ) : null}
              {/* The notched tab on the top edge. */}
              <span
                className={`absolute left-1/2 top-0 z-10 -translate-x-1/2 rounded-b-lg px-2.5 py-0.5 text-[10px] font-bold ${
                  launch ? "bg-app-champagne text-app-brown-ink" : "bg-app-brown text-white"
                }`}
              >
                {item.badge || "Featured"}
              </span>
              <span
                className={`absolute inset-x-1.5 top-6 z-10 text-center font-app-display text-[18px] font-bold leading-tight ${
                  launch || art ? "text-white drop-shadow" : "text-app-brown"
                }`}
              >
                {item.title}
              </span>
              {launch ? (
                <span className="wh-blink absolute inset-x-0 bottom-1.5 z-10 text-center text-[10px] font-bold text-white">
                  ✦ For You ✦
                </span>
              ) : null}
            </AppLink>
          )
        })}
      </Rail>
      </div>
    </Reveal>
  )
}

/** A full-width campaign: copy on the left, art drifting on the right. */
export function CampaignBanner({ campaign }) {
  if (!campaign) return null
  const art = mediaUrl(campaign.artUrl)
  const brands = (campaign.poweredBy || []).filter((b) => b?.logoUrl)
  return (
    <Reveal as="section" aria-label={campaign.title} className="px-4">
      <AppLink
        to={campaign.link}
        className="relative block aspect-[2/1] overflow-hidden rounded-2xl shadow-sm"
        style={{ background: campaign.tint || "var(--app-brown)" }}
      >
        {art ? (
          <img src={art} alt="" loading="lazy" className="wh-kenburns absolute inset-0 h-full w-full object-cover" />
        ) : null}
        <span aria-hidden="true" className="absolute inset-0 bg-gradient-to-r from-black/35 via-black/10 to-transparent" />
        <span className="relative flex h-full w-[58%] flex-col justify-center gap-1 p-4">
          <span className="font-app-display text-[26px] font-bold leading-tight text-white drop-shadow">{campaign.title}</span>
          {campaign.subtitle ? <span className="text-[13px] text-white/90">{campaign.subtitle}</span> : null}
          {brands.length ? (
            <span className="mt-1 flex items-center gap-1.5 text-[9px] font-semibold text-white/80">
              POWERED BY:
              {brands.map((b) => (
                <img key={b.logoUrl} src={mediaUrl(b.logoUrl)} alt={b.name || ""} className="h-4 w-auto" />
              ))}
            </span>
          ) : null}
          <span className="wh-sheen relative mt-2 w-fit overflow-hidden rounded-full bg-app-champagne px-4 py-1.5 text-[13px] font-semibold text-app-brown-ink">
            {campaign.ctaText || "Shop Now"}
          </span>
        </span>
      </AppLink>
    </Reveal>
  )
}

/** A titled grid of subcategory tiles, four across. */
export function CategoryGroup({ group }) {
  const { storePath } = useStoreMode()
  if (!group?.children?.length) return null
  return (
    <Reveal as="section" aria-label={group.title} className="font-app">
      <AppSectionHeading title={group.title} />
      <div className="grid grid-cols-4 gap-x-2.5 gap-y-3 px-4">
        {group.children.map((child) => {
          const image = mediaUrl(child.image)
          const slug = child.name.toLowerCase().replace(/&/g, " ").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")
          return (
            <Link key={child.id} to={storePath(`/category/${slug}`)} className="group block active:scale-95">
              <span className="flex aspect-square items-center justify-center overflow-hidden rounded-full border border-app-line bg-app-tint">
                {image ? (
                  <img
                    src={image}
                    alt=""
                    loading="lazy"
                    className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-110"
                  />
                ) : (
                  <span aria-hidden="true" className="font-app-display text-[22px] font-bold text-app-brown">
                    {child.name.slice(0, 1)}
                  </span>
                )}
              </span>
              <span className="mt-1.5 block text-center text-[11.5px] font-medium leading-tight text-app-ink line-clamp-2">
                {child.name}
              </span>
            </Link>
          )
        })}
      </div>
    </Reveal>
  )
}
