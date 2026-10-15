/**
 * Desktop (lg+) listing in the customer app's look (product_listing_screen
 * .dart, laid out wide): a cream page, a serif brown title with "N items",
 * sand/brown sub-category pills, a left rail of white filter cards, a sort
 * menu, and a 4–5 column grid of the app's product card.
 *
 * Data: GET /catalog/search/products (searchAPI.searchProducts) with the
 * params it already accepts (q, smart, smartExclude, categoryId, brand,
 * attr[...], minPrice, maxPrice, inStockOnly, sort, page, limit, facets).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Link, useSearchParams } from "react-router-dom"
import { X, ChevronDown, ChevronLeft, ChevronRight, FilterX, PackageOpen, Search, SearchX, SlidersHorizontal } from "lucide-react"
import { useStoreMode } from "@store/context/StoreModeContext"
import { adminAPI } from "@store/api"
import { searchAPI } from "@/services/api"
import { mediaUrl, useDesktopAddToCart } from "./desktopCart"
import ProductCard from "../storefront/ProductCard"
import { QuickGridSkeleton, QuickProductGrid } from "./quick/QuickRail"
import QuickSubcategoryRail from "./quick/QuickSubcategoryRail"
import { categorySlugOf, findCategoryBySlug, isCategoryId } from "@store/utils/categorySlug"
import { AppEmptyState, appOutlinedButton, appPill, appRing, appSolidButton } from "./appBits"

const cx = (...a) => a.filter(Boolean).join(" ")
const PAGE_SIZE = 24
const focusRing = appRing

// Re-exported so existing importers (StoreDesktop) keep working.
export { mediaUrl, useDesktopAddToCart }

export const SORT_OPTIONS = [
  { value: "relevance", label: "Featured" },
  { value: "price_asc", label: "Price: Low to High" },
  { value: "price_desc", label: "Price: High to Low" },
  { value: "rating", label: "Customer Rating" },
  { value: "newest", label: "Newest Arrivals" },
]

const num = (v) => (v == null || v === "" || !Number.isFinite(Number(v)) ? null : Number(v))
const rupees = (n) => `₹${Number(n || 0).toLocaleString("en-IN")}`

/**
 * Result tile: the app's product card (storefront/ProductCard) with this
 * listing's channel and delivery time. Products with sizes pick one on the card.
 */
export function ListingTile({ product, channel, etaMinutes, onAddToCart }) {
  return <ProductCard product={product} channel={channel} etaMinutes={etaMinutes} onAction={onAddToCart} />
}

export function TileGrid({ children }) {
  return (
    <div className="grid grid-cols-2 gap-x-3 gap-y-4 sm:grid-cols-3 lg:grid-cols-4 lg:gap-x-4 lg:gap-y-5 2xl:grid-cols-5">{children}</div>
  )
}

/** One white filter card in the rail. */
function RailSection({ title, children, extra = null }) {
  return (
    <section className="rounded-2xl bg-white p-4 shadow-[0_1px_4px_rgba(25,20,17,0.05)]">
      <div className="mb-2.5 flex items-center justify-between gap-2">
        <h3 className="text-[14px] font-bold text-app-ink">{title}</h3>
        {extra}
      </div>
      {children}
    </section>
  )
}

function Check({ checked, onChange, children }) {
  return (
    <label className="-mx-1.5 flex cursor-pointer items-center gap-2.5 rounded-lg px-1.5 py-1.5 text-[13.5px] text-app-ink hover:bg-app-tint">
      <input type="checkbox" checked={checked} onChange={onChange} className={cx("h-4 w-4 shrink-0 accent-app-brown", focusRing)} />
      <span className={cx("min-w-0 truncate", checked ? "font-semibold" : "")}>{children}</span>
    </label>
  )
}

/** Category tree built from the public categories (parentId groups subcategories). */
export function buildCategoryTree(list = []) {
  const rows = (Array.isArray(list) ? list : []).map((c, i) => ({
    id: String(c._id || c.id || ""),
    slug: categorySlugOf(c),
    name: c.name || "",
    image: c.image || c.imageUrl || "",
    parentId: c.parentId ? String(c.parentId?._id || c.parentId) : null,
    sortOrder: Number(c.sortOrder) || 0,
    order: i,
  })).filter((c) => c.id && c.name)
    // The API appends product-less parents after the listed categories; restore sortOrder.
    .sort((a, b) => a.sortOrder - b.sortOrder || a.order - b.order)
  const ids = new Set(rows.map((r) => r.id))
  const top = rows.filter((r) => !r.parentId || !ids.has(r.parentId))
  return top.map((t) => ({ ...t, children: rows.filter((r) => r.parentId === t.id) }))
}

function CategoryTree({ tree, selectedId, onSelect }) {
  const selectedTop = tree.find((t) => t.id === selectedId || t.children.some((c) => c.id === selectedId))
  const link = (cat, level = 0) => {
    const active = cat.id === selectedId
    return (
      <li key={cat.id}>
        <button
          type="button"
          onClick={() => onSelect(cat)}
          className={cx(
            "w-full truncate rounded-lg px-2.5 py-1.5 text-left text-[13.5px] transition-colors",
            level ? "pl-5" : "",
            active ? "bg-app-tint font-bold text-app-brown" : "text-app-ink hover:bg-app-alt",
            focusRing,
          )}
          aria-current={active ? "true" : undefined}
        >
          {cat.name}
        </button>
      </li>
    )
  }
  return (
    <ul className="-mx-1 max-h-80 space-y-0.5 overflow-y-auto px-1 [scrollbar-width:thin]">
      {selectedId ? (
        <li>
          <button
            type="button"
            onClick={() => onSelect(null)}
            className={cx("flex items-center gap-1 rounded-lg px-1 py-1 text-[13px] font-semibold text-app-brown hover:underline", focusRing)}
          >
            <ChevronLeft className="h-3.5 w-3.5" aria-hidden="true" /> Any category
          </button>
        </li>
      ) : null}
      {tree.map((top) => (
        <li key={top.id}>
          <ul className="space-y-0.5">
            {link(top)}
            {selectedTop?.id === top.id ? top.children.map((c) => link(c, 1)) : null}
          </ul>
        </li>
      ))}
    </ul>
  )
}

// Brown thumbs on the shared two-thumb slider (.wh-range in global.css).
const thumb =
  "[&::-webkit-slider-thumb]:border-app-brown! [&::-moz-range-thumb]:border-app-brown! focus-visible:outline-none [&:focus-visible::-webkit-slider-thumb]:ring-2 [&:focus-visible::-webkit-slider-thumb]:ring-app-champagne [&:focus-visible::-moz-range-thumb]:ring-2 [&:focus-visible::-moz-range-thumb]:ring-app-champagne"

/** Price: a brown two-thumb slider over the result's range, plus exact fields. */
function PriceFilter({ range, minPrice, maxPrice, onApply }) {
  const [min, setMin] = useState(minPrice ?? "")
  const [max, setMax] = useState(maxPrice ?? "")
  useEffect(() => { setMin(minPrice ?? ""); setMax(maxPrice ?? "") }, [minPrice, maxPrice])
  const floor = Math.floor(Number(range?.min) || 0)
  const ceil = Math.max(floor + 1, Math.ceil(Number(range?.max) || 0))
  const span = Math.max(1, ceil - floor)
  const clamp = (n) => Math.min(ceil, Math.max(floor, n))
  const lo = clamp(num(min) ?? floor)
  const hi = clamp(num(max) ?? ceil)
  const input = cx(
    "h-9 w-full min-w-0 rounded-lg border border-app-line bg-app-alt px-2.5 text-[13px] text-app-ink placeholder:text-app-muted",
    focusRing,
  )
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        onApply(num(min), num(max))
      }}
    >
      <p className="mb-1 text-[12.5px] font-semibold text-app-ink">
        {rupees(lo)} – {rupees(hi)}
      </p>
      <div className="relative h-8">
        <span className="absolute left-0 right-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-app-line" />
        <span
          className="absolute top-1/2 h-1 -translate-y-1/2 rounded-full bg-app-brown"
          style={{ left: `${((lo - floor) / span) * 100}%`, right: `${100 - ((hi - floor) / span) * 100}%` }}
        />
        <input
          type="range"
          aria-label="Lowest price"
          min={floor}
          max={ceil}
          value={lo}
          onChange={(e) => setMin(String(Math.min(Number(e.target.value), hi)))}
          className={`wh-range absolute inset-0 w-full ${thumb}`}
        />
        <input
          type="range"
          aria-label="Highest price"
          min={floor}
          max={ceil}
          value={hi}
          onChange={(e) => setMax(String(Math.max(Number(e.target.value), lo)))}
          className={`wh-range absolute inset-0 w-full ${thumb}`}
        />
      </div>
      <div className="mt-2 flex items-center gap-2">
        <input aria-label="Minimum price" inputMode="numeric" placeholder={`₹${floor}`} value={min} onChange={(e) => setMin(e.target.value)} className={input} />
        <span className="text-app-muted" aria-hidden="true">–</span>
        <input aria-label="Maximum price" inputMode="numeric" placeholder={`₹${ceil}`} value={max} onChange={(e) => setMax(e.target.value)} className={input} />
      </div>
      <button
        type="submit"
        className={cx("mt-3 h-9 w-full rounded-full bg-app-brown text-[13px] font-bold text-white transition-colors hover:bg-app-brown-deep", focusRing)}
      >
        Apply price
      </button>
    </form>
  )
}

/** Brands as brown checkboxes, with a search box once the list is long. */
function BrandFilter({ brands, selected, onToggle }) {
  const [query, setQuery] = useState("")
  const needle = query.trim().toLowerCase()
  const shown = needle ? brands.filter((b) => String(b.value).toLowerCase().includes(needle)) : brands
  return (
    <>
      {brands.length > 8 ? (
        <label className="mb-2 flex h-9 items-center gap-2 rounded-full border border-app-line bg-app-alt px-3 focus-within:ring-2 focus-within:ring-app-champagne">
          <Search className="h-4 w-4 text-app-muted" aria-hidden="true" />
          <span className="sr-only">Search brand</span>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search brand..."
            className="min-w-0 flex-1 bg-transparent text-[13px] text-app-ink placeholder:text-app-muted focus:outline-none"
          />
        </label>
      ) : null}
      <div className="max-h-60 overflow-y-auto [scrollbar-width:thin]">
        {shown.map((b) => (
          <Check key={b.value} checked={selected.includes(b.value)} onChange={() => onToggle(b.value)}>
            {b.value} <span className="font-normal text-app-muted">({b.count})</span>
          </Check>
        ))}
        {!shown.length ? <p className="py-1 text-[12.5px] text-app-muted">No brand matches “{query.trim()}”.</p> : null}
      </div>
    </>
  )
}

const EMPTY_FILTERS = { brands: [], attrs: {}, minPrice: null, maxPrice: null, inStockOnly: false }

/*
 * Sort, filters and page live in the address (?sort=price_asc&brand=A,B&
 * minPrice=500&inStock=1&attr.Size=M,L&page=2), so Back from a product comes
 * back to the same results, and a link shares them.
 */
const LISTING_KEYS = ["sort", "page", "brand", "minPrice", "maxPrice", "inStock"]
const ATTR_PREFIX = "attr."
const splitList = (v) => String(v || "").split(",").map((s) => s.trim()).filter(Boolean)

const isListingKey = (key) => LISTING_KEYS.includes(key) || key.startsWith(ATTR_PREFIX)

/** Just the listing's own params, in a stable order: a string to memo on. */
function listingParamString(searchParams) {
  return [...searchParams.entries()]
    .filter(([k]) => isListingKey(k))
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join("&")
}

function readListingParams(searchParams) {
  const attrs = {}
  for (const [k, v] of searchParams.entries()) {
    if (k.startsWith(ATTR_PREFIX) && k.length > ATTR_PREFIX.length) {
      const values = splitList(v)
      if (values.length) attrs[k.slice(ATTR_PREFIX.length)] = values
    }
  }
  const sort = searchParams.get("sort")
  return {
    sort: SORT_OPTIONS.some((o) => o.value === sort) ? sort : "relevance",
    page: Math.max(1, parseInt(searchParams.get("page"), 10) || 1),
    filters: {
      brands: splitList(searchParams.get("brand")),
      attrs,
      minPrice: num(searchParams.get("minPrice")),
      maxPrice: num(searchParams.get("maxPrice")),
      inStockOnly: searchParams.get("inStock") === "1",
    },
  }
}

/** The other params (q, cat, minDiscount…) kept; the listing's replaced by `next`. */
function writeListingParams(searchParams, { sort, page, filters }) {
  const out = new URLSearchParams()
  for (const [k, v] of searchParams.entries()) if (!isListingKey(k)) out.append(k, v)
  if (sort && sort !== "relevance") out.set("sort", sort)
  if (filters.brands.length) out.set("brand", filters.brands.join(","))
  if (filters.minPrice != null) out.set("minPrice", String(filters.minPrice))
  if (filters.maxPrice != null) out.set("maxPrice", String(filters.maxPrice))
  if (filters.inStockOnly) out.set("inStock", "1")
  for (const [name, values] of Object.entries(filters.attrs || {})) {
    if (values?.length) out.set(`${ATTR_PREFIX}${name}`, values.join(","))
  }
  if (page > 1) out.set("page", String(page))
  return out
}

/** Skeleton of the app card while results load. */
function CardSkeleton() {
  return (
    <div className="rounded-[14px] bg-white p-[5px] shadow-[0_2px_8px_rgba(25,20,17,0.06)]" aria-hidden="true">
      <div className="aspect-[4/5] animate-pulse rounded-[10px] bg-app-sand/70" />
      <div className="space-y-1.5 px-1 pb-1 pt-2">
        <div className="h-3 w-2/3 animate-pulse rounded bg-app-sand/70" />
        <div className="h-3 w-4/5 animate-pulse rounded bg-app-sand/60" />
        <div className="h-3 w-1/2 animate-pulse rounded bg-app-sand/60" />
        <div className="mt-2 h-[38px] w-full animate-pulse rounded-[10px] bg-app-sand/60" />
      </div>
    </div>
  )
}

/**
 * The full desktop listing: rail + results bar + grid + pages.
 * Props: q, smart (bool, search chips), categoryId (Mongo id) or categorySlug,
 * onSelectCategory(cat|null), zoneId, title, emptyText.
 */
export function DesktopProductListing({ q = "", smart = false, categoryId = null, categorySlug = null, onSelectCategory, zoneId, title, minDiscount = null }) {
  const { isQuick, fulfilmentMode, storePath } = useStoreMode()
  const channel = isQuick ? "quick" : "shop"
  const addToCart = useDesktopAddToCart()
  const [rawCategories, setRawCategories] = useState([])
  const [categoriesLoaded, setCategoriesLoaded] = useState(false)
  const [searchParams, setSearchParams] = useSearchParams()
  const listingKey = listingParamString(searchParams)
  const { filters, sort, page } = useMemo(() => readListingParams(new URLSearchParams(listingKey)), [listingKey])
  const [removedChips, setRemovedChips] = useState([])
  const [state, setState] = useState({ loading: true, products: [], total: 0, facets: null, chips: [] })

  /** Changes the listing's params in place (replace), so Back skips each filter click. */
  const setListing = useCallback(
    (change) => setSearchParams((prev) => writeListingParams(prev, change(readListingParams(prev))), { replace: true }),
    [setSearchParams],
  )

  useEffect(() => {
    let cancelled = false
    setCategoriesLoaded(false)
    adminAPI.getPublicCategories(zoneId ? { zoneId } : {})
      .then((res) => {
        const list = res?.data?.data?.categories || res?.data?.categories || []
        if (!cancelled) setRawCategories(Array.isArray(list) ? list : [])
      })
      .catch(() => { if (!cancelled) setRawCategories([]) })
      .finally(() => { if (!cancelled) setCategoriesLoaded(true) })
    return () => { cancelled = true }
  }, [zoneId])

  const tree = useMemo(() => buildCategoryTree(rawCategories), [rawCategories])
  const allCats = useMemo(() => tree.flatMap((t) => [t, ...t.children]), [tree])
  const selectedCat = useMemo(
    () => (categoryId
      ? allCats.find((c) => c.id === String(categoryId)) || null
      : categorySlug && categorySlug !== "all" ? findCategoryBySlug(allCats, categorySlug) : null),
    [allCats, categoryId, categorySlug],
  )
  // An id this session's list doesn't know (added since it loaded) still filters.
  const effectiveCategoryId = categoryId || selectedCat?.id || (isCategoryId(categorySlug) ? categorySlug : null)
  const unresolvedSlug = !categoryId && categorySlug && categorySlug !== "all" && !selectedCat && !isCategoryId(categorySlug)
  // A slug that isn't resolved yet: wait for the categories rather than listing everything.
  const waitingForCategory = unresolvedSlug && !categoriesLoaded
  // Loaded, and no category answers to it: say so rather than listing everything.
  const categoryNotFound = unresolvedSlug && categoriesLoaded && rawCategories.length > 0

  // A new query or category starts clean (on a change, not when coming back to the page).
  const scopeKey = `${q}|${categoryId || ""}|${categorySlug || ""}|${minDiscount || ""}`
  const lastScope = useRef(scopeKey)
  useEffect(() => {
    if (lastScope.current === scopeKey) return
    lastScope.current = scopeKey
    // Keep the same array when nothing was removed, or the search re-runs for nothing.
    setRemovedChips((c) => (c.length ? [] : c))
    const cur = readListingParams(searchParams)
    const anySet = cur.page > 1 || cur.filters.brands.length || cur.filters.minPrice != null || cur.filters.maxPrice != null
      || cur.filters.inStockOnly || Object.keys(cur.filters.attrs).length
    if (anySet) setListing((c) => ({ ...c, filters: EMPTY_FILTERS, page: 1 }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scopeKey])

  useEffect(() => {
    if (waitingForCategory || categoryNotFound) {
      if (categoryNotFound) setState({ loading: false, products: [], total: 0, facets: null, chips: [] })
      return undefined
    }
    // A discount page ("Minimum 35% off") lists across every category.
    if (!q && !effectiveCategoryId && !(categorySlug === "all") && !(minDiscount > 0)) {
      setState({ loading: false, products: [], total: 0, facets: null, chips: [] })
      return undefined
    }
    let cancelled = false
    setState((s) => ({ ...s, loading: true }))
    searchAPI.searchProducts({
      ...(q ? { q } : {}),
      ...(smart && q ? { smart: 1 } : {}),
      ...(smart && removedChips.length ? { smartExclude: removedChips.join(",") } : {}),
      ...(effectiveCategoryId ? { categoryId: effectiveCategoryId } : {}),
      ...(filters.brands.length ? { brand: filters.brands.join(",") } : {}),
      ...(filters.minPrice != null ? { minPrice: filters.minPrice } : {}),
      ...(filters.maxPrice != null ? { maxPrice: filters.maxPrice } : {}),
      ...(filters.inStockOnly ? { inStockOnly: true } : {}),
      ...(minDiscount > 0 ? { minDiscount } : {}),
      attrs: filters.attrs,
      zoneId,
      fulfilmentMode,
      sort,
      page,
      limit: PAGE_SIZE,
      facets: true,
    })
      .then((res) => {
        if (cancelled) return
        const data = res?.data?.data || {}
        setState({
          loading: false,
          products: Array.isArray(data.products) ? data.products : [],
          total: Number(data.total) || 0,
          facets: data.facets || null,
          chips: data.smart?.appliedFilters || [],
        })
      })
      .catch(() => { if (!cancelled) setState({ loading: false, products: [], total: 0, facets: null, chips: [] }) })
    return () => { cancelled = true }
  }, [q, smart, removedChips, effectiveCategoryId, categorySlug, waitingForCategory, categoryNotFound, filters, sort, page, zoneId, fulfilmentMode, minDiscount])

  const update = (patch) => setListing((c) => ({ ...c, filters: { ...c.filters, ...patch }, page: 1 }))
  const toggleBrand = (b) => update({ brands: filters.brands.includes(b) ? filters.brands.filter((x) => x !== b) : [...filters.brands, b] })
  const toggleAttr = (name, value) => {
    const cur = filters.attrs[name] || []
    const next = cur.includes(value) ? cur.filter((v) => v !== value) : [...cur, value]
    update({ attrs: { ...filters.attrs, [name]: next } })
  }
  const anyFilter = filters.brands.length || filters.minPrice != null || filters.maxPrice != null || filters.inStockOnly || Object.values(filters.attrs).some((v) => v.length)

  // Quick category pages swap the filter rail for the subcategory rail
  // (QUICK_UI_SPEC.md). Search keeps the filters it has today.
  const quickRailItems = useMemo(() => {
    if (!isQuick || q || !selectedCat) return []
    const parent =
      tree.find((t) => t.id === selectedCat.id) ||
      tree.find((t) => (t.children || []).some((c) => c.id === selectedCat.id))
    return parent?.children?.length ? parent.children : []
  }, [isQuick, q, selectedCat, tree])
  const showQuickRail = quickRailItems.length > 0

  // Sub-category pills, as the app shows them: "All" (the parent) and its children.
  const pillParent = useMemo(() => {
    if (!selectedCat || showQuickRail) return null
    const parent = tree.find((t) => t.id === selectedCat.id) || tree.find((t) => t.children.some((c) => c.id === selectedCat.id))
    return parent?.children?.length ? parent : null
  }, [selectedCat, showQuickRail, tree])

  const { loading, products, total, facets, chips } = state
  const from = total ? (page - 1) * PAGE_SIZE + 1 : 0
  const to = Math.min(page * PAGE_SIZE, total)
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const heading = title || selectedCat?.name || (q ? `“${q}”` : categoryNotFound ? "Category not found" : effectiveCategoryId ? "Products" : "All Products")
  const eyebrow = q && !title ? "Search results" : pillParent && pillParent.id !== selectedCat?.id ? pillParent.name : ""
  const subtitle = minDiscount > 0 ? `Styles at ${minDiscount}% off or more` : ""

  // The filters in force, each removable from above the grid.
  const appliedPills = [
    ...filters.brands.map((b) => ({ key: `b:${b}`, label: b, remove: () => toggleBrand(b) })),
    ...Object.entries(filters.attrs).flatMap(([name, values]) =>
      values.map((v) => ({ key: `a:${name}:${v}`, label: `${name}: ${v}`, remove: () => toggleAttr(name, v) })),
    ),
    ...(filters.minPrice != null || filters.maxPrice != null
      ? [{
          key: "price",
          label: filters.minPrice != null && filters.maxPrice != null
            ? `${rupees(filters.minPrice)} – ${rupees(filters.maxPrice)}`
            : filters.minPrice != null ? `From ${rupees(filters.minPrice)}` : `Up to ${rupees(filters.maxPrice)}`,
          remove: () => update({ minPrice: null, maxPrice: null }),
        }]
      : []),
    ...(filters.inStockOnly ? [{ key: "stock", label: "In stock", remove: () => update({ inStockOnly: false }) }] : []),
  ]

  const goToPage = (n) => {
    setListing((c) => ({ ...c, page: n }))
    window.scrollTo(0, 0)
  }

  if (categoryNotFound) {
    return (
      <div className="min-h-screen bg-app-cream font-app text-app-ink">
        <div className="mx-auto max-w-[1500px] px-3 py-10 sm:px-5">
          <AppEmptyState icon={SearchX} serif title="Category not found" text="This category may have been renamed or removed.">
            <Link to={storePath("/categories")} className={appOutlinedButton}>All categories</Link>
            <Link to={storePath("/")} className={appSolidButton}>Back to home</Link>
          </AppEmptyState>
        </div>
      </div>
    )
  }

  const pageButton = cx(
    "inline-flex h-10 items-center gap-1 rounded-full border border-app-brown bg-white px-4 text-[13.5px] font-semibold text-app-brown transition-colors hover:bg-app-tint disabled:cursor-not-allowed disabled:border-app-line disabled:text-[#BDB5AE] disabled:hover:bg-white",
    focusRing,
  )

  return (
    <div className="min-h-screen bg-app-cream font-app text-app-ink">
      <div className="mx-auto max-w-[1500px] px-3 pb-12 pt-5 sm:px-5">
        {/* Title, count and sort */}
        <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
          <div className="min-w-0">
            {eyebrow ? <p className="text-[11.5px] font-semibold uppercase tracking-[1.4px] text-app-muted">{eyebrow}</p> : null}
            <h1 className="line-clamp-2 font-app-display text-[30px] font-bold leading-[1.1] text-app-brown xl:text-[34px]">{heading}</h1>
            <p className="mt-1 text-[13px] text-app-muted" aria-live="polite">
              {loading ? (q ? "Searching…" : "Loading…") : (
                <>
                  <span className="font-semibold text-app-ink">{total.toLocaleString("en-IN")}</span> item{total === 1 ? "" : "s"}
                  {total > PAGE_SIZE ? <> · showing {from}–{to}</> : null}
                  {subtitle ? <> · {subtitle}</> : null}
                </>
              )}
            </p>
          </div>
          <label className="flex items-center gap-2.5 text-[13px] text-app-muted">
            Sort by
            <span className="relative">
              <select
                value={sort}
                onChange={(e) => { const value = e.target.value; setListing((c) => ({ ...c, sort: value, page: 1 })) }}
                className={cx(
                  "h-10 cursor-pointer appearance-none rounded-full border-[1.5px] border-app-brown bg-white pl-4 pr-10 text-[13px] font-semibold text-app-brown",
                  focusRing,
                )}
              >
                {SORT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
              <ChevronDown className="pointer-events-none absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-app-brown" aria-hidden="true" />
            </span>
          </label>
        </header>

        {pillParent && onSelectCategory ? (
          <nav aria-label="Sub-categories" className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              aria-current={selectedCat?.id === pillParent.id ? "page" : undefined}
              onClick={() => { if (selectedCat?.id !== pillParent.id) onSelectCategory(pillParent) }}
              className={appPill(selectedCat?.id === pillParent.id)}
            >
              All
            </button>
            {pillParent.children.map((c) => (
              <button
                key={c.id}
                type="button"
                aria-current={selectedCat?.id === c.id ? "page" : undefined}
                onClick={() => { if (selectedCat?.id !== c.id) onSelectCategory(c) }}
                className={appPill(selectedCat?.id === c.id)}
              >
                {c.name}
              </button>
            ))}
          </nav>
        ) : null}

        <div className={cx("mt-5 flex", showQuickRail ? "flex-col gap-3 sm:flex-row sm:gap-4" : "gap-6")}>
          {showQuickRail ? (
            <QuickSubcategoryRail items={quickRailItems} selectedId={selectedCat?.id} heading={heading} />
          ) : (
            <aside
              className="hidden w-[256px] shrink-0 self-start lg:sticky lg:top-[136px] lg:block lg:max-h-[calc(100vh-150px)] lg:overflow-y-auto lg:pb-2 lg:[scrollbar-width:thin]"
              aria-label="Filters"
            >
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-2 px-1">
                  <p className="flex items-center gap-2 text-[15px] font-bold text-app-ink">
                    <SlidersHorizontal className="h-4 w-4 text-app-brown" aria-hidden="true" /> Filters
                  </p>
                  {anyFilter ? (
                    <button type="button" onClick={() => update(EMPTY_FILTERS)} className={cx("rounded text-[12.5px] font-semibold text-app-brown hover:underline", focusRing)}>
                      Clear all
                    </button>
                  ) : null}
                </div>
                {tree.length > 0 && onSelectCategory ? (
                  <RailSection title="Category">
                    <CategoryTree tree={tree} selectedId={selectedCat?.id || effectiveCategoryId} onSelect={onSelectCategory} />
                  </RailSection>
                ) : null}
                {facets?.priceRange && facets.priceRange.max > 0 ? (
                  <RailSection title="Price range">
                    <PriceFilter range={facets.priceRange} minPrice={filters.minPrice} maxPrice={filters.maxPrice} onApply={(minPrice, maxPrice) => update({ minPrice, maxPrice })} />
                  </RailSection>
                ) : null}
                {facets?.brands?.length ? (
                  <RailSection title="Brand">
                    <BrandFilter brands={facets.brands} selected={filters.brands} onToggle={toggleBrand} />
                  </RailSection>
                ) : null}
                {(facets?.attributes || []).map((a) => (
                  <RailSection key={a.name} title={a.name}>
                    <div className="flex max-h-48 flex-wrap gap-2 overflow-y-auto [scrollbar-width:thin]">
                      {a.values.map((v) => {
                        const on = (filters.attrs[a.name] || []).includes(v.value)
                        return (
                          <button
                            key={v.value}
                            type="button"
                            aria-pressed={on}
                            aria-label={`${v.value} (${v.count})`}
                            onClick={() => toggleAttr(a.name, v.value)}
                            className={cx(
                              "min-w-[44px] rounded-full border px-3 py-1.5 text-[12.5px] transition-colors",
                              on ? "border-app-brown bg-app-brown font-bold text-white" : "border-transparent bg-app-sand font-medium text-app-ink hover:border-app-champagne",
                              focusRing,
                            )}
                          >
                            {v.value}
                          </button>
                        )
                      })}
                    </div>
                  </RailSection>
                ))}
                <RailSection title="Availability">
                  <Check checked={filters.inStockOnly} onChange={() => update({ inStockOnly: !filters.inStockOnly })}>In stock only</Check>
                </RailSection>
              </div>
            </aside>
          )}

          <main className="min-w-0 flex-1">
            {smart && chips.length > 0 ? (
              <div className="mb-3 flex flex-wrap items-center gap-2" aria-label="Filters read from your search">
                <span className="text-[12.5px] text-app-muted">From your search:</span>
                {chips.map((chip) => (
                  <button
                    key={chip.id}
                    type="button"
                    onClick={() => { setRemovedChips((prev) => [...prev, chip.id]); if (page > 1) setListing((c) => ({ ...c, page: 1 })) }}
                    className={cx("inline-flex h-8 items-center gap-1 rounded-full bg-app-sand px-3 text-[12.5px] font-medium text-app-ink hover:bg-app-champagne/60", focusRing)}
                    aria-label={`Remove filter ${chip.label}`}
                  >
                    {chip.label} <X className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                ))}
              </div>
            ) : null}

            {appliedPills.length ? (
              <div className="mb-3 flex flex-wrap items-center gap-2" aria-label="Filters applied">
                {appliedPills.map((p) => (
                  <button
                    key={p.key}
                    type="button"
                    onClick={p.remove}
                    aria-label={`Remove filter ${p.label}`}
                    className={cx("inline-flex h-8 items-center gap-1 rounded-full border border-app-brown bg-app-tint px-3 text-[12.5px] font-semibold text-app-brown hover:bg-app-tint-strong", focusRing)}
                  >
                    {p.label} <X className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                ))}
                <button type="button" onClick={() => update(EMPTY_FILTERS)} className={cx("rounded px-1 text-[12.5px] font-semibold text-app-muted hover:text-app-brown hover:underline", focusRing)}>
                  Clear all
                </button>
              </div>
            ) : null}

            {loading ? (
              isQuick ? <QuickGridSkeleton count={12} /> : (
                <TileGrid>
                  {Array.from({ length: 10 }).map((_, i) => <CardSkeleton key={i} />)}
                </TileGrid>
              )
            ) : products.length ? (
              isQuick ? <QuickProductGrid products={products} /> : (
                <TileGrid>
                  {products.map((p) => (
                    <ProductCard key={p._id} product={p} channel={channel} onAction={addToCart} />
                  ))}
                </TileGrid>
              )
            ) : (
              <div className="rounded-2xl bg-white/60">
                <AppEmptyState
                  icon={anyFilter ? FilterX : q ? SearchX : PackageOpen}
                  title={anyFilter ? "Nothing matches those filters" : q ? `No results for “${q}”` : "Nothing here yet"}
                  text={
                    anyFilter
                      ? "Try widening your price range or clearing a filter to see more."
                      : q
                        ? "Check the spelling, or try a broader word."
                        : isQuick
                          ? "Try Shop for delivery across India."
                          : "We are still stocking this. Try another category."
                  }
                >
                  {anyFilter ? (
                    <button type="button" onClick={() => update(EMPTY_FILTERS)} className={appOutlinedButton}>Clear filters</button>
                  ) : (
                    <Link to={storePath("/categories")} className={appOutlinedButton}>Browse categories</Link>
                  )}
                </AppEmptyState>
              </div>
            )}

            {!loading && pages > 1 ? (
              <nav className="mt-8 flex items-center justify-center gap-3" aria-label="Pages">
                <button type="button" disabled={page <= 1} onClick={() => goToPage(Math.max(1, page - 1))} className={pageButton}>
                  <ChevronLeft className="h-4 w-4" aria-hidden="true" /> Previous
                </button>
                <span className="rounded-full bg-app-sand px-4 py-2 text-[13px] font-semibold text-app-ink">
                  Page {page} of {pages}
                </span>
                <button type="button" disabled={page >= pages} onClick={() => goToPage(page + 1)} className={pageButton}>
                  Next <ChevronRight className="h-4 w-4" aria-hidden="true" />
                </button>
              </nav>
            ) : null}
          </main>
        </div>
      </div>
    </div>
  )
}
