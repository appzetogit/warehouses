import { useEffect, useRef, useState } from "react"
import { Link, useLocation, useNavigate } from "react-router-dom"
import { ChevronDown, MapPin, Menu, Search, ShoppingCart, X, ChevronRight } from "lucide-react"
import { useDeliveryLocation } from "@store/context/DeliveryLocationContext"
import { useCart } from "@store/context/CartContext"
import { useStoreMode } from "@store/context/StoreModeContext"
import { useProfile } from "@store/context/ProfileContext"
import { clearHomeScrollState } from "@store/utils/homeScrollRestore"
import { BRAND_LOGO_ON_DARK } from "@/config/brandMark"
import { useLocationSelector } from "../UserLayout"
import { useBusinessSettings, usePublicCategories } from "./useDesktopShell"
import { locationPincode, useQuickEta } from "./useDeliveryEstimates"

// The orange category bar carries dark text (white on orange is unreadable).
const catItem =
  "rounded-[2px] border border-transparent px-2 hover:border-wh-text focus-visible:border-wh-text focus-visible:outline-2 focus-visible:outline-wh-nav text-wh-text"

// Hovered/focused items on the dark bars get a 1px white outline.
const navItem =
  "rounded-[2px] border border-transparent px-2 hover:border-white focus-visible:border-white focus-visible:outline-2 focus-visible:outline-wh-brand text-white"

const isSignedIn = () => {
  try {
    return localStorage.getItem("user_authenticated") === "true" || !!localStorage.getItem("user_accessToken")
  } catch {
    return false
  }
}

function AccountMenu({ firstName, signedIn, storePath }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  const closeTimer = useRef(null)
  const show = () => {
    clearTimeout(closeTimer.current)
    setOpen(true)
  }
  const hide = () => {
    closeTimer.current = setTimeout(() => setOpen(false), 120)
  }
  useEffect(() => () => clearTimeout(closeTimer.current), [])

  const items = signedIn
    ? [
        ["Your profile", "/profile"],
        ["Your orders", "/orders"],
        ["Coins", "/coins"],
        ["Wallet", "/wallet"],
        ["Wishlist", "/profile/favorites"],
        ["Sign out", "/profile/logout"],
      ]
    : [["Sign in", "/auth/login"]]

  return (
    <div
      ref={ref}
      className="relative h-full"
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={(e) => {
        if (!ref.current?.contains(e.relatedTarget)) setOpen(false)
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape") setOpen(false)
      }}
    >
      <Link
        to={signedIn ? "/profile" : "/auth/login"}
        aria-haspopup="menu"
        aria-expanded={open}
        className={`${navItem} flex h-full flex-col justify-center leading-tight`}
      >
        <span className="text-[12px]">Hello, {signedIn ? firstName || "there" : "sign in"}</span>
        <span className="flex items-center gap-0.5 text-[14px] font-bold">
          Account &amp; Lists <ChevronDown className="h-3 w-3" aria-hidden />
        </span>
      </Link>
      {open ? (
        <div role="menu" className="absolute right-0 top-full z-50 w-56 rounded-[8px] border border-wh-border bg-wh-surface p-2 text-wh-text shadow-xl">
          {!signedIn ? (
            <p className="px-3 pb-2 pt-1 text-[12px] text-wh-muted">Sign in to see orders, coins and your wallet.</p>
          ) : null}
          {items.map(([label, to]) => (
            <Link
              key={to}
              role="menuitem"
              to={to}
              onClick={() => setOpen(false)}
              className="block rounded-[4px] px-3 py-1.5 text-[13px] hover:bg-[#F3F3F3] hover:text-wh-link-hover hover:underline"
            >
              {label}
            </Link>
          ))}
          <div className="my-1 border-t border-wh-border" />
          <Link role="menuitem" to={storePath("/cart")} onClick={() => setOpen(false)} className="block rounded-[4px] px-3 py-1.5 text-[13px] hover:bg-[#F3F3F3]">
            Your cart
          </Link>
        </div>
      ) : null}
    </div>
  )
}

function CategoryDrawer({ open, onClose, tree, storePath, brandName }) {
  const panelRef = useRef(null)
  const [expanded, setExpanded] = useState(null)
  useEffect(() => {
    if (!open) return undefined
    const prev = document.activeElement
    panelRef.current?.querySelector("button, a")?.focus()
    const onKey = (e) => {
      if (e.key === "Escape") onClose()
    }
    document.addEventListener("keydown", onKey)
    const overflow = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      document.removeEventListener("keydown", onKey)
      document.body.style.overflow = overflow
      prev?.focus?.()
    }
  }, [open, onClose])
  if (!open) return null
  return (
    <div className="fixed inset-0 z-[60]" role="dialog" aria-modal="true" aria-label="All categories">
      <button type="button" aria-label="Close categories" onClick={onClose} className="absolute inset-0 h-full w-full cursor-default bg-black/70" />
      <div ref={panelRef} className="absolute left-0 top-0 flex h-full w-[365px] flex-col bg-wh-surface text-wh-text shadow-2xl">
        <div className="flex h-[50px] items-center bg-wh-nav-2 px-8 text-[19px] font-bold text-white">Hello, shop {brandName}</div>
        <button type="button" onClick={onClose} aria-label="Close" className="absolute left-[372px] top-3 text-white">
          <X className="h-7 w-7" aria-hidden />
        </button>
        <nav className="flex-1 overflow-y-auto py-2">
          <h2 className="px-8 pb-1 pt-3 text-[18px] font-bold">Shop by category</h2>
          <ul>
            {tree.map((c) => (
              <li key={c.id}>
                <div className="flex items-center">
                  <Link
                    to={storePath(`/category/${c.slug}`)}
                    onClick={onClose}
                    className="flex-1 px-8 py-3 text-[14px] hover:bg-[#EAEDED]"
                  >
                    {c.name}
                  </Link>
                  {c.children.length ? (
                    <button
                      type="button"
                      aria-expanded={expanded === c.id}
                      aria-label={`Show ${c.name} subcategories`}
                      onClick={() => setExpanded((v) => (v === c.id ? null : c.id))}
                      className="px-4 py-3 text-wh-muted hover:bg-[#EAEDED]"
                    >
                      <ChevronRight className={`h-4 w-4 transition-transform ${expanded === c.id ? "rotate-90" : ""}`} aria-hidden />
                    </button>
                  ) : null}
                </div>
                {expanded === c.id ? (
                  <ul className="bg-[#F7F8F8]">
                    {c.children.map((s) => (
                      <li key={s.id}>
                        <Link to={storePath(`/category/${s.slug}`)} onClick={onClose} className="block px-12 py-2 text-[13px] hover:bg-[#EAEDED]">
                          {s.name}
                        </Link>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </li>
            ))}
            {!tree.length ? <li className="px-8 py-3 text-wh-muted">No categories yet.</li> : null}
          </ul>
          <div className="mt-2 border-t border-wh-border pt-2">
            <Link to={storePath("/categories")} onClick={onClose} className="block px-8 py-3 text-[14px] hover:bg-[#EAEDED]">
              See all categories
            </Link>
            <Link to="/help" onClick={onClose} className="block px-8 py-3 text-[14px] hover:bg-[#EAEDED]">
              Help
            </Link>
          </div>
        </nav>
      </div>
    </div>
  )
}

/**
 * Desktop (lg+) storefront header: top bar + category bar, sticky.
 * Props: onOpenSpin() opens the existing Spin & Win modal.
 */
export default function DesktopHeader({ onOpenSpin }) {
  const navigate = useNavigate()
  const location = useLocation()
  const { isQuick, storePath } = useStoreMode()
  const { effectiveLocation, displayAddressText, zoneId, setCommerceMode } = useDeliveryLocation()
  const { getCartCount } = useCart()
  const { userProfile } = useProfile()
  const { openLocationSelector } = useLocationSelector()
  const { brandName, logoOnDark } = useBusinessSettings()
  const { roots, tree } = usePublicCategories(zoneId)
  const quickEta = useQuickEta()
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [q, setQ] = useState("")
  const [cat, setCat] = useState("")
  const [logoSrc, setLogoSrc] = useState(logoOnDark)
  useEffect(() => setLogoSrc(logoOnDark), [logoOnDark])

  // Keep the box in sync with the search page's ?q=.
  useEffect(() => {
    if (location.pathname.endsWith("/search")) {
      const params = new URLSearchParams(location.search)
      setQ(params.get("q") || "")
      setCat(params.get("cat") || "")
    }
  }, [location.pathname, location.search])

  const signedIn = isSignedIn()
  const firstName = String(userProfile?.name || userProfile?.fullName || "").trim().split(/\s+/)[0]
  const cartCount = getCartCount()
  const area = effectiveLocation?.area?.trim() || effectiveLocation?.city || ""
  const pin = locationPincode(effectiveLocation)
  const deliverLine2 = [area || displayAddressText || "Select location", pin].filter(Boolean).join(" ")

  const submitSearch = (e) => {
    e.preventDefault()
    const term = q.trim()
    if (!term && cat) {
      const c = roots.find((r) => r.id === cat)
      if (c) return navigate(storePath(`/category/${c.slug}`))
    }
    if (!term) return undefined
    const params = new URLSearchParams({ q: term })
    if (cat) params.set("cat", cat)
    navigate(`${storePath("/search")}?${params.toString()}`)
    return undefined
  }

  const topCats = roots.slice(0, 6)

  return (
    <header className="wh-desktop sticky top-0 z-50 hidden lg:block">
      {/* Top bar */}
      <div className="bg-wh-nav">
        <div className="mx-auto flex h-[60px] max-w-[1500px] items-stretch gap-1 px-[20px] py-[5px]">
          <Link
            to={storePath("/")}
            onClick={() => clearHomeScrollState()}
            className={`${navItem} flex shrink-0 items-center`}
            aria-label={`${brandName} home`}
          >
            <img
              src={logoSrc}
              alt={brandName}
              className="h-[40px] w-auto max-w-[140px] object-contain"
              onError={() => logoSrc !== BRAND_LOGO_ON_DARK && setLogoSrc(BRAND_LOGO_ON_DARK)}
            />
          </Link>

          <button type="button" onClick={openLocationSelector} className={`${navItem} flex shrink-0 items-end gap-1 pb-1 text-left`}>
            <MapPin className="mb-0.5 h-4 w-4" aria-hidden />
            <span className="flex flex-col leading-tight">
              <span className="text-[12px] text-[#CCCCCC]">Deliver to {firstName || "you"}</span>
              <span className="max-w-[150px] truncate text-[14px] font-bold">{deliverLine2}</span>
            </span>
          </button>

          <form role="search" onSubmit={submitSearch} className="mx-2 flex min-w-0 flex-1 items-center">
            <div className="flex h-[40px] w-full overflow-hidden rounded-[8px] focus-within:outline-3 focus-within:outline-wh-brand">
              <label className="sr-only" htmlFor="wh-search-cat">Search in</label>
              <select
                id="wh-search-cat"
                value={cat}
                onChange={(e) => setCat(e.target.value)}
                className="max-w-[160px] shrink-0 border-r border-wh-border bg-[#E6E6E6] px-2 text-[12px] text-[#555] hover:bg-[#D4D4D4] focus:outline-none"
              >
                <option value="">All</option>
                {roots.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
              <label className="sr-only" htmlFor="wh-search-q">Search {brandName}</label>
              <input
                id="wh-search-q"
                type="search"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder={`Search ${brandName}`}
                autoComplete="off"
                className="min-w-0 flex-1 bg-white px-3 text-[15px] text-wh-text placeholder:text-[#6F7373] focus:outline-none"
              />
              <button type="submit" aria-label="Search" className="flex w-[45px] shrink-0 items-center justify-center bg-wh-brand hover:bg-wh-brand-600">
                <Search className="h-5 w-5 text-wh-text" aria-hidden />
              </button>
            </div>
          </form>

          <div role="group" aria-label="Choose store" className="flex shrink-0 items-center">
            <div className="flex rounded-full bg-wh-nav-2 p-0.5">
              <button
                type="button"
                aria-pressed={!isQuick}
                onClick={() => setCommerceMode("standard")}
                className={`rounded-full px-3 py-1 text-[13px] font-bold ${!isQuick ? "bg-wh-brand text-wh-text" : "text-white hover:bg-wh-nav-3"}`}
              >
                Shop
              </button>
              <button
                type="button"
                aria-pressed={isQuick}
                onClick={() => setCommerceMode("quick")}
                className={`rounded-full px-3 py-1 text-[13px] font-bold ${isQuick ? "bg-wh-brand text-wh-text" : "text-white hover:bg-wh-nav-3"}`}
              >
                Quick · {quickEta} min
              </button>
            </div>
          </div>

          <AccountMenu firstName={firstName} signedIn={signedIn} storePath={storePath} />

          <Link to="/orders" className={`${navItem} flex shrink-0 flex-col justify-center leading-tight`}>
            <span className="text-[12px]">Returns</span>
            <span className="text-[14px] font-bold">&amp; Orders</span>
          </Link>

          <Link
            to={storePath("/cart")}
            aria-label={`Cart, ${cartCount} item${cartCount === 1 ? "" : "s"}`}
            className={`${navItem} relative flex shrink-0 items-end gap-1 pb-1`}
          >
            <span className="relative">
              <ShoppingCart className="h-8 w-8" aria-hidden />
              <span className="absolute -top-1 left-1/2 min-w-[20px] -translate-x-1/2 rounded-full bg-wh-brand px-1 text-center text-[13px] font-bold leading-5 text-wh-text">
                {cartCount > 99 ? "99+" : cartCount}
              </span>
            </span>
            <span className="text-[14px] font-bold">Cart</span>
          </Link>
        </div>
      </div>

      {/* Category bar */}
      <nav aria-label="Categories" className="bg-wh-brand">
        <div className="mx-auto flex h-[39px] max-w-[1500px] items-center gap-1 overflow-hidden px-[20px] text-[14px]">
          <button type="button" onClick={() => setDrawerOpen(true)} className={`${catItem} flex h-[31px] items-center gap-1 font-bold`}>
            <Menu className="h-5 w-5" aria-hidden /> All
          </button>
          {topCats.map((c) => (
            <Link key={c.id} to={storePath(`/category/${c.slug}`)} className={`${catItem} flex h-[31px] items-center whitespace-nowrap`}>
              {c.name}
            </Link>
          ))}
          <Link to="/offers" className={`${catItem} flex h-[31px] items-center whitespace-nowrap`}>Today&apos;s Deals</Link>
          <Link to="/coins" className={`${catItem} flex h-[31px] items-center whitespace-nowrap`}>Coins</Link>
          {onOpenSpin ? (
            <button type="button" onClick={onOpenSpin} className={`${catItem} flex h-[31px] items-center whitespace-nowrap`}>Spin &amp; Win</button>
          ) : null}
          <Link to="/seller/signup" className={`${catItem} flex h-[31px] items-center whitespace-nowrap`}>Sell on {brandName}</Link>
          <Link to="/help" className={`${catItem} flex h-[31px] items-center whitespace-nowrap`}>Help</Link>
        </div>
      </nav>

      <CategoryDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} tree={tree} storePath={storePath} brandName={brandName} />
    </header>
  )
}
