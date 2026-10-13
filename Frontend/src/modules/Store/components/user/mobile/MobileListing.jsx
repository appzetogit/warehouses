import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom"
import { FilterX, PackageOpen, SearchX, X } from "lucide-react"
import { catalogAPI, searchAPI } from "@/services/api"
import { useDeliveryLocation } from "@store/context/DeliveryLocationContext"
import { useStoreMode } from "@store/context/StoreModeContext"
import { usePublicCategories } from "../desktop/useDesktopShell"
import FilterSheet, { EMPTY_MOBILE_FILTERS, activeFilterCount } from "./FilterSheet"
import FloatingFilterBar from "./FloatingFilterBar"
import ListingHeader from "./ListingHeader"
import ProductTile from "./ProductTile"
import { categorySlugOf, findCategoryBySlug, isCategoryId } from "@store/utils/categorySlug"

/**
 * The phone product listing, for a category, a search or a discount page,
 * styled as the customer app's (product_listing_screen.dart and
 * sub_category_screen.dart): a serif title header, brown/sand sub-category
 * pills, an "N items" line, a two-column grid (search results grouped by
 * category), more on demand, and the floating Sort | Brand | Price | Filters
 * pill that opens the Sort & filter sheet.
 */

const PAGE = 20
const SORTS = [
  ["relevance", "Relevance"],
  ["price_asc", "Price: Low to High"],
  ["price_desc", "Price: High to Low"],
  ["rating", "Customer Rating"],
  ["newest", "Newest First"],
]
const SORT_KEYS = SORTS.map(([key]) => key)

/*
 * Sort and filters live in the address (?sort=price_asc&brand=A&size=M,L&
 * colour=Red&minPrice=500), so Back from a product comes back to the same
 * list. How many pages were loaded is kept per history entry (sessionStorage),
 * not in the address: changing the address scrolls the page to the top, which
 * "Show More" must not do.
 */
const PARAM_KEYS = ["sort", "brand", "size", "colour", "minPrice", "maxPrice"]
const splitList = (v) => String(v || "").split(",").map((x) => x.trim()).filter(Boolean)
const toNum = (v) => (v == null || v === "" || !Number.isFinite(Number(v)) ? null : Number(v))

function readListParams(sp) {
  const sort = sp.get("sort")
  return {
    sort: SORT_KEYS.includes(sort) ? sort : "relevance",
    filters: {
      ...EMPTY_MOBILE_FILTERS,
      brands: splitList(sp.get("brand")),
      sizes: splitList(sp.get("size")),
      colours: splitList(sp.get("colour")),
      minPrice: toNum(sp.get("minPrice")),
      maxPrice: toNum(sp.get("maxPrice")),
    },
  }
}

function writeListParams(sp, { sort, filters }) {
  const out = new URLSearchParams()
  for (const [k, v] of sp.entries()) if (!PARAM_KEYS.includes(k)) out.append(k, v)
  if (sort && sort !== "relevance") out.set("sort", sort)
  if (filters.brands.length) out.set("brand", filters.brands.join(","))
  if (filters.sizes.length) out.set("size", filters.sizes.join(","))
  if (filters.colours.length) out.set("colour", filters.colours.join(","))
  if (filters.minPrice != null) out.set("minPrice", String(filters.minPrice))
  if (filters.maxPrice != null) out.set("maxPrice", String(filters.maxPrice))
  return out
}

const PAGES_KEY = "store_listing_pages_v1"
function readLoadedPages(key) {
  try {
    const n = Number(JSON.parse(sessionStorage.getItem(PAGES_KEY) || "{}")[key])
    return Number.isFinite(n) && n > 1 ? Math.min(Math.floor(n), 10) : 1
  } catch {
    return 1
  }
}
function saveLoadedPages(key, n) {
  try {
    const all = JSON.parse(sessionStorage.getItem(PAGES_KEY) || "{}") || {}
    delete all[key]
    if (n > 1) all[key] = n
    const keys = Object.keys(all)
    for (const old of keys.slice(0, Math.max(0, keys.length - 40))) delete all[old]
    sessionStorage.setItem(PAGES_KEY, JSON.stringify(all))
  } catch {
    // private mode: Back just shows the first page
  }
}

/** Search API params for a set of filters. */
const filterParams = (f) => ({
  ...(f.brands.length ? { brand: f.brands.join(",") } : {}),
  ...(f.minPrice != null ? { minPrice: f.minPrice } : {}),
  ...(f.maxPrice != null ? { maxPrice: f.maxPrice } : {}),
  attrs: {
    ...(f.sizes.length ? { Size: f.sizes } : {}),
    ...(f.colours.length ? { Colour: f.colours } : {}),
  },
})

export default function MobileListing({ categorySlug = "", q = "", minDiscount = null, title, withTopBar = true, groupByCategory = false }) {
  const navigate = useNavigate()
  const { storePath, fulfilmentMode, isQuick } = useStoreMode()
  const { zoneId } = useDeliveryLocation()
  const { categories, loading: categoriesLoading } = usePublicCategories(zoneId)
  const location = useLocation()
  const [searchParams, setSearchParams] = useSearchParams()
  const paramString = PARAM_KEYS.map((k) => `${k}=${searchParams.get(k) || ""}`).join("&")
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const { sort, filters } = useMemo(() => readListParams(searchParams), [paramString])
  /** Rewrites sort/filters in place (replace), so Back goes to the previous page, not the previous filter. */
  const setList = useCallback(
    (change) => setSearchParams((prev) => writeListParams(prev, change(readListParams(prev))), { replace: true }),
    [setSearchParams],
  )
  const setFilters = (value) => { setList((c) => ({ ...c, filters: value })); setPage(1) }

  // Pages loaded: as many as this history entry had, when coming back to it.
  const [page, setPage] = useState(() => readLoadedPages(location.key))
  const [state, setState] = useState({ loading: true, products: [], total: 0, facets: null })
  const loaded = useRef({ key: "", pages: 0 })
  // "" (closed), "sort", "brand", "price" or "all".
  const [sheet, setSheet] = useState("")
  const closeSheet = useCallback(() => setSheet(""), [])
  const [swatches, setSwatches] = useState({})

  useEffect(() => {
    saveLoadedPages(location.key, page)
  }, [location.key, page])

  // The category this page is about, its parent, and the chips to show.
  const current = useMemo(
    () => (categorySlug && categorySlug !== "all" ? findCategoryBySlug(categories, categorySlug) : null),
    [categories, categorySlug],
  )
  const parent = current?.parentId ? categories.find((c) => c.id === current.parentId) : current
  const chips = parent ? categories.filter((c) => c.parentId === parent.id) : []
  const unresolved = Boolean(categorySlug) && categorySlug !== "all" && !current && !isCategoryId(categorySlug)
  const waiting = unresolved && (categoriesLoading || !categories.length)
  // Categories loaded and none of them is this one: say so rather than list everything.
  const notFound = unresolved && !categoriesLoading && categories.length > 0

  useEffect(() => {
    catalogAPI
      .getAttributes()
      .then((res) => {
        const list = res?.data?.data?.attributes || res?.data?.data || []
        const map = {}
        for (const a of Array.isArray(list) ? list : []) {
          for (const v of a?.values || []) if (v?.hex) map[String(v.value).toLowerCase()] = v.hex
        }
        setSwatches(map)
      })
      .catch(() => {})
  }, [])

  // A new category or query starts from the top with no filters (on a
  // change, not when coming back to this page).
  const scopeKey = `${categorySlug}|${q}|${minDiscount || ""}`
  const lastScope = useRef(scopeKey)
  useEffect(() => {
    if (lastScope.current === scopeKey) return
    lastScope.current = scopeKey
    setPage(1)
    if (activeFilterCount(filters)) setList((c) => ({ ...c, filters: EMPTY_MOBILE_FILTERS }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scopeKey])

  const baseParams = useMemo(
    () => ({
      ...(q ? { q, smart: 1 } : {}),
      // A category id this session's list doesn't know yet (added since it
      // loaded) still filters, rather than falling back to everything.
      ...(current
        ? { categoryId: current.id }
        : isCategoryId(categorySlug)
          ? { categoryId: categorySlug }
          : {}),
      ...(minDiscount > 0 ? { minDiscount } : {}),
      fulfilmentMode,
      ...(isQuick && zoneId ? { zoneId } : {}),
    }),
    [q, current, categorySlug, minDiscount, fulfilmentMode, isQuick, zoneId],
  )

  useEffect(() => {
    if (waiting) return undefined
    if (notFound) {
      setState({ loading: false, products: [], total: 0, facets: null })
      return undefined
    }
    let cancelled = false
    setState((s) => ({ ...s, loading: true }))
    // The next page of what is showing is appended; anything else (a new
    // search, or coming back with three pages loaded) loads pages 1..page.
    const key = JSON.stringify([baseParams, filters, sort])
    const append = page > 1 && loaded.current.key === key && loaded.current.pages === page - 1
    const pages = append ? [page] : Array.from({ length: page }, (_, i) => i + 1)
    Promise.all(
      pages.map((n) => searchAPI.searchProducts({ ...baseParams, ...filterParams(filters), sort, page: n, limit: PAGE, facets: n === 1 })),
    )
      .then((responses) => {
        if (cancelled) return
        const data = responses.map((res) => res?.data?.data || {})
        const list = data.flatMap((d) => (Array.isArray(d.products) ? d.products : []))
        const first = data[0] || {}
        loaded.current = { key, pages: page }
        setState((s) => ({
          loading: false,
          products: append ? [...s.products, ...list] : list,
          total: Number(first.total) || 0,
          // Facets from the unfiltered first page, so options don't vanish as you pick.
          facets: !append && !activeFilterCount(filters) ? first.facets || s.facets : s.facets || first.facets,
        }))
      })
      .catch(() => {
        if (!cancelled) setState((s) => ({ ...s, loading: false }))
      })
    return () => {
      cancelled = true
    }
  }, [baseParams, filters, sort, page, waiting, notFound])

  const countFor = useCallback(
    (draft) =>
      searchAPI
        .searchProducts({ ...baseParams, ...filterParams(draft), limit: 1 })
        .then((res) => Number(res?.data?.data?.total) || 0),
    [baseParams],
  )

  const heading = title || current?.name || (q ? `"${q}"` : notFound ? "Category not found" : isCategoryId(categorySlug) ? "Products" : "All Products")
  const subtitle = minDiscount > 0 ? `Styles at ${minDiscount}% off or more` : ""
  const nFilters = activeFilterCount(filters)
  // Loading with nothing to show yet (also when coming back with several pages to reload).
  const firstLoad = state.loading && (page === 1 || !state.products.length)

  // Search results read in category groups ("Kurtas · 12 results") while
  // nothing re-orders or narrows them; a sort or filter shows one flat grid.
  const groups = useMemo(() => {
    if (!groupByCategory || !q || sort !== "relevance" || nFilters) return null
    const byName = new Map()
    for (const p of state.products) {
      const name = String(p?.categoryName || "").trim() || "More results"
      if (!byName.has(name)) byName.set(name, [])
      byName.get(name).push(p)
    }
    return byName.size > 1 ? [...byName.entries()] : null
  }, [groupByCategory, q, sort, nFilters, state.products])

  const pill = (on) =>
    `flex h-[34px] shrink-0 items-center rounded-[20px] px-4 text-[13px] transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app-brown ${
      on ? "bg-app-brown font-bold text-white" : "bg-app-sand font-medium text-app-ink active:bg-app-champagne/50"
    }`
  const grid = "grid grid-cols-2 gap-x-3 gap-y-4"
  const outlined =
    "inline-flex h-11 items-center justify-center rounded-full border border-app-brown px-6 text-[13.5px] font-bold text-app-brown active:bg-app-tint focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app-brown disabled:opacity-50"

  return (
    <div className="min-h-screen bg-app-cream pb-[calc(84px+env(safe-area-inset-bottom))] font-app text-app-ink lg:hidden">
      {withTopBar ? <ListingHeader title={heading} subtitle={subtitle} /> : title ? (
        // Under the big search header (a deals page): the title, without a second back bar.
        <div className="px-4 pb-1 pt-3">
          <h1 className="font-app-display text-[26px] font-bold leading-[1.1] text-app-brown">{title}</h1>
          {subtitle ? <p className="text-[12.5px] text-app-muted">{subtitle}</p> : null}
        </div>
      ) : null}

      {chips.length ? (
        <nav
          aria-label="Sub-categories"
          className={`${withTopBar ? "sticky top-[calc(60px+env(safe-area-inset-top))] z-30" : ""} flex h-[42px] items-center gap-2 overflow-x-auto bg-app-cream/95 px-3 backdrop-blur [scrollbar-width:none] [&::-webkit-scrollbar]:hidden`}
        >
          <button
            type="button"
            aria-current={current?.id === parent?.id ? "page" : undefined}
            onClick={() => parent && navigate(storePath(`/category/${categorySlugOf(parent)}`))}
            className={pill(current?.id === parent?.id)}
          >
            All
          </button>
          {chips.map((c) => (
            <button
              key={c.id}
              type="button"
              aria-current={current?.id === c.id ? "page" : undefined}
              onClick={() => navigate(storePath(`/category/${categorySlugOf(c)}`))}
              className={pill(current?.id === c.id)}
            >
              {c.name}
            </button>
          ))}
        </nav>
      ) : null}

      {notFound ? null : (
        <div className="flex min-h-[36px] items-center gap-2 px-4 pt-2 text-[13px]" aria-live="polite">
          <p className="min-w-0 flex-1 truncate text-app-muted">
            {firstLoad ? (q ? "Searching…" : "Loading…") : (
              <>
                <span className="font-semibold text-app-ink">{state.total.toLocaleString("en-IN")}</span> item{state.total === 1 ? "" : "s"}
                {q && !withTopBar ? <> for <span className="font-semibold text-app-ink">&ldquo;{q}&rdquo;</span></> : null}
              </>
            )}
          </p>
          {nFilters ? (
            <button
              type="button"
              onClick={() => setFilters(EMPTY_MOBILE_FILTERS)}
              className="flex shrink-0 items-center gap-1 rounded-full px-2 py-1 text-[12.5px] font-semibold text-app-brown focus-visible:outline-2 focus-visible:outline-app-brown"
            >
              <X className="h-3.5 w-3.5" aria-hidden="true" /> Clear filters
            </button>
          ) : null}
        </div>
      )}

      <div className="p-3">
        {firstLoad ? (
          <div className={grid} aria-hidden="true">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="overflow-hidden rounded-2xl bg-white">
                <div className="aspect-[4/5] animate-pulse bg-app-sand/70" />
                <div className="space-y-1.5 p-2.5">
                  <div className="h-3 w-4/5 animate-pulse rounded bg-app-sand/70" />
                  <div className="h-3 w-1/2 animate-pulse rounded bg-app-sand/70" />
                  <div className="h-8 w-full animate-pulse rounded-full bg-app-sand/70" />
                </div>
              </div>
            ))}
          </div>
        ) : notFound ? (
          <div className="mt-10 flex flex-col items-center px-6 text-center">
            <span className="flex h-20 w-20 items-center justify-center rounded-full bg-app-sand text-app-brown" aria-hidden="true">
              <SearchX className="h-9 w-9" />
            </span>
            <p className="mt-5 font-app-display text-[24px] font-bold leading-tight text-app-brown">Category not found</p>
            <p className="mt-1 max-w-[260px] text-[13px] text-app-muted">It may have been renamed or removed.</p>
            <div className="mt-6 flex gap-3">
              <Link to={storePath("/categories")} className={outlined}>All categories</Link>
              <Link
                to={storePath("/")}
                className="inline-flex h-11 items-center justify-center rounded-full bg-app-brown px-6 text-[13.5px] font-bold text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app-brown"
              >
                Home
              </Link>
            </div>
          </div>
        ) : state.products.length ? (
          <>
            {groups ? (
              <div className="space-y-5">
                {groups.map(([name, list]) => (
                  <section key={name} aria-label={name}>
                    <h2 className="mb-2.5 px-1 text-[15px] font-semibold text-app-ink">
                      {name} <span className="font-normal text-app-muted">· {list.length} result{list.length === 1 ? "" : "s"}</span>
                    </h2>
                    <div className={grid}>
                      {list.map((p) => (
                        <ProductTile key={p._id} product={p} />
                      ))}
                    </div>
                  </section>
                ))}
              </div>
            ) : (
              <div className={grid}>
                {state.products.map((p) => (
                  <ProductTile key={p._id} product={p} />
                ))}
              </div>
            )}
            {state.products.length < state.total ? (
              <div className="mt-5 text-center">
                <button type="button" disabled={state.loading} onClick={() => setPage((n) => n + 1)} className={outlined}>
                  {state.loading ? "Loading…" : "Show more"}
                </button>
              </div>
            ) : null}
          </>
        ) : (
          <div className="mt-10 flex flex-col items-center px-6 text-center">
            <span className="flex h-20 w-20 items-center justify-center rounded-full bg-app-sand text-app-brown" aria-hidden="true">
              {nFilters ? <FilterX className="h-9 w-9" /> : <PackageOpen className="h-9 w-9" />}
            </span>
            <p className="mt-5 text-[17px] font-bold text-app-ink">
              {nFilters ? "Nothing matches those filters" : q ? `No results for “${q}”` : "Nothing here yet"}
            </p>
            <p className="mt-1 max-w-[270px] text-[13px] text-app-muted">
              {nFilters
                ? "Try widening your price range or clearing a filter to see more."
                : q
                  ? "Check the spelling, or try a broader word."
                  : isQuick
                    ? "Try Shop for delivery across India."
                    : "We are still stocking this. Try another category."}
            </p>
            {nFilters ? (
              <button type="button" onClick={() => setFilters(EMPTY_MOBILE_FILTERS)} className={`mt-6 ${outlined}`}>
                Clear filters
              </button>
            ) : (
              <Link to={storePath("/categories")} className={`mt-6 ${outlined}`}>Browse categories</Link>
            )}
          </div>
        )}
      </div>

      {notFound ? null : (
        <FloatingFilterBar
          sortActive={sort !== "relevance"}
          brandActive={filters.brands.length > 0}
          priceActive={filters.minPrice != null || filters.maxPrice != null}
          filterCount={nFilters}
          onOpen={setSheet}
        />
      )}
      <FilterSheet
        open={Boolean(sheet)}
        section={sheet || "all"}
        onClose={closeSheet}
        value={filters}
        sort={sort}
        sorts={SORTS}
        onApply={(f, s) => {
          setList((c) => ({ ...c, filters: f, sort: SORT_KEYS.includes(s) ? s : c.sort }))
          setPage(1)
        }}
        facets={state.facets}
        swatches={swatches}
        countFor={countFor}
      />
    </div>
  )
}

