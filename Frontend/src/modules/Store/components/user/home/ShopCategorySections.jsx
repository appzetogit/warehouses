import { Link } from "react-router-dom"
import { useStoreMode } from "@store/context/StoreModeContext"
import { categorySlugOf } from "@store/utils/categorySlug"
import { mediaUrl } from "../desktop/desktopCart"
import AppSectionHeading from "./AppSectionHeading"
import { categoryFromLink, categoryImage, rupees } from "./homeCatalogue"

/**
 * The app's category sections for the Shop home (shop_home_screen.dart):
 * - CollectionCards (_CollectionCards): a dark card per main category.
 * - TopCategories (_TopCategories): a rail of subcategory cards with "From ₹X".
 * - WardrobeCollections (_WardrobeCollections): photo tiles of subcategories.
 * - CuratedEdits (_CuratedEdits): the admin's featured cards, as a 2-col grid.
 *
 * `groups` is groupByCategory(categories, products): what each category sells.
 */

const rail = "flex gap-3 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
const countOf = (groups, c) => groups.get(String(c.id))?.items.length || 0

/** Main categories with something for sale, as one or two dark cards. */
export function CollectionCards({ categories = [], groups }) {
  const { storePath } = useStoreMode()
  const byId = new Set(categories.map((c) => c.id))
  const roots = categories.filter((c) => (!c.parentId || !byId.has(c.parentId)) && countOf(groups, c) > 0).slice(0, 2)
  if (!roots.length) return null
  const single = roots.length === 1

  const blurb = (c) => {
    const names = categories.filter((s) => s.parentId === c.id).map((s) => s.name.trim()).filter(Boolean)
    if (!names.length) return ""
    const shown = names.slice(0, 3).join(" · ")
    return names.length > 3 ? `${shown} +${names.length - 3}` : shown
  }

  return (
    <section aria-label="Collections" className={`grid gap-3 px-4 font-app ${single ? "grid-cols-1" : "grid-cols-2"}`}>
      {roots.map((c) => {
        const image = categoryImage(c) || groups.get(String(c.id))?.cover || ""
        const sub = blurb(c)
        return (
          <Link
            key={c.id}
            to={storePath(`/category/${categorySlugOf(c)}`)}
            className={`relative block overflow-hidden rounded-[10px] bg-app-brown-deep shadow-[0_6px_14px_rgba(25,20,17,0.15)] active:scale-[0.98] ${
              single ? "h-[168px]" : "h-[190px]"
            }`}
          >
            {image ? <img src={image} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover" /> : null}
            <span aria-hidden="true" className="absolute inset-0 bg-[linear-gradient(0deg,rgba(20,14,10,0.9),transparent)]" />
            <span className="absolute inset-x-0 bottom-0 flex flex-col items-start gap-1 p-3">
              <span className="font-app-display text-[22px] font-bold leading-none text-white">{c.name}</span>
              {sub ? <span className="line-clamp-2 text-[11.5px] leading-snug text-[#E9DED4]">{sub}</span> : null}
              <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-white px-3 py-1 text-[11.5px] font-extrabold text-app-brown">
                Shop now <span aria-hidden="true">→</span>
              </span>
            </span>
          </Link>
        )
      })}
    </section>
  )
}

/** Subcategories that sell something here, with their lowest price. */
export function TopCategories({ categories = [], groups }) {
  const { storePath } = useStoreMode()
  const byId = new Set(categories.map((c) => c.id))
  const subs = categories.filter((c) => c.parentId && byId.has(c.parentId) && countOf(groups, c) > 0).slice(0, 10)
  if (!subs.length) return null
  return (
    <section aria-label="Top categories" className="font-app">
      <div className="mb-3 flex items-center justify-between gap-3 px-4">
        <h2 className="text-[18px] font-bold text-app-ink">Top Categories</h2>
        <Link to={storePath("/categories")} className="text-[12.5px] font-semibold text-app-brown-badge">
          View All <span aria-hidden="true">→</span>
        </Link>
      </div>
      <div className={rail}>
        {subs.map((c) => {
          const g = groups.get(String(c.id))
          const image = categoryImage(c) || g?.cover || ""
          return (
            <Link
              key={c.id}
              to={storePath(`/category/${categorySlugOf(c)}`)}
              className="flex h-[162px] w-[112px] shrink-0 flex-col overflow-hidden rounded-[14px] border border-app-line bg-white active:scale-[0.97]"
            >
              <span className="block min-h-0 flex-1 bg-app-alt">
                {image ? <img src={image} alt="" loading="lazy" className="h-full w-full object-cover" /> : null}
              </span>
              <span className="block px-2 py-1.5">
                <span className="block truncate text-[12px] font-bold text-app-ink">{c.name}</span>
                {g?.minPrice ? <span className="block truncate text-[10.5px] text-app-muted">From {rupees(g.minPrice)}</span> : null}
              </span>
            </Link>
          )
        })}
      </div>
    </section>
  )
}

/** Every subcategory that has its own photo. */
export function WardrobeCollections({ categories = [] }) {
  const { storePath } = useStoreMode()
  const byId = new Set(categories.map((c) => c.id))
  const tiles = categories.filter((c) => c.parentId && byId.has(c.parentId) && categoryImage(c))
  if (!tiles.length) return null
  return (
    <section aria-label="Wardrobe collections" className="font-app">
      <AppSectionHeading title="Wardrobe Collections" subtitle="Every category in the store" />
      <div className={rail}>
        {tiles.map((c) => (
          <Link
            key={c.id}
            to={storePath(`/category/${categorySlugOf(c)}`)}
            className="relative block h-[185px] w-[148px] shrink-0 overflow-hidden rounded-2xl bg-app-alt active:scale-[0.97]"
          >
            <img src={categoryImage(c)} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover" />
            <span aria-hidden="true" className="absolute inset-0 bg-[linear-gradient(0deg,rgba(0,0,0,0.75),transparent_60%)]" />
            <span className="absolute inset-x-0 bottom-0 p-3">
              <span className="block truncate text-[13.5px] font-extrabold text-white">{c.name}</span>
              <span className="block text-[11px] font-bold text-app-champagne">
                Explore <span aria-hidden="true">→</span>
              </span>
            </span>
          </Link>
        ))}
      </div>
    </section>
  )
}

/**
 * The admin's featured cards that open a category this store really sells:
 * a card pointing at a category that doesn't exist here, or has no products,
 * is left out. Fewer than two left and the section hides.
 */
export function CuratedEdits({ items = [], categories = [], groups }) {
  const { storePath } = useStoreMode()
  const tiles = []
  for (const item of items) {
    const art = mediaUrl(item?.artUrl)
    const category = art ? categoryFromLink(item?.link, categories) : null
    if (!category || countOf(groups, category) < 1) continue
    tiles.push({ key: item._id || item.title, title: item.title, badge: item.badge, art, to: storePath(`/category/${categorySlugOf(category)}`) })
    if (tiles.length === 6) break
  }
  if (tiles.length < 2) return null
  return (
    <section aria-label="Curated style edits" className="font-app">
      <AppSectionHeading title="Curated Style Edits" />
      <div className="grid grid-cols-2 gap-3 px-4">
        {tiles.map((t) => (
          <Link key={t.key} to={t.to} className="relative block aspect-[0.85] overflow-hidden rounded-[18px] bg-app-alt active:scale-[0.98]">
            <img src={t.art} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover" />
            <span aria-hidden="true" className="absolute inset-0 bg-[linear-gradient(0deg,rgba(0,0,0,0.87),transparent_65%)]" />
            {t.badge ? (
              <span className="absolute left-2.5 top-2.5 rounded-full bg-white/[0.92] px-2 py-0.5 text-[9.5px] font-extrabold uppercase tracking-wide text-app-ink">
                {t.badge}
              </span>
            ) : null}
            <span className="absolute inset-x-0 bottom-0 line-clamp-2 p-3 text-[16px] font-extrabold leading-tight text-white">{t.title}</span>
          </Link>
        ))}
      </div>
    </section>
  )
}
