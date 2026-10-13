import { useEffect, useRef, useState } from "react"
import { Link, useNavigate } from "react-router-dom"
import { ChevronLeft, ChevronRight, Heart, MapPin, Maximize2, Search, Share2, ShoppingCart, Store, Truck, Zap } from "lucide-react"
import { toast } from "sonner"
import { useProfile } from "@store/context/ProfileContext"
import { useCart } from "@store/context/CartContext"
import { useDeliveryLocation } from "@store/context/DeliveryLocationContext"
import ProductReviews from "@store/components/user/reviews/ProductReviews"
import { resolveMediaUrl } from "@/shared/utils/mediaUrl"
import { useLocationSelector } from "../UserLayout"
import { formatDeliveryWindow, locationPincode, useQuickEta, useShopDeliveryEstimate } from "../desktop/useDeliveryEstimates"
import { useBusinessSettings } from "../desktop/useDesktopShell"
import { ImagePlaceholder, isRealImage } from "../desktop/ui"
import ImageZoomViewer from "../product/ImageZoomViewer"
import useSimilarProducts from "../product/useSimilarProducts"
import { AdditionalDetails, Band, ProductHighlights, TrustRow, focusRing, focusRingInset } from "../product/ProductDetailBands"
import ProductTile from "./ProductTile"

/**
 * The phone product page, styled after the customer app's product details
 * screen (warehouse_user product_details_screen.dart): a white top bar, then
 * white full-width bands on a cream page (gallery, similar strip, title,
 * price + options, sold by, highlights, details, reviews, trust row, people
 * also viewed) and a pinned Add to Cart / Buy Now bar.
 *
 * ProductDetail owns the data, the variant choice and the add; this only lays
 * it out for a phone.
 */

const isColourName = (name) => /^colou?r$/i.test(String(name || ""))
const titleCase = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s)
const valueOf = (raw) => (raw && typeof raw === "object" ? raw.value : raw)

export default function MobileProductView({
  product,
  seller,
  storePath,
  isQuick,
  altChannel,
  altPath,
  avail,
  isAvailable,
  notInThisStore,
  currentVariant,
  selectedAttrs,
  missingOptions = [],
  choiceHint = false,
  onSelectAttribute,
  isValueEnabled,
  allImages = [],
  displayPrice,
  priceFrom = false,
  displayMrp,
  discountPercent,
  onAddToCart,
}) {
  const navigate = useNavigate()
  const { addDishFavorite, removeDishFavorite, isDishFavorite } = useProfile()
  const { getCartCount, isInCart } = useCart()
  const { effectiveLocation } = useDeliveryLocation()
  const { openLocationSelector } = useLocationSelector()
  const { returnWindowDays } = useBusinessSettings()
  const eta = useQuickEta()
  const estimate = useShopDeliveryEstimate({ enabled: !isQuick })
  const similar = useSimilarProducts(product?._id, 10)
  const gallery = useRef(null)
  const optionsRef = useRef(null)
  const [index, setIndex] = useState(0)
  const [zoomOpen, setZoomOpen] = useState(false)

  // Opened straight from a link there is no page to go back to.
  const goBack = () => {
    if (typeof window !== "undefined" && window.history.length > 1) navigate(-1)
    else navigate(storePath("/"))
  }

  const id = String(product?._id || "")
  const sellerId = String(seller?._id || product?.sellerId || "")
  const sellerName = seller?.sellerName || seller?.name || ""
  const sellerHref = storePath(`/sellers/${seller?.slug || sellerId}`)
  const liked = isDishFavorite(id, sellerId)
  const bullets = String(product?.description || "")
    .split(/\r?\n|(?<=\.)\s+(?=[A-Z])/)
    .map((s) => s.trim().replace(/^[-•*]\s*/, ""))
    .filter(Boolean)
    .slice(0, 8)
  const images = allImages.filter(isRealImage)
  const cartCount = getCartCount()
  const options = Array.isArray(product?.options) ? product.options : []

  // A new variant's gallery starts at its first photo.
  const firstImage = images[0] || ""
  useEffect(() => {
    if (gallery.current) gallery.current.scrollLeft = 0
    setIndex(0)
  }, [firstImage])

  // "Delivering to <City> - <PIN>" from the delivery location.
  const city = String(effectiveLocation?.city || effectiveLocation?.area || "").trim()
  const pin = locationPincode(effectiveLocation)
  const delivering = city ? `Delivering to ${city}${pin ? ` - ${pin}` : ""}` : ""

  // Delivery lines: the price band's text, and the short form for the trust row.
  const deliveryLine = isQuick ? `Delivery in ${eta} minutes` : formatDeliveryWindow(estimate)
  const minDays = Number(estimate?.minDays)
  const maxDays = Number(estimate?.maxDays)
  const deliveryShort = isQuick
    ? `${eta} min`
    : maxDays > 0
      ? minDays > 0 && minDays !== maxDays
        ? `${minDays}–${maxDays} days`
        : `${maxDays} day${maxDays === 1 ? "" : "s"}`
      : "2–4 days"

  // This variant (or the product, when it has no variants) already in the cart.
  const hasVariants = (product?.variants || []).some((v) => v && v.isActive !== false)
  const inCart = (!hasVariants || !!currentVariant) && isInCart(id, currentVariant?._id ? String(currentVariant._id) : "")

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

  // A size/colour still to choose: the parent shows the hint and toast; take
  // the customer to the pickers instead of adding.
  const needsChoice = () => {
    if (!missingOptions.length) return false
    onAddToCart()
    optionsRef.current?.scrollIntoView({ behavior: "smooth", block: "center" })
    return true
  }

  const add = () => {
    if (inCart) {
      navigate(storePath("/cart"))
      return
    }
    if (needsChoice()) return
    onAddToCart()
  }

  const buyNow = () => {
    if (needsChoice()) return
    if (inCart || onAddToCart()) navigate(storePath("/cart"))
  }

  const disabled = notInThisStore || !isAvailable
  const disabledLabel = notInThisStore ? "Not sold here" : currentVariant ? "Out of Stock" : "Select Options"

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
  ]
    .filter(([, v]) => v !== undefined && v !== null && String(v).trim() !== "")
    .map(([k, v]) => [k, String(v).trim()])

  const moreRows = [
    !isQuick ? ["Ships via", "Courier"] : null,
    returnWindowDays ? ["Returns", `${returnWindowDays}-day returns`] : null,
  ].filter(Boolean)

  const iconBtn = `relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-app-ink active:bg-black/5 ${focusRing}`

  return (
    <div className="min-h-screen bg-app-cream pb-[calc(84px+env(safe-area-inset-bottom))] font-app text-app-ink lg:hidden">
      {/* Top bar */}
      <header className="sticky top-0 z-40 flex h-14 items-center bg-white px-1.5">
        <button type="button" onClick={goBack} aria-label="Back" className={iconBtn}>
          <ChevronLeft className="h-6 w-6" strokeWidth={2.2} aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={() => openLocationSelector()}
          aria-label={delivering ? `${delivering}. Change delivery location` : "Set delivery location"}
          className={`flex min-w-0 flex-1 items-center gap-1 rounded px-1 text-left ${focusRing}`}
        >
          <MapPin className="h-[17px] w-[17px] shrink-0 fill-app-brown text-white" strokeWidth={2} aria-hidden="true" />
          <span className="truncate text-[12.5px] font-bold text-app-ink">{delivering || "Set delivery location"}</span>
        </button>
        <Link to={storePath("/search")} aria-label="Search" className={iconBtn}>
          <Search className="h-6 w-6" strokeWidth={1.9} aria-hidden="true" />
        </Link>
        <button type="button" onClick={toggleLike} aria-label={liked ? "Remove from wishlist" : "Save to wishlist"} aria-pressed={liked} className={iconBtn}>
          <Heart className={`h-[23px] w-[23px] ${liked ? "fill-[#D32F2F] text-[#D32F2F]" : ""}`} strokeWidth={1.9} aria-hidden="true" />
        </button>
        <Link to={storePath("/cart")} aria-label={`Cart, ${cartCount} item${cartCount === 1 ? "" : "s"}`} className={iconBtn}>
          <ShoppingCart className="h-[23px] w-[23px]" strokeWidth={1.9} aria-hidden="true" />
          {cartCount > 0 ? (
            <span
              key={cartCount}
              className="wh-pop absolute right-0.5 top-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-app-brown px-1 text-[10px] font-bold leading-none text-white"
            >
              {cartCount > 99 ? "99+" : cartCount}
            </span>
          ) : null}
        </Link>
      </header>

      {/* Gallery */}
      <div className="rounded-b-[18px] bg-white pb-3">
        <div className="relative aspect-[0.78]">
          <div
            ref={gallery}
            onScroll={(e) => {
              const el = e.currentTarget
              setIndex(Math.round(el.scrollLeft / Math.max(1, el.clientWidth)))
            }}
            className="flex h-full snap-x snap-mandatory overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            aria-label="Product photos"
          >
            {images.length ? (
              images.map((src, i) => (
                <img
                  key={src}
                  src={src}
                  alt={i === 0 ? product?.name : ""}
                  loading={i === 0 ? "eager" : "lazy"}
                  className="h-full w-full shrink-0 snap-center object-cover"
                />
              ))
            ) : (
              <ImagePlaceholder name={product?.name} />
            )}
          </div>
          {discountPercent > 0 ? (
            <span className="absolute left-3 top-3 rounded-[12px] bg-[#FFEBEE] px-[9px] py-[3.5px] text-[10.5px] font-extrabold text-[#D32F2F]">
              {discountPercent}% OFF
            </span>
          ) : null}
          {images.length ? (
            <button
              type="button"
              onClick={() => setZoomOpen(true)}
              aria-label="View photos full screen"
              className={`absolute bottom-2 right-3 flex h-[38px] w-[38px] items-center justify-center rounded-full bg-white text-app-ink shadow-[0_2px_6px_rgba(0,0,0,0.14)] ${focusRing}`}
            >
              <Maximize2 className="h-[18px] w-[18px]" aria-hidden="true" />
            </button>
          ) : null}
        </div>
        {images.length > 1 ? (
          <div className="mt-2.5 flex justify-center" aria-hidden="true">
            {images.map((src, i) => (
              <span
                key={src}
                className={`mx-[3px] h-[5px] rounded-[3px] transition-all duration-200 ${i === index ? "w-[22px] bg-app-brown" : "w-5 bg-[#E6E6E6]"}`}
              />
            ))}
          </div>
        ) : null}
      </div>

      {/* N Similar Products */}
      {similar.length ? (
        <div className="pt-[14px]">
          <p className="px-[14px] text-[14px] font-semibold text-[#555]">
            {similar.length} Similar Product{similar.length === 1 ? "" : "s"}
          </p>
          <ul className="mt-2.5 flex gap-2.5 overflow-x-auto px-[14px] pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <li className="h-[76px] w-[62px] shrink-0 overflow-hidden rounded-lg border-2 border-app-brown bg-white" aria-current="true">
              {images[0] ? <img src={images[0]} alt={`${product?.name} (this product)`} className="h-full w-full object-cover" /> : <ImagePlaceholder name={product?.name} />}
            </li>
            {similar.slice(0, 8).map((p) => {
              const src = p.image ? resolveMediaUrl(p.image) : ""
              return (
                <li key={p._id} className="shrink-0">
                  <Link
                    to={storePath(`/product/${p._id}`)}
                    aria-label={p.name}
                    className={`block h-[76px] w-[62px] overflow-hidden rounded-lg border border-[#E6E6E6] bg-white ${focusRing}`}
                  >
                    {src ? <img src={src} alt="" loading="lazy" className="h-full w-full object-cover" /> : <ImagePlaceholder name={p.name} />}
                  </Link>
                </li>
              )
            })}
          </ul>
        </div>
      ) : null}

      {/* Title with Wishlist and Share */}
      <Band gap="mt-2.5">
        <div className="flex items-start">
          <div className="min-w-0 flex-1">
            <h1 className="line-clamp-2 text-[14.5px] font-normal leading-[1.35] text-[#4A423D]">{product?.name}</h1>
            {sellerName ? (
              <Link to={sellerHref} className={`mt-1 inline-flex items-center gap-0.5 rounded text-[12.5px] font-semibold text-app-brown ${focusRing}`}>
                By {sellerName} <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
              </Link>
            ) : null}
          </div>
          <button
            type="button"
            onClick={toggleLike}
            aria-label={liked ? "Remove from wishlist" : "Save to wishlist"}
            aria-pressed={liked}
            className={`ml-[18px] flex flex-col items-center rounded ${focusRing}`}
          >
            <Heart className={`h-[22px] w-[22px] ${liked ? "fill-[#D32F2F] text-[#D32F2F]" : "text-app-ink"}`} strokeWidth={1.9} aria-hidden="true" />
            <span className="mt-1 text-[11.5px] text-[#555]">Wishlist</span>
          </button>
          <button type="button" onClick={share} aria-label="Share" className={`ml-[18px] flex flex-col items-center rounded ${focusRing}`}>
            <Share2 className="h-[22px] w-[22px] text-app-ink" strokeWidth={1.9} aria-hidden="true" />
            <span className="mt-1 text-[11.5px] text-[#555]">Share</span>
          </button>
        </div>
      </Band>

      {/* Price, delivery, stock and options */}
      <Band gap="mt-px">
        <p className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <span className="text-[24px] font-black text-app-ink">
            {priceFrom ? <span className="mr-1 text-[14px] font-semibold text-app-muted">From</span> : null}
            {`₹${Number(displayPrice || 0).toLocaleString("en-IN")}`}
          </span>
          {displayMrp > displayPrice ? (
            <span className="text-[14px] text-[#9E9E9E] line-through">₹{Number(displayMrp).toLocaleString("en-IN")}</span>
          ) : null}
          {discountPercent > 0 ? <span className="text-[13.5px] font-extrabold text-app-ok">{discountPercent}% off</span> : null}
        </p>
        <p className="mt-[3px] text-[11px] text-app-muted">Inclusive of All Taxes</p>
        <p className="mt-2.5 flex items-center gap-1.5 text-[12.5px] font-bold text-app-ink">
          {isQuick ? <Zap className="h-[17px] w-[17px] text-app-brown" aria-hidden="true" /> : <Truck className="h-[17px] w-[17px] text-app-brown" aria-hidden="true" />}
          {deliveryLine}
        </p>

        {notInThisStore ? (
          <div className="mt-2.5 rounded-lg bg-app-tint p-3 text-[13px] text-app-ink">
            Not sold in {isQuick ? "Quick" : "Shop"}.{" "}
            {altPath ? (
              <Link to={altPath} className={`rounded font-bold text-app-brown underline ${focusRing}`}>
                See it in {altChannel === "quick" ? "Quick" : "Shop"}
              </Link>
            ) : null}
          </div>
        ) : avail?.low && avail?.qty != null ? (
          <p className="mt-2.5 text-[12px] font-bold text-app-sale">Only {avail.qty} left in stock</p>
        ) : null}

        {options.length ? (
          <div ref={optionsRef} className="mt-[14px] scroll-mt-20 space-y-3">
            {options.map((opt) => {
              const isColour = isColourName(opt.name)
              const label = isColour ? "Colour" : titleCase(String(opt.name || ""))
              const missing = choiceHint && missingOptions.includes(opt.name)
              return (
                <fieldset key={opt.name}>
                  <legend className="mb-2.5 flex w-full items-center justify-between gap-2 text-[14px] font-bold text-app-ink">
                    Select {label}
                    {selectedAttrs?.[opt.name] ? (
                      <span className="truncate text-[12.5px] font-medium text-app-muted">{selectedAttrs[opt.name]}</span>
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
                      const selected = selectedAttrs?.[opt.name] === value
                      const enabled = isValueEnabled(opt.name, value)
                      if (isColour) {
                        const photo = colourImage(value)
                        return (
                          <button
                            key={value}
                            type="button"
                            disabled={!enabled}
                            aria-pressed={selected}
                            aria-label={enabled ? value : `${value} (sold out)`}
                            onClick={() => onSelectAttribute(opt.name, value)}
                            className={`h-14 w-12 overflow-hidden rounded-lg p-0.5 disabled:opacity-35 ${focusRing} ${
                              selected ? "border-2 border-app-brown" : "border border-app-line"
                            }`}
                          >
                            {photo ? (
                              <img src={photo} alt="" className="h-full w-full rounded-md object-cover" />
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
                          aria-label={enabled ? undefined : `${value} (sold out)`}
                          onClick={() => onSelectAttribute(opt.name, value)}
                          className={`min-w-12 rounded-lg px-4 py-2 text-[12px] transition-colors disabled:cursor-not-allowed disabled:line-through disabled:opacity-40 ${focusRing} ${
                            selected
                              ? "border-[1.5px] border-app-brown bg-app-tint font-extrabold text-app-brown"
                              : "border border-app-line bg-white font-semibold text-app-ink"
                          }`}
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
      </Band>

      {/* Sold by */}
      {sellerName ? (
        <Link to={sellerHref} className={`mt-2 flex w-full items-center gap-3 bg-white px-[14px] py-[14px] ${focusRingInset}`}>
          <span className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-full bg-app-tint text-app-brown">
            <Store className="h-5 w-5" strokeWidth={1.8} aria-hidden="true" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[11.5px] text-app-muted">Sold by</span>
            <span className="block truncate text-[15px] font-bold text-app-ink">{sellerName}</span>
          </span>
          <ChevronRight className="h-5 w-5 shrink-0 text-app-muted" aria-hidden="true" />
        </Link>
      ) : null}

      <ProductHighlights rows={highlightRows} />
      <AdditionalDetails bullets={bullets} rows={moreRows} />

      <div id="pd-reviews" className="scroll-mt-16">
        <ProductReviews productId={product._id} productName={product.name} variant="mobile" />
      </div>

      <TrustRow delivery={deliveryShort} returnDays={returnWindowDays} />

      {similar.length ? (
        <section aria-labelledby="pd-also-viewed">
          <h2 id="pd-also-viewed" className="px-[14px] pb-3 pt-[18px] text-[15px] font-extrabold text-app-ink">
            PEOPLE ALSO VIEWED
          </h2>
          <div className="grid grid-cols-2 gap-x-3 gap-y-4 px-3 pb-5">
            {similar.map((p) => (
              <ProductTile key={p._id} product={p} />
            ))}
          </div>
        </section>
      ) : null}

      {/* Pinned bottom bar */}
      <div className="fixed inset-x-0 bottom-0 z-[95] flex gap-3 border-t border-[#EBEBEB] bg-white px-[14px] pt-2.5 pb-[max(10px,env(safe-area-inset-bottom))] lg:hidden">
        <button
          type="button"
          onClick={add}
          disabled={disabled}
          className={`flex h-[46px] flex-1 items-center justify-center gap-2 rounded-lg border-[1.5px] border-app-brown bg-white text-[14px] font-bold text-app-brown active:scale-[0.99] disabled:border-[#D6D6D6] disabled:text-[#9B9B9B] ${focusRing}`}
        >
          <ShoppingCart className="h-[18px] w-[18px]" aria-hidden="true" />
          {disabled ? disabledLabel : inCart ? "Go to Cart" : "Add to Cart"}
        </button>
        <button
          type="button"
          onClick={buyNow}
          disabled={disabled}
          className={`flex h-[46px] flex-1 items-center justify-center gap-1.5 rounded-lg bg-app-brown text-[14px] font-bold text-white active:scale-[0.99] disabled:bg-[#D6D6D6] ${focusRing}`}
        >
          <Zap className="h-5 w-5 fill-white" aria-hidden="true" />
          Buy Now
        </button>
      </div>

      {zoomOpen && images.length ? (
        <ImageZoomViewer images={images} startIndex={index} alt={product?.name} onClose={() => setZoomOpen(false)} />
      ) : null}
    </div>
  )
}
