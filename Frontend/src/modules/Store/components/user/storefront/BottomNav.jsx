import { Link, useLocation } from "react-router-dom"
import { Home, LayoutGrid, RotateCcw, ShoppingCart, User } from "lucide-react"
import { useCart } from "@store/context/CartContext"
import { useStoreMode } from "@store/context/StoreModeContext"

/**
 * The phone's tab bar (MOBILE_UI_SPEC.md): Home, Shop, Cart and Account always
 * within thumb reach, so the header does not have to carry navigation on a
 * small screen. Hidden from `md` up, where the header has room for everything.
 */
export default function BottomNav() {
  const { pathname } = useLocation()
  const { storePath, isQuick } = useStoreMode()
  const { getCartCount } = useCart()
  const count = getCartCount()

  const home = storePath("/")
  const isHome = (p) => p === home || p === "/" || p === "/quick"
  const account = { to: "/profile", label: "Account", icon: User, match: (p) => p.startsWith("/profile") }

  // Quick follows the instant-delivery apps (QUICK_MOBILE_SPEC.md §1): no Cart
  // tab — the cart floats above the bar — and a way to buy the usual again.
  const items = isQuick
    ? [
        { to: home, label: "Home", icon: Home, match: isHome },
        { to: storePath("/order-again"), label: "Order Again", icon: RotateCcw, match: (p) => p.endsWith("/order-again") },
        { to: storePath("/categories"), label: "Categories", icon: LayoutGrid, match: (p) => /\/(categories|category)/.test(p) },
        account,
      ]
    : [
        { to: home, label: "Home", icon: Home, match: isHome },
        { to: storePath("/categories"), label: "Shop", icon: LayoutGrid, match: (p) => /\/(categories|category)/.test(p) },
        { to: storePath("/cart"), label: "Cart", icon: ShoppingCart, match: (p) => p.endsWith("/cart"), badge: count },
        account,
      ]

  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-[90] border-t border-white/10 bg-wh-nav pb-[env(safe-area-inset-bottom)] md:hidden"
    >
      <ul className="mx-auto flex h-[57px] max-w-lg items-stretch">
        {items.map(({ to, label, icon: Icon, match, badge }) => {
          const active = match(pathname)
          return (
            <li key={label} className="flex-1">
              <Link
                to={to}
                aria-current={active ? "page" : undefined}
                className={`flex h-full flex-col items-center justify-center gap-0.5 text-[11px] font-semibold transition-colors ${
                  active ? "text-wh-brand" : "text-white/70 hover:text-white"
                }`}
              >
                <span className="relative">
                  <Icon className="h-5 w-5" aria-hidden="true" />
                  {badge > 0 ? (
                    <span className="absolute -right-2 -top-1.5 min-w-[16px] rounded-full bg-wh-brand px-1 text-center text-[10px] font-black leading-4 text-wh-text">
                      {badge > 9 ? "9+" : badge}
                    </span>
                  ) : null}
                </span>
                {label}
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
