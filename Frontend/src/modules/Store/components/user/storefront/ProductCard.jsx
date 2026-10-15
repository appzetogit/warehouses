import { useEffect, useMemo, useRef, useState } from "react"
import { Link } from "react-router-dom"
import { Heart, Minus, Plus, ShoppingCart, Star, Truck, Zap } from "lucide-react"
import { toast } from "sonner"
import { useCart } from "@store/context/CartContext"
import { useProfile } from "@store/context/ProfileContext"
import { useStoreMode } from "@store/context/StoreModeContext"
import { channelAvailability } from "@store/utils/channelStock"
import { buildCartLineId } from "@store/utils/productVariants"
import { ImagePlaceholder, isRealImage, percentOff } from "../desktop/ui"
import { mediaUrl } from "../desktop/desktopCart"
import { useQuickEta, useShopDeliveryEstimate } from "../desktop/useDeliveryEstimates"
import CardSizePicker from "./CardSizePicker"

/**
 * The storefront product card in the customer app's look (ListingGridCard,
 * as the phone's ProductTile): a white card with a 4:5 photo on a soft panel,
 * a brown "N% OFF" flag, a heart, a delivery chip and a rating chip on the
 * photo; then brand (or store), name, price against MRP, a "Sizes:" line, and
 * an outlined brown "Add to Cart" that turns into a brown −/count/+ stepper
 * once the product is in the cart.
 *
 * `onAction(product, null, variant)` adds to the cart (the caller decides
 * how). Products with sizes/colours open CardSizePicker on the card first; the
 * size picked there is remembered so the stepper follows that cart line.
 * With a mouse, hovering the photo shows the next one; on touch screens the
 * photos cycle while the card is on screen.
 */

const focusRing = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app-brown"

const attrPairs = (variant) => {
  const a = variant?.attributes
  if (Array.isArray(a)) return a.map((x) => [String(x?.name || ""), x?.value])
  return a && typeof a === "object" ? Object.entries(a) : []
}

export default function ProductCard({
  product,
  actionLabel = "Add to Cart",
  onAction,
  disabled = false,
  badge = null,
  footNote = null,
  channel: channelProp,
  etaMinutes,
  showSizes = true,
}) {
  const { storePath, isQuick } = useStoreMode()
  const { getCartItem, updateQuantity } = useCart()
  const { addDishFavorite, removeDishFavorite, isDishFavorite } = useProfile()
  const zoneEta = useQuickEta()
  const channel = channelProp || (isQuick ? "quick" : "shop")
  const quick = channel === "quick"
  // One shared request per pincode; every card reads the same answer.
  const shopEstimate = useShopDeliveryEstimate({ enabled: !quick })

  // Products with sizes/colours: Add to Cart opens the picker on the card.
  const hasOptions = Array.isArray(product?.variants) && product.variants.length > 0
  const [picking, setPicking] = useState(false)
  // The variant last added from this card: the stepper follows its cart line.
  const [pickedId, setPickedId] = useState("")
  const ref = useRef(null)
  const triggerRef = useRef(null)
  const id = String(product?._id || product?.id || "")
  const to = storePath(`/product/${id}`)

  // Every photo the product has, so the card can cycle through them.
  //
  // `image` often arrives already resolved to an absolute URL while `images`
  // stay relative, so the same file appears under two spellings. Comparing
  // paths keeps one copy — otherwise a card spends half its cycle fading one
  // photo into itself, which reads as nothing happening.
  const gallery = useMemo(() => {
    const raw = [product?.imageUrl, product?.image, ...(Array.isArray(product?.images) ? product.images : [])]
    const seen = new Set()
    const urls = []
    for (const entry of raw) {
      const url = mediaUrl(typeof entry === "string" ? entry : entry?.url)
      if (!isRealImage(url)) continue
      let key = url
      try {
        key = new URL(url, window.location.origin).pathname
      } catch {
        /* not a parseable URL; compare the raw string */
      }
      if (seen.has(key)) continue
      seen.add(key)
      urls.push(url)
    }
    return urls.slice(0, 5)
  }, [product])

  const [frame, setFrame] = useState(0)

  // With a mouse, hovering shows the next photo (as the old shop did) and
  // leaving goes back; nothing moves on its own.
  const canHover = useMemo(() => Boolean(window.matchMedia?.("(hover: hover) and (pointer: fine)")?.matches), [])
  const hoverHandlers = canHover && gallery.length > 1
    ? { onMouseEnter: () => setFrame(1), onMouseLeave: () => setFrame(0) }
    : {}

  // Touch screens have no hover: there the photos cycle, only while the card
  // is on screen, and never when the visitor has asked for less motion — an
  // animation nobody is looking at is just battery.
  useEffect(() => {
    if (canHover || gallery.length < 2) return undefined
    const el = ref.current
    if (!el) return undefined
    const still = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches
    if (still) return undefined

    let timer = null
    const start = () => {
      if (timer) return
      timer = setInterval(() => setFrame((f) => (f + 1) % gallery.length), 2600)
    }
    const stop = () => {
      clearInterval(timer)
      timer = null
    }
    if (typeof IntersectionObserver === "undefined") {
      start()
      return stop
    }
    const observer = new IntersectionObserver(
      ([entry]) => (entry.isIntersecting ? start() : stop()),
      { threshold: 0.35 },
    )
    observer.observe(el)
    return () => {
      observer.disconnect()
      stop()
    }
  }, [canHover, gallery.length])

  const price = Number(product?.displayPrice ?? product?.price ?? 0)
  // Active variants' prices: more than one means the shown price is "From".
  const activeVariants = hasOptions ? product.variants.filter((v) => v && v.isActive !== false) : []
  const variantPrices = new Set(activeVariants.map((v) => Number(v.price)).filter((n) => Number.isFinite(n) && n > 0))
  const fromPrice = variantPrices.size > 1
  // No product MRP: the MRP of the variant at the shown price, else the cheapest variant's.
  const priceVariant =
    activeVariants.find((v) => Number(v.price) === price) ||
    [...activeVariants].sort((a, b) => Number(a.price) - Number(b.price))[0]
  const mrp = Number(product?.mrp) || Number(product?.originalPrice) || Number(priceVariant?.mrp) || 0
  const off = percentOff(price, mrp)
  const rating = Number(product?.rating ?? product?.averageRating) > 0 ? Number(product?.rating ?? product?.averageRating) : null
  const ratingCount = Number(product?.ratingCount ?? product?.totalRatings) || 0
  const countLabel = ratingCount >= 1000 ? `${(ratingCount / 1000).toFixed(1)}K` : String(ratingCount)

  // In stock if the product is, or (with sizes) if any active size is.
  const stock = activeVariants.length
    ? (() => {
        const all = activeVariants.map((v) => channelAvailability(product, channel, v))
        return { enabled: all.some((a) => a.enabled), inStock: all.some((a) => a.inStock), low: false, qty: null }
      })()
    : channelAvailability(product, channel)
  const soldOut = !stock.enabled || !stock.inStock
  const soldOutLabel = !stock.enabled ? "Not available here" : "Out of Stock"

  // The cart line this card controls: the product itself, or the size picked here.
  const lineVariantId = hasOptions ? pickedId : ""
  const line = onAction && (!hasOptions || pickedId) ? getCartItem(id, lineVariantId) : null
  const qty = Number(line?.quantity) || 0

  const seller = product?.seller && typeof product.seller === "object" ? product.seller : {}
  const sellerId = String(seller._id || seller.id || product?.sellerId || "")
  const sellerName =
    seller.name || seller.sellerName || (typeof product?.seller === "string" ? product.seller : "") || product?.sellerName || product?.storeName || ""
  const brand = typeof product?.brand === "string" ? product.brand.trim() : String(product?.brand?.name || "").trim()
  const byline = brand || sellerName

  const liked = id ? isDishFavorite(id, sellerId) : false
  const toggleLike = (e) => {
    e.preventDefault()
    e.stopPropagation()
    if (!id) return
    if (liked) {
      removeDishFavorite(id, sellerId)
      toast("Removed from wishlist")
    } else {
      addDishFavorite({ id, sellerId, name: product?.name, image: gallery[0] || "", price, mrp, sellerName, mode: channel })
      toast.success("Saved to wishlist")
    }
  }

  // "Sizes: S · M · L", as the app shows it.
  const sizeNames = [
    ...new Set(
      activeVariants
        .map((v) => attrPairs(v).find(([name]) => /^size$/i.test(name))?.[1])
        .filter((v) => v != null && v !== "")
        .map(String),
    ),
  ]

  // Quick: the zone's (or store's) ETA. Shop: the courier window for this pincode.
  const minDays = Number(shopEstimate?.minDays)
  const maxDays = Number(shopEstimate?.maxDays)
  const eta = Number(etaMinutes) > 0 ? Math.round(Number(etaMinutes)) : zoneEta
  const deliveryChip = quick
    ? `${eta} min`
    : Number.isFinite(minDays) && Number.isFinite(maxDays) && maxDays > 0
      ? minDays > 0 && minDays !== maxDays ? `${minDays}-${maxDays} days` : `${maxDays} day${maxDays === 1 ? "" : "s"}`
      : "2-4 days"

  const step = (by) => (e) => {
    e.preventDefault()
    e.stopPropagation()
    updateQuantity(buildCartLineId(id, lineVariantId), qty + by)
  }

  const actionDisabled = disabled || soldOut

  return (
    <article
      ref={ref}
      className="relative flex h-full flex-col rounded-[14px] bg-white p-[5px] font-app text-app-ink shadow-[0_2px_8px_rgba(25,20,17,0.08)] transition-shadow duration-300 hover:shadow-[0_8px_22px_rgba(25,20,17,0.12)]"
    >
      <div className="group relative aspect-[4/5] w-full overflow-hidden rounded-[10px] bg-app-alt" {...hoverHandlers}>
        <Link to={to} className={`absolute inset-0 block rounded-[10px] ${focusRing}`}>
          {gallery.length ? (
            gallery.map((url, i) => (
              <img
                key={url}
                src={url}
                alt={i === 0 ? product?.name || "Product" : ""}
                aria-hidden={i === 0 ? undefined : "true"}
                loading={i === 0 ? "lazy" : "eager"}
                className={`absolute inset-0 h-full w-full object-cover transition-all duration-700 ease-out group-hover:scale-105 ${
                  i === frame ? "opacity-100" : "opacity-0"
                }`}
              />
            ))
          ) : (
            <ImagePlaceholder name={product?.name} />
          )}
        </Link>

        {/* Overlays: they let clicks through to the photo link beneath. */}
        {off > 0 ? (
          <span className="pointer-events-none absolute left-0 top-0 rounded-br-[10px] bg-app-brown px-2 py-[3px] text-[10px] font-semibold leading-tight text-white">
            {off}% OFF
          </span>
        ) : null}
        <span className="pointer-events-none absolute bottom-1.5 left-1.5 flex items-center gap-0.5 rounded-xl bg-white/[0.94] px-[7px] py-[3px] text-[10.5px] font-semibold leading-tight text-app-ink">
          {quick ? (
            <Zap className="h-[13px] w-[13px] fill-app-brown text-app-brown" aria-hidden="true" />
          ) : (
            <Truck className="h-[13px] w-[13px] text-app-brown" aria-hidden="true" />
          )}
          <span className="sr-only">Delivery in </span>
          {deliveryChip}
        </span>
        {rating && ratingCount ? (
          <span className="pointer-events-none absolute bottom-1.5 right-1.5 flex items-center rounded-md bg-white/[0.92] px-1.5 py-[3px] text-[11px] leading-tight text-app-ink">
            <span className="sr-only">Rated </span>
            <span className="font-bold">{rating.toFixed(1)}</span>
            <Star className="mx-[3px] h-3 w-3 fill-app-ok text-app-ok" aria-hidden="true" />
            <span className="text-app-muted">
              <span aria-hidden="true">| </span>
              {countLabel}
              <span className="sr-only"> ratings</span>
            </span>
          </span>
        ) : null}
        {/* Which photo is showing, when they cycle on a touch screen. */}
        {!canHover && gallery.length > 1 ? (
          <span aria-hidden="true" className="pointer-events-none absolute inset-x-0 bottom-8 flex justify-center gap-1">
            {gallery.map((url, i) => (
              <span
                key={url}
                className={`h-1 rounded-full bg-white transition-all duration-300 ${i === frame ? "w-3 opacity-95" : "w-1 opacity-60"}`}
              />
            ))}
          </span>
        ) : null}
        {soldOut ? (
          <span className="pointer-events-none absolute inset-0 flex items-center justify-center bg-white/60 text-[12px] font-bold text-app-ink">
            {soldOutLabel}
          </span>
        ) : null}
        {badge}
        <button
          type="button"
          onClick={toggleLike}
          aria-label={liked ? `Remove ${product?.name || "product"} from wishlist` : `Save ${product?.name || "product"} to wishlist`}
          aria-pressed={liked}
          className={`absolute right-1.5 top-1.5 flex h-[30px] w-[30px] items-center justify-center rounded-full bg-white shadow-[0_1px_3px_rgba(25,20,17,0.12)] transition-transform hover:scale-105 active:scale-90 ${focusRing}`}
        >
          <Heart className={`h-[17px] w-[17px] ${liked ? "fill-[#D32F2F] text-[#D32F2F]" : "text-app-muted"}`} aria-hidden="true" />
        </button>
      </div>

      <div className="flex flex-1 flex-col px-1 pb-0.5 pt-1.5">
        {byline ? <p className="line-clamp-1 text-[13px] font-bold leading-[18px] text-app-ink">{byline}</p> : null}
        <Link to={to} className={`line-clamp-2 min-h-[30px] rounded text-[11.5px] leading-[15px] text-app-muted hover:text-app-brown ${focusRing}`}>
          {product?.name}
        </Link>
        {product?.packSize ? <p className="mt-0.5 text-[10.5px] text-app-muted">{product.packSize}</p> : null}
        <p className="mt-1 flex flex-wrap items-baseline gap-x-[5px]">
          {fromPrice ? <span className="text-[10.5px] text-app-muted">From</span> : null}
          <span className="text-[13.5px] font-bold text-app-ink">₹{price.toLocaleString("en-IN")}</span>
          {mrp > price ? (
            <span className="text-[10.5px] text-app-muted line-through">
              <span className="sr-only">MRP </span>₹{mrp.toLocaleString("en-IN")}
            </span>
          ) : null}
          {off > 0 ? <span className="text-[11.5px] font-bold text-app-brown">{off}% OFF</span> : null}
        </p>
        {showSizes && sizeNames.length > 1 ? (
          <p className="mt-0.5 line-clamp-1 text-[10.5px] text-app-muted">Sizes: {sizeNames.join(" · ")}</p>
        ) : null}
        {!soldOut && stock.low && stock.qty != null ? (
          <p className="mt-0.5 text-[10.5px] font-semibold text-app-sale">Only {stock.qty} left</p>
        ) : null}

        {footNote}

        {onAction ? (
          <div className="mt-auto pt-2">
            {qty > 0 ? (
              <div className="flex h-[38px] items-center justify-between rounded-[10px] bg-app-brown text-white" role="group" aria-label={`${product?.name || "Product"} in cart`}>
                <button
                  type="button"
                  onClick={step(-1)}
                  aria-label={qty === 1 ? "Remove from cart" : "One fewer"}
                  className="mx-1 flex h-[30px] w-[30px] items-center justify-center rounded-full bg-white/[0.18] transition-colors hover:bg-white/30 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-white"
                >
                  <Minus className="h-[18px] w-[18px]" aria-hidden="true" />
                </button>
                <span key={qty} className="wh-pop text-[15px] font-extrabold" aria-live="polite">
                  {qty}
                </span>
                <button
                  type="button"
                  onClick={step(1)}
                  aria-label="One more"
                  className="mx-1 flex h-[30px] w-[30px] items-center justify-center rounded-full bg-white/[0.18] transition-colors hover:bg-white/30 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-white"
                >
                  <Plus className="h-[18px] w-[18px]" aria-hidden="true" />
                </button>
              </div>
            ) : (
              <button
                ref={triggerRef}
                type="button"
                disabled={actionDisabled}
                onClick={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  if (hasOptions) setPicking((open) => !open)
                  else onAction(product)
                }}
                aria-expanded={hasOptions ? picking : undefined}
                aria-haspopup={hasOptions ? "dialog" : undefined}
                className={`flex h-[38px] w-full items-center justify-center gap-1.5 whitespace-nowrap rounded-[10px] border-[1.5px] border-app-brown px-1.5 text-[12.5px] font-bold text-app-brown transition hover:bg-app-tint active:scale-[0.98] disabled:cursor-not-allowed disabled:border-app-alt disabled:bg-app-alt disabled:text-[#BDB5AE] disabled:hover:bg-app-alt disabled:active:scale-100 ${focusRing}`}
              >
                <ShoppingCart className="h-[17px] w-[17px] shrink-0" aria-hidden="true" />
                {soldOut ? soldOutLabel : actionLabel}
              </button>
            )}
          </div>
        ) : null}
      </div>

      {picking && onAction ? (
        <CardSizePicker
          product={product}
          channel={channel}
          triggerRef={triggerRef}
          selectedId={pickedId}
          onClose={() => setPicking(false)}
          onPick={(variant) => {
            setPicking(false)
            setPickedId(String(variant?._id || variant?.id || ""))
            onAction(product, null, variant)
          }}
        />
      ) : null}
    </article>
  )
}
