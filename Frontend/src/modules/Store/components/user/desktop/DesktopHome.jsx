import { useEffect, useMemo, useState } from "react"
import { catalogAPI, searchAPI, orderAPI } from "@store/api"
import { useStoreMode } from "@store/context/StoreModeContext"
import { isModuleAuthenticated } from "@store/utils/auth"
import { resolveMediaUrl } from "@/shared/utils/mediaUrl"
import HeroCarousel from "./HeroCarousel"
import { GridCard, DealCard } from "./HomeCard"
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

/**
 * Desktop (lg+) homepage for both stores. Hero banners and categories come
 * from Home.jsx; the product rows use one mode-aware product search (the
 * mobile home has no product feed), the recommendations endpoint, and the
 * signed-in user's orders for "Buy again".
 */
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

  // Card row: build every card that has content, then keep the first 8 (two rows).
  const cards = []
  const catTiles = categories.filter((c) => c?.name).slice(0, 4).map((c) => ({
    key: `cat-${c.id}`, to: storePath(`/category/${c.slug || slugify(c.name)}`), image: c.image, label: c.name,
  }))
  if (catTiles.length >= 2) {
    cards.push(<GridCard key="cats" title={isQuick ? "Shop essentials by category" : "Shop by category"} tiles={catTiles} seeMoreTo={storePath("/categories")} />)
  }
  if (signedIn && orderItems.length >= 2) {
    const tiles = orderItems.slice(0, 4).map((it) => ({
      key: `again-${it.id}`, to: productLink(it.id), image: it.image || productById.get(it.id)?.image || "", label: it.name,
    }))
    cards.push(<GridCard key="again" title="Order again" tiles={tiles} seeMoreTo={storePath("/orders")} />)
  }
  if (deals[0]) {
    cards.push(<DealCard key="deal" title="Deal of the day" product={deals[0]} to={productLink(deals[0]._id)} seeMoreTo={storePath("/offers")} />)
  }
  for (const g of productGroups) {
    if (g.items.length < 2) continue
    cards.push(
      <GridCard
        key={`grp-${g.id}`}
        title={`Popular in ${g.name}`}
        tiles={g.items.slice(0, 4).map((p) => ({ key: `p-${p._id}`, to: productLink(p._id), image: p.image, label: p.name }))}
        seeMoreTo={categoryLink(g.id, g.name)}
      />,
    )
  }
  if (deals.length >= 3) {
    cards.push(
      <GridCard key="deals-grid" title="More savings"
        tiles={deals.slice(1, 5).map((p) => ({ key: `d-${p._id}`, to: productLink(p._id), image: p.image, label: `${percentOff(p.price, p.mrp)}% off · ${p.name}` }))}
        seeMoreTo={storePath("/offers")} />,
    )
  }
  const rowCards = cards.slice(0, 8)
  // At 1024–1279px rows hold 3 cards; drop a trailing orphan so no row is ragged.
  const hideFromMd = rowCards.length > 3 && rowCards.length % 3 !== 0 ? rowCards.length - (rowCards.length % 3) : rowCards.length

  const topGroup = productGroups[0]
  const recommendedList = recommended.filter((p) => p?._id)
  const mode = isQuick ? "quick" : undefined

  return (
    <div className="min-h-screen bg-wh-page pb-8">
      <HeroCarousel banners={heroBanners} onOpen={onOpenBanner} />
      <div className={`relative z-10 mx-auto max-w-[1500px] space-y-5 px-5 ${heroBanners.length ? "-mt-[250px]" : "-mt-[200px]"}`}>
        {rowCards.length ? (
          <div className="grid grid-cols-3 gap-5 xl:grid-cols-4">
            {rowCards.map((card, i) => (
              <div key={card.key} className={i >= hideFromMd ? "hidden xl:block" : undefined}>{card}</div>
            ))}
          </div>
        ) : null}
        <ProductCarousel title="Today's deals" products={deals.slice(0, 20)} seeAllTo={storePath("/offers")} mode={mode} etaMinutes={etaMinutes} />
        <ProductCarousel title="You may also like" products={recommendedList} mode={mode} etaMinutes={etaMinutes} />
        {topGroup && topGroup.items.length >= 3 ? (
          <ProductCarousel title={`Top picks in ${topGroup.name}`} products={topGroup.items.slice(0, 20)} seeAllTo={categoryLink(topGroup.id, topGroup.name)} mode={mode} etaMinutes={etaMinutes} />
        ) : null}
        {!rowCards.length && !deals.length && !recommendedList.length && !products.length ? (
          <section className="rounded-[8px] bg-wh-surface p-8 text-center text-wh-muted">
            {isQuick ? "Nothing is available for quick delivery here yet." : "New products are on their way. Check back soon."}
          </section>
        ) : null}
      </div>
    </div>
  )
}
