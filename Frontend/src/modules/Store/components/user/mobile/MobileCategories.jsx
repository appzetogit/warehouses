import { useMemo, useState } from "react"
import { Link } from "react-router-dom"
import { LayoutGrid, Sparkles } from "lucide-react"
import { useDeliveryLocation } from "@store/context/DeliveryLocationContext"
import { useStoreMode } from "@store/context/StoreModeContext"
import { categorySlugOf } from "@store/utils/categorySlug"
import { resolveMediaUrl } from "@/shared/utils/mediaUrl"
import { usePublicCategories } from "../desktop/useDesktopShell"

/**
 * The Categories tab on phones, as the customer app's (categories_screen.dart):
 * a 92px rail of top-level categories on the left and, for the one picked, its
 * sub-categories as photo tiles on the right. The first rail entry, "For You",
 * lists every top-level category with its sub-categories — real categories
 * only (a category with none is itself the tile).
 */

const RAIL_TOP = "top-[calc(52px+env(safe-area-inset-top))]"
const RAIL_HEIGHT = "max-h-[calc(100dvh-52px-68px-env(safe-area-inset-top)-env(safe-area-inset-bottom))]"

function Photo({ src, name, className = "" }) {
  return src ? (
    <img src={src} alt="" loading="lazy" decoding="async" className={`h-full w-full object-cover ${className}`} />
  ) : (
    <span className="flex h-full w-full items-center justify-center font-app-display text-[22px] font-bold text-app-brown/60" aria-hidden="true">
      {String(name || "?").charAt(0).toUpperCase()}
    </span>
  )
}

function Tile({ category, to }) {
  return (
    <li>
      <Link to={to} className="group block rounded-[18px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app-brown">
        <span className="block aspect-square overflow-hidden rounded-[18px] bg-app-alt transition-transform group-active:scale-95">
          <Photo src={category.photo} name={category.name} />
        </span>
        <span className="mt-1.5 line-clamp-2 text-center text-[12.5px] leading-[1.2] text-app-ink">{category.name}</span>
      </Link>
    </li>
  )
}

function Section({ title, items, linkTo }) {
  if (!items.length) return null
  return (
    <section aria-label={title}>
      <h2 className="pb-3 pt-[18px] text-[19px] font-semibold leading-tight text-app-ink">{title}</h2>
      <ul className="grid grid-cols-3 gap-x-3 gap-y-3.5">
        {items.map((c) => (
          <Tile key={c.id} category={c} to={linkTo(c)} />
        ))}
      </ul>
    </section>
  )
}

export default function MobileCategories() {
  const { storePath } = useStoreMode()
  const { zoneId } = useDeliveryLocation()
  const { categories: list, loading } = usePublicCategories(zoneId)
  const categories = useMemo(() => list.map((c) => ({ ...c, photo: c.image ? resolveMediaUrl(c.image) : "" })), [list])
  /** null = "For You". */
  const [selected, setSelected] = useState(null)
  const linkTo = (c) => storePath(`/category/${categorySlugOf(c)}`)

  const { core, childrenOf, orphans } = useMemo(() => {
    const byOrder = (a, b) => a.sortOrder - b.sortOrder || a.order - b.order
    const tops = categories.filter((c) => !c.parentId).sort(byOrder)
    const ids = new Set(tops.map((c) => c.id))
    const kids = new Map()
    for (const c of categories) {
      if (!c.parentId || !ids.has(c.parentId)) continue
      if (!kids.has(c.parentId)) kids.set(c.parentId, [])
      kids.get(c.parentId).push(c)
    }
    for (const list of kids.values()) list.sort(byOrder)
    return {
      core: tops,
      childrenOf: (parent) => {
        const list = kids.get(parent.id) || []
        return list.length ? list : [parent]
      },
      // Anything whose parent is missing from the list still gets shown.
      orphans: categories.filter((c) => c.parentId && !ids.has(c.parentId)),
    }
  }, [categories])

  const picked = core.find((c) => c.id === selected) || null
  // The panel starts at its top, as the app's own scrolling panel does.
  const pick = (id) => {
    setSelected(id)
    if (window.scrollY > 0) window.scrollTo({ top: 0 })
  }

  const railItem = ({ key, label, on, face, onClick }) => (
    <li key={key}>
      <button
        type="button"
        onClick={onClick}
        aria-current={on ? "true" : undefined}
        className={`flex w-full items-center py-2.5 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-app-brown ${on ? "bg-white" : ""}`}
      >
        <span className={`h-16 w-1 shrink-0 rounded-r ${on ? "bg-app-brown" : ""}`} aria-hidden="true" />
        <span className="flex min-w-0 flex-1 flex-col items-center px-1">
          <span className="h-[52px] w-[52px]">{face}</span>
          <span
            className={`mt-1.5 line-clamp-2 text-center text-[12px] leading-[1.2] ${on ? "font-bold text-app-brown" : "font-medium text-app-muted"}`}
          >
            {label}
          </span>
        </span>
      </button>
    </li>
  )

  return (
    <div className="min-h-[70vh] bg-app-cream font-app text-app-ink lg:hidden">
      <h1 className="px-4 pb-2 pt-3 text-[21px] font-medium text-app-ink">All Categories</h1>

      {loading ? (
        <div className="flex" aria-hidden="true">
          <div className="w-[92px] shrink-0 space-y-4 bg-app-alt py-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <span key={i} className="mx-auto block h-[52px] w-[52px] animate-pulse rounded-[14px] bg-app-sand/80" />
            ))}
          </div>
          <div className="grid flex-1 grid-cols-3 content-start gap-3 px-4 pt-5">
            {Array.from({ length: 9 }).map((_, i) => (
              <span key={i} className="aspect-square animate-pulse rounded-[18px] bg-app-sand/70" />
            ))}
          </div>
        </div>
      ) : !core.length && !orphans.length ? (
        <div className="flex flex-col items-center px-8 py-16 text-center">
          <span className="flex h-20 w-20 items-center justify-center rounded-full bg-app-sand text-app-brown" aria-hidden="true">
            <LayoutGrid className="h-9 w-9" />
          </span>
          <p className="mt-5 text-[17px] font-bold">No categories yet</p>
          <p className="mt-1 max-w-[260px] text-[13px] text-app-muted">Our catalogue is being set up for your area. Check back shortly.</p>
        </div>
      ) : (
        <div className="flex items-start">
          <nav
            aria-label="Category groups"
            className={`sticky ${RAIL_TOP} ${RAIL_HEIGHT} w-[92px] shrink-0 self-start overflow-y-auto bg-app-alt [scrollbar-width:none] [&::-webkit-scrollbar]:hidden`}
          >
            <ul>
              {railItem({
                key: "for-you",
                label: "For You",
                on: !picked,
                onClick: () => pick(null),
                face: (
                  <span className="flex h-full w-full items-center justify-center rounded-full bg-app-brown text-white">
                    <Sparkles className="h-6 w-6" aria-hidden="true" />
                  </span>
                ),
              })}
              {core.map((c) =>
                railItem({
                  key: c.id,
                  label: c.name,
                  on: picked?.id === c.id,
                  onClick: () => pick(c.id),
                  face: (
                    <span className="block h-full w-full overflow-hidden rounded-[14px] bg-white">
                      <Photo src={c.photo} name={c.name} />
                    </span>
                  ),
                }),
              )}
            </ul>
          </nav>

          <div className="min-w-0 flex-1 pb-[calc(84px+env(safe-area-inset-bottom))] pl-4 pr-3">
            {picked ? (
              <Section title={picked.name} items={childrenOf(picked)} linkTo={linkTo} />
            ) : (
              <>
                {core.map((parent) => (
                  <Section key={parent.id} title={parent.name} items={childrenOf(parent)} linkTo={linkTo} />
                ))}
                <Section title="More" items={orphans} linkTo={linkTo} />
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
