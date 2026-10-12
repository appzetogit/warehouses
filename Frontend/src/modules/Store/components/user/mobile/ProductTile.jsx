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
 * The product card from the mobile mockup (screens 1, 2, 3 and 9): image with a
 * delivery chip and a heart, name, "By <store>", rating, price against MRP,
 * size chips, and a full-width Add button that becomes a stepper.
 *
 * It adds real products only. A product with sizes needs one chosen first —
 * the chips pick it, and Add without a size highlights them instead of adding
 * the wrong one.
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

  // A product with sizes asks which one first, in a sheet, unless a size chip
  // on the tile was already picked.
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

  return (
    <article className="flex h-full flex-col overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-[0_1px_4px_rgba(0,0,0,0.05)]">
      <Link
        to={storePath(`/product/${id}`)}
        className={`relative block aspect-[4/5] overflow-hidden bg-[#F5F5F5] ${isRealImage(image) && !imageLoaded ? "animate-pulse" : ""}`}
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
        <button
          type="button"
          onClick={toggleLike}
          aria-label={liked ? "Remove from wishlist" : "Save to wishlist"}
          aria-pressed={liked}
          className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-full bg-white/95 shadow-sm active:scale-90"
        >
          <Heart className={`h-4 w-4 ${liked ? "fill-[#E4322B] text-[#E4322B]" : "text-gray-700"}`} aria-hidden="true" />
        </button>
        <span className="absolute bottom-2 left-2 flex items-center gap-1 rounded-md bg-[#FFC928] px-1.5 py-0.5 text-[10px] font-bold text-gray-900 shadow-sm">
          {isQuick ? <Zap className="h-3 w-3 fill-current" aria-hidden="true" /> : <Truck className="h-3 w-3" aria-hidden="true" />}
          {deliveryChip}
        </span>
        {!stock.inStock ? (
          <span className="absolute inset-0 flex items-center justify-center bg-white/60 text-[12px] font-bold text-gray-700">
            Out of Stock
          </span>
        ) : null}
      </Link>

      <div className="flex flex-1 flex-col gap-1 p-2.5">
        <Link to={storePath(`/product/${id}`)} className="line-clamp-1 text-[13px] font-semibold text-gray-900">
          {product?.name}
        </Link>
        {sellerName ? <p className="line-clamp-1 text-[11px] text-gray-500">By {sellerName}</p> : null}
        {rating ? (
          <p className="flex items-center gap-1 text-[11px] text-gray-600">
            <Star className="h-3 w-3 fill-[#1E9E48] text-[#1E9E48]" aria-hidden="true" />
            <span className="font-semibold text-gray-800">{rating.toFixed(1)}</span>
            {ratingCount ? <span>({ratingCount >= 1000 ? `${(ratingCount / 1000).toFixed(1)}k` : ratingCount})</span> : null}
          </p>
        ) : null}
        <p className="flex flex-wrap items-baseline gap-x-1.5">
          <span className="text-[15px] font-bold text-gray-900">₹{price.toLocaleString("en-IN")}</span>
          {mrp > price ? <span className="text-[11px] text-gray-400 line-through">₹{mrp.toLocaleString("en-IN")}</span> : null}
          {off > 0 ? <span className="text-[11px] font-bold text-[#1E9E48]">{off}% OFF</span> : null}
        </p>

        {showSizes && sizes.length > 1 ? (
          <div className="flex flex-wrap gap-1" role="radiogroup" aria-label="Size">
            {sizes.slice(0, 5).map((s) => (
              <button
                key={s.size}
                type="button"
                role="radio"
                aria-checked={size === s.size}
                disabled={!s.ok}
                onClick={() => setSize((cur) => (cur === s.size ? "" : s.size))}
                className={`min-w-[28px] rounded-md border px-1.5 py-0.5 text-[10px] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-35 disabled:line-through ${
                  size === s.size
                    ? "border-[#0D9488] bg-[#F0FDFA] text-[#0F766E]"
                    : "border-gray-200 text-gray-700"
                }`}
              >
                {s.size}
              </button>
            ))}
          </div>
        ) : null}

        <div className="mt-auto pt-1.5">
          {qty > 0 ? (
            <div className="flex h-9 items-center justify-between rounded-lg bg-[#0D9488] px-1 text-white">
              <button type="button" onClick={step(-1)} aria-label="One fewer" className="flex h-7 w-7 items-center justify-center rounded-md active:bg-black/10">
                <Minus className="h-4 w-4" aria-hidden="true" />
              </button>
              <span key={qty} className="wh-pop text-[14px] font-bold">
                {qty}
              </span>
              <button type="button" onClick={step(1)} aria-label="One more" className="flex h-7 w-7 items-center justify-center rounded-md active:bg-black/10">
                <Plus className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={add}
              disabled={!stock.enabled}
              className="flex h-9 w-full items-center justify-center gap-1.5 rounded-lg bg-[#0D9488] text-[13px] font-bold text-white shadow-sm transition active:scale-[0.98] disabled:bg-gray-300"
            >
              <ShoppingCart className="h-4 w-4" aria-hidden="true" /> Add
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
