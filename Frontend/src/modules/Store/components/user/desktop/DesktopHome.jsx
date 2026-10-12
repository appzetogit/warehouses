import { useEffect, useMemo, useState } from "react"
import { catalogAPI, searchAPI, orderAPI } from "@store/api"
import { useStoreMode } from "@store/context/StoreModeContext"
import { isModuleAuthenticated } from "@store/utils/auth"
import { resolveMediaUrl } from "@/shared/utils/mediaUrl"
import HeroCarousel from "./HeroCarousel"
import OfferBannerStrip from "../home/OfferBannerStrip"
import ShopPlanSection from "../home/ShopPlanSection"
import { AccessoriseIt, DealsOnRepeat, FindYourFit } from "../home/ShopFitSections"
import { HomeSkeleton } from "./HomeSkeletons"
import {
  FeatureBand,
  Marquee,
  ProductRailSection,
  TabbedRailSection,
  TrustStrip,
} from "../storefront/HomeSections"
import {
  CategoryCircleStrip,
  ShopByCategoryGrid,
  ShopPromiseRow,
  StoreDealsSection,
} from "../storefront/ShopHomeSections"
import { useDesktopAddToCart } from "./desktopCart"
import { isRealImage, percentOff } from "./ui"
import { buildHomeRails, railSubtitle } from "@store/utils/homeRails"
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

const slugify = (s) => String(s || "").toLowerCase().trim().replace(/\s+/g, "-")

export default function DesktopHome({ heroBanners = [], categories = [], zoneId, onOpenBanner, etaMinutes }) {
  const isDesktop = useIsDesktop()
  const { storePath, fulfilmentMode, isQuick } = useStoreMode()
  const business = useBusinessSettings()
  const { roots: categoryRoots, categories: categoryList } = usePublicCategories(zoneId)
  const [products, setProducts] = useState([])
  const [loading, setLoading] = useState(true)
  const [orderItems, setOrderItems] = useState([])
  const [recommended, setRecommended] = useState([])
  const signedIn = isModuleAuthenticated("user")
  const addToCart = useDesktopAddToCart()

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
    if (!signedIn) { setOrderItems([]); return undefined }
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
  }, [signedIn])

  const productById = useMemo(() => new Map(products.map((p) => [String(p._id), p])), [products])

  // Seed "You May Also Like" from the most recent ordered product this store sells, else the top product.
  const seedId = useMemo(() => {
    const ordered = orderItems.find((it) => productById.has(it.id))
    return ordered?.id || (products[0]?._id ? String(products[0]._id) : null)
  }, [orderItems, productById, products])

  useEffect(() => {
    if (!seedId) { setRecommended([]); return undefined }
    let cancelled = false
    catalogAPI
      .getProductRecommendations(seedId, { type: "similar", fulfilmentMode, limit: 15 })
      .then((res) => { if (!cancelled) setRecommended((res?.data?.data?.products || []).map(toTile)) })
      .catch(() => { if (!cancelled) setRecommended([]) })
    return () => { cancelled = true }
  }, [seedId, fulfilmentMode])

  const deals = useMemo(
    () => products
      .map((p) => ({ p, off: percentOff(p.price, p.mrp) || 0 }))
      .filter((x) => x.off > 0)
      .sort((a, b) => b.off - a.off)
      .map((x) => x.p),
    [products],
  )

  // New Arrivals, a row per busy category and an under-499 row, from the catalogue itself.
  const rails = useMemo(() => buildHomeRails(products), [products])

  // Product categories ranked by how many products they have here.
  const productGroups = useMemo(() => {
    const byCat = new Map()
    for (const p of products) {
      const key = String(p.categoryId || p.categoryName || "")
      if (!key || !p.categoryName) continue
      if (!byCat.has(key)) byCat.set(key, { id: key, name: p.categoryName, items: [], fromPrice: 0, maxOff: 0 })
      const g = byCat.get(key)
      g.items.push(p)
      const price = Number(p.price) || 0
      if (price > 0 && (!g.fromPrice || price < g.fromPrice)) g.fromPrice = price
      g.maxOff = Math.max(g.maxOff, percentOff(p.price, p.mrp) || 0)
    }
    return [...byCat.values()].sort((a, b) => b.items.length - a.items.length)
  }, [products])

  // Stores by their best discount right now, from the products they list here.
  const storeDeals = useMemo(() => {
    const byStore = new Map()
    for (const p of products) {
      const id = String(p.seller?._id || p.sellerId || "")
      if (!id) continue
      if (!byStore.has(id)) {
        byStore.set(id, {
          id,
          name: p.seller?.name || "Store",
          image: p.seller?.image || p.image,
          to: storePath(`/sellers/${id}`),
          count: 0,
          fromPrice: 0,
          maxOff: 0,
        })
      }
      const s = byStore.get(id)
      s.count += 1
      const price = Number(p.price) || 0
      if (price > 0 && (!s.fromPrice || price < s.fromPrice)) s.fromPrice = price
      s.maxOff = Math.max(s.maxOff, percentOff(p.price, p.mrp) || 0)
    }
    return [...byStore.values()].sort((a, b) => b.maxOff - a.maxOff || b.count - a.count)
  }, [products, storePath])

  const categoryLink = (id, name) => {
    const match = categories.find((c) => String(c.id) === String(id) || c.name === name)
    return storePath(`/category/${match?.slug || slugify(name)}`)
  }

  // Collection tiles: every category that actually has products here.
  // One tile per category name (two stores' categories can share one); the busier wins.
  const seenTileNames = new Set()
  const collectionTiles = productGroups
    .filter((group) => {
      const key = String(group.name || "").trim().toLowerCase()
      if (seenTileNames.has(key)) return false
      seenTileNames.add(key)
      return true
    })
    .slice(0, 14)
    .map((group) => {
    const match = categories.find(
      (c) => String(c.id) === String(group.id) || c.name === group.name,
    )
    return {
      id: group.id,
      label: group.name,
      image: isRealImage(match?.image) ? match.image : firstImage(group.items[0]),
      to: categoryLink(group.id, group.name),
      fromPrice: group.fromPrice,
      maxOff: group.maxOff,
    }
  })

  // Departments that have products (Women, Accessories...), then the busiest
  // subcategories, as photo circles. Empty departments are left out, and a
  // category without its own photo shows one of its products.
  const circleItems = (() => {
    const groupOf = (c) => productGroups.find((g) => String(g.id) === String(c.id) || g.name === c.name)
    const busy = productGroups
      .map((g) => categoryList.find((c) => String(c.id) === String(g.id) || c.name === g.name))
      .filter(Boolean)
    const stocked = new Set(busy.flatMap((c) => [String(c.id), c.parentId ? String(c.parentId) : ""]))
    const tops = categoryRoots.filter((c) => stocked.has(String(c.id)))
    const photoOf = (c) => {
      if (isRealImage(c.image)) return c.image
      const own = groupOf(c)
      if (own) return firstImage(own.items[0])
      const child = busy.find((b) => String(b.parentId) === String(c.id))
      const childGroup = child ? groupOf(child) : null
      return childGroup ? firstImage(childGroup.items[0]) : ""
    }
    return [...tops, ...busy.filter((c) => !tops.some((t) => t.id === c.id))].slice(0, 12).map((c) => ({
      id: c.id,
      label: c.name,
      image: photoOf(c),
      to: storePath(`/category/${c.slug}`),
    })).filter((c) => c.image)
  })()

  // Only promises the settings back up: no free-delivery threshold or coin
  // rate is configured, so none is advertised.
  const standardDays = business.settings?.standardDeliveryDays
  const marqueeItems = [
    isQuick
      ? `Quick delivery in ${etaMinutes || 10} minutes`
      : `Courier delivery in ${standardDays?.min || 2}-${standardDays?.max || 4} days`,
    "Every store is verified before it can sell",
    business.returnWindowDays ? `Returns within ${business.returnWindowDays} days of delivery` : "Easy returns on eligible items",
    "Fashion from local stores near you",
  ]

  // Hold the page's shape while the catalogue loads, instead of flashing an
  // empty screen and then pushing everything down.
  // Phones get the mobile storefront (screen 1 of the mobile mockup).
  if (!isDesktop) {
    return <MobileHome heroBanners={heroBanners} products={products} loading={loading} />
  }

  if (loading) return <HomeSkeleton />

  const recommendedList = recommended.filter((p) => p?._id)

  return (
    <div className="min-h-screen bg-wh-page pb-12">
      <div className="mx-auto max-w-[1500px] px-3 pt-4 sm:px-5">
        <CategoryCircleStrip items={circleItems} />
      </div>

      {/* Hero, inset and rounded like the reference (MOBILE_UI_SPEC.md) */}
      <div className="mx-auto max-w-[1500px] px-3 pt-3 sm:px-5">
        <div className="overflow-hidden rounded-2xl shadow-sm">
          <HeroCarousel banners={heroBanners} onOpen={onOpenBanner} />
        </div>
      </div>

      <div className="mx-auto max-w-[1500px] space-y-6 px-3 py-4 sm:px-5 sm:space-y-8">
        <TrustStrip />

        {isQuick ? <OfferBannerStrip /> : <ShopPlanSection products={products} />}

        <Marquee items={marqueeItems} />

        <ShopByCategoryGrid
          title="Shop by Category"
          subtitle="The best price in every category, from stores near you"
          tiles={collectionTiles}
        />

        {isQuick ? null : <FindYourFit products={products} />}
        {isQuick ? null : <AccessoriseIt products={products} />}
        {isQuick ? null : <DealsOnRepeat products={products} />}

        {/* New Arrivals, with a tab per busy category (the old shop's home led with this) */}
        <TabbedRailSection
          title="New Arrivals"
          subtitle="Fresh styles, added every week"
          all={rails.newArrivals.all}
          tabs={rails.newArrivals.tabs.map((t) => ({ ...t, to: categoryLink(t.id, t.label) }))}
          onAdd={addToCart}
        />

        {/* Today's Fashion Deals */}
        <ProductRailSection
          title="Today's Fashion Deals"
          subtitle="The biggest savings in the store right now"
          products={deals.slice(0, 20)}
          onAdd={addToCart}
          auto={5200}
        />

        {/* A row per category that has enough to fill one, best discount first */}
        {rails.categoryRails.slice(0, 2).map((r) => (
          <ProductRailSection
            key={r.id}
            title={r.name}
            subtitle={railSubtitle(r)}
            products={r.products}
            onAdd={addToCart}
            seeAllTo={categoryLink(r.id, r.name)}
          />
        ))}

        <ProductRailSection
          title="Under ₹499"
          subtitle="Easy picks that cost less"
          products={rails.budget}
          onAdd={addToCart}
        />

        {rails.categoryRails.slice(2).map((r) => (
          <ProductRailSection
            key={r.id}
            title={r.name}
            subtitle={railSubtitle(r)}
            products={r.products}
            onAdd={addToCart}
            seeAllTo={categoryLink(r.id, r.name)}
          />
        ))}

        {/* Real stores and their best discount, from what they list */}
        {storeDeals.length > 1 ? <StoreDealsSection stores={storeDeals} /> : null}

        <FeatureBand
          title={`Sell on ${business.brandName || "The Warehousess"}`}
          subtitle="Showcase your designer apparel and boutique collections to millions across India."
          ctaLabel="Start Selling"
          ctaTo="/seller/signup"
        />

        {recommendedList.length > 0 ? (
          <ProductRailSection
            title="You May Also Like"
            subtitle="Picked from what you have been browsing"
            products={recommendedList}
            onAdd={addToCart}
          />
        ) : null}

        <ShopPromiseRow returnDays={business.returnWindowDays} />

        {!deals.length && !recommendedList.length && !products.length ? (
          <section className="rounded-2xl border border-wh-border bg-wh-surface p-8 text-center text-wh-muted">
            {isQuick ? "Nothing is available for quick delivery here yet." : "New fashion collections are on their way. Check back soon."}
          </section>
        ) : null}
      </div>
    </div>
  )
}

