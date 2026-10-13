import { useEffect, useRef, useState } from "react"
import { Link, useLocation } from "react-router-dom"
import { Home, LayoutGrid, Store, Package, User } from "lucide-react"
import { useCart } from "@store/context/CartContext"
import { useStoreMode } from "@store/context/StoreModeContext"

/**
 * The phone tab bar, styled after the customer app's (warehouse_user
 * app_shell.dart, _NavItem): cream bar, 24px icons, a bold label and a short
 * indicator under the active tab. It slides away while scrolling down and
 * comes back on scroll up or near the top.
 * Home | Categories | Stores | Orders | Account
 */

const SHOW_NEAR_TOP = 80 // px: always shown this close to the top
const MIN_DELTA = 6 // px of scroll before it reacts, so jitter does not flicker it

function useHideOnScrollDown() {
  const [hidden, setHidden] = useState(false)
  const lastY = useRef(0)

  useEffect(() => {
    lastY.current = window.scrollY
    const onScroll = () => {
      const y = window.scrollY
      const delta = y - lastY.current
      if (y < SHOW_NEAR_TOP) setHidden(false)
      else if (delta > MIN_DELTA) setHidden(true)
      else if (delta < -MIN_DELTA) setHidden(false)
      if (Math.abs(delta) > MIN_DELTA || y < SHOW_NEAR_TOP) lastY.current = y
    }
    window.addEventListener("scroll", onScroll, { passive: true })
    return () => window.removeEventListener("scroll", onScroll)
  }, [])

  return hidden
}

export default function BottomNav() {
  const { pathname } = useLocation()
  const { storePath } = useStoreMode()
  const { getCartCount } = useCart()
  const cartCount = getCartCount()
  const hidden = useHideOnScrollDown()

  const home = storePath("/")
  const isHome = (p) => p === home || p === "/" || p === "/quick" || p === "/shop"

  const account = {
    to: "/profile",
    label: "Account",
    icon: User,
    match: (p) => p.startsWith("/profile") || p.startsWith("/user/profile"),
  }

  // One tab bar for Shop and Quick; each tab stays inside the current store.
  const items = [
    { to: home, label: "Home", icon: Home, match: isHome },
    {
      to: storePath("/categories"),
      label: "Categories",
      icon: LayoutGrid,
      match: (p) => /\/(categories|category)/.test(p),
    },
    {
      to: storePath("/sellers"),
      label: "Stores",
      icon: Store,
      match: (p) => /\/(sellers|stores)/.test(p),
    },
    {
      to: "/orders",
      label: "Orders",
      icon: Package,
      match: (p) => p.startsWith("/orders"),
    },
    account,
  ]

  // Pages with their own pinned action bar (Add to Cart, checkout, an order's
  // Reorder | Invoice | Help) hide the tabs. The orders list and the "order
  // placed" page keep them.
  if (/\/product\/|\/cart(\/|$)|\/orders\/(?!placed\/)[^/]+/.test(pathname)) return null

  return (
    <nav
      aria-label="Main Navigation"
      className={`fixed inset-x-0 bottom-0 z-[90] border-t border-app-line bg-app-cream pb-[env(safe-area-inset-bottom)] font-app transition-transform duration-300 ease-in-out motion-reduce:transition-none md:hidden ${
        hidden ? "translate-y-full" : "translate-y-0"
      }`}
    >
      <ul className="mx-auto flex h-[68px] max-w-lg items-stretch">
        {items.map(({ to, label, icon: Icon, match }) => {
          const active = match(pathname)
          return (
            <li key={label} className="flex-1">
              <Link
                to={to}
                aria-current={active ? "page" : undefined}
                tabIndex={hidden ? -1 : undefined}
                className="flex h-full flex-col items-center justify-center rounded-lg focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-app-brown"
              >
                <span className="relative">
                  <Icon
                    className={`h-6 w-6 ${active ? "text-app-brown" : "text-app-muted"}`}
                    strokeWidth={active ? 2.1 : 1.7}
                    fill={active ? "currentColor" : "none"}
                    fillOpacity={active ? 0.18 : undefined}
                    aria-hidden="true"
                  />
                  {label === "Orders" && cartCount > 0 ? (
                    <span className="sr-only">({cartCount} items in cart)</span>
                  ) : null}
                </span>
                <span
                  className={`mt-[3px] truncate text-[10.5px] leading-tight ${
                    active ? "font-extrabold text-app-brown-ink" : "font-medium text-app-muted"
                  }`}
                >
                  {label}
                </span>
                <span
                  aria-hidden="true"
                  className={`mt-0.5 h-[3px] w-4 rounded-[2px] ${active ? "bg-app-brown-ink" : "bg-transparent"}`}
                />
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
