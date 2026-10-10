/**
 * Desktop storefront helpers shared by the listing tiles and the Quick UI:
 * resolving media URLs and adding a product to the current store's cart.
 * Kept in its own module so quick/* and ListingDesktop don't import each other.
 */
import { useNavigate } from "react-router-dom"
import { toast } from "sonner"
import { useCart } from "@store/context/CartContext"
import { useStoreMode } from "@store/context/StoreModeContext"
import { API_BASE_URL } from "@store/api/config"

const BACKEND_ORIGIN = API_BASE_URL.replace(/\/api(\/v\d+)?\/?$/, "")

/** Absolute URL for an image field that may be a bare /uploads path. */
export function mediaUrl(value) {
  const url = typeof value === "string" ? value : value?.url
  if (typeof url !== "string" || !url.trim()) return ""
  const t = url.trim()
  if (/^(https?:)?\/\//i.test(t) || /^(data|blob):/i.test(t)) return t
  return `${BACKEND_ORIGIN}${t.startsWith("/") ? "" : "/"}${t}`
}

const firstImage = (p) => mediaUrl(p?.imageUrl || p?.image || (Array.isArray(p?.images) ? p.images[0] : ""))

/**
 * Add a product without options straight to the cart; products with variants
 * open their page. Guests may fill a cart just as they can from a product
 * page — signing in is asked for at checkout.
 */
export function useDesktopAddToCart() {
  const { addToCart } = useCart()
  const { storePath } = useStoreMode()
  const navigate = useNavigate()
  // `variant`: the size/colour picked on the card. A product with options and
  // none picked opens its page instead.
  return (product, sellerOverride = null, variant = null) => {
    const id = product?._id || product?.id
    if (!id) return
    if (!variant && Array.isArray(product.variants) && product.variants.length > 0) {
      navigate(storePath(`/product/${id}`))
      return
    }
    const variantPrice = variant ? Number(variant.price) || (product.displayPrice ?? product.price) : null
    const rawSeller = sellerOverride || product.seller || {}
    const seller = typeof rawSeller === "string" ? { name: rawSeller } : rawSeller
    // A made-up name would make the Quick cart's seller check (names first)
    // see a different store, so fall back to the product's own seller name.
    const sellerName = seller.name || seller.sellerName || product.sellerName || product.storeName || "Store"
    const result = addToCart({
      id,
      itemId: id,
      productId: id,
      name: product.name,
      price: variant ? variantPrice : product.displayPrice ?? product.price,
      variantId: variant ? variant._id || variant.id || null : null,
      variantName: variant ? variant.name || "" : "",
      variantPrice: variant ? variantPrice : product.displayPrice ?? product.price,
      otherPrice: variant?.mrp ?? product.mrp,
      image: (variant && mediaUrl(variant.images?.[0])) || firstImage(product),
      seller: sellerName,
      sellerName,
      sellerId: seller._id || seller.id || product.sellerId,
      channels: product.channels,
    })
    if (result?.ok === false) {
      if (!result.needsConfirmation) toast.error(result.error || "Could not add this item to your cart")
      return
    }
    toast.success(variant?.name ? `Added ${product.name} (${variant.name}) to cart` : `Added ${product.name} to cart`)
  }
}
