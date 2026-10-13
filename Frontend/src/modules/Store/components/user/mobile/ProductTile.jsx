import { useMemo, useState } from "react"
import { Link, useNavigate } from "react-router-dom"
import { Heart, Minus, Plus, ShoppingCart, Star, Truck, Zap } from "lucide-react"
import { toast } from "sonner"
import { useCart } from "@store/context/CartContext"
import { useProfile } from "@store/context/ProfileContext"
import { useStoreMode } from "@store/context/StoreModeContext"
import { channelAvailability } from "@store/utils/channelStock"
import { buildCartLineId } from "@store/utils/productVariants"
import { mediaUrl } from "../desktop/desktopCart"
import { useQuickEta, useShopDeliveryEstimate } from "../desktop/useDeliveryEstimates"
import { ImagePlaceholder, isRealImage, percentOff } from "../desktop/ui"
import SizeSheet from "./SizeSheet"

/**
 * The phone product card, styled after the customer app's ListingGridCard /
 * ListingCard: a 4:5 photo with a discount flag, heart, delivery chip and
 * rating chip, then brand (or store), name, price against MRP, a "Sizes:"
 * line, and an outlined "Add to Cart" that becomes a brown stepper.
 *
 * It adds real products only. A product with sizes opens the size sheet from
 * Add; the size picked there is remembered so the stepper follows that line.
 */

const sizeOf = (variant) =>
  (variant?.attributes || []).find((a) => /^size$/i.test(String(a?.name || "")))?.value ||
  String(variant?.name || "").split("/")[0].trim()

const attrPairs = (variant) => {
  const a = variant?.attributes
  if (Array.isArray(a)) return a.map((x) => [String(x?.name || ""), x?.value])
  return a && typeof a === "object" ? Object.entries(a) : []
}

// The full name of a variant ("M / Red"): its own name, else its values.
const variantLabel = (variant) =>
  String(variant?.name || "").trim() ||
  attrPairs(variant).map(([, value]) => value).filter(Boolean).join(" / ") ||
  "Option"

// True when variants differ on something besides size (a colour, say). A size
// chip would then stand for several variants and add an arbitrary colour.
const differsBeyondSize = (variants) => {
  const values = new Map()
  for (const v of variants) {
    for (const [name, value] of attrPairs(v)) {
      if (!name || /^size$/i.test(name)) continue
      if (!values.has(name)) values.set(name, new Set())
      values.get(name).add(String(value))
    }
  }
  return [...values.values()].some((set) => set.size > 1)
}

export default function ProductTile({ product, showSizes = true }) {
  const navigate = useNavigate()
  const { isQuick, storePath } = useStoreMode()
  const { addToCart, getCartItem, updateQuantity } = useCart()
  const { addDishFavorite, removeDishFavorite, isDishFavorite } = useProfile()
  const eta = useQuickEta()
  // One shared request per pincode; every card reads the same answer.
  const shopEstimate = useShopDeliveryEstimate({ enabled: !isQuick })
  const channel = isQuick ? "quick" : "shop"
  const id = String(product?._id || product?.id || "")
  const seller = product?.seller || {}
  const sellerId = String(seller._id || seller.id || product?.sellerId || "")
  const sellerName = seller.name || seller.sellerName || product?.sellerName || ""

  const variants = useMemo(
    () => (Array.isArray(product?.variants) ? product.variants.filter((v) => v?.isActive !== false) : []),
    [product],
  )

  const multiAttribute = useMemo(() => differsBeyondSize(variants), [variants])

  // One chip per size, in stock if any variant of that size is. Not offered
  // when variants also differ by colour etc.: the sheet lists every variant.
  const sizes = useMemo(() => {
    if (multiAttribute) return []
    const seen = new Map()
    for (const v of variants) {
      const size = sizeOf(v)
      if (!size) continue
      const ok = channelAvailability(product, channel, v).inStock
      if (!seen.has(size) || (ok && !seen.get(size).ok)) seen.set(size, { size, variant: v, ok })
    }
    return [...seen.values()]
  }, [variants, product, channel, multiAttribute])

  const [size, setSize] = useState("")
  const [imageLoaded, setImageLoaded] = useState(false)
  const [sheetOpen, setSheetOpen] = useState(false)
  // `size` holds the picked size, or the picked variant's id for a product
  // whose variants differ beyond size.
  const chosen = multiAttribute
    ? (() => {
        const v = variants.find((x) => String(x._id || x.id || "") === size)
        return v ? { size, variant: v } : undefined
      })()
    : sizes.find((s) => s.size === size)
  const variant = chosen?.variant || (variants.length === 1 ? variants[0] : null)

  const price = Number(variant?.price ?? product?.displayPrice ?? product?.price ?? 0)
  // Before a size is picked, show the MRP of the size the price comes from: many
  // products keep the MRP on their sizes only, and the card lost its strike-through.
  const priceVariant = variant || variants.find((v) => Number(v?.price) === price) || variants[0]
  const mrp = Number(variant?.mrp) || Number(product?.mrp) || Number(priceVariant?.mrp) || 0
  const off = percentOff(price, mrp)
  const rating = Number(product?.rating) > 0 ? Number(product.rating) : null
  const ratingCount = Number(product?.ratingCount ?? product?.totalRatings) || 0
  // Before a size is picked, the card is in stock if any size is.
  const stock =
    variants.length > 1 && !variant
      ? (() => {
          const any = variants.map((v) => channelAvailability(product, channel, v))
          return { enabled: any.some((a) => a.enabled), inStock: any.some((a) => a.inStock) }
        })()
      : channelAvailability(product, channel, variant)
  const image = mediaUrl(product?.image || (Array.isArray(product?.images) ? product.images[0] : ""))

  const variantId = variant?._id ? String(variant._id) : ""
  const line = getCartItem(id, variantId)
  const qty = Number(line?.quantity) || 0

  const liked = isDishFavorite(id, sellerId)
  const toggleLike = (e) => {
    e.preventDefault()
    e.stopPropagation()
    if (liked) {
      removeDishFavorite(id, sellerId)
      toast("Removed from wishlist")
    } else {
      addDishFavorite({
        id,
        sellerId,
        name: product?.name,
        image,
        price,
        mrp,
        sellerName,
        mode: channel,
      })
      toast.success("Saved to wishlist")
    }
  }

  // Adds the product, in `v` when it has sizes.
  const addVariant = (v) => {
    if (!channelAvailability(product, channel, v).inStock) {
      toast.error("Out of Stock")
      return
    }
    const linePrice = Number(v?.price ?? product?.displayPrice ?? product?.price ?? 0)
    const result = addToCart({
      id,
      itemId: id,
      productId: id,
      name: product?.name,
      price: linePrice,
      variantId: v?._id ? String(v._id) : null,
      variantName: v?.name || "",
      variantPrice: linePrice,
      otherPrice: Number(v?.mrp) || mrp,
      image,
      seller: sellerName || "Store",
      sellerName: sellerName || "Store",
      sellerId,
      channels: product?.channels,
    })
    if (result?.ok === false) {
      if (!result.needsConfirmation) toast.error(result.error || "Could not add this item")
      return
    }
    const label = v ? (multiAttribute ? variantLabel(v) : sizeOf(v)) : ""
    if (v && multiAttribute) setSize(String(v._id || v.id || ""))
    else if (label) setSize(label)
    toast.success(`Added ${product?.name}${label ? ` (${label})` : ""}`)
  }

  // A product with sizes asks which one first, in a sheet, unless a size was
  // already picked (added) from this tile.
  const sheetOptions = sizes.length
    ? sizes.map((s) => ({ key: s.size, label: s.size, ok: s.ok, variant: s.variant }))
    : variants.map((v) => ({ key: String(v._id || v.name), label: variantLabel(v), ok: channelAvailability(product, channel, v).inStock, variant: v }))

  const add = (e) => {
    e.preventDefault()
    e.stopPropagation()
    if (variants.length > 0 && !chosen) {
      setSheetOpen(true)
      return
    }
    addVariant(variant)
  }

  const step = (by) => (e) => {
    e.preventDefault()
    e.stopPropagation()
    updateQuantity(buildCartLineId(id, variantId), qty + by)
  }

  // Quick: the zone's ETA. Shop: the courier window for this pincode.
  const minDays = Number(shopEstimate?.minDays)
  const maxDays = Number(shopEstimate?.maxDays)
  const deliveryChip = isQuick
    ? `${eta} min`
    : Number.isFinite(minDays) && Number.isFinite(maxDays) && maxDays > 0
      ? `${minDays}-${maxDays} days`
      : "2-4 days"

  const brand = typeof product?.brand === "string" ? product.brand.trim() : String(product?.brand?.name || "").trim()
  const byline = brand || sellerName
  // "Sizes: S · M · L" under the price, as the app shows it.
  const sizeNames = sizes.length
    ? sizes.map((s) => s.size)
    : [
        ...new Set(
          variants
            .map((v) => attrPairs(v).find(([name]) => /^size$/i.test(name))?.[1])
            .filter(Boolean)
            .map(String),
        ),
      ]
  const countLabel = ratingCount >= 1000 ? `${(ratingCount / 1000).toFixed(1)}K` : String(ratingCount)
  const soldOut = !stock.enabled || !stock.inStock

  return (
    <article className="flex h-full flex-col overflow-hidden rounded-[14px] bg-white p-[5px] font-app shadow-[0_2px_8px_rgba(25,20,17,0.08)]">
      <Link
        to={storePath(`/product/${id}`)}
        className={`relative block aspect-[4/5] overflow-hidden rounded-[10px] bg-app-alt ${isRealImage(image) && !imageLoaded ? "animate-pulse" : ""}`}
      >
        {isRealImage(image) ? (
          // Shimmers until the photo arrives, then fades it in, so a slow photo never reads as a blank card.
          <img
            src={image}
            alt={product?.name || ""}
            loading="lazy"
            onLoad={() => setImageLoaded(true)}
            onError={() => setImageLoaded(true)}
            className={`h-full w-full object-cover transition-[opacity,transform] duration-500 hover:scale-105 ${imageLoaded ? "opacity-100" : "opacity-0"}`}
          />
        ) : (
          <ImagePlaceholder name={product?.name} />
        )}
        {off > 0 ? (
          <span className="absolute left-0 top-0 rounded-br-[10px] bg-app-brown px-2 py-[3px] text-[10px] font-semibold leading-tight text-white">
            {off}% OFF
          </span>
        ) : null}
        <button
          type="button"
          onClick={toggleLike}
          aria-label={liked ? "Remove from wishlist" : "Save to wishlist"}
          aria-pressed={liked}
          className="absolute right-1.5 top-1.5 flex h-[30px] w-[30px] items-center justify-center rounded-full bg-white shadow-[0_1px_3px_rgba(25,20,17,0.12)] active:scale-90"
        >
          <Heart className={`h-[17px] w-[17px] ${liked ? "fill-[#D32F2F] text-[#D32F2F]" : "text-app-muted"}`} aria-hidden="true" />
        </button>
        <span className="absolute bottom-1.5 left-1.5 flex items-center gap-0.5 rounded-xl bg-white/[0.94] px-[7px] py-[3px] text-[10.5px] font-semibold leading-tight text-app-ink">
          {isQuick ? (
            <Zap className="h-[13px] w-[13px] fill-app-brown text-app-brown" aria-hidden="true" />
          ) : (
            <Truck className="h-[13px] w-[13px] text-app-brown" aria-hidden="true" />
          )}
          {deliveryChip}
        </span>
        {rating && ratingCount ? (
          <span className="absolute bottom-1.5 right-1.5 flex items-center rounded-md bg-white/[0.92] px-1.5 py-[3px] text-[11px] leading-tight text-app-ink">
            <span className="font-bold">{rating.toFixed(1)}</span>
            <Star className="mx-[3px] h-3 w-3 fill-app-ok text-app-ok" aria-hidden="true" />
            <span className="text-app-muted">| {countLabel}</span>
          </span>
        ) : null}
        {!stock.inStock ? (
          <span className="absolute inset-0 flex items-center justify-center bg-white/60 text-[12px] font-bold text-app-ink">
            Out of Stock
          </span>
        ) : null}
      </Link>

      <div className="flex flex-1 flex-col px-1 pb-0.5 pt-1.5">
        {byline ? <p className="line-clamp-1 text-[13px] font-bold leading-[18px] text-app-ink">{byline}</p> : null}
        <Link to={storePath(`/product/${id}`)} className="line-clamp-2 h-[30px] text-[11.5px] leading-[15px] text-app-muted">
          {product?.name}
        </Link>
        <p className="mt-1 flex flex-wrap items-baseline gap-x-[5px]">
          <span className="text-[13.5px] font-bold text-app-ink">₹{price.toLocaleString("en-IN")}</span>
          {mrp > price ? <span className="text-[10.5px] text-app-muted line-through">₹{mrp.toLocaleString("en-IN")}</span> : null}
          {off > 0 ? <span className="text-[11.5px] font-bold text-app-brown">{off}% OFF</span> : null}
        </p>
        {showSizes && sizeNames.length > 1 ? (
          <p className="mt-0.5 line-clamp-1 text-[10.5px] text-app-muted">Sizes: {sizeNames.join(" · ")}</p>
        ) : null}

        <div className="mt-auto pt-2">
          {qty > 0 ? (
            <div className="flex h-[38px] items-center justify-between rounded-[10px] bg-app-brown text-white">
              <button
                type="button"
                onClick={step(-1)}
                aria-label="One fewer"
                className="mx-1 flex h-[30px] w-[30px] items-center justify-center rounded-full bg-white/[0.18] active:bg-white/30"
              >
                <Minus className="h-[18px] w-[18px]" aria-hidden="true" />
              </button>
              <span key={qty} className="wh-pop text-[15px] font-extrabold">
                {qty}
              </span>
              <button
                type="button"
                onClick={step(1)}
                aria-label="One more"
                className="mx-1 flex h-[30px] w-[30px] items-center justify-center rounded-full bg-white/[0.18] active:bg-white/30"
              >
                <Plus className="h-[18px] w-[18px]" aria-hidden="true" />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={add}
              disabled={soldOut}
              className="flex h-[38px] w-full items-center justify-center gap-1.5 whitespace-nowrap rounded-[10px] border-[1.5px] border-app-brown px-1.5 text-[12.5px] font-bold text-app-brown transition active:scale-[0.98] active:bg-app-tint disabled:cursor-not-allowed disabled:border-app-alt disabled:bg-app-alt disabled:text-[#BDB5AE] disabled:active:scale-100"
            >
              <ShoppingCart className="h-[17px] w-[17px] shrink-0" aria-hidden="true" />
              {soldOut ? "Out of Stock" : "Add to Cart"}
            </button>
          )}
        </div>
      </div>

      {sheetOpen ? (
        <SizeSheet
          title={product?.name}
          optionName={sizes.length ? "size" : "option"}
          price={price}
          options={sheetOptions}
          selected={size}
          onClose={() => setSheetOpen(false)}
          onPick={(o) => {
            setSheetOpen(false)
            addVariant(o.variant)
          }}
        />
      ) : null}
    </article>
  )
}
