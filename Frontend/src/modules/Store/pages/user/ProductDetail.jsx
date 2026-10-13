import { useStoreMode } from "@store/context/StoreModeContext"
import { useState, useEffect, useMemo } from "react"
import { useParams, Link, useNavigate } from "react-router-dom"
import useAppBackNavigation from "@store/hooks/useAppBackNavigation"
import { motion, AnimatePresence } from "framer-motion"
import { 
  ArrowLeft, 
  Star, 
  Clock, 
  MapPin, 
  ShoppingBag, 
  Plus, 
  Minus, 
  Check, 
  Zap, 
  Truck, 
  Coins, 
  ShieldCheck, 
  Store,
  ChevronRight,
  Share2,
  AlertCircle
} from "lucide-react"
import { toast } from "sonner"
import { catalogAPI } from "@/services/api"
import { brandMarkUrl } from "@/config/brandMark"
import SEOHead from "@store/components/SEOHead"
import RecommendationRail from "@store/components/user/RecommendationRail"
import ProductReviews from "@store/components/user/reviews/ProductReviews"
import { useCart } from "@store/context/CartContext"
import { Button } from "@store/components/ui/button"
import ProductDetailDesktop from "@store/components/user/desktop/ProductDetailDesktop"
import useIsDesktop, { useStorefrontLayout } from "@store/components/user/desktop/useIsDesktop"
import MobileProductView from "@store/components/user/mobile/MobileProductView"
import { ProductDetailSkeleton } from "@store/components/user/desktop/HomeSkeletons"
import { CHANNEL_COPY, channelAvailability, otherChannel, productInChannel, stockLabel, variantInChannel } from "@store/utils/channelStock"

// A variant's value for one option; attributes are either [{ name, value }] or
// a plain { name: value } object.
const attrOf = (variant, key) => {
  const a = variant?.attributes
  if (!a) return undefined
  if (Array.isArray(a)) return a.find((x) => x.name === key)?.value
  return a[key]
}

/**
 * A product with several variants but no `options` list had no picker, and the
 * page silently used the first variant. Build the options from the variants'
 * attributes (or, failing that, their names) so the customer chooses.
 */
const withPickableOptions = (product) => {
  const variants = Array.isArray(product?.variants) ? product.variants.filter((v) => v && v.isActive !== false) : []
  if ((Array.isArray(product?.options) && product.options.length > 0) || variants.length < 2) return product
  const byName = new Map()
  for (const v of variants) {
    const a = v.attributes
    const pairs = Array.isArray(a) ? a.map((x) => [x.name, x.value]) : Object.entries(a || {})
    for (const [name, value] of pairs) {
      if (!name || value == null || value === "") continue
      if (!byName.has(name)) byName.set(name, [])
      if (!byName.get(name).includes(value)) byName.get(name).push(value)
    }
  }
  if (byName.size > 0) {
    return { ...product, options: [...byName].map(([name, values]) => ({ name, values })) }
  }
  // No attributes at all: one "Option" picked by variant name.
  const names = [...new Set(variants.map((v) => String(v.name || "").trim()).filter(Boolean))]
  if (names.length !== variants.length) return product
  return {
    ...product,
    options: [{ name: "Option", values: names }],
    variants: product.variants.map((v) => ({ ...v, attributes: { Option: String(v.name || "").trim() } })),
  }
}

export default function ProductDetail() {
  const { storePath, fulfilmentMode, isQuick } = useStoreMode()
  const { id } = useParams()
  const navigate = useNavigate()
  const goBack = useAppBackNavigation()
  const isDesktop = useStorefrontLayout()
  const onWideScreen = useIsDesktop()
  const { addToCart, isInCart, getCartItem } = useCart()

  const [loading, setLoading] = useState(true)
  const [product, setProduct] = useState(null)
  const [seller, setSeller] = useState(null)
  const [activeImageIndex, setActiveImageIndex] = useState(0)
  const [quantity, setQuantity] = useState(1)

  // Selected attribute dictionary: { [optionName]: selectedValue }
  const [selectedAttrs, setSelectedAttrs] = useState({})
  // Set when Add to Cart is pressed before a size/colour was chosen.
  const [choiceHint, setChoiceHint] = useState(false)

  useEffect(() => {
    async function loadProduct() {
      // A new product starts with nothing chosen and a quantity of 1; the
      // previous product's size must not carry over.
      setSelectedAttrs({})
      setQuantity(1)
      setChoiceHint(false)
      try {
        setLoading(true)
        const res = await catalogAPI.getProduct(id)
        const data = res?.data?.data || res?.data
        if (data?.product) {
          const loaded = withPickableOptions(data.product)
          setProduct(loaded)
          setSeller(data.seller)

          // Only an option with a single value is chosen up front. A size has
          // to be picked by the customer, as on any fashion store; choosing S
          // for them sent the wrong size to anyone who didn't notice.
          setChoiceHint(false)
          const initialAttrs = {}
          if (Array.isArray(loaded.options) && loaded.options.length > 0) {
            loaded.options.forEach((opt) => {
              if (opt.values && opt.values.length === 1) {
                const firstVal = typeof opt.values[0] === "object" ? opt.values[0].value : opt.values[0]
                initialAttrs[opt.name] = firstVal
              }
            })
          }
          setSelectedAttrs(initialAttrs)
        }
      } catch (err) {
        toast.error("Product not found or currently unavailable")
      } finally {
        setLoading(false)
      }
    }

    if (id) loadProduct()
  }, [id])

  // Options with a real choice the customer hasn't made yet.
  const missingOptions = (Array.isArray(product?.options) ? product.options : [])
    .filter((opt) => (opt.values?.length || 0) > 1 && !selectedAttrs[opt.name])
    .map((opt) => opt.name)

  // Variants switched off by the seller are ignored everywhere on this page.
  const activeVariants = useMemo(
    () => (Array.isArray(product?.variants) ? product.variants.filter((v) => v && v.isActive !== false) : []),
    [product],
  )
  const hasVariants = activeVariants.length > 0
  // Options with one value are pre-chosen; a variant that doesn't spell that
  // value out still matches it.
  const singleValueOptions = useMemo(
    () => new Set((Array.isArray(product?.options) ? product.options : []).filter((o) => (o.values?.length || 0) <= 1).map((o) => o.name)),
    [product],
  )
  const variantMatches = (variant, attrs) =>
    Object.keys(attrs).every((key) => {
      const value = attrOf(variant, key)
      if (value === undefined) return singleValueOptions.has(key)
      return value === attrs[key]
    })

  // The chosen variant: only once every option with a real choice is chosen.
  // Until then the page shows the range ("From" price, in stock if any size is).
  const currentVariant = useMemo(() => {
    if (!hasVariants) return null
    if (missingOptions.length > 0) return null
    if (Object.keys(selectedAttrs).length === 0) return activeVariants.length === 1 ? activeVariants[0] : null
    return activeVariants.find((variant) => variantMatches(variant, selectedAttrs)) || null
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeVariants, hasVariants, missingOptions.length, selectedAttrs, singleValueOptions])
  // Every option chosen, but no variant has that size + colour.
  const combinationMissing = hasVariants && missingOptions.length === 0 && !currentVariant

  // Stock and availability for this store's channel (see CHANNELS_CONTRACT.md).
  const channel = isQuick ? "quick" : "shop"
  const altChannel = otherChannel(channel)
  // Variants still possible with what is chosen so far, and sold here.
  const candidates = hasVariants && !currentVariant
    ? activeVariants.filter((v) => variantMatches(v, selectedAttrs) && variantInChannel(v, product, channel))
    : []
  const cheapest = candidates.reduce(
    (best, v) => (Number.isFinite(Number(v.price)) && (!best || Number(v.price) < Number(best.price)) ? v : best),
    null,
  )
  const priceFrom = !!cheapest && candidates.some((v) => Number(v.price) !== Number(cheapest.price))

  // Current pricing & stock resolution
  const priceSource = currentVariant || cheapest
  const displayPrice = priceSource ? Number(priceSource.price) : (product?.price ?? 0)
  // A variant without its own MRP uses the product's.
  const displayMrp = (priceSource ? priceSource.mrp ?? product?.mrp : product?.mrp) ?? 0
  const hasDiscount = displayMrp > displayPrice
  const discountPercent = hasDiscount ? Math.round(((displayMrp - displayPrice) / displayMrp) * 100) : 0
  const avail = (() => {
    if (currentVariant || !hasVariants) return channelAvailability(product, channel, currentVariant)
    const base = channelAvailability(product, channel, null)
    if (combinationMissing) return { enabled: base.enabled, inStock: false, qty: null, low: false }
    // Not everything chosen yet: in stock if any variant still possible is.
    return {
      enabled: base.enabled && candidates.length > 0,
      inStock: base.enabled && candidates.some((v) => channelAvailability(product, channel, v).inStock),
      qty: null,
      low: false,
    }
  })()
  const isAvailable = avail.inStock
  const notInThisStore = !!product && !avail.enabled
  const altAvail = channelAvailability(product, altChannel, currentVariant)
  const altPath = altChannel === "quick" ? `/quick/product/${id}` : `/product/${id}`
  // A value is on offer when some active variant with it (and with the other
  // values already chosen) is sold here and in stock; sold-out sizes show
  // struck through before they are tapped.
  const isValueEnabled = (optName, val) => {
    if (!hasVariants) return true
    // Variants that don't describe this option can't rule a value out.
    if (!activeVariants.some((v) => attrOf(v, optName) !== undefined)) return true
    const others = { ...selectedAttrs }
    delete others[optName]
    return activeVariants.some(
      (v) => variantMatches(v, { ...others, [optName]: val }) && channelAvailability(product, channel, v).inStock,
    )
  }

  // Images list: the selected variant's own photos first, then the product's
  // (de-duplicated, so a variant reusing a product photo shows it once).
  const allImages = useMemo(() => {
    const list = [
      ...(Array.isArray(currentVariant?.images) ? currentVariant.images : []),
      ...(Array.isArray(product?.images) ? product.images : []),
      product?.image,
    ].filter((u) => typeof u === "string" && u.trim())
    const unique = [...new Set(list)]
    return unique.length > 0 ? unique : [brandMarkUrl()]
  }, [product, currentVariant])

  // Picking another variant (e.g. a different colour) starts its gallery at its first photo.
  const currentVariantId = currentVariant?._id || currentVariant?.id || ""
  useEffect(() => {
    setActiveImageIndex(0)
  }, [currentVariantId])

  const handleSelectAttribute = (optName, val) => {
    setSelectedAttrs((prev) => ({ ...prev, [optName]: val }))
  }

  const handleAddToCart = () => {
    if (missingOptions.length > 0) {
      setChoiceHint(true)
      toast.error(`Please choose a ${missingOptions.map((n) => n.toLowerCase()).join(" and ")}`)
      return false
    }
    if (combinationMissing || (hasVariants && !currentVariant)) {
      // Never add a product with sizes as "no size" at the product price.
      toast.error("This combination isn't available")
      return false
    }
    if (notInThisStore) {
      toast.error(`This item isn't available in ${CHANNEL_COPY[channel].label}.`)
      return false
    }
    if (!isAvailable) {
      toast.error("Selected item variant is currently out of stock")
      return false
    }

    const variantLabel = currentVariant?.name || Object.values(selectedAttrs).join(" / ")

    const result = addToCart({
      id: product._id,
      itemId: product._id,
      productId: product._id,
      name: product.name,
      price: displayPrice,
      variantId: currentVariant?._id || null,
      variantName: variantLabel,
      variantPrice: displayPrice,
      otherPrice: displayMrp,
      image: allImages[0],
      sellerId: seller?._id,
      // Both spellings: the cart reads `seller` for the name it shows, e.g. in
      // the "replace cart?" dialog.
      seller: seller?.sellerName || "Store",
      sellerName: seller?.sellerName || "Store",
      selectedAttributes: selectedAttrs,
      channels: product.channels,
    }, null, { quantity })

    if (result?.ok === false) {
      // A cart from another seller puts up the replace dialog; nothing was
      // added, so don't claim otherwise or move on to checkout.
      if (!result.needsConfirmation) {
        toast.error(result.error || "Could not add this item to your cart")
      }
      return false
    }

    toast.success(`Added ${quantity} × ${product.name} to cart!`)
    return true
  }

  // Desktop "Buy now": the normal add, then the cart page (which runs checkout).
  const handleBuyNow = () => {
    if (handleAddToCart()) navigate(storePath("/cart"))
  }

  // The skeleton mirrors the real page's columns, so nothing jumps when the
  // product arrives.
  if (loading) return <ProductDetailSkeleton />

  if (!product) {
    return (
      <div className="min-h-[70vh] flex flex-col items-center justify-center p-6 text-center">
        <AlertCircle className="w-16 h-16 text-gray-400 mb-4" />
        <h2 className="text-2xl font-bold text-gray-800 dark:text-gray-100">Product Unavailable</h2>
        <p className="text-gray-500 mt-2 max-w-sm">This product may have been unlisted or is no longer serviceable in your area.</p>
        <Button onClick={() => navigate(-1)} className="mt-6 rounded-xl bg-orange-500 hover:bg-orange-600 text-white font-semibold">
          Return to Browse
        </Button>
      </div>
    )
  }

  if (isDesktop) {
    return (
      <>
        <SEOHead
          title={product.name}
          description={product.description || [product.brand, product.name, product.packSize].filter(Boolean).join(" ")}
          ogImage={allImages[0]}
        />
        {onWideScreen ? null : (
          // Phones: the product page from the mobile mockup (screen 4).
          <MobileProductView
            product={product}
            seller={seller}
            storePath={storePath}
            isQuick={isQuick}
            altChannel={altChannel}
            altPath={altPath}
            avail={avail}
            isAvailable={isAvailable}
            notInThisStore={notInThisStore}
            currentVariant={currentVariant}
            selectedAttrs={selectedAttrs}
            onSelectAttribute={handleSelectAttribute}
            missingOptions={missingOptions}
            choiceHint={choiceHint}
            isValueEnabled={isValueEnabled}
            allImages={allImages}
            displayPrice={displayPrice}
            priceFrom={priceFrom}
            displayMrp={displayMrp}
            discountPercent={discountPercent}
            onAddToCart={handleAddToCart}
          />
        )}
        {onWideScreen ? (
        <ProductDetailDesktop
          product={product}
          seller={seller}
          storePath={storePath}
          isQuick={isQuick}
          channel={channel}
          altChannel={altChannel}
          altPath={altPath}
          avail={avail}
          altAvail={altAvail}
          isAvailable={isAvailable}
          notInThisStore={notInThisStore}
          currentVariant={currentVariant}
          selectedAttrs={selectedAttrs}
          onSelectAttribute={handleSelectAttribute}
          missingOptions={missingOptions}
          choiceHint={choiceHint}
          isValueEnabled={isValueEnabled}
          allImages={allImages}
          activeImageIndex={activeImageIndex}
          setActiveImageIndex={setActiveImageIndex}
          quantity={quantity}
          setQuantity={setQuantity}
          displayPrice={displayPrice}
          priceFrom={priceFrom}
          displayMrp={displayMrp}
          discountPercent={discountPercent}
          onAddToCart={handleAddToCart}
          onBuyNow={handleBuyNow}
        />
        ) : null}
      </>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-white dark:from-gray-950 dark:to-gray-900 pb-20">
      <SEOHead
        title={product.name}
        description={product.description || [product.brand, product.name, product.packSize].filter(Boolean).join(" ")}
        ogImage={allImages[0]}
      />
      {/* Top Navbar */}
      <div className="sticky top-0 z-40 bg-white/80 dark:bg-gray-900/80 backdrop-blur-md border-b border-gray-100 dark:border-gray-800 px-4 py-3">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <button
            onClick={() => navigate(-1)}
            className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-200 transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-2 text-xs font-semibold">
            {isQuick ? (
              <span className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                <Zap className="w-3.5 h-3.5 fill-amber-500 text-amber-500" />
                Quick 20-30 Mins
              </span>
            ) : (
              <span className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
                <Truck className="w-3.5 h-3.5 text-blue-500" />
                Standard Courier Shipping
              </span>
            )}
          </div>
          <button
            onClick={() => {
              if (navigator.share) {
                navigator.share({ title: product.name, url: window.location.href })
              } else {
                navigator.clipboard.writeText(window.location.href)
                toast.success("Product link copied!")
              }
            }}
            className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-200 transition-colors"
          >
            <Share2 className="w-5 h-5" />
          </button>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 md:px-8 py-6 md:py-10">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-14">
          {/* Left Column: Image Gallery */}
          <div className="space-y-4">
            <div className="relative aspect-square rounded-3xl overflow-hidden bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-800 shadow-sm group">
              <img
                src={allImages[activeImageIndex] || allImages[0]}
                alt={product.name}
                className="w-full h-full object-cover object-center transition-transform duration-500 group-hover:scale-105"
              />
              {hasDiscount && (
                <div className="absolute top-4 left-4 bg-rose-600 text-white font-extrabold text-xs px-3 py-1.5 rounded-full shadow-lg">
                  {discountPercent}% OFF
                </div>
              )}
            </div>

            {/* Thumbnail Strip */}
            {allImages.length > 1 && (
              <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-none">
                {allImages.map((img, idx) => (
                  <button
                    key={idx}
                    onClick={() => setActiveImageIndex(idx)}
                    className={`relative w-20 h-20 shrink-0 rounded-2xl overflow-hidden border-2 transition-all ${
                      activeImageIndex === idx
                        ? "border-orange-500 ring-2 ring-orange-500/20 shadow-md scale-105"
                        : "border-gray-200 dark:border-gray-700 opacity-70 hover:opacity-100"
                    }`}
                  >
                    <img src={img} alt="thumbnail" className="w-full h-full object-cover" />
                  </button>
                ))}
              </div>
            )}

            {/* Coins Promotional Card */}
            <div className="p-4 rounded-2xl bg-gradient-to-r from-amber-500/10 via-orange-500/10 to-wh-brand/10 border border-amber-500/20 flex items-center gap-3.5">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-wh-brand to-wh-brand-600 text-wh-text flex items-center justify-center shrink-0 shadow-md">
                <Coins className="w-5 h-5" />
              </div>
              <div>
                <h4 className="text-xs font-bold text-gray-900 dark:text-white uppercase tracking-wider">
                  Platform Coins Usable
                </h4>
                <p className="text-xs text-gray-600 dark:text-gray-300 mt-0.5">
                  Use up to <strong>50% Coins</strong> on this order at checkout! Earn refund coins for instant savings.
                </p>
              </div>
            </div>
          </div>

          {/* Right Column: Product Info & Variant Picker */}
          <div className="space-y-6">
            {/* Title & Brand */}
            <div>
              {product.brand && (
                <span className="text-xs font-extrabold uppercase tracking-wider text-wh-brand-ink dark:text-wh-brand">
                  {product.brand}
                </span>
              )}
              <h1 className="text-2xl md:text-3xl font-black text-gray-900 dark:text-white mt-1 leading-tight">
                {product.name}
              </h1>
              {Number(product.totalRatings) > 0 && (
                <p className="mt-1 flex items-center gap-1 text-sm text-gray-600 dark:text-gray-300" aria-label={`Rated ${Number(product.rating).toFixed(1)} out of 5 from ${product.totalRatings} ratings`}>
                  <Star className="h-4 w-4 fill-wh-brand text-wh-brand" aria-hidden="true" />
                  <span className="font-bold text-gray-900 dark:text-white">{Number(product.rating).toFixed(1)}</span>
                  <span>({product.totalRatings})</span>
                </p>
              )}

              {/* Price Row */}
              <div className="flex items-baseline gap-3 mt-3">
                <span className="text-3xl font-black text-gray-900 dark:text-white">
                  {priceFrom ? <span className="mr-1 text-base font-semibold text-gray-500">From</span> : null}
                  ₹{displayPrice.toLocaleString()}
                </span>
                {hasDiscount && (
                  <>
                    <span className="text-lg text-gray-400 line-through">
                      ₹{displayMrp.toLocaleString()}
                    </span>
                    <span className="text-sm font-bold text-emerald-600 dark:text-emerald-400">
                      Save ₹{(displayMrp - displayPrice).toLocaleString()}
                    </span>
                  </>
                )}
              </div>

              {/* Availability & SKU */}
              <div className="flex items-center gap-3 mt-2">
                <span
                  className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold ${
                    isAvailable
                      ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300"
                      : "bg-rose-100 text-rose-800 dark:bg-rose-950/40 dark:text-rose-300"
                  }`}
                >
                  <span className={`w-1.5 h-1.5 rounded-full ${isAvailable ? "bg-emerald-500" : "bg-rose-500"}`} />
                  {stockLabel(avail)}
                </span>

                {currentVariant?.sku && (
                  <span className="text-xs font-mono text-gray-400">
                    SKU: {currentVariant.sku}
                  </span>
                )}
              </div>
            </div>

            {/* DYNAMIC VARIANT MATRIX PICKER */}
            {product.options && product.options.length > 0 && (
              <div className="p-5 rounded-2xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 shadow-sm space-y-5">
                <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider">
                  Select Specifications
                </h3>

                {product.options.map((opt) => {
                  const isColor = opt.type === "color" || opt.name.toLowerCase() === "color"
                  const selectedVal = selectedAttrs[opt.name]

                  return (
                    <div key={opt.name} className="space-y-2">
                      <div className="flex justify-between text-xs">
                        <span className="font-bold text-gray-700 dark:text-gray-300">{opt.name}</span>
                        <span className={`font-semibold ${selectedVal ? "text-orange-600 dark:text-orange-400" : choiceHint ? "text-red-600" : "text-gray-500"}`}>
                          {selectedVal || "Choose an option"}
                        </span>
                      </div>

                      <div className="flex flex-wrap gap-2.5">
                        {opt.values.map((v) => {
                          const valStr = typeof v === "object" ? v.value : v
                          const hex = typeof v === "object" ? v.hex : null
                          const isSelected = selectedVal === valStr
                          const valEnabled = isValueEnabled(opt.name, valStr)

                          if (isColor) {
                            return (
                              <button
                                key={valStr}
                                onClick={() => handleSelectAttribute(opt.name, valStr)}
                                disabled={!valEnabled}
                                title={valEnabled ? valStr : `${valStr} (not available in ${CHANNEL_COPY[channel].label})`}
                                className={`relative w-9 h-9 rounded-full transition-all flex items-center justify-center border-2 ${
                                  isSelected
                                    ? "border-orange-500 scale-110 shadow-md ring-2 ring-orange-500/30"
                                    : "border-gray-300 dark:border-gray-700 opacity-80 hover:opacity-100"
                                }`}
                                style={{ backgroundColor: hex || "#000" }}
                              >
                                {isSelected && (
                                  <Check className={`w-4 h-4 ${hex && hex.toLowerCase() === "#ffffff" ? "text-gray-900" : "text-white"}`} />
                                )}
                              </button>
                            )
                          }

                          return (
                            <button
                              key={valStr}
                              onClick={() => handleSelectAttribute(opt.name, valStr)}
                              disabled={!valEnabled}
                              className={`${valEnabled ? "" : "opacity-40 line-through cursor-not-allowed "}px-4 py-2 rounded-xl text-xs font-bold transition-all border ${
                                isSelected
                                  ? "border-orange-500 bg-orange-500 text-white shadow-sm"
                                  : "border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-700 dark:text-gray-200 hover:border-gray-300"
                              }`}
                            >
                              {valStr}
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}

            {/* Quantity & Add to Cart Row */}
            <div className="flex flex-col sm:flex-row gap-4 pt-2">
              <div className="flex items-center border border-gray-200 dark:border-gray-700 rounded-2xl bg-white dark:bg-gray-800 p-1 w-fit">
                <button
                  onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                  className="w-10 h-10 flex items-center justify-center rounded-xl hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-600 transition-colors"
                >
                  <Minus className="w-4 h-4" />
                </button>
                <span className="w-12 text-center font-bold text-sm text-gray-900 dark:text-white">
                  {quantity}
                </span>
                <button
                  onClick={() => setQuantity((q) => q + 1)}
                  className="w-10 h-10 flex items-center justify-center rounded-xl hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-600 transition-colors"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>

              <Button
                onClick={handleAddToCart}
                disabled={(!isAvailable || notInThisStore) && missingOptions.length === 0}
                className="flex-1 py-3.5 px-8 rounded-2xl bg-app-brown hover:bg-app-brown-deep text-white font-extrabold shadow-lg shadow-[#58321D]/25 transition-all text-sm flex items-center justify-center gap-2"
              >
                <ShoppingBag className="w-5 h-5" />
                {notInThisStore ? `Not available in ${CHANNEL_COPY[channel].label}` : (isAvailable ? "Add to Cart" : "Currently Out of Stock")}
              </Button>
            </div>

            {notInThisStore && (
              <div className="p-4 rounded-2xl border border-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-800 text-sm">
                <p className="font-bold text-gray-900 dark:text-white">
                  {currentVariant && productInChannel(product, channel)
                    ? `This option isn't sold in ${CHANNEL_COPY[channel].label}.`
                    : `This product isn't sold in ${CHANNEL_COPY[channel].label}.`}
                </p>
                {altAvail.inStock && (
                  <Link to={altPath} className="mt-1 inline-flex items-center gap-1 font-semibold text-orange-600 hover:text-orange-700">
                    Available in {CHANNEL_COPY[altChannel].label} — {CHANNEL_COPY[altChannel].eta} <ChevronRight className="w-4 h-4" />
                  </Link>
                )}
              </div>
            )}

            {/* Seller Store Card */}
            {seller && (
              <div className="p-5 rounded-2xl bg-gray-50 dark:bg-gray-800/60 border border-gray-200 dark:border-gray-700 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-xl bg-orange-100 dark:bg-orange-950/50 text-orange-600 flex items-center justify-center font-bold">
                    <Store className="w-6 h-6" />
                  </div>
                  <div>
                    <h4 className="font-bold text-sm text-gray-900 dark:text-white">
                      Sold by {seller.sellerName}
                    </h4>
                    <p className="text-xs text-gray-500 flex items-center gap-1.5 mt-0.5">
                      <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                      <span className="font-bold text-gray-700 dark:text-gray-300">{seller.rating || "4.8"}</span>
                      <span>• Verified Multi-Vendor Partner</span>
                    </p>
                  </div>
                </div>

                <Link
                  to={storePath(`/sellers/${seller._id || seller.id}`)}
                  className="text-xs font-bold text-orange-600 hover:text-orange-700 flex items-center gap-0.5"
                >
                  Visit Store <ChevronRight className="w-4 h-4" />
                </Link>
              </div>
            )}

            {/* Description */}
            {product.description && (
              <div className="pt-2">
                <h3 className="text-sm font-bold text-gray-900 dark:text-white mb-2">Product Description</h3>
                <p className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed whitespace-pre-line">
                  {product.description}
                </p>
              </div>
            )}

            {/* Ratings, reviews and "Write a Review" (when the customer received it) */}
            <ProductReviews productId={product._id} productName={product.name} variant="mobile" />

            {/* Recommendations: co-purchases, then similar products */}
            <RecommendationRail productId={product._id} type="frequently_bought" title="Frequently Bought Together" limit={8} />
            <RecommendationRail productId={product._id} type="similar" title="You May Also Like" limit={10} />
          </div>
        </div>
      </div>
    </div>
  )
}
