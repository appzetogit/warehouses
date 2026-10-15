/**
 * Desktop (lg+) index pages: the categories page and the stores grid.
 * Both take the rows their pages already fetched.
 */
import { useMemo, useState } from "react"
import { Link } from "react-router-dom"
import { Star, Clock, Search, ChevronRight, LayoutGrid, Sparkles } from "lucide-react"
import { useStoreMode } from "@store/context/StoreModeContext"
import { isRealImage } from "./ui"
import { AppEmptyState, appOutlinedButton, appRing } from "./appBits"

const cx = (...a) => a.filter(Boolean).join(" ")
const focusRing = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-wh-brand"

function PageShell({ title, subtitle, filter, setFilter, placeholder, children }) {
  return (
    <div className="min-h-screen bg-wh-page text-wh-text">
      <div className="mx-auto max-w-[1500px] px-3 py-5 sm:px-5 sm:py-6">
        {/* The title and the filter stack on a phone; side by side from sm. */}
        <div className="mb-4 flex flex-col gap-3 sm:mb-5 sm:flex-row sm:items-end sm:justify-between sm:gap-6">
          <div>
            <h1 className="font-display text-[26px] font-semibold leading-tight sm:text-[30px]">{title}</h1>
            {subtitle ? <p className="text-[14px] text-wh-muted">{subtitle}</p> : null}
          </div>
          <label className="relative w-full sm:w-80">
            <span className="sr-only">{placeholder}</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-wh-muted" aria-hidden="true" />
            <input
              type="search"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder={placeholder}
              className={cx("h-9 w-full rounded-[8px] border border-wh-border bg-wh-surface pl-9 pr-3 text-[14px]", focusRing)}
            />
          </label>
        </div>
        {children}
      </div>
    </div>
  )
}

const Skeleton = ({ n = 12, cols = "grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 2xl:grid-cols-6" }) => (
  <div className={cx("grid gap-4", cols)}>
    {Array.from({ length: n }).map((_, i) => (
      <div key={i} className="animate-pulse rounded-[8px] bg-wh-surface p-4">
        <div className="aspect-square rounded-[4px] bg-[#F0F2F2]" />
        <div className="mt-3 h-3 w-2/3 rounded bg-[#F0F2F2]" />
      </div>
    ))}
  </div>
)

/**
 * Main categories as sections (Men, Women, Kids…), each with its own
 * subcategories; categories with no subcategories share a "More to shop"
 * section at the end. A search flattens everything into one grid.
 */
function groupCategories(categories) {
  const byId = new Map(categories.map((c) => [c.id, c]))
  const bySort = (a, b) => (a.sortOrder || 0) - (b.sortOrder || 0) || (a.order || 0) - (b.order || 0)
  const children = new Map()
  for (const c of categories) {
    if (c.parentId && byId.has(c.parentId)) children.set(c.parentId, [...(children.get(c.parentId) || []), c])
  }
  const roots = categories.filter((c) => !c.parentId || !byId.has(c.parentId)).sort(bySort)
  const sections = roots.filter((r) => children.has(r.id)).map((r) => ({ key: r.id, title: r.name, parent: r, items: children.get(r.id).sort(bySort) }))
  const loose = roots.filter((r) => !children.has(r.id))
  if (loose.length) sections.push({ key: "more", title: "More to Shop", parent: null, items: loose })
  return sections
}

/** A category photo, or its initial in serif when it has none (no stock photos). */
function CategoryPhoto({ src, name }) {
  return isRealImage(src) ? (
    <img src={src} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" />
  ) : (
    <span className="flex h-full w-full items-center justify-center font-app-display text-[30px] font-bold text-app-brown/60" aria-hidden="true">
      {String(name || "?").charAt(0).toUpperCase()}
    </span>
  )
}

/**
 * The customer app's Categories screen, laid out wide: a rail of category
 * groups on the left ("For You" shows them all), and on the right each group's
 * sub-categories as photo tiles under a serif title. Real categories only.
 */
export function CategoriesDesktop({ categories = [], loading }) {
  const { storePath } = useStoreMode()
  const [filter, setFilter] = useState("")
  /** null = "For You" (every group). */
  const [picked, setPicked] = useState(null)
  const query = filter.trim().toLowerCase()
  const groups = useMemo(() => groupCategories(categories), [categories])
  const rows = categories.filter((c) => (c.name || "").toLowerCase().includes(query))
  const current = groups.find((g) => g.key === picked) || null
  const sections = query
    ? [{ key: "results", title: `Matching “${filter.trim()}”`, parent: null, items: rows }]
    : current ? [current] : groups

  // By id, so two categories with the same name (a "Jeans" under Men and a
  // top-level one) each open their own page.
  const tile = (c) => (
    <li key={c.id}>
      <Link to={storePath(`/category/${c.id}`)} className={cx("group block rounded-[18px]", appRing)}>
        <span className="block aspect-square overflow-hidden rounded-[18px] bg-app-alt shadow-[0_1px_4px_rgba(25,20,17,0.06)]">
          <CategoryPhoto src={c.image} name={c.name} />
        </span>
        <span className="mt-2 line-clamp-2 text-center text-[13.5px] font-medium leading-[1.25] text-app-ink group-hover:text-app-brown">{c.name}</span>
      </Link>
    </li>
  )

  const railItem = ({ key, label, on, face, onClick }) => (
    <li key={key}>
      <button
        type="button"
        onClick={onClick}
        aria-current={on ? "true" : undefined}
        className={cx(
          "relative flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left transition-colors focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-app-brown",
          on ? "bg-app-tint" : "hover:bg-app-alt",
        )}
      >
        <span className={cx("absolute left-0 top-1/2 h-8 w-1 -translate-y-1/2 rounded-r", on ? "bg-app-brown" : "")} aria-hidden="true" />
        <span className="h-11 w-11 shrink-0">{face}</span>
        <span className={cx("min-w-0 flex-1 line-clamp-2 text-[13.5px] leading-[1.2]", on ? "font-bold text-app-brown" : "font-medium text-app-ink")}>
          {label}
        </span>
      </button>
    </li>
  )

  return (
    <div className="min-h-screen bg-app-cream font-app text-app-ink">
      <div className="mx-auto max-w-[1500px] px-3 pb-12 pt-6 sm:px-5">
        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between sm:gap-6">
          <div>
            <h1 className="font-app-display text-[32px] font-bold leading-[1.1] text-app-brown xl:text-[36px]">All Categories</h1>
            <p className="mt-1 text-[13px] text-app-muted">
              {loading ? "Loading…" : `${categories.length} categor${categories.length === 1 ? "y" : "ies"} to explore`}
            </p>
          </div>
          <label className="flex h-11 w-full items-center gap-2 rounded-full border border-app-line bg-white px-4 focus-within:ring-2 focus-within:ring-app-champagne sm:w-80">
            <Search className="h-4 w-4 shrink-0 text-app-muted" aria-hidden="true" />
            <span className="sr-only">Find a category</span>
            <input
              type="search"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Find a category"
              className="min-w-0 flex-1 bg-transparent text-[13.5px] text-app-ink placeholder:text-app-muted focus:outline-none"
            />
          </label>
        </div>

        {loading ? (
          <div className="flex gap-6" aria-hidden="true">
            <div className="hidden w-[232px] shrink-0 space-y-2 rounded-2xl bg-white p-3 lg:block">
              {Array.from({ length: 7 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3 px-2.5 py-2">
                  <span className="h-11 w-11 animate-pulse rounded-xl bg-app-sand/80" />
                  <span className="h-3 w-24 animate-pulse rounded bg-app-sand/70" />
                </div>
              ))}
            </div>
            <div className="grid flex-1 grid-cols-3 content-start gap-5 md:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
              {Array.from({ length: 12 }).map((_, i) => (
                <div key={i}>
                  <span className="block aspect-square animate-pulse rounded-[18px] bg-app-sand/70" />
                  <span className="mx-auto mt-2 block h-3 w-2/3 animate-pulse rounded bg-app-sand/60" />
                </div>
              ))}
            </div>
          </div>
        ) : !categories.length ? (
          <AppEmptyState icon={LayoutGrid} title="No categories yet" text="Our catalogue is being set up for your area. Check back shortly." />
        ) : (
          <div className="flex items-start gap-6">
            {groups.length > 1 && !query ? (
              <nav
                aria-label="Category groups"
                className="hidden w-[232px] shrink-0 self-start rounded-2xl bg-white p-2 shadow-[0_1px_4px_rgba(25,20,17,0.05)] lg:sticky lg:top-[136px] lg:block lg:max-h-[calc(100vh-150px)] lg:overflow-y-auto lg:[scrollbar-width:thin]"
              >
                <ul className="space-y-0.5">
                  {railItem({
                    key: "for-you",
                    label: "For You",
                    on: !current,
                    onClick: () => setPicked(null),
                    face: (
                      <span className="flex h-full w-full items-center justify-center rounded-full bg-app-brown text-white">
                        <Sparkles className="h-5 w-5" aria-hidden="true" />
                      </span>
                    ),
                  })}
                  {groups.map((g) => {
                    const face = g.parent || g.items[0]
                    return railItem({
                      key: g.key,
                      label: g.title,
                      on: current?.key === g.key,
                      onClick: () => setPicked(g.key),
                      face: (
                        <span className="block h-full w-full overflow-hidden rounded-xl bg-app-alt">
                          <CategoryPhoto src={face?.image} name={g.title} />
                        </span>
                      ),
                    })
                  })}
                </ul>
              </nav>
            ) : null}

            <div className="min-w-0 flex-1">
              {query && !rows.length ? (
                <AppEmptyState icon={Search} title={`No categories match “${filter.trim()}”`} text="Try a shorter word, or browse them all.">
                  <button type="button" onClick={() => setFilter("")} className={appOutlinedButton}>Show all categories</button>
                </AppEmptyState>
              ) : (
                <div className="space-y-9">
                  {sections.map((s) => (
                    <section key={s.key} aria-label={s.title || "Categories"}>
                      <div className="mb-4 flex items-end justify-between gap-3 border-b border-app-line pb-2">
                        <h2 className="font-app-display text-[28px] font-bold leading-[1.1] text-app-brown">{s.title}</h2>
                        {s.parent ? (
                          <Link
                            to={storePath(`/category/${s.parent.id}`)}
                            className={cx("inline-flex items-center gap-0.5 rounded text-[13px] font-semibold text-app-brown hover:underline", appRing)}
                          >
                            Shop all {s.parent.name} <ChevronRight className="h-4 w-4" aria-hidden="true" />
                          </Link>
                        ) : null}
                      </div>
                      <ul className="grid grid-cols-3 gap-x-5 gap-y-6 md:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">{s.items.map(tile)}</ul>
                    </section>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

/** stores: [{ id, slug, name, rating, deliveryTime, distance, image }] */
export function StoresDesktop({ stores = [], loading }) {
  const { storePath, isQuick } = useStoreMode()
  const [filter, setFilter] = useState("")
  const rows = stores.filter((s) => (s.name || "").toLowerCase().includes(filter.trim().toLowerCase()))
  return (
    <PageShell title="All Stores" subtitle={loading ? "" : `${stores.length} stores`} filter={filter} setFilter={setFilter} placeholder="Find a store">
      {loading ? <Skeleton n={8} cols="grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5" /> : rows.length ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4 2xl:grid-cols-5">
          {rows.map((s) => (
            <Link
              key={s.id}
              to={storePath(`/sellers/${s.slug}`)}
              className={cx("group flex flex-col overflow-hidden rounded-[8px] bg-wh-surface hover:shadow-md", focusRing)}
            >
              <div className="aspect-[16/9] bg-[#F0F2F2]">
                {s.image ? <img src={s.image} alt={s.name} loading="lazy" className="h-full w-full object-cover" /> : null}
              </div>
              <div className="flex flex-col gap-1 p-4">
                <span className="truncate text-[16px] font-bold group-hover:text-wh-link-hover">{s.name}</span>
                <div className="flex items-center gap-3 text-[13px] text-wh-muted">
                  {s.rating ? (
                    <span className="inline-flex items-center gap-1">
                      <Star className="h-3.5 w-3.5 fill-wh-brand text-wh-brand" aria-hidden="true" /> {Number(s.rating).toFixed(1)}
                    </span>
                  ) : null}
                  {isQuick && s.deliveryTime ? (
                    <span className="inline-flex items-center gap-1 text-wh-success">
                      <Clock className="h-3.5 w-3.5" aria-hidden="true" /> {s.deliveryTime}
                    </span>
                  ) : null}
                  {isQuick && s.distance ? <span>{s.distance}</span> : null}
                </div>
              </div>
            </Link>
          ))}
        </div>
      ) : (
        <p className="py-16 text-center text-[14px] text-wh-muted">No stores match "{filter}".</p>
      )}
    </PageShell>
  )
}
