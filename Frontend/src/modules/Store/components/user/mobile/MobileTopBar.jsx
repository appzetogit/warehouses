import { Link, useNavigate } from "react-router-dom"
import { ArrowLeft, Heart, Search, ShoppingBag } from "lucide-react"
import { useCart } from "@store/context/CartContext"
import { useStoreMode } from "@store/context/StoreModeContext"

/**
 * The top bar on inner pages of the mobile mockup (screens 2, 5, 6, 8, 9, 10):
 * back, a title with an optional count line, and small actions on the right.
 * Phones only; desktop keeps its header.
 *
 * `actions` picks from "search", "wishlist" and "cart", or pass `right` for
 * anything else.
 */
export default function MobileTopBar({ title, subtitle, actions = ["search", "wishlist"], right = null, onBack }) {
  const navigate = useNavigate()
  const { storePath } = useStoreMode()
  const { getCartCount } = useCart()
  const count = getCartCount()

  const back = () => {
    if (onBack) return onBack()
    if (window.history.length > 1) return navigate(-1)
    return navigate(storePath("/"))
  }

  // Cream and ink, as in the customer app (warehouse_user).
  const icon =
    "flex h-9 w-9 items-center justify-center rounded-full text-app-ink active:bg-app-sand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app-brown"

  return (
    <div className="sticky top-0 z-40 border-b border-app-line bg-app-cream/95 font-app text-app-ink backdrop-blur lg:hidden">
      <div className="flex h-14 items-center gap-1 px-2">
        <button type="button" onClick={back} aria-label="Back" className={icon}>
          <ArrowLeft className="h-5 w-5" aria-hidden="true" />
        </button>
        <div className="min-w-0 flex-1 px-1">
          <h1 className="truncate text-[16px] font-bold leading-tight text-app-ink">{title}</h1>
          {subtitle ? <p className="truncate text-[11px] text-app-muted">{subtitle}</p> : null}
        </div>
        {actions.includes("search") ? (
          <Link to={storePath("/search")} aria-label="Search" className={icon}>
            <Search className="h-5 w-5" aria-hidden="true" />
          </Link>
        ) : null}
        {actions.includes("wishlist") ? (
          <Link to={storePath("/wishlist")} aria-label="Wishlist" className={icon}>
            <Heart className="h-5 w-5" aria-hidden="true" />
          </Link>
        ) : null}
        {actions.includes("cart") ? (
          <Link to={storePath("/cart")} aria-label={`Cart, ${count} items`} className={`relative ${icon}`}>
            <ShoppingBag className="h-5 w-5" aria-hidden="true" />
            {count > 0 ? (
              <span key={count} className="wh-pop absolute right-0.5 top-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-app-brown-badge px-1 text-[10px] font-bold text-white">
                {count > 9 ? "9+" : count}
              </span>
            ) : null}
          </Link>
        ) : null}
        {right}
      </div>
    </div>
  )
}
