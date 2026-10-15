/**
 * Desktop (lg+) product page in the customer app's look (product_details_
 * screen.dart laid out wide): breadcrumb, then a gallery with thumbnails and
 * zoom on the left and the app's white bands on the right (title, price and
 * options, sold by, highlights, details, trust row), then frequently bought
 * together, reviews and "People also viewed" in the app's product card.
 * Presentation only: all state and handlers come from ProductDetail.
 */
import { useRef, useState } from "react"
import { Link } from "react-router-dom"
import {
  ChevronLeft, ChevronRight, Coins, Heart, MapPin, Maximize2, Minus, Plus, RotateCcw, Share2, ShoppingCart, Star, Store, Tag, Truck, Zap,
} from "lucide-react"
import { toast } from "sonner"
import { useCart } from "@store/context/CartContext"
import { useDeliveryLocation } from "@store/context/DeliveryLocationContext"
import { useProfile } from "@store/context/ProfileContext"
import { CHANNEL_COPY, productInChannel } from "@store/utils/channelStock"
import { resolveMediaUrl } from "@/shared/utils/mediaUrl"
import ProductReviews from "@store/components/user/reviews/ProductReviews"
import ImageZoomViewer from "../product/ImageZoomViewer"
import useSimilarProducts from "../product/useSimilarProducts"
import { AdditionalDetails, Band, ProductHighlights, TrustRow } from "../product/ProductDetailBands"
import ProductCard from "../storefront/ProductCard"
import { ImagePlaceholder, isRealImage } from "./ui"
import { useDesktopAddToCart } from "./desktopCart"
import { AppSectionTitle, appRing, useProductRecommendations } from "./appBits"
import { useBusinessSettings } from "./useDesktopShell"
import { formatDeliveryWindow, locationPincode, useQuickEta, useShopDeliveryEstimate } from "./useDeliveryEstimates"

const QTY_MAX = 10
const isColourName = (name) => /^colou?r$/i.test(String(name || ""))
const titleCase = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s)
const valueOf = (raw) => (raw && typeof raw === "object" ? raw.value : raw)
const cx = (...a) => a.filter(Boolean).join(" ")

/** A grid of the app's product cards under a serif title. */
function CardGridSection({ id, title, products, onAdd }) {
  if (!products.length) return null
  return (
    <section aria-labelledby={id} className="mt-10">
      <AppSectionTitle id={id} className="mb-4">{title}</AppSectionTitle>
      <div className="grid grid-cols-3 gap-x-4 gap-y-5 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
        {products.map((p) => (
          <ProductCard key={p._id} product={p} onAction={onAdd} />
        ))}
      </div>
    </section>
  )
}

export default function ProductDetailDesktop({
  product,
  seller,
  storePath,
  isQuick,
  channel,
  altChannel,
  altPath,
  avail,
  altAvail,
  isAvailable,
  notInThisStore,
  currentVariant,
  selectedAttrs,
  missingOptions = [],
  choiceHint = false,
  onSelectAttribute,
  isValueEnabled,
  allImages,
  activeImageIndex,
  setActiveImageIndex,
  quantity,
  setQuantity,
  displayPrice,
  priceFrom = false,
  displayMrp,
  discountPercent,
  onAddToCart,
  onBuyNow,
}) {
  const { displayAddressText, effectiveLocation } = useDeliveryLocation()
  const { addDishFavorite, removeDishFavorite, isDishFavorite } = useProfile()
  const { isInCart } = useCart()
  const { returnWindowDays } = useBusinessSettings()
  const addCard = useDesktopAddToCart()
  const quickEta = useQuickEta()
  const shopEstimate = useShopDeliveryEstimate({ enabled: !isQuick })
  const similar = useSimilarProducts(product?._id, 12)
  const boughtTogether = useProductRecommendations(product?._id, "frequently_bought", 6)
  const optionsRef = useRef(null)
  const [zoomOpen, setZoomOpen] = useState(false)

  const deliverTo = [effectiveLocation?.area || effectiveLocation?.city, locationPincode(effectiveLocation)]
    .filter(Boolean)
    .join(" ") || displayAddressText
  const storeLabel = CHANNEL_COPY[channel].label
  const rating = Number(product.rating) || 0
  const totalRatings = Number(product.totalRatings) || 0
  const options = Array.isArray(product.options) ? product.options : []
  const bullets = String(product.description || "")
    .split(/\r?\n|(?<=\.)\s+(?=[A-Z])/)
    .map((s) => s.replace(/^[-•*\s]+/, "").trim())
    .filter(Boolean)
    .slice(0, 8)

  const id = String(product?._id || "")
  const sellerId = String(seller?._id || seller?.id || product?.sellerId || "")
  const sellerName = seller?.sellerName || seller?.name || ""
  const sellerHref = storePath(`/sellers/${seller?._id || seller?.id}`)
  const liked = isDishFavorite(id, sellerId)
  const images = allImages.filter(isRealImage)
  const activeSrc = allImages[activeImageIndex] || allImages[0]
  const hasVariants = (product?.variants || []).some((v) => v && v.isActive !== false)
  const inCart = (!hasVariants || !!currentVariant) && isInCart(id, currentVariant?._id ? String(currentVariant._id) : "")

  // Delivery: the price band's line, and the short form for the trust row.
  const deliveryLine = isQuick ? `Delivery in ${quickEta} minutes` : formatDeliveryWindow(shopEstimate)
  const minDays = Number(shopEstimate?.minDays)
  const maxDays = Number(shopEstimate?.maxDays)
  const deliveryShort = isQuick
    ? `${quickEta} min`
    : maxDays > 0
      ? minDays > 0 && minDays !== maxDays
        ? `${minDays}–${maxDays} days`
        : `${maxDays} day${maxDays === 1 ? "" : "s"}`
      : "2–4 days"

  // A colour's swatch is a photo of that colour when a variant has one.
  const colourImage = (value) => {
    const v = (product?.variants || []).find((x) => {
      const a = x?.attributes
      const pairs = Array.isArray(a) ? a.map((p) => [p?.name, p?.value]) : Object.entries(a || {})
      return pairs.some(([name, val]) => isColourName(name) && String(val) === String(value))
    })
    const img = v?.images?.[0]
    return typeof img === "string" ? img : img?.url || ""
  }

  const toggleLike = () => {
    if (liked) {
      removeDishFavorite(id, sellerId)
      toast("Removed from wishlist")
    } else {
      addDishFavorite({ id, sellerId, name: product?.name, image: images[0], price: displayPrice, mrp: displayMrp, sellerName, mode: isQuick ? "quick" : "shop" })
      toast.success("Saved to wishlist")
    }
  }

  const share = async () => {
    const url = window.location.href
    try {
      if (navigator.share) await navigator.share({ title: product?.name, url })
      else {
        await navigator.clipboard.writeText(url)
        toast.success("Link copied")
      }
    } catch {
      /* the share sheet was dismissed */
    }
  }

  // A size/colour still to choose: the parent shows the hint and toast; bring
  // the pickers into view as well.
  const add = () => {
    const ok = onAddToCart()
    if (!ok && missingOptions.length) optionsRef.current?.scrollIntoView({ behavior: "smooth", block: "center" })
  }
  const buyNow = () => {
    if (missingOptions.length) optionsRef.current?.scrollIntoView({ behavior: "smooth", block: "center" })
    onBuyNow()
  }

  const disabled = !isAvailable || notInThisStore
  const disabledLabel = notInThisStore ? "Not sold here" : currentVariant || !hasVariants ? "Out of Stock" : "Unavailable"

  const stockLine = notInThisStore ? (
    <div className="mt-3 rounded-lg bg-app-tint p-3 text-[13px] text-app-ink">
      {currentVariant && productInChannel(product, channel) ? `This option isn't sold in ${storeLabel}.` : `Not sold in ${storeLabel}.`}
      {altAvail.inStock ? (
        <Link to={altPath} className={cx("ml-1 inline-flex items-center gap-0.5 rounded font-bold text-app-brown underline", appRing)}>
          Available in {CHANNEL_COPY[altChannel].label} — {altChannel === "quick" ? `${quickEta} min` : formatDeliveryWindow(shopEstimate).replace(/^Delivery/, "delivery")}
          <ChevronRight className="h-4 w-4" aria-hidden="true" />
        </Link>
      ) : null}
    </div>
  ) : !isAvailable ? (
    <p className="mt-3 text-[14px] font-bold text-app-sale">Currently out of stock</p>
  ) : avail.low ? (
    <p className="mt-3 text-[13px] font-bold text-app-sale">Only {avail.qty} left in stock</p>
  ) : (
    <p className="mt-3 text-[13px] font-semibold text-app-ok">In stock</p>
  )

  // Highlights: only rows with values.
  const highlightRows = [
    ["Brand", product?.brand],
    ["Category", product?.categoryName || product?.category?.name],
    ...options.map((opt) => {
      const label = isColourName(opt.name) ? "Colour" : titleCase(String(opt.name || ""))
      const chosen = selectedAttrs?.[opt.name]
      const values = (opt.values || []).map(valueOf).filter((v) => v != null && v !== "")
      return [label, chosen || values.join(", ")]
    }),
    ["Pack size", product?.packSize],
    ["SKU", currentVariant?.sku || product?.sku],
  ]
    .filter(([, v]) => v !== undefined && v !== null && String(v).trim() !== "")
    .map(([k, v]) => [k, String(v).trim()])

  const moreRows = [
    ["Ships via", isQuick ? "Quick Rider" : "Courier"],
    returnWindowDays ? ["Returns", `${returnWindowDays}-day returns`] : null,
  ].filter(Boolean)

  // Same slug the category pages are linked with (header, footer).
  const categorySlug = product.category?.slug || String(product.categoryName || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "")
  const breadcrumb = [
    { label: isQuick ? "Quick" : "Home", to: storePath("/") },
    product.categoryName && { label: product.categoryName, to: storePath(`/category/${categorySlug}`) },
    { label: product.name },
  ].filter(Boolean)

  const qtyCap = Number(avail?.qty) > 0 ? Math.min(QTY_MAX, Number(avail.qty)) : QTY_MAX
  const showImage = (i) => setActiveImageIndex((i + allImages.length) % allImages.length)
  const zoomStart = Math.max(0, images.indexOf(activeSrc))
  const circleBtn = cx("flex h-10 w-10 items-center justify-center rounded-full bg-white text-app-ink shadow-[0_2px_6px_rgba(0,0,0,0.14)] transition-transform hover:scale-105", appRing)
  const actionBtn = "flex h-12 flex-1 items-center justify-center gap-2 rounded-xl text-[14.5px] font-bold transition active:scale-[0.99] disabled:cursor-not-allowed"

  return (
    <div className="min-h-screen w-full max-w-full overflow-x-hidden bg-app-cream pb-12 font-app text-[14px] leading-5 text-app-ink">
      <div className="mx-auto max-w-[1400px] px-3 sm:px-5">
        <nav aria-label="Breadcrumb" className="py-3.5 text-[12.5px] text-app-muted">
          <ol className="flex flex-wrap items-center gap-1">
            {breadcrumb.map((b, i) => (
              <li key={i} className="flex items-center gap-1">
                {i > 0 && <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />}
                {b.to ? (
                  <Link to={b.to} className={cx("rounded hover:text-app-brown hover:underline", appRing)}>{b.label}</Link>
                ) : (
                  <span aria-current="page" className={cx("text-app-ink", i === breadcrumb.length - 1 ? "line-clamp-1 max-w-[220px] sm:max-w-[480px]" : "")}>{b.label}</span>
                )}
              </li>
            ))}
          </ol>
        </nav>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1.08fr)_minmax(0,1fr)] xl:gap-8">
          {/* 1. Gallery */}
          <div className="min-w-0 self-start lg:sticky lg:top-[136px]">
            <div className="flex gap-3 rounded-[18px] bg-white p-3">
              {allImages.length > 1 ? (
                <ul className="flex max-h-[600px] w-[68px] shrink-0 flex-col gap-2 overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" aria-label="Product photos">
                  {allImages.map((img, idx) => (
                    <li key={img}>
                      <button
                        type="button"
                        onMouseEnter={() => setActiveImageIndex(idx)}
                        onClick={() => setActiveImageIndex(idx)}
                        aria-label={`Show photo ${idx + 1} of ${allImages.length}`}
                        aria-pressed={activeImageIndex === idx}
                        className={cx(
                          "block h-[84px] w-[68px] overflow-hidden rounded-[10px] bg-app-alt",
                          activeImageIndex === idx ? "border-2 border-app-brown" : "border border-app-line hover:border-app-champagne",
                          appRing,
                        )}
                      >
                        {isRealImage(img) ? <img src={img} alt="" className="h-full w-full object-cover" /> : <ImagePlaceholder name={product.name} />}
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
              <div className="relative aspect-[4/5] min-w-0 flex-1 overflow-hidden rounded-[14px] bg-app-alt">
                {isRealImage(activeSrc) ? (
                  <button
                    type="button"
                    onClick={() => setZoomOpen(true)}
                    aria-label="View photos full screen"
                    className="block h-full w-full cursor-zoom-in focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-app-brown"
                  >
                    <img src={activeSrc} alt={product.name} className="h-full w-full object-cover" />
                  </button>
                ) : (
                  <ImagePlaceholder name={product.name} />
                )}
                {discountPercent > 0 ? (
                  <span className="pointer-events-none absolute left-3 top-3 rounded-[12px] bg-[#FFEBEE] px-2.5 py-1 text-[11.5px] font-extrabold text-[#D32F2F]">
                    {discountPercent}% OFF
                  </span>
                ) : null}
                {allImages.length > 1 ? (
                  <>
                    <button type="button" onClick={() => showImage(activeImageIndex - 1)} aria-label="Previous photo" className={cx(circleBtn, "absolute left-3 top-1/2 -translate-y-1/2")}>
                      <ChevronLeft className="h-5 w-5" aria-hidden="true" />
                    </button>
                    <button type="button" onClick={() => showImage(activeImageIndex + 1)} aria-label="Next photo" className={cx(circleBtn, "absolute right-3 top-1/2 -translate-y-1/2")}>
                      <ChevronRight className="h-5 w-5" aria-hidden="true" />
                    </button>
                  </>
                ) : null}
                {images.length ? (
                  <button type="button" onClick={() => setZoomOpen(true)} aria-label="Zoom photos" className={cx(circleBtn, "absolute bottom-3 right-3")}>
                    <Maximize2 className="h-[18px] w-[18px]" aria-hidden="true" />
                  </button>
                ) : null}
                {allImages.length > 1 ? (
                  <div className="pointer-events-none absolute inset-x-0 bottom-4 flex justify-center" aria-hidden="true">
                    {allImages.map((src, i) => (
                      <span key={src} className={cx("mx-[3px] h-[5px] rounded-[3px] transition-all duration-200", i === activeImageIndex ? "w-[22px] bg-app-brown" : "w-2 bg-white/80")} />
                    ))}
                  </div>
                ) : null}
              </div>
            </div>

            {/* N Similar Products */}
            {similar.length ? (
              <div className="mt-3 rounded-[18px] bg-white p-3">
                <p className="text-[13.5px] font-semibold text-[#555]">
                  {similar.length} Similar Product{similar.length === 1 ? "" : "s"}
                </p>
                <ul className="mt-2.5 flex gap-2.5 overflow-x-auto pb-1 [scrollbar-width:thin]">
                  <li className="h-[84px] w-[68px] shrink-0 overflow-hidden rounded-lg border-2 border-app-brown bg-app-alt" aria-current="true">
                    {images[0] ? <img src={images[0]} alt={`${product.name} (this product)`} className="h-full w-full object-cover" /> : <ImagePlaceholder name={product.name} />}
                  </li>
                  {similar.slice(0, 10).map((p) => {
                    const src = p.image ? resolveMediaUrl(p.image) : ""
                    return (
                      <li key={p._id} className="shrink-0">
                        <Link
                          to={storePath(`/product/${p._id}`)}
                          aria-label={p.name}
                          title={p.name}
                          className={cx("block h-[84px] w-[68px] overflow-hidden rounded-lg border border-app-line bg-app-alt transition-colors hover:border-app-brown", appRing)}
                        >
                          {src ? <img src={src} alt="" loading="lazy" className="h-full w-full object-cover" /> : <ImagePlaceholder name={p.name} />}
                        </Link>
                      </li>
                    )
                  })}
                </ul>
              </div>
            ) : null}
          </div>

          {/* 2. The app's bands */}
          <div className="min-w-0 overflow-hidden rounded-[18px] [&>*:first-child]:mt-0">
            {/* Title with Wishlist and Share */}
            <Band gap="mt-0">
              <div className="flex items-start gap-4">
                <div className="min-w-0 flex-1">
                  {product.brand ? <p className="text-[12.5px] font-bold uppercase tracking-[1px] text-app-muted">{product.brand}</p> : null}
                  <h1 className="mt-0.5 text-[21px] font-normal leading-[1.35] text-[#4A423D]">{product.name}</h1>
                  <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5">
                    {sellerName ? (
                      <Link to={sellerHref} className={cx("inline-flex items-center gap-0.5 rounded text-[13px] font-semibold text-app-brown hover:underline", appRing)}>
                        By {sellerName} <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
                      </Link>
                    ) : null}
                    {rating > 0 ? (
                      <a href="#pd-reviews" className={cx("inline-flex items-center gap-1.5 rounded", appRing)} aria-label={`Rated ${rating.toFixed(1)} out of 5${totalRatings ? `, ${totalRatings} ratings` : ""}. See reviews`}>
                        <span className="inline-flex items-center gap-0.5 rounded-md bg-[#1E9E5A] px-1.5 py-0.5 text-[12.5px] font-bold text-white">
                          {rating.toFixed(1)} <Star className="h-3 w-3 fill-white" strokeWidth={0} aria-hidden="true" />
                        </span>
                        {totalRatings > 0 ? <span className="text-[12.5px] text-app-muted hover:underline">{totalRatings.toLocaleString("en-IN")} ratings</span> : null}
                      </a>
                    ) : null}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={toggleLike}
                  aria-label={liked ? "Remove from wishlist" : "Save to wishlist"}
                  aria-pressed={liked}
                  className={cx("flex w-14 flex-col items-center rounded-lg py-1 hover:bg-app-alt", appRing)}
                >
                  <Heart className={cx("h-[22px] w-[22px]", liked ? "fill-[#D32F2F] text-[#D32F2F]" : "text-app-ink")} strokeWidth={1.9} aria-hidden="true" />
                  <span className="mt-1 text-[11.5px] text-[#555]">Wishlist</span>
                </button>
                <button type="button" onClick={share} aria-label="Share" className={cx("flex w-14 flex-col items-center rounded-lg py-1 hover:bg-app-alt", appRing)}>
                  <Share2 className="h-[22px] w-[22px] text-app-ink" strokeWidth={1.9} aria-hidden="true" />
                  <span className="mt-1 text-[11.5px] text-[#555]">Share</span>
                </button>
              </div>
            </Band>

            {/* Price, delivery, stock, options and the buttons */}
            <Band gap="mt-px">
              <p className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
                <span className="text-[28px] font-black leading-none text-app-ink">
                  {priceFrom ? <span className="mr-1 text-[14px] font-semibold text-app-muted">From</span> : null}
                  {`₹${Number(displayPrice || 0).toLocaleString("en-IN")}`}
                </span>
                {displayMrp > displayPrice ? (
                  <span className="text-[15px] text-[#9E9E9E] line-through">
                    <span className="sr-only">MRP </span>₹{Number(displayMrp).toLocaleString("en-IN")}
                  </span>
                ) : null}
                {discountPercent > 0 ? <span className="text-[15px] font-extrabold text-app-ok">{discountPercent}% off</span> : null}
              </p>
              <p className="mt-1 text-[11.5px] text-app-muted">Inclusive of all taxes</p>

              <div className="mt-3 flex flex-wrap gap-2">
                {discountPercent > 0 ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-app-sand px-3 py-1 text-[12px] font-medium">
                    <Tag className="h-3.5 w-3.5 text-app-brown" aria-hidden="true" /> Save ₹{Number(displayMrp - displayPrice).toLocaleString("en-IN")} on MRP
                  </span>
                ) : null}
                <span className="inline-flex items-center gap-1 rounded-full bg-app-sand px-3 py-1 text-[12px] font-medium">
                  <Coins className="h-3.5 w-3.5 text-app-brown" aria-hidden="true" /> Coins usable at checkout
                </span>
                <span className="inline-flex items-center gap-1 rounded-full bg-app-sand px-3 py-1 text-[12px] font-medium">
                  <Tag className="h-3.5 w-3.5 text-app-ok" aria-hidden="true" /> Coupons applied in cart
                </span>
              </div>

              <div className="mt-4 rounded-xl bg-app-alt px-3.5 py-3">
                <p className="flex items-center gap-1.5 text-[13px] font-bold text-app-ink">
                  {isQuick ? <Zap className="h-[17px] w-[17px] text-app-brown" aria-hidden="true" /> : <Truck className="h-[17px] w-[17px] text-app-brown" aria-hidden="true" />}
                  {deliveryLine}
                </p>
                {deliverTo ? (
                  <p className="mt-1 flex items-start gap-1.5 text-[12px] text-app-muted">
                    <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-app-brown" aria-hidden="true" />
                    <span className="line-clamp-2">Deliver to {deliverTo}</span>
                  </p>
                ) : null}
              </div>

              {stockLine}

              {options.length ? (
                <div ref={optionsRef} className="mt-5 scroll-mt-40 space-y-4">
                  {options.map((opt) => {
                    const isColour = opt.type === "color" || isColourName(opt.name)
                    const label = isColour ? "Colour" : titleCase(String(opt.name || ""))
                    const missing = choiceHint && missingOptions.includes(opt.name)
                    const selectedVal = selectedAttrs?.[opt.name]
                    return (
                      <fieldset key={opt.name}>
                        <legend className="mb-2.5 flex w-full items-center justify-between gap-2 text-[14px] font-bold text-app-ink">
                          Select {label}
                          {selectedVal ? (
                            <span className="truncate text-[12.5px] font-medium text-app-muted">{selectedVal}</span>
                          ) : missing ? (
                            <span className="text-[12.5px] font-semibold text-app-sale" role="alert">
                              Please choose a {label.toLowerCase()}
                            </span>
                          ) : null}
                        </legend>
                        <div className="flex flex-wrap gap-2">
                          {(opt.values || []).map((raw) => {
                            const value = valueOf(raw)
                            const hex = typeof raw === "object" ? raw?.hex : null
                            const selected = selectedVal === value
                            const enabled = isValueEnabled(opt.name, value)
                            const unavailable = `${value} (not available in ${storeLabel})`
                            if (isColour) {
                              const photo = colourImage(value)
                              return (
                                <button
                                  key={value}
                                  type="button"
                                  disabled={!enabled}
                                  aria-pressed={selected}
                                  aria-label={enabled ? value : unavailable}
                                  title={enabled ? value : unavailable}
                                  onClick={() => onSelectAttribute(opt.name, value)}
                                  className={cx(
                                    "h-16 w-[52px] overflow-hidden rounded-lg p-0.5 disabled:cursor-not-allowed disabled:opacity-35",
                                    selected ? "border-2 border-app-brown" : "border border-app-line hover:border-app-champagne",
                                    appRing,
                                  )}
                                >
                                  {photo ? (
                                    <img src={resolveMediaUrl(photo)} alt="" className="h-full w-full rounded-md object-cover" />
                                  ) : (
                                    <span className="block h-full w-full rounded-md" style={{ background: hex || "#ccc" }} />
                                  )}
                                </button>
                              )
                            }
                            return (
                              <button
                                key={value}
                                type="button"
                                disabled={!enabled}
                                aria-pressed={selected}
                                aria-label={enabled ? undefined : unavailable}
                                title={enabled ? undefined : unavailable}
                                onClick={() => onSelectAttribute(opt.name, value)}
                                className={cx(
                                  "min-w-12 rounded-lg px-4 py-2 text-[12.5px] transition-colors disabled:cursor-not-allowed disabled:line-through disabled:opacity-40",
                                  selected
                                    ? "border-[1.5px] border-app-brown bg-app-tint font-extrabold text-app-brown"
                                    : "border border-app-line bg-white font-semibold text-app-ink hover:border-app-brown",
                                  appRing,
                                )}
                              >
                                {value}
                              </button>
                            )
                          })}
                        </div>
                      </fieldset>
                    )
                  })}
                </div>
              ) : null}

              {!disabled ? (
                <div className="mt-5 flex items-center gap-3">
                  <span className="text-[13px] font-bold text-app-ink" id="pd-qty-label">Quantity</span>
                  <div className="flex h-10 items-center rounded-full border border-app-line bg-white" role="group" aria-labelledby="pd-qty-label">
                    <button
                      type="button"
                      onClick={() => setQuantity(Math.max(1, quantity - 1))}
                      disabled={quantity <= 1}
                      aria-label="Decrease quantity"
                      className={cx("flex h-10 w-10 items-center justify-center rounded-full text-app-brown hover:bg-app-tint disabled:text-[#BDB5AE] disabled:hover:bg-transparent", appRing)}
                    >
                      <Minus className="h-4 w-4" aria-hidden="true" />
                    </button>
                    <span className="min-w-8 text-center text-[14px] font-bold" aria-live="polite">{quantity}</span>
                    <button
                      type="button"
                      onClick={() => setQuantity(Math.min(qtyCap, quantity + 1))}
                      disabled={quantity >= qtyCap}
                      aria-label="Increase quantity"
                      className={cx("flex h-10 w-10 items-center justify-center rounded-full text-app-brown hover:bg-app-tint disabled:text-[#BDB5AE] disabled:hover:bg-transparent", appRing)}
                    >
                      <Plus className="h-4 w-4" aria-hidden="true" />
                    </button>
                  </div>
                </div>
              ) : null}

              <div className="mt-5 flex gap-3">
                <button
                  type="button"
                  onClick={add}
                  disabled={disabled}
                  className={cx(actionBtn, "border border-[#DDB089] bg-app-champagne text-app-brown-deep hover:bg-[#DDB089] disabled:border-[#D6D6D6] disabled:bg-[#EDEDED] disabled:text-[#9B9B9B]", appRing)}
                >
                  <ShoppingCart className="h-[18px] w-[18px]" aria-hidden="true" />
                  {disabled ? disabledLabel : "Add to Cart"}
                </button>
                <button
                  type="button"
                  onClick={buyNow}
                  disabled={disabled}
                  className={cx(actionBtn, "bg-app-brown text-white hover:bg-app-brown-deep disabled:bg-[#D6D6D6]", appRing)}
                >
                  <Zap className="h-5 w-5 fill-white" aria-hidden="true" />
                  Buy Now
                </button>
              </div>
              {inCart && !disabled ? (
                <p className="mt-2.5 text-center text-[12.5px] text-app-muted">
                  Already in your cart ·{" "}
                  <Link to={storePath("/cart")} className={cx("rounded font-semibold text-app-brown underline", appRing)}>Go to cart</Link>
                </p>
              ) : null}
            </Band>

            {/* Sold by, shipping and returns */}
            <Band gap="mt-2">
              {sellerName ? (
                <Link to={sellerHref} className={cx("-mx-2 flex items-center gap-3 rounded-xl px-2 py-1.5 hover:bg-app-alt", appRing)}>
                  <span className="flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-full bg-app-tint text-app-brown">
                    <Store className="h-5 w-5" strokeWidth={1.8} aria-hidden="true" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[11.5px] text-app-muted">Sold by</span>
                    <span className="block truncate text-[15px] font-bold text-app-ink">{sellerName}</span>
                  </span>
                  <ChevronRight className="h-5 w-5 shrink-0 text-app-muted" aria-hidden="true" />
                </Link>
              ) : null}
              <dl className={cx("grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-[12.5px]", sellerName ? "mt-3 border-t border-app-line pt-3" : "")}>
                <dt className="text-app-muted">Ships via</dt>
                <dd className="text-app-ink">{isQuick ? "Quick Rider" : "Courier"}</dd>
                <dt className="text-app-muted">Returns</dt>
                <dd className="inline-flex items-center gap-1">
                  <RotateCcw className="h-3.5 w-3.5 text-app-brown" aria-hidden="true" />
                  <Link to="/profile/refund" className={cx("rounded font-semibold text-app-brown hover:underline", appRing)}>
                    {returnWindowDays ? `${returnWindowDays}-day returns, per our policy` : "Per our returns policy"}
                  </Link>
                </dd>
              </dl>
            </Band>

            <ProductHighlights rows={highlightRows} />
            <AdditionalDetails bullets={bullets} rows={moreRows} />
            <TrustRow delivery={deliveryShort} returnDays={returnWindowDays} />
          </div>
        </div>

        <CardGridSection id="pd-bought-together" title="Frequently Bought Together" products={boughtTogether} onAdd={addCard} />

        <div id="pd-reviews" className="mt-10 scroll-mt-40">
          <ProductReviews productId={product._id} productName={product.name} variant="desktop" />
        </div>

        <CardGridSection id="pd-also-viewed" title="People Also Viewed" products={similar} onAdd={addCard} />
      </div>

      {zoomOpen && images.length ? (
        <ImageZoomViewer images={images} startIndex={zoomStart} alt={product?.name} onClose={() => setZoomOpen(false)} />
      ) : null}
    </div>
  )
}
