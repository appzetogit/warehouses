import { useEffect, useMemo, useState } from "react"
import { catalogAPI, searchAPI, orderAPI } from "@store/api"
import { useStoreMode } from "@store/context/StoreModeContext"
import { isModuleAuthenticated } from "@store/utils/auth"
import { resolveMediaUrl } from "@/shared/utils/mediaUrl"
import HeroCarousel from "./HeroCarousel"
import { CategoryGridCard, FeaturedDealCard, PopularProductsCard } from "./HomeCard"
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
  const [orderItems, setOrderItems] = useState([])
  const [recommended, setRecommended] = useState([])
  const signedIn = isModuleAuthenticated("user")

  useEffect(() => {
    let cancelled = false
    searchAPI
      .searchProducts({ limit: PRODUCT_LIMIT, fulfilmentMode, ...(zoneId ? { zoneId } : {}) })
      .then((res) => { if (!cancelled) setProducts((res?.data?.data?.products || []).map(toTile)) })
      .catch(() => { if (!cancelled) setProducts([]) })
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

  // Find exact seeded products by name substring to hook up deep links
  const findProd = (pattern) => {
    const pat = pattern.toLowerCase()
    return products.find((p) => String(p.name || "").toLowerCase().includes(pat))
  }

  const chanderiProd = findProd("chanderi")
  const supimaProd = findProd("supima")
  const waffleProd = findProd("waffle")
  const stripedProd = findProd("striped")
  const vintageProd = findProd("vintage")
  const linenProd = findProd("linen")
  const oxfordProd = findProd("oxford")
  const flannelProd = findProd("flannel") || findProd("brushed")
  const casualProd = findProd("casual") || findProd("collar")

  // --- Featured 4-card row matching the screenshot ---
  // Card 1: Shop by category
  const featuredCategoryTiles = [
    {
      key: "cat-bomber",
      label: "Bomber & Denim Jackets",
      image: "/categories/bomber-denim-jackets.webp",
      to: storePath("/category/bomber-and-denim-jackets"),
    },
    {
      key: "cat-gym",
      label: "Gym Tees & Tops",
      image: "/categories/gym-tees-tops.webp",
      to: storePath("/category/gym-tees-and-tops"),
    },
    {
      key: "cat-dresses",
      label: "Dresses",
      image: "/categories/dresses.webp",
      to: storePath("/category/dresses"),
    },
    {
      key: "cat-tshirts",
      label: "T-Shirts",
      image: "/categories/t-shirts.webp",
      to: storePath("/category/t-shirts"),
    },
  ]

  // Card 2: Deal of the day (Chanderi Silk Festive A-line Kurta)
  const featuredDealProduct = chanderiProd
    ? {
        ...chanderiProd,
        name: "Chanderi Silk Festive A-line Kurta",
        image: "/deal-chanderi.jpg",
        price: 999,
        mrp: 1999,
        rating: 4.5,
        reviews: "1.2k",
      }
    : {
        name: "Chanderi Silk Festive A-line Kurta",
        image: "/deal-chanderi.jpg",
        price: 999,
        mrp: 1999,
        rating: 4.5,
        reviews: "1.2k",
      }

  // Card 3: Popular in T-Shirts
  const featuredTshirts = [
    {
      key: "t-supima",
      name: "Supima Classic Heavy Tee",
      badge: "699",
      image: "https://images.unsplash.com/photo-1521572267360-ee0c2909d518?w=600&auto=format&fit=crop&q=80",
      to: supimaProd?._id ? productLink(supimaProd._id) : storePath("/category/t-shirts"),
    },
    {
      key: "t-waffle",
      name: "Slub Textured Waffle Tee",
      badge: "4.4",
      image: "https://images.unsplash.com/photo-1562157873-818bc0726f68?w=600&auto=format&fit=crop&q=80",
      to: waffleProd?._id ? productLink(waffleProd._id) : storePath("/category/t-shirts"),
    },
    {
      key: "t-striped",
      name: "Organic Cotton Striped Tee",
      badge: "4.2",
      image: "https://images.unsplash.com/photo-1523381210434-271e8be1f52b?w=600&auto=format&fit=crop&q=80",
      to: stripedProd?._id ? productLink(stripedProd._id) : storePath("/category/t-shirts"),
    },
    {
      key: "t-vintage",
      name: "Garment-Dyed Vintage Tee",
      badge: "4.3",
      image: "https://images.unsplash.com/photo-1618354691229-88d47f285158?w=600&auto=format&fit=crop&q=80",
      to: vintageProd?._id ? productLink(vintageProd._id) : storePath("/category/t-shirts"),
    },
  ]

  // Card 4: Popular in Shirts
  const featuredShirts = [
    {
      key: "s-linen",
      name: "Pure European Linen Shirt",
      badge: "1,199",
      image: "https://images.unsplash.com/photo-1602810318383-e386cc2a3ccf?w=600&auto=format&fit=crop&q=80",
      to: linenProd?._id ? productLink(linenProd._id) : storePath("/category/shirts"),
    },
    {
      key: "s-oxford",
      name: "Classic Oxford Button-Down",
      badge: "4.5",
      image: "https://images.unsplash.com/photo-1598033129183-c4f50c736f10?w=600&auto=format&fit=crop&q=80",
      to: oxfordProd?._id ? productLink(oxfordProd._id) : storePath("/category/shirts"),
    },
    {
      key: "s-brushed",
      name: "Yarn-Dyed Brushed Cotton",
      badge: "899",
      image: "https://images.unsplash.com/photo-1626497764746-6dc36546b388?w=600&auto=format&fit=crop&q=80",
      to: flannelProd?._id ? productLink(flannelProd._id) : storePath("/category/shirts"),
    },
    {
      key: "s-casual",
      name: "Slim Fit Casual Shirt",
      badge: "4.2",
      image: "https://images.unsplash.com/photo-1603252109303-2751441dd157?w=600&auto=format&fit=crop&q=80",
      to: casualProd?._id ? productLink(casualProd._id) : storePath("/category/shirts"),
    },
  ]

  const topGroup = productGroups[0]
  const recommendedList = recommended.filter((p) => p?._id)
  const mode = isQuick ? "quick" : "shop"

  return (
    <div className="min-h-screen bg-gray-100/70 pb-12">
      {/* Hero Banner Section */}
      <HeroCarousel banners={heroBanners} onOpen={onOpenBanner} />

      {/* Main Content Area */}
      <div className="relative z-20 mx-auto max-w-[1500px] space-y-6 px-5 -mt-16">
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
            to={chanderiProd?._id ? productLink(chanderiProd._id) : storePath("/offers")}
            seeMoreTo={storePath("/offers")}
          />

          <PopularProductsCard
            title="Popular in T-Shirts"
            seeMoreTo={storePath("/category/t-shirts")}
            items={featuredTshirts}
          />

          <PopularProductsCard
            title="Popular in Shirts"
            seeMoreTo={storePath("/category/shirts")}
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
