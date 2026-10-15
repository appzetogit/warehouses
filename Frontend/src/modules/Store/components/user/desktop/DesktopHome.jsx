import { useEffect, useMemo, useRef, useState } from "react"
import { Link } from "react-router-dom"
import { ChevronLeft, ChevronRight, LayoutGrid } from "lucide-react"
import { catalogAPI, searchAPI, orderAPI, sellerAPI } from "@store/api"
import { useDeliveryLocation } from "@store/context/DeliveryLocationContext"
import { useStoreMode } from "@store/context/StoreModeContext"
import { isModuleAuthenticated } from "@store/utils/auth"
import { categorySlugOf, slugifyCategory } from "@store/utils/categorySlug"
import { resolveMediaUrl } from "@/shared/utils/mediaUrl"
import OfferBannerStrip from "../home/OfferBannerStrip"
import ShopPlanSection from "../home/ShopPlanSection"
import { AccessoriseIt, DealsOnRepeat, FindYourFit } from "../home/ShopFitSections"
import ShopHero from "../home/ShopHero"
import ServiceMarquee from "../home/ServiceMarquee"
import { CollectionCards, CuratedEdits, TopCategories, WardrobeCollections } from "../home/ShopCategorySections"
import AppProductRail from "../home/AppProductRail"
import ShopStoresRail from "../home/ShopStoresRail"
import MoreToExplore from "../home/MoreToExplore"
import useHomeFeatured from "../home/useHomeFeatured"
import { categoryImage, groupByCategory, productOff } from "../home/homeCatalogue"
import { HomeSkeleton } from "./HomeSkeletons"
import useIsDesktop from "./useIsDesktop"
import { useBusinessSettings, usePublicCategories } from "./useDesktopShell"
import MobileHome from "../mobile/MobileHome"

// The search API pages 50 at a time; the home reads up to this many pages.
const PAGE_SIZE = 50
const MAX_PAGES = 8

/** The whole catalogue for this mode, newest first, a page at a time. */
async function loadCatalogue(params) {
  const page = (n) => searchAPI
    .searchProducts({ ...params, sort: "newest", limit: PAGE_SIZE, page: n })
    .then((res) => res?.data?.data || {})
  const first = await page(1)
  const pages = Math.min(MAX_PAGES, Math.ceil((Number(first.total) || 0) / PAGE_SIZE))
  const rest = pages > 1
    ? await Promise.all(Array.from({ length: pages - 1 }, (_, i) => page(i + 2).catch(() => ({}))))
    : []
  const seen = new Set()
  return [first, ...rest]
    .flatMap((d) => d.products || [])
    .filter((p) => p?._id && !seen.has(String(p._id)) && seen.add(String(p._id)))
}

const firstImage = (p) => {
  const raw = p?.image || (Array.isArray(p?.images) ? (typeof p.images[0] === "string" ? p.images[0] : p.images[0]?.url) : "")
  return raw ? resolveMediaUrl(raw) : ""
}

/** Normalise a catalogue product for the tiles (resolved image, display price). */
const toTile = (p) => ({
  ...p,
  image: firstImage(p),
  price: p.displayPrice ?? p.price,
  mrp: p.mrp ?? p.variants?.[0]?.mrp,
})

const focusRing = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app-brown"

/**
 * The phone header's round category photos, wide: "All", then the main
 * categories and their subcategories that sell something here, with arrow
 * buttons when the row runs past the page.
 */
function CategoryCircles({ categories = [], groups }) {
  const { storePath } = useStoreMode()
  const rowRef = useRef(null)
  const [edges, setEdges] = useState({ start: true, end: true })

  const items = useMemo(() => {
    const stocked = categories.filter((c) => c?.name && (groups.get(String(c.id))?.items.length || 0) > 0)
    return [...stocked.filter((c) => !c.parentId), ...stocked.filter((c) => c.parentId)].slice(0, 24)
  }, [categories, groups])

  useEffect(() => {
    const row = rowRef.current
    if (!row) return undefined
    const update = () =>
      setEdges({ start: row.scrollLeft <= 4, end: row.scrollLeft + row.clientWidth >= row.scrollWidth - 4 })
    update()
    row.addEventListener("scroll", update, { passive: true })
    window.addEventListener("resize", update)
    return () => {
      row.removeEventListener("scroll", update)
      window.removeEventListener("resize", update)
    }
  }, [items.length])

  if (!items.length) return null

  const scroll = (dir) => rowRef.current?.scrollBy({ left: dir * rowRef.current.clientWidth * 0.8, behavior: "smooth" })
  const arrow = (dir, hidden) => (
    <button
      type="button"
      onClick={() => scroll(dir)}
      aria-label={dir < 0 ? "Scroll categories left" : "Scroll categories right"}
      className={`absolute top-[26px] z-10 flex h-9 w-9 items-center justify-center rounded-full border border-app-line bg-white text-app-brown shadow-[0_2px_8px_rgba(25,20,17,0.12)] transition hover:bg-app-tint ${focusRing} ${
        dir < 0 ? "-left-2" : "-right-2"
      } ${hidden ? "pointer-events-none opacity-0" : "opacity-100"}`}
      tabIndex={hidden ? -1 : undefined}
      aria-hidden={hidden || undefined}
    >
      {dir < 0 ? <ChevronLeft className="h-5 w-5" aria-hidden="true" /> : <ChevronRight className="h-5 w-5" aria-hidden="true" />}
    </button>
  )

  const circle =
    "flex h-[68px] w-[68px] items-center justify-center overflow-hidden rounded-full shadow-[0_2px_6px_rgba(25,20,17,0.10)] transition-transform group-hover:scale-105"

  return (
    <nav aria-label="Shop by category" className="relative">
      {arrow(-1, edges.start)}
      <div
        ref={rowRef}
        className={`flex gap-2 overflow-x-auto py-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden ${
          edges.start && edges.end ? "justify-center" : ""
        }`}
      >
        <Link to={storePath("/categories")} className={`group flex w-[92px] shrink-0 flex-col items-center rounded-xl py-1 ${focusRing}`}>
          <span className={`${circle} border-2 border-[#F0D5BE] bg-app-ink`}>
            <LayoutGrid className="h-6 w-6 text-white" fill="currentColor" aria-hidden="true" />
          </span>
          <span className="mt-1.5 max-w-[92px] truncate rounded-full bg-[#F6D8B6] px-2.5 py-0.5 text-[12px] font-bold leading-tight">All</span>
        </Link>
        {items.map((c) => {
          const image = categoryImage(c) || groups.get(String(c.id))?.cover || ""
          return (
            <Link
              key={c.id}
              to={storePath(`/category/${categorySlugOf(c)}`)}
              className={`group flex w-[92px] shrink-0 flex-col items-center rounded-xl py-1 ${focusRing}`}
            >
              <span className={`${circle} border-2 border-white bg-app-alt`}>
                {image ? (
                  <img src={image} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" />
                ) : (
                  <span className="text-[20px] font-semibold text-app-muted" aria-hidden="true">
                    {c.name.charAt(0).toUpperCase()}
                  </span>
                )}
              </span>
              <span className="mt-1.5 max-w-[92px] truncate px-1 text-[12px] font-medium leading-tight text-app-ink group-hover:text-app-brown">
                {c.name}
              </span>
            </Link>
          )
        })}
      </div>
      {arrow(1, edges.end)}
    </nav>
  )
}

export default function DesktopHome({ heroBanners = [], zoneId }) {
  const isDesktop = useIsDesktop()
  const { storePath, fulfilmentMode, isQuick } = useStoreMode()
  const { brandName } = useBusinessSettings()
  const { effectiveLocation } = useDeliveryLocation()
  const { categories } = usePublicCategories(zoneId)
  // The admin's featured cards, for Shop's "Curated Style Edits".
  const featured = useHomeFeatured(zoneId)
  const [products, setProducts] = useState([])
  const [loading, setLoading] = useState(true)
  const [orderItems, setOrderItems] = useState([])
  const [recommended, setRecommended] = useState([])
  const [stores, setStores] = useState([])
  const signedIn = isModuleAuthenticated("user")

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    loadCatalogue({ fulfilmentMode, ...(zoneId ? { zoneId } : {}) })
      .then((list) => { if (!cancelled) setProducts(list.map(toTile)) })
      .catch(() => { if (!cancelled) setProducts([]) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [fulfilmentMode, zoneId])

  useEffect(() => {
    if (!isDesktop || !signedIn) { setOrderItems([]); return undefined }
    let cancelled = false
    orderAPI
      .getOrders({ page: 1, limit: 10 })
      .then((res) => {
        const d = res?.data?.data
        const orders = d?.orders || (Array.isArray(d) ? d : []) || []
        const seen = new Set()
        const items = []
        for (const o of orders) {
          for (const it of o?.items || []) {
            const id = String(it?.itemId || "")
            if (!id || seen.has(id)) continue
            seen.add(id)
            items.push({ id, name: it.name, image: it.image ? resolveMediaUrl(it.image) : "" })
          }
        }
        if (!cancelled) setOrderItems(items)
      })
      .catch(() => { if (!cancelled) setOrderItems([]) })
    return () => { cancelled = true }
  }, [isDesktop, signedIn])

  const productById = useMemo(() => new Map(products.map((p) => [String(p._id), p])), [products])

  // Seed "You May Also Like" from the most recent ordered product this store sells, else the top product.
  const seedId = useMemo(() => {
    const ordered = orderItems.find((it) => productById.has(it.id))
    return ordered?.id || (products[0]?._id ? String(products[0]._id) : null)
  }, [orderItems, productById, products])

  useEffect(() => {
    if (!isDesktop || !seedId) { setRecommended([]); return undefined }
    let cancelled = false
    catalogAPI
      .getProductRecommendations(seedId, { type: "similar", fulfilmentMode, limit: 15 })
      .then((res) => { if (!cancelled) setRecommended((res?.data?.data?.products || []).map(toTile)) })
      .catch(() => { if (!cancelled) setRecommended([]) })
    return () => { cancelled = true }
  }, [isDesktop, seedId, fulfilmentMode])

  // The stores rail, as on the phone: nearest first when the address is known.
  const lat = effectiveLocation?.latitude
  const lng = effectiveLocation?.longitude
  useEffect(() => {
    if (!isDesktop) return undefined
    let cancelled = false
    const request =
      Number.isFinite(lat) && Number.isFinite(lng)
        ? catalogAPI.getNearbyStores({ lat, lng, limit: 10, ...(isQuick ? { fulfilmentMode: "quick" } : {}) })
        : sellerAPI.getSellers({ limit: 10 })
    request
      .then((res) => {
        const d = res?.data?.data
        const list = d?.stores || d?.sellers || (Array.isArray(d) ? d : [])
        if (!cancelled) setStores(list.map((s) => ({ ...s, sellerName: s.sellerName || s.name })))
      })
      .catch(() => {
        if (!cancelled) setStores([])
      })
    return () => {
      cancelled = true
    }
  }, [isDesktop, lat, lng, isQuick])

  // What each public category sells here (its subcategories' products count for a parent).
  const groups = useMemo(() => groupByCategory(categories, products), [categories, products])

  // Deals of the Day: the same 10% floor as "View All" (/search?minDiscount=10).
  const deals = useMemo(
    () =>
      products
        .map((p) => ({ p, off: productOff(p) }))
        .filter((x) => x.off >= 10)
        .sort((a, b) => b.off - a.off)
        .map((x) => x.p)
        .slice(0, 12),
    [products],
  )

  // A rail per category with at least three products here, the busiest four.
  const categoryRails = useMemo(() => {
    const byKey = new Map()
    for (const p of products) {
      const name = String(p?.categoryName || "").trim()
      if (!name) continue
      const key = name.toLowerCase()
      if (!byKey.has(key)) byKey.set(key, { name, id: String(p.categoryId || ""), items: [] })
      byKey.get(key).items.push(p)
    }
    return [...byKey.values()]
      .filter((r) => r.items.length >= 3)
      .sort((a, b) => b.items.length - a.items.length)
      .slice(0, 4)
  }, [products])

  // Phones get the mobile storefront (screen 1 of the mobile mockup).
  if (!isDesktop) {
    return <MobileHome heroBanners={heroBanners} products={products} loading={loading} />
  }

  // Hold the page's shape while the catalogue loads, instead of flashing an
  // empty screen and then pushing everything down.
  if (loading) return <HomeSkeleton />

  const categoryLink = (id, name) => {
    const match = categories.find(
      (c) => (id && String(c.id) === id) || c.name.trim().toLowerCase() === name.toLowerCase(),
    )
    return storePath(`/category/${match ? categorySlugOf(match) : slugifyCategory(name)}`)
  }

  // Stores: only those selling something here, nearest first.
  const sellingIds = new Set(products.map((p) => String(p.sellerId || p.seller?._id || "")))
  const featuredStores = stores.filter((s) => sellingIds.has(String(s._id)))
  const recommendedList = recommended.filter((p) => p?._id)

  // The phone home's sections in the phone's order, laid out for a wide screen.
  return (
    <div className="wh-desktop min-h-screen bg-app-cream pb-16 font-app text-app-ink">
      <div className="mx-auto max-w-[1400px] px-6">
        <div className="pt-5">
          <CategoryCircles categories={categories} groups={groups} />
        </div>

        <div className="space-y-14 pt-4">
          <div>
            <ShopHero banners={heroBanners} />
            <div className="mt-4">
              <ServiceMarquee storeCount={featuredStores.length} />
            </div>
          </div>

          {isQuick ? (
            <OfferBannerStrip />
          ) : (
            <>
              <CollectionCards categories={categories} groups={groups} />
              <TopCategories categories={categories} groups={groups} />
              <ShopPlanSection products={products} />
              <WardrobeCollections categories={categories} />
              <CuratedEdits items={featured} categories={categories} groups={groups} />
            </>
          )}

          <AppProductRail
            title="Deals of the Day"
            products={deals}
            to={`${storePath("/search")}?minDiscount=10`}
            linkLabel="View All"
          />

          {isQuick ? null : <FindYourFit products={products} />}
          {isQuick ? null : <AccessoriseIt products={products} />}

          <ShopStoresRail
            title={isQuick ? "Stores Near You" : `Stores on ${brandName}`}
            stores={featuredStores}
            products={products}
          />

          {categoryRails.map((r) => (
            <AppProductRail key={r.name} title={r.name} products={r.items.slice(0, 12)} to={categoryLink(r.id, r.name)} />
          ))}

          {isQuick ? null : <DealsOnRepeat products={products} />}

          <AppProductRail title="You May Also Like" subtitle="Picked from what you have been browsing" products={recommendedList} />

          {products.length ? null : (
            <p className="rounded-2xl border border-app-line bg-white p-10 text-center text-[15px] text-app-muted">
              {isQuick ? "Nothing is available for quick delivery here yet." : "New fashion collections are on their way. Check back soon."}
            </p>
          )}
        </div>

        <MoreToExplore products={products} />
      </div>
    </div>
  )
}
