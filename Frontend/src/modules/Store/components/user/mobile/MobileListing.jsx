import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom"
import { ArrowUpDown, ChevronDown, SlidersHorizontal, X } from "lucide-react"
import { catalogAPI, searchAPI } from "@/services/api"
import { useDeliveryLocation } from "@store/context/DeliveryLocationContext"
import { useStoreMode } from "@store/context/StoreModeContext"
import { usePublicCategories } from "../desktop/useDesktopShell"
import FilterSheet, { EMPTY_MOBILE_FILTERS, activeFilterCount } from "./FilterSheet"
import MobileTopBar from "./MobileTopBar"
import ProductTile from "./ProductTile"
import { categorySlugOf, findCategoryBySlug, isCategoryId } from "@store/utils/categorySlug"

/**
 * The product listing from the mobile mockup (screen 2), for a category, a
 * search or a discount page: top bar with the count, subcategory chips, sort
 * and filter chips, a two-column grid, and more on demand.
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

function SortSheet({ open, value, onPick, onClose }) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-[80] lg:hidden" role="dialog" aria-modal="true" aria-label="Sort">
      <button type="button" aria-label="Close" onClick={onClose} className="absolute inset-0 bg-black/40" />
      <div className="wh-slide-up-bar absolute inset-x-0 bottom-0 rounded-t-2xl bg-white p-4 pb-[max(16px,env(safe-area-inset-bottom))]">
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-gray-200" />
        <h2 className="mb-2 text-[16px] font-bold text-gray-900">Sort by</h2>
        {SORTS.map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => {
              onPick(key)
              onClose()
            }}
            className={`flex w-full items-center justify-between rounded-lg px-2 py-3 text-left text-[14px] ${
              value === key ? "font-bold text-[#EA580C]" : "text-gray-800"
            }`}
          >
            {label}
            {value === key ? <span className="h-2 w-2 rounded-full bg-[#EA580C]" aria-hidden="true" /> : null}
          </button>
        ))}
      </div>
    </div>
  )
}

export default function MobileListing({ categorySlug = "", q = "", minDiscount = null, title, withTopBar = true }) {
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
  const setSort = (value) => { setList((c) => ({ ...c, sort: value })); setPage(1) }
  const setFilters = (value) => { setList((c) => ({ ...c, filters: value })); setPage(1) }

  // Pages loaded: as many as this history entry had, when coming back to it.
  const [page, setPage] = useState(() => readLoadedPages(location.key))
  const [state, setState] = useState({ loading: true, products: [], total: 0, facets: null })
  const loaded = useRef({ key: "", pages: 0 })
  const [sheet, setSheet] = useState("")
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
  const nFilters = activeFilterCount(filters)
  // Loading with nothing to show yet (also when coming back with several pages to reload).
  const firstLoad = state.loading && (page === 1 || !state.products.length)
  const chip = (on) =>
    `flex shrink-0 items-center gap-1 rounded-full border px-3 py-1.5 text-[12px] font-semibold transition-colors ${
      on ? "border-[#EA580C] bg-[#FFF1E7] text-[#C2410C]" : "border-gray-200 bg-white text-gray-700"
    }`

  return (
    <div className="min-h-screen bg-[#F7F7F8] pb-6 lg:hidden">
      {withTopBar ? (
        <MobileTopBar
          title={heading}
          subtitle={firstLoad ? "Loading…" : `${state.total.toLocaleString("en-IN")} product${state.total === 1 ? "" : "s"}`}
        />
      ) : null}

      {/* Under the page's own top bar the chips stick; under the big search header they scroll. */}
      <div className={`${withTopBar ? "sticky top-14 z-30" : ""} space-y-2 border-b border-gray-100 bg-white pb-2 pt-2`}>
        {!withTopBar ? (
          <p className="px-3 text-[13px] text-gray-600">
            {firstLoad ? "Searching…" : (
              <>
                <span className="font-bold text-gray-900">{state.total.toLocaleString("en-IN")}</span> result{state.total === 1 ? "" : "s"}
                {q ? <> for <span className="font-semibold text-gray-900">&ldquo;{q}&rdquo;</span></> : title ? <> · {title}</> : null}
              </>
            )}
          </p>
        ) : null}
        {chips.length ? (
          <div className="flex gap-2 overflow-x-auto px-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <button
              type="button"
              onClick={() => parent && navigate(storePath(`/category/${categorySlugOf(parent)}`))}
              className={`shrink-0 rounded-full px-4 py-1.5 text-[13px] font-semibold ${
                current?.id === parent?.id ? "bg-[#EA580C] text-white" : "bg-gray-100 text-gray-700"
              }`}
            >
              All
            </button>
            {chips.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => navigate(storePath(`/category/${categorySlugOf(c)}`))}
                className={`shrink-0 rounded-full px-4 py-1.5 text-[13px] font-semibold ${
                  current?.id === c.id ? "bg-[#EA580C] text-white" : "bg-gray-100 text-gray-700"
                }`}
              >
                {c.name}
              </button>
            ))}
          </div>
        ) : null}

        <div className="flex gap-2 overflow-x-auto px-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <button type="button" onClick={() => setSheet("sort")} className={chip(sort !== "relevance")}>
            <ArrowUpDown className="h-3.5 w-3.5" aria-hidden="true" /> Sort <ChevronDown className="h-3 w-3" aria-hidden="true" />
          </button>
          <button type="button" onClick={() => setSheet("filter")} className={chip(filters.brands.length > 0)}>
            Brand <ChevronDown className="h-3 w-3" aria-hidden="true" />
          </button>
          <button type="button" onClick={() => setSheet("filter")} className={chip(filters.sizes.length > 0)}>
            Size <ChevronDown className="h-3 w-3" aria-hidden="true" />
          </button>
          <button type="button" onClick={() => setSheet("filter")} className={chip(filters.minPrice != null || filters.maxPrice != null)}>
            Price <ChevronDown className="h-3 w-3" aria-hidden="true" />
          </button>
          <button type="button" onClick={() => setSheet("filter")} className={chip(nFilters > 0)}>
            <SlidersHorizontal className="h-3.5 w-3.5" aria-hidden="true" /> Filter{nFilters ? ` (${nFilters})` : ""}
          </button>
          {nFilters ? (
            <button type="button" onClick={() => setFilters(EMPTY_MOBILE_FILTERS)} className="flex shrink-0 items-center gap-1 px-2 text-[12px] font-semibold text-[#EA580C]">
              <X className="h-3.5 w-3.5" aria-hidden="true" /> Clear
            </button>
          ) : null}
        </div>
      </div>

      <div className="px-3 pt-3">
        {firstLoad ? (
          <div className="grid grid-cols-2 gap-3" aria-hidden="true">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="overflow-hidden rounded-2xl bg-white">
                <div className="aspect-[4/5] animate-pulse bg-gray-200/80" />
                <div className="space-y-1.5 p-2.5">
                  <div className="h-3 w-4/5 animate-pulse rounded bg-gray-200/80" />
                  <div className="h-3 w-1/2 animate-pulse rounded bg-gray-200/80" />
                  <div className="h-8 w-full animate-pulse rounded-lg bg-gray-200/80" />
                </div>
              </div>
            ))}
          </div>
        ) : notFound ? (
          <div className="rounded-2xl bg-white p-8 text-center">
            <p className="text-[15px] font-semibold text-gray-900">Category not found</p>
            <p className="mt-1 text-[13px] text-gray-500">It may have been renamed or removed.</p>
            <Link to={storePath("/")} className="mt-4 inline-block rounded-full border border-[#EA580C] px-5 py-2 text-[13px] font-bold text-[#EA580C]">
              Back to home
            </Link>
          </div>
        ) : state.products.length ? (
          <>
            <div className="grid grid-cols-2 gap-3">
              {state.products.map((p) => (
                <ProductTile key={p._id} product={p} />
              ))}
            </div>
            {state.products.length < state.total ? (
              <button
                type="button"
                disabled={state.loading}
                onClick={() => setPage((n) => n + 1)}
                className="mx-auto mt-4 block rounded-full border border-[#EA580C] px-6 py-2 text-[13px] font-bold text-[#EA580C] disabled:opacity-50"
              >
                {state.loading ? "Loading…" : "Show More"}
              </button>
            ) : null}
          </>
        ) : (
          <div className="rounded-2xl bg-white p-8 text-center">
            <p className="text-[15px] font-semibold text-gray-900">Nothing matches yet</p>
            <p className="mt-1 text-[13px] text-gray-500">
              {nFilters ? "Try removing a filter." : isQuick ? "Try Shop for delivery across India." : "Try another category."}
            </p>
          </div>
        )}
      </div>

      <SortSheet open={sheet === "sort"} value={sort} onPick={(k) => { setSort(k); setPage(1) }} onClose={() => setSheet("")} />
      <FilterSheet
        open={sheet === "filter"}
        onClose={() => setSheet("")}
        value={filters}
        onApply={(f) => {
          setFilters(f)
          setPage(1)
        }}
        facets={state.facets}
        swatches={swatches}
        countFor={countFor}
      />
    </div>
  )
}
