import { useEffect, useMemo, useState } from "react"
import { Link } from "react-router-dom"
import { ChevronRight } from "lucide-react"
import { catalogAPI, sellerAPI } from "@/services/api"
import { useDeliveryLocation } from "@store/context/DeliveryLocationContext"
import { useStoreMode } from "@store/context/StoreModeContext"
import { categorySlugOf, slugifyCategory } from "@store/utils/categorySlug"
import { mediaUrl } from "../desktop/desktopCart"
import { useBusinessSettings, usePublicCategories } from "../desktop/useDesktopShell"
import { useQuickLayout } from "../quick-mobile/QuickLayoutContext"
import { CampaignBanner, FeaturedRail } from "../quick-mobile/QuickFeed"
import QuickRateNudge from "../quick-mobile/QuickRateNudge"
import OfferBannerStrip from "../home/OfferBannerStrip"
import ShopPlanSection from "../home/ShopPlanSection"
import { AccessoriseIt, DealsOnRepeat, FindYourFit } from "../home/ShopFitSections"
import ShopHero from "../home/ShopHero"
import ServiceMarquee from "../home/ServiceMarquee"
import { CollectionCards, CuratedEdits, TopCategories, WardrobeCollections } from "../home/ShopCategorySections"
import AppProductRail from "../home/AppProductRail"
import ShopStoresRail from "../home/ShopStoresRail"
import MoreToExplore from "../home/MoreToExplore"
import ShopHomeFooter from "../home/ShopHomeFooter"
import useHomeFeatured from "../home/useHomeFeatured"
import { groupByCategory, productOff } from "../home/homeCatalogue"

/**
 * The phone home, section by section after the customer app's Shop home
 * (warehouse_user shop_home_screen.dart): hero, service strip, collection
 * cards, top categories, "What's the plan?", wardrobe collections, curated
 * edits, deals, the fit grids, stores, a rail per busy category, deals on
 * repeat, More to Explore and the footer. Quick keeps its own blocks (offer
 * strip, category row, featured cards, campaigns) in the same frame.
 *
 * Every section is live data — the admin's banners and featured cards, the
 * public categories, the catalogue and the stores selling it — and hides when
 * there is nothing real to show.
 */

/** Quick's category row: main categories first, then their children. */
function CategoryRow({ categories = [] }) {
  const { storePath } = useStoreMode()
  if (!categories.length) return null
  return (
    <section aria-label="Shop by category" className="font-app">
      <div className="mb-3 flex items-center justify-between gap-3 px-4">
        <h2 className="text-[18px] font-bold text-app-ink">Shop by Category</h2>
        <Link to={storePath("/categories")} className="flex items-center gap-0.5 text-[12.5px] font-semibold text-app-brown-badge">
          View All <ChevronRight className="h-4 w-4" aria-hidden="true" />
        </Link>
      </div>
      <div className="flex gap-3 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {categories.map((c) => (
          <Link key={c.id} to={storePath(`/category/${categorySlugOf(c)}`)} className="w-[72px] shrink-0 text-center active:scale-95">
            <span className="block aspect-square overflow-hidden rounded-2xl bg-app-alt">
              {c.image ? (
                <img src={mediaUrl(c.image)} alt="" loading="lazy" className="h-full w-full object-cover" />
              ) : (
                <span className="flex h-full items-center justify-center text-[20px] font-black text-app-brown">{c.name.slice(0, 1)}</span>
              )}
            </span>
            <span className="mt-1 block truncate text-[11px] font-semibold text-app-ink">{c.name}</span>
          </Link>
        ))}
      </div>
    </section>
  )
}

const shimmer = "animate-pulse bg-app-line"

export function MobileHomeSkeleton() {
  return (
    <div role="status" aria-label="Loading" className="space-y-5 bg-app-cream pb-6 pt-3 lg:hidden">
      <div className={`mx-1.5 aspect-[2/1] rounded-[10px] ${shimmer}`} />
      <div className={`mx-4 h-4 rounded-full ${shimmer}`} />
      <div className="grid grid-cols-2 gap-3 px-4">
        <div className={`h-[190px] rounded-[10px] ${shimmer}`} />
        <div className={`h-[190px] rounded-[10px] ${shimmer}`} />
      </div>
      <div className="flex gap-3 overflow-hidden px-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className={`h-[162px] w-[112px] shrink-0 rounded-[14px] ${shimmer}`} />
        ))}
      </div>
      <div className="flex gap-3 overflow-hidden px-4">
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className={`aspect-[4/7] w-[46%] shrink-0 rounded-2xl ${shimmer}`} />
        ))}
      </div>
    </div>
  )
}

export default function MobileHome({ heroBanners = [], products = [], loading = false }) {
  const { isQuick, storePath } = useStoreMode()
  const { brandName } = useBusinessSettings()
  const { effectiveLocation, zoneId } = useDeliveryLocation()
  // The public category tree: real images and parents, one request per zone.
  const { categories } = usePublicCategories(zoneId)
  // Quick's admin-edited extras (featured cards, campaigns); empty outside Quick.
  const { layout } = useQuickLayout()
  // The admin's featured cards, for Shop's "Curated Style Edits" as well.
  const featured = useHomeFeatured(zoneId)
  const [stores, setStores] = useState([])

  const lat = effectiveLocation?.latitude
  const lng = effectiveLocation?.longitude
  useEffect(() => {
    let cancelled = false
    // Nearest first when the address is known; otherwise every approved store.
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
  }, [lat, lng, isQuick])

  // What each public category sells here (its subcategories' products count for a parent).
  const groups = useMemo(() => groupByCategory(categories, products), [categories, products])

  // Quick's category row: top-level categories first, then their children.
  const categoryRow = useMemo(() => {
    const withName = categories.filter((c) => c?.name)
    const parents = withName.filter((c) => !c.parentId)
    const children = withName.filter((c) => c.parentId)
    return [...parents, ...children].slice(0, 14)
  }, [categories])

  const deals = useMemo(
    () =>
      products
        .map((p) => ({ p, off: productOff(p) }))
        // The same 10% floor as "View All" (/search?minDiscount=10).
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

  const categoryLink = (id, name) => {
    const match = categories.find((c) => (id && String(c.id) === id) || c.name.trim().toLowerCase() === name.toLowerCase())
    return storePath(`/category/${match ? categorySlugOf(match) : slugifyCategory(name)}`)
  }

  // Stores: only those selling something here, nearest first.
  const sellingIds = new Set(products.map((p) => String(p.sellerId || p.seller?._id || "")))
  const featuredStores = stores.filter((s) => sellingIds.has(String(s._id)))

  if (loading && !products.length) return <MobileHomeSkeleton />

  return (
    <div className="bg-app-cream font-app lg:hidden">
      <div className="space-y-7 pb-7 pt-1.5">
        <ShopHero banners={heroBanners} loading={loading} />
        <div className={heroBanners.length || loading ? "-mt-6!" : ""}>
          <ServiceMarquee storeCount={featuredStores.length} />
        </div>

        {isQuick ? (
          <>
            <OfferBannerStrip />
            <CategoryRow categories={categoryRow} />
            <FeaturedRail items={layout.featured} />
          </>
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

        {isQuick ? <CampaignBanner campaign={layout.campaigns[0]} /> : <DealsOnRepeat products={products} />}

        {products.length ? null : (
          <p className="px-4 text-center text-[14px] text-app-muted">
            {isQuick ? "Nothing is available for quick delivery here yet." : "New products are on their way."}
          </p>
        )}
      </div>

      <MoreToExplore products={products} />

      {isQuick && layout.campaigns.length > 1 ? (
        <div className="space-y-7 pb-7">
          {layout.campaigns.slice(1).map((c) => (
            <CampaignBanner key={c._id || c.title} campaign={c} />
          ))}
        </div>
      ) : null}

      <QuickRateNudge />
      <ShopHomeFooter />
    </div>
  )
}
