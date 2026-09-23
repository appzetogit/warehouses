import { useEffect, useMemo, useState } from "react"
import { catalogAPI, searchAPI, orderAPI } from "@store/api"
import { useStoreMode } from "@store/context/StoreModeContext"
import { isModuleAuthenticated } from "@store/utils/auth"
import { resolveMediaUrl } from "@/shared/utils/mediaUrl"
import HeroCarousel from "./HeroCarousel"
import { CategoryGridCard, FeaturedDealCard, PopularProductsCard } from "./HomeCard"
import { HomeSkeleton } from "./HomeSkeletons"
import ProductCarousel from "./ProductCarousel"
import { percentOff } from "./ui"

const PRODUCT_LIMIT = 50

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
  const { storePath, fulfilmentMode, isQuick } = useStoreMode()
  const [products, setProducts] = useState([])
  const [loading, setLoading] = useState(true)
  const [orderItems, setOrderItems] = useState([])
  const [recommended, setRecommended] = useState([])
  const signedIn = isModuleAuthenticated("user")

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    searchAPI
      .searchProducts({ limit: PRODUCT_LIMIT, fulfilmentMode, ...(zoneId ? { zoneId } : {}) })
      .then((res) => { if (!cancelled) setProducts((res?.data?.data?.products || []).map(toTile)) })
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

  // Seed "You may also like" from the most recent ordered product this store sells, else the top product.
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

  // Product categories ranked by how many products they have here.
  const productGroups = useMemo(() => {
    const byCat = new Map()
    for (const p of products) {
      const key = String(p.categoryId || p.categoryName || "")
      if (!key || !p.categoryName) continue
      if (!byCat.has(key)) byCat.set(key, { id: key, name: p.categoryName, items: [] })
      byCat.get(key).items.push(p)
    }
    return [...byCat.values()].sort((a, b) => b.items.length - a.items.length)
  }, [products])

  const categoryLink = (id, name) => {
    const match = categories.find((c) => String(c.id) === String(id) || c.name === name)
    return storePath(`/category/${match?.slug || slugify(name)}`)
  }
  const productLink = (id) => storePath(`/product/${id}`)

  // --- Featured 4-card row ---------------------------------------------
  // All four cards read the live catalogue: no placeholder names, ratings or
  // stock photos, so what a shopper clicks is what they saw.
  const categoryTileImage = (cat) =>
    cat?.image ? resolveMediaUrl(cat.image) : ""

  // Card 1: shop by category — the categories that actually have products.
  const featuredCategoryTiles = productGroups.slice(0, 4).map((group) => {
    const match = categories.find(
      (c) => String(c.id) === String(group.id) || c.name === group.name,
    )
    return {
      key: `cat-${group.id}`,
      label: group.name,
      image: categoryTileImage(match) || firstImage(group.items[0]),
      to: categoryLink(group.id, group.name),
    }
  })

  // Card 2: deal of the day — the deepest discount on offer right now.
  const featuredDealProduct = deals[0] || products[0] || null

  /** Four products from a category for the 2x2 cards, rating badge only. */
  const popularTiles = (group, prefix) =>
    (group?.items || []).slice(0, 4).map((item, idx) => ({
      key: `${prefix}-${item._id || idx}`,
      name: item.name,
      badge: Number(item.rating) > 0 ? Number(item.rating).toFixed(1) : "",
      image: firstImage(item),
      to: productLink(item._id),
    }))

  const featuredTshirts = popularTiles(productGroups[0], "pop-a")
  const featuredShirts = popularTiles(productGroups[1], "pop-b")

  // Hold the page's shape while the catalogue loads, instead of flashing an
  // empty screen and then pushing everything down.
  if (loading) return <HomeSkeleton />

  const topGroup = productGroups[0]
  const recommendedList = recommended.filter((p) => p?._id)
  const mode = isQuick ? "quick" : "shop"

  return (
    <div className="min-h-screen bg-gray-100/70 pb-12">
      {/* Hero Banner Section */}
      <HeroCarousel banners={heroBanners} onOpen={onOpenBanner} />

      {/* Main Content Area */}
      <div className="relative z-20 mx-auto -mt-6 max-w-[1500px] space-y-4 px-3 sm:px-5 lg:-mt-16 lg:space-y-6">
        {/* 4 Featured Cards Grid Matching Screenshot */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          <CategoryGridCard
            title={isQuick ? "Shop essentials by category" : "Shop by category"}
            tiles={featuredCategoryTiles}
            seeMoreTo={storePath("/categories")}
          />

          <FeaturedDealCard
            title="Deal of the day"
            product={featuredDealProduct}
            to={featuredDealProduct?._id ? productLink(featuredDealProduct._id) : storePath("/offers")}
            seeMoreTo={storePath("/offers")}
          />

          <PopularProductsCard
            title={productGroups[0] ? `Popular in ${productGroups[0].name}` : "Popular now"}
            seeMoreTo={productGroups[0] ? categoryLink(productGroups[0].id, productGroups[0].name) : storePath("/categories")}
            items={featuredTshirts}
          />

          <PopularProductsCard
            title={productGroups[1] ? `Popular in ${productGroups[1].name}` : "Popular now"}
            seeMoreTo={productGroups[1] ? categoryLink(productGroups[1].id, productGroups[1].name) : storePath("/categories")}
            items={featuredShirts}
          />
        </div>

        {/* Carousel Rows */}
        <ProductCarousel
          title="Today's deals"
          products={deals.slice(0, 20)}
          seeAllTo={storePath("/offers")}
          mode={mode}
          etaMinutes={etaMinutes}
        />

        <ProductCarousel
          title="You may also like"
          products={recommendedList}
          mode={mode}
          etaMinutes={etaMinutes}
        />

        {topGroup && topGroup.items.length >= 3 ? (
          <ProductCarousel
            title={`Top picks in ${topGroup.name}`}
            products={topGroup.items.slice(0, 20)}
            seeAllTo={categoryLink(topGroup.id, topGroup.name)}
            mode={mode}
            etaMinutes={etaMinutes}
          />
        ) : null}

        {!deals.length && !recommendedList.length && !products.length ? (
          <section className="rounded-2xl bg-white p-8 text-center text-gray-500 shadow-sm border border-gray-100">
            {isQuick ? "Nothing is available for quick delivery here yet." : "New products are on their way. Check back soon."}
          </section>
        ) : null}
      </div>
    </div>
  )
}
