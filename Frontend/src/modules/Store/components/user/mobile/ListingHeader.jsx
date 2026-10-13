import { Link, useNavigate } from "react-router-dom"
import { ArrowLeft, Search, ShoppingBag } from "lucide-react"
import { useCart } from "@store/context/CartContext"
import { useStoreMode } from "@store/context/StoreModeContext"

/**
 * The listing header from the customer app (product_listing_screen.dart
 * _Header): back, a serif brown title with an optional muted line under it,
 * then search and the bag. Phones only.
 */
export default function ListingHeader({ title, subtitle = "" }) {
  const navigate = useNavigate()
  const { storePath } = useStoreMode()
  const { getCartCount } = useCart()
  const count = getCartCount()

  const back = () => (window.history.length > 1 ? navigate(-1) : navigate(storePath("/")))
  const icon =
    "relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-app-ink active:bg-app-sand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app-brown"

  return (
    <header className="sticky top-0 z-40 bg-app-cream/95 pt-[env(safe-area-inset-top)] font-app backdrop-blur lg:hidden">
      <div className="flex min-h-[60px] items-center gap-0.5 px-1.5 py-1.5">
        <button type="button" onClick={back} aria-label="Back" className={icon}>
          <ArrowLeft className="h-6 w-6" aria-hidden="true" />
        </button>
        <div className="min-w-0 flex-1 px-1">
          <h1 className="truncate font-app-display text-[26px] font-bold leading-[1.1] text-app-brown">{title}</h1>
          {subtitle ? <p className="truncate text-[12.5px] leading-tight text-app-muted">{subtitle}</p> : null}
        </div>
        <Link to={storePath("/search")} aria-label="Search" className={icon}>
          <Search className="h-6 w-6" aria-hidden="true" />
        </Link>
        <Link to={storePath("/cart")} aria-label={`Cart, ${count} item${count === 1 ? "" : "s"}`} className={icon}>
          <ShoppingBag className="h-6 w-6" aria-hidden="true" />
          {count > 0 ? (
            <span
              key={count}
              className="wh-pop absolute right-0.5 top-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-app-brown-badge px-1 text-[10px] font-bold text-white"
            >
              {count > 9 ? "9+" : count}
            </span>
          ) : null}
        </Link>
      </div>
    </header>
  )
}
