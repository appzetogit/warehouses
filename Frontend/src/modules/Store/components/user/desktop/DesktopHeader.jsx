import { useEffect, useMemo, useRef, useState } from "react"
import { Link, useLocation, useNavigate } from "react-router-dom"
import { ChevronDown, ChevronRight, Heart, MapPin, Menu, Search, ShoppingBag, User, X, Zap } from "lucide-react"
import { useDeliveryLocation } from "@store/context/DeliveryLocationContext"
import { useCart } from "@store/context/CartContext"
import { useStoreMode } from "@store/context/StoreModeContext"
import { useProfile } from "@store/context/ProfileContext"
import { clearHomeScrollState } from "@store/utils/homeScrollRestore"
import { useLocationSelector } from "../UserLayout"
import RotatingSearchHint from "../mobile/RotatingSearchHint"
import { useBusinessSettings, usePublicCategories } from "./useDesktopShell"
import { locationPincode } from "./useDeliveryEstimates"
import { useQuickCartPanel } from "./quick/QuickCartPanel"
import SearchSuggestions, { useSearchSuggestions, useSuggestionKeyboard } from "./SearchSuggestions"

/**
 * Desktop (lg+) storefront header in the customer app's look (the phone's
 * MobileHeader, laid out wide): a cream band (#F1E4D6 → #F8F1EA) with ink
 * text — logo, "Deliver to", a white rounded search pill with the category
 * picker and a rotating hint, the dark Shop/Quick pill offering the other
 * store, account, orders, wishlist and bag — then a white category bar whose
 * current category carries a brown underline.
 */

// The light-background logo (the footer uses it too); the business logo is
// uploaded for dark backgrounds, so it is not used on the cream band.
const BRAND_LOGO_ON_LIGHT = "/brand/logo-on-light.png"

// Soft circles behind the band, as on the phone (_TopBackdrop).
const BACKDROP_CIRCLES = [
  { top: -60, right: 120, size: 200, color: "rgba(239,229,218,0.6)" },
  { top: -40, right: -30, size: 150, color: "rgba(230,218,207,0.45)" },
  { top: -50, left: -40, size: 170, color: "rgba(243,231,219,0.55)" },
  { top: 20, left: "38%", size: 120, color: "rgba(236,224,211,0.35)" },
]

const focusRing = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app-brown"

// An item on the cream band: ink text, a faint pill on hover.
const navItem = `rounded-xl px-2.5 py-1 text-app-ink transition-colors hover:bg-black/[0.045] ${focusRing}`

const isSignedIn = () => {
  try {
    return localStorage.getItem("user_authenticated") === "true" || !!localStorage.getItem("user_accessToken")
  } catch {
    return false
  }
}

const countLabel = (n) => (n > 99 ? "99+" : String(n))

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
        ["Your Profile", "/profile"],
        ["Your Orders", "/orders"],
        ["Coins", "/coins"],
        ["Wallet", "/wallet"],
        ["Wishlist", "/profile/favorites"],
        ["Sign Out", "/profile/logout"],
      ]
    : [["Sign in", "/auth/login"]]

  const menuItem = "block rounded-lg px-3 py-2 text-[13px] text-app-ink transition-colors hover:bg-app-tint hover:text-app-brown"

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
        className={`${navItem} flex h-full items-center gap-2 leading-tight`}
      >
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white bg-white/70 shadow-[0_2px_4px_rgba(25,20,17,0.08)]">
          <User className="h-[18px] w-[18px]" strokeWidth={1.9} aria-hidden="true" />
        </span>
        <span className="hidden flex-col xl:flex">
          <span className="text-[11px] text-[#6E6862]">Hello, {signedIn ? firstName || "there" : "sign in"}</span>
          <span className="flex items-center gap-0.5 text-[13.5px] font-bold">
            Account <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
          </span>
        </span>
        <span className="sr-only xl:hidden">{signedIn ? "Your account" : "Sign in"}</span>
      </Link>
      {open ? (
        <div
          role="menu"
          className="absolute right-0 top-full z-50 mt-1 w-60 rounded-2xl border border-app-line bg-white p-2 text-app-ink shadow-[0_12px_32px_rgba(25,20,17,0.14)]"
        >
          <p className="px-3 pb-2 pt-1 text-[12px] text-app-muted">
            {signedIn ? `Hello, ${firstName || "there"}` : "Sign in to see orders, coins and your wallet."}
          </p>
          {items.map(([label, to]) => (
            <Link key={to} role="menuitem" to={to} onClick={() => setOpen(false)} className={menuItem}>
              {label}
            </Link>
          ))}
          <div className="my-1 border-t border-app-line" />
          <Link role="menuitem" to={storePath("/cart")} onClick={() => setOpen(false)} className={menuItem}>
            Your Bag
          </Link>
        </div>
      ) : null}
    </div>
  )
}

export function CategoryDrawer({ open, onClose, tree, storePath, brandName }) {
  const panelRef = useRef(null)
  const [expanded, setExpanded] = useState(null)
  const [shown, setShown] = useState(false)
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

  // Stay mounted for the closing slide, and start off-canvas on the opening one.
  useEffect(() => {
    if (!open) {
      setShown(false)
      return undefined
    }
    const id = requestAnimationFrame(() => setShown(true))
    return () => cancelAnimationFrame(id)
  }, [open])

  if (!open) return null

  const row = "hover:bg-app-tint hover:text-app-brown transition-colors"

  return (
    <div className="fixed inset-0 z-[60] font-app" role="dialog" aria-modal="true" aria-label="All categories">
      <button
        type="button"
        aria-label="Close categories"
        onClick={onClose}
        className={`absolute inset-0 h-full w-full cursor-default bg-black/50 transition-opacity duration-300 ${
          shown ? "opacity-100" : "opacity-0"
        }`}
      />
      <div
        ref={panelRef}
        className={`absolute left-0 top-0 flex h-full w-[86%] max-w-[365px] flex-col bg-white text-app-ink shadow-2xl transition-transform duration-300 ease-out ${
          shown ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        {/* The band carries the header's cream, so the drawer reads as part of it. */}
        <div className="flex h-[60px] items-center justify-between gap-2 border-b border-app-line bg-[linear-gradient(180deg,#F1E4D6_0%,#F8F1EA_100%)] px-5">
          <span className="truncate text-[16px] font-bold">Hello, shop {brandName}</span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className={`shrink-0 rounded-full p-1.5 hover:bg-black/[0.06] ${focusRing}`}
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>
        <nav className="flex-1 overflow-y-auto py-2">
          <h2 className="px-5 pb-1 pt-3 font-app-display text-[24px] font-bold text-app-brown">Shop by Category</h2>
          <ul>
            {tree.map((c) => (
              <li key={c.id}>
                <div className="flex items-center">
                  <Link
                    to={storePath(`/category/${c.slug}`)}
                    onClick={onClose}
                    className={`min-w-0 flex-1 truncate px-5 py-3 text-[14px] ${row}`}
                  >
                    {c.name}
                  </Link>
                  {c.children.length ? (
                    <button
                      type="button"
                      aria-expanded={expanded === c.id}
                      aria-label={`Show ${c.name} subcategories`}
                      onClick={() => setExpanded((v) => (v === c.id ? null : c.id))}
                      className={`px-4 py-3 text-app-muted ${row}`}
                    >
                      <ChevronRight className={`h-4 w-4 transition-transform ${expanded === c.id ? "rotate-90" : ""}`} aria-hidden="true" />
                    </button>
                  ) : null}
                </div>
                {expanded === c.id ? (
                  <ul className="bg-app-alt">
                    {c.children.map((s) => (
                      <li key={s.id}>
                        <Link
                          to={storePath(`/category/${s.slug}`)}
                          onClick={onClose}
                          className={`block truncate px-9 py-2 text-[13px] ${row}`}
                        >
                          {s.name}
                        </Link>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </li>
            ))}
            {!tree.length ? <li className="px-5 py-3 text-app-muted">No categories yet.</li> : null}
          </ul>
          <div className="mt-2 border-t border-app-line pt-2">
            <Link to={storePath("/categories")} onClick={onClose} className={`block px-5 py-3 text-[14px] ${row}`}>
              See All Categories
            </Link>
            <Link to="/help" onClick={onClose} className={`block px-5 py-3 text-[14px] ${row}`}>
              Help
            </Link>
          </div>
        </nav>
      </div>
    </div>
  )
}

/** A round header icon (wishlist, bag) with an optional brown count badge and label. */
function IconLink({ to, label, icon: Icon, badge = 0, caption, onClick, asButton = false, ...rest }) {
  const body = (
    <>
      <span className="relative flex h-9 w-9 items-center justify-center">
        <Icon className="h-[22px] w-[22px]" strokeWidth={1.8} aria-hidden="true" />
        {badge > 0 ? (
          <span
            key={badge}
            className="wh-pop absolute -right-0.5 top-0 flex h-[17px] min-w-[17px] items-center justify-center rounded-full bg-app-brown-badge px-1 text-[10px] font-bold leading-none text-white"
          >
            {countLabel(badge)}
          </span>
        ) : null}
      </span>
      {caption ? <span className="hidden text-[13.5px] font-bold xl:inline">{caption}</span> : null}
    </>
  )
  const className = `${navItem} relative flex shrink-0 items-center gap-1 px-1.5`
  return asButton ? (
    <button type="button" onClick={onClick} aria-label={label} className={className} {...rest}>
      {body}
    </button>
  ) : (
    <Link to={to} aria-label={label} className={className} {...rest}>
      {body}
    </Link>
  )
}

/**
 * Desktop (lg+) storefront header: the cream band + category bar, sticky.
 * Props: onOpenSpin() opens the existing Spin & Win modal.
 */
export default function DesktopHeader({ onOpenSpin, desktopOnly = false }) {
  const navigate = useNavigate()
  const location = useLocation()
  const { isQuick, storePath, fulfilmentMode } = useStoreMode()
  const { effectiveLocation, displayAddressText, zoneId, setCommerceMode } = useDeliveryLocation()
  const { getCartCount } = useCart()
  const { userProfile } = useProfile()
  const { openLocationSelector } = useLocationSelector()
  const { brandName } = useBusinessSettings()
  const { categories, roots, tree } = usePublicCategories(zoneId)
  const quickCart = useQuickCartPanel()
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [q, setQ] = useState("")
  const [cat, setCat] = useState("")
  const [logoFailed, setLogoFailed] = useState(false)

  // Keep the box in sync with the search page's ?q=.
  useEffect(() => {
    if (location.pathname.endsWith("/search")) {
      const params = new URLSearchParams(location.search)
      setQ(params.get("q") || "")
      setCat(params.get("cat") || "")
    }
  }, [location.pathname, location.search])

  // The hint cycles through real subcategory names, as on the phone.
  const hintWords = useMemo(() => {
    const names = categories.filter((c) => c.parentId).map((c) => c.name.toLowerCase())
    return (names.length ? names : ["t-shirts", "jeans", "kurtas"]).slice(0, 8)
  }, [categories])

  const signedIn = isSignedIn()
  const firstName = String(userProfile?.name || userProfile?.fullName || "").trim().split(/\s+/)[0]
  const cartCount = getCartCount()
  const area = effectiveLocation?.area?.trim() || effectiveLocation?.city || ""
  const pin = locationPincode(effectiveLocation)
  const place = [area || displayAddressText || "", pin].filter(Boolean).join(" ")

  const goToSearch = (term) => {
    const params = new URLSearchParams({ q: term })
    if (cat) params.set("cat", cat)
    navigate(`${storePath("/search")}?${params.toString()}`)
  }

  const submitSearch = (e) => {
    e.preventDefault()
    const term = q.trim()
    if (!term && cat) {
      const c = roots.find((r) => r.id === cat)
      if (c) return navigate(storePath(`/category/${c.slug}`))
    }
    if (!term) return undefined
    goToSearch(term)
    return undefined
  }

  const suggestions = useSearchSuggestions({
    term: q,
    categories,
    fulfilmentMode,
    zoneId,
  })

  const pickSuggestion = (item) => {
    if (item.type === "product") {
      navigate(storePath(`/product/${item.id}`))
      return
    }
    if (item.type === "category") {
      setQ("")
      navigate(storePath(`/category/${item.slug}`))
      return
    }
    setQ(item.label)
    goToSearch(item.label)
  }

  const search = useSuggestionKeyboard({
    items: suggestions,
    onPick: pickSuggestion,
    onSubmit: submitSearch,
  })

  const topCats = roots.slice(0, 7)
  const currentPath = location.pathname.replace(/\/+$/, "")
  const isCurrent = (to) => {
    const [path, query = ""] = to.split("?")
    return currentPath === path.replace(/\/+$/, "") && (!query || location.search.replace(/^\?/, "") === query)
  }

  const cartLabel = `Bag, ${cartCount} item${cartCount === 1 ? "" : "s"}`

  // Category bar links: ink text, brown underline on hover and on the current page.
  const subnavLink = (on) =>
    `relative flex h-full items-center whitespace-nowrap px-3 text-[13.5px] transition-colors after:absolute after:inset-x-3 after:bottom-0 after:h-[2.5px] after:rounded-full after:bg-app-brown after:transition-opacity hover:text-app-brown hover:after:opacity-100 ${focusRing} ${
      on ? "font-semibold text-app-brown after:opacity-100" : "font-medium text-app-ink after:opacity-0"
    }`

  const extraLinks = [
    // Stays in the current store (Quick or Shop); /offers is Shop-only.
    { label: "Today's Deals", to: storePath("/search?minDiscount=10") },
    { label: "Coins", to: "/coins" },
    { label: "Spin & Win", to: "/spin", onClick: onOpenSpin },
    { label: `Sell on ${brandName}`, to: "/seller/signup" },
    { label: "Help", to: "/help" },
  ]

  return (
    // desktopOnly: on phones MobileHeader / QuickMobileHeader take over.
    <header className={`wh-desktop sticky top-0 z-50 font-app text-app-ink ${desktopOnly ? "hidden lg:block" : ""}`}>
      {/* The cream band */}
      <div className="relative bg-[linear-gradient(180deg,#F1E4D6_0%,#F8F1EA_100%)]">
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
          {BACKDROP_CIRCLES.map(({ size, color, ...pos }, i) => (
            <span key={i} className="absolute rounded-full" style={{ ...pos, width: size, height: size, backgroundColor: color }} />
          ))}
        </div>

        <div className="relative mx-auto flex h-[72px] max-w-[1400px] items-center gap-2 px-6 xl:gap-3">
          <Link
            to={storePath("/")}
            onClick={() => clearHomeScrollState()}
            className={`flex shrink-0 items-center rounded-lg ${focusRing}`}
            aria-label={`${brandName} home`}
          >
            {logoFailed ? (
              <span className="font-app-display text-[26px] font-bold text-app-brown">{brandName}</span>
            ) : (
              <img
                src={BRAND_LOGO_ON_LIGHT}
                alt={brandName}
                className="h-[50px] w-auto max-w-[150px] object-contain"
                onError={() => setLogoFailed(true)}
              />
            )}
          </Link>

          <button
            type="button"
            onClick={openLocationSelector}
            aria-label={`Deliver to ${place || "your location"}. Change delivery location`}
            className={`${navItem} flex min-w-0 max-w-[200px] shrink-0 items-center gap-1.5 text-left`}
          >
            <MapPin className="h-5 w-5 shrink-0" strokeWidth={2.2} aria-hidden="true" />
            <span className="flex min-w-0 flex-col leading-tight">
              <span className="text-[11px] text-[#6E6862]">Deliver to</span>
              <span className="flex items-center gap-0.5 text-[13.5px] font-bold">
                <span className="truncate">{place || "Set delivery location"}</span>
                <ChevronDown className="h-4 w-4 shrink-0" aria-hidden="true" />
              </span>
            </span>
          </button>

          <form role="search" onSubmit={search.submit} ref={search.boxRef} className="relative mx-1 min-w-0 flex-1 xl:mx-3">
            <div className="flex h-[44px] w-full items-center overflow-hidden rounded-full bg-white shadow-[0_2px_10px_rgba(0,0,0,0.05)] ring-1 ring-app-line/70 focus-within:ring-2 focus-within:ring-app-champagne">
              <label className="sr-only" htmlFor="wh-search-cat">
                Search in
              </label>
              <select
                id="wh-search-cat"
                value={cat}
                onChange={(e) => setCat(e.target.value)}
                className="h-full max-w-[150px] shrink-0 cursor-pointer border-r border-app-line bg-app-alt pl-4 pr-2 text-[12.5px] font-medium text-app-ink hover:bg-app-tint focus:outline-none focus-visible:bg-app-tint"
              >
                <option value="">All Categories</option>
                {roots.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              <Search className="ml-3 h-[19px] w-[19px] shrink-0 text-app-muted" aria-hidden="true" />
              <div className="relative h-full min-w-0 flex-1">
                <label className="sr-only" htmlFor="wh-search-q">
                  Search {brandName}
                </label>
                <input
                  id="wh-search-q"
                  type="search"
                  value={q}
                  onChange={(e) => {
                    setQ(e.target.value)
                    search.setOpen(true)
                  }}
                  onFocus={() => search.setOpen(true)}
                  onKeyDown={search.handleKeyDown}
                  autoComplete="off"
                  role="combobox"
                  aria-expanded={search.open && suggestions.length > 0}
                  aria-controls="wh-search-suggestions"
                  aria-autocomplete="list"
                  className="h-full w-full bg-transparent px-2.5 text-[14px] text-app-ink focus:outline-none"
                />
                {q ? null : (
                  <RotatingSearchHint
                    words={hintWords}
                    className="pointer-events-none absolute inset-x-2.5 top-1/2 -translate-y-1/2 [&_span]:text-[13.5px]!"
                  />
                )}
              </div>
              <button
                type="submit"
                aria-label="Search"
                className="mr-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-app-brown text-white transition-colors hover:bg-app-brown-deep focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-app-champagne"
              >
                <Search className="h-[18px] w-[18px]" aria-hidden="true" />
              </button>
            </div>
            {search.open && (
              <SearchSuggestions
                listId="wh-search-suggestions"
                items={suggestions}
                activeIndex={search.activeIndex}
                onPick={(item) => {
                  search.setOpen(false)
                  pickSuggestion(item)
                }}
                onHover={search.setActiveIndex}
              />
            )}
          </form>

          {/* Shop | Quick: two segments, the active store in brown. */}
          <div
            role="group"
            aria-label="Choose store"
            className="flex shrink-0 items-center rounded-full border border-app-line bg-white p-[3px] text-[12.5px] font-bold shadow-[0_1px_2px_rgba(0,0,0,0.06)]"
          >
            <button
              type="button"
              onClick={() => {
                if (isQuick) setCommerceMode("standard")
              }}
              aria-pressed={!isQuick}
              aria-label={isQuick ? "Switch to Shop" : "Shop (current store)"}
              className={`flex items-center rounded-full px-3.5 py-1.5 transition-colors ${
                !isQuick ? "bg-app-brown text-white" : "text-app-muted hover:bg-app-cream hover:text-app-brown"
              } ${focusRing}`}
            >
              Shop
            </button>
            <button
              type="button"
              onClick={() => {
                if (!isQuick) setCommerceMode("quick")
              }}
              aria-pressed={isQuick}
              aria-label={isQuick ? "Quick (current store)" : "Switch to Quick delivery"}
              className={`flex items-center gap-1 rounded-full px-3.5 py-1.5 transition-colors ${
                isQuick ? "bg-app-brown text-white" : "text-app-muted hover:bg-app-cream hover:text-app-brown"
              } ${focusRing}`}
            >
              <Zap className="h-3.5 w-3.5 text-app-champagne" fill="currentColor" aria-hidden="true" />
              Quick
            </button>
          </div>

          <AccountMenu firstName={firstName} signedIn={signedIn} storePath={storePath} />

          <Link to="/orders" className={`${navItem} hidden shrink-0 flex-col justify-center leading-tight xl:flex`}>
            <span className="text-[11px] text-[#6E6862]">Returns</span>
            <span className="text-[13.5px] font-bold">&amp; Orders</span>
          </Link>

          <IconLink to={storePath("/wishlist")} label="Wishlist" icon={Heart} />

          {/* On /quick the bag opens the slide-in panel; Shop still links to /cart. */}
          {isQuick && quickCart.enabled ? (
            <IconLink
              asButton
              onClick={quickCart.openPanel}
              aria-haspopup="dialog"
              aria-expanded={quickCart.open}
              label={cartLabel}
              icon={ShoppingBag}
              badge={cartCount}
              caption="Bag"
            />
          ) : (
            <IconLink to={storePath("/cart")} label={cartLabel} icon={ShoppingBag} badge={cartCount} caption="Bag" />
          )}
        </div>
      </div>

      {/* Category bar */}
      <nav aria-label="Categories" className="border-y border-app-line bg-white/95 shadow-[0_2px_8px_rgba(25,20,17,0.04)] backdrop-blur">
        <div className="mx-auto flex h-[44px] max-w-[1400px] items-center gap-1 overflow-x-auto px-6 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            aria-haspopup="dialog"
            aria-expanded={drawerOpen}
            className={`mr-2 flex h-[30px] shrink-0 items-center gap-1.5 rounded-full bg-app-brown px-3.5 text-[13px] font-bold text-white transition-colors hover:bg-app-brown-deep ${focusRing}`}
          >
            <Menu className="h-4 w-4" aria-hidden="true" /> All
          </button>
          {topCats.map((c) => {
            const to = storePath(`/category/${c.slug}`)
            const on = isCurrent(to)
            return (
              <Link key={c.id} to={to} aria-current={on ? "page" : undefined} className={subnavLink(on)}>
                {c.name}
              </Link>
            )
          })}
          <span aria-hidden="true" className="mx-2 h-4 w-px shrink-0 bg-app-line" />
          {extraLinks.map(({ label, to, onClick }) =>
            onClick ? (
              <button key={label} type="button" onClick={onClick} className={subnavLink(false)}>
                {label}
              </button>
            ) : (
              <Link key={label} to={to} aria-current={isCurrent(to) ? "page" : undefined} className={subnavLink(isCurrent(to))}>
                {label}
              </Link>
            ),
          )}
        </div>
      </nav>

      <CategoryDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} tree={tree} storePath={storePath} brandName={brandName} />
    </header>
  )
}
