import { useEffect, useMemo, useRef, useState } from "react"
import { Link, useLocation, useNavigate } from "react-router-dom"
import { ArrowLeft, Bell, ChevronDown, Heart, LayoutGrid, MapPin, Mic, Search, ShoppingBag, Zap } from "lucide-react"
import { useCart } from "@store/context/CartContext"
import { useDeliveryLocation } from "@store/context/DeliveryLocationContext"
import { useStoreMode } from "@store/context/StoreModeContext"
import { useLocationSelector } from "../UserLayout"
import SearchSuggestions, { useSearchSuggestions, useSuggestionKeyboard } from "../desktop/SearchSuggestions"
import { usePublicCategories } from "../desktop/useDesktopShell"
import RotatingSearchHint from "./RotatingSearchHint"

/**
 * The phone header, styled after the customer app's Shop home
 * (warehouse_user shop_home_screen.dart: _Header, _TopBackdrop, _TopCircles,
 * _StickySearch): cream backdrop, "Deliver to" place with the Shop/Quick
 * switch, search with bell / wishlist / bag, and on a home page a row of
 * round category photos. Past ~90px of scroll the big header has gone and a
 * compact search bar slides in at the top.
 *
 * The old menu drawer only listed categories, which the Categories tab and the
 * circles already reach, so the header no longer has a menu or logo.
 * Inner pages draw their own top bar (MobileTopBar) instead.
 */

const SpeechRecognition =
  typeof window !== "undefined" ? window.SpeechRecognition || window.webkitSpeechRecognition : null

const STICKY_AFTER = 90 // px of scroll before the compact bar shows

const slugify = (name) =>
  String(name || "")
    .toLowerCase()
    .replace(/&/g, " ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")

// Soft circles behind the header (_TopBackdrop), partly off-screen.
const BACKDROP_CIRCLES = [
  { top: -45, right: -35, size: 180, color: "rgba(239,229,218,0.6)" },
  { top: -25, right: -20, size: 130, color: "rgba(230,218,207,0.4)" },
  { top: -35, left: -40, size: 140, color: "rgba(243,231,219,0.5)" },
  { top: 55, right: -45, size: 150, color: "rgba(236,224,211,0.35)" },
  { top: 95, left: -35, size: 130, color: "rgba(242,230,218,0.45)" },
]

const focusRing = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app-brown"

/** A 32x38 header icon (bell, heart, bag) with an optional count badge. */
function HeaderIcon({ to, label, icon: Icon, badge = 0 }) {
  return (
    <Link
      to={to}
      aria-label={label}
      className={`relative flex h-[38px] w-8 shrink-0 items-center justify-center rounded-full text-app-ink active:bg-black/5 ${focusRing}`}
    >
      <Icon className="h-[21px] w-[21px]" strokeWidth={1.8} aria-hidden="true" />
      {badge > 0 ? (
        <span
          key={badge}
          className="wh-pop absolute right-px top-1 flex h-[13px] min-w-[13px] items-center justify-center rounded-full bg-app-brown-badge px-[3px] text-[9px] font-bold leading-none text-white"
        >
          {badge > 99 ? "99+" : badge}
        </span>
      ) : null}
    </Link>
  )
}

export default function MobileHeader() {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const isHome = pathname === "/" || /^\/quick\/?$/.test(pathname)
  const { storePath, fulfilmentMode, isQuick } = useStoreMode()
  const { effectiveLocation, setCommerceMode, zoneId } = useDeliveryLocation()
  const { openLocationSelector } = useLocationSelector()
  const { getCartCount } = useCart()
  const cartCount = getCartCount()
  const { categories } = usePublicCategories(zoneId)
  const inputRef = useRef(null)

  const [q, setQ] = useState("")
  const [listening, setListening] = useState(false)
  const [compact, setCompact] = useState(false)

  const place = effectiveLocation?.area || effectiveLocation?.city || ""

  // The hint cycles through real category names, so it suggests things you can buy.
  const words = useMemo(() => {
    const names = categories.filter((c) => c.parentId).map((c) => c.name.toLowerCase())
    return (names.length ? names : ["t-shirts", "jeans", "kurtas"]).slice(0, 8)
  }, [categories])

  // As in the app: the top-level categories first, then every sub-category.
  const circles = useMemo(
    () => [...categories.filter((c) => !c.parentId), ...categories.filter((c) => c.parentId)],
    [categories],
  )

  // The big header scrolls away; past STICKY_AFTER the compact bar takes over.
  useEffect(() => {
    const onScroll = () => setCompact(window.scrollY > STICKY_AFTER)
    onScroll()
    window.addEventListener("scroll", onScroll, { passive: true })
    return () => window.removeEventListener("scroll", onScroll)
  }, [])

  const goToSearch = (term) => navigate(`${storePath("/search")}?${new URLSearchParams({ q: term })}`)
  const suggestions = useSearchSuggestions({ term: q, categories, fulfilmentMode, zoneId })
  const pick = (item) => {
    if (item.type === "product") return navigate(storePath(`/product/${item.id}`))
    if (item.type === "category") return navigate(storePath(`/category/${slugify(item.label)}`))
    setQ(item.label)
    return goToSearch(item.label)
  }
  const search = useSuggestionKeyboard({
    items: suggestions,
    onPick: pick,
    onSubmit: (e) => {
      e.preventDefault()
      if (q.trim()) goToSearch(q.trim())
    },
  })

  const listen = () => {
    if (!SpeechRecognition || listening) return
    const rec = new SpeechRecognition()
    rec.lang = "en-IN"
    rec.interimResults = false
    rec.maxAlternatives = 1
    rec.onresult = (event) => {
      const said = event.results?.[0]?.[0]?.transcript?.trim()
      if (said) {
        setQ(said)
        goToSearch(said)
      }
    }
    rec.onend = () => setListening(false)
    rec.onerror = () => setListening(false)
    setListening(true)
    rec.start()
  }

  // The compact bar's search goes back to the real field at the top.
  const focusSearch = () => {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" })
    requestAnimationFrame(() => {
      inputRef.current?.focus()
      search.setOpen(true)
    })
  }

  const micButton = SpeechRecognition ? (
    <button
      type="button"
      onClick={listen}
      aria-label={listening ? "Listening" : "Search by voice"}
      className={`shrink-0 rounded-full px-[3px] py-1 text-app-ink ${focusRing} ${listening ? "wh-blink" : ""}`}
    >
      <Mic className="h-[17px] w-[17px]" strokeWidth={1.8} aria-hidden="true" />
    </button>
  ) : null

  const pill = "flex h-[38px] w-full items-center gap-1.5 rounded-[30px] bg-white px-2.5 shadow-[0_2px_10px_rgba(0,0,0,0.05)]"
  const toQuick = !isQuick

  return (
    <>
      <header className="relative z-50 w-full bg-[linear-gradient(180deg,#F1E4D6_0%,#F8F1EA_50%,#F8F1EA_100%)] pb-1 pt-2 font-app text-app-ink lg:hidden">
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
          {BACKDROP_CIRCLES.map(({ size, color, ...pos }, i) => (
            <span
              key={i}
              className="absolute rounded-full"
              style={{ ...pos, width: size, height: size, backgroundColor: color }}
            />
          ))}
        </div>

        <div className="relative">
          {/* Deliver to … + Shop/Quick switch */}
          <div className="flex items-center gap-1.5 px-3.5 pt-0.5">
            {isHome ? null : (
              <button
                type="button"
                onClick={() => navigate(-1)}
                aria-label="Back"
                className={`-ml-1.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full active:bg-black/5 ${focusRing}`}
              >
                <ArrowLeft className="h-5 w-5" aria-hidden="true" />
              </button>
            )}
            <MapPin className="h-5 w-5 shrink-0" strokeWidth={2.2} aria-hidden="true" />
            <button
              type="button"
              onClick={openLocationSelector}
              aria-label={`Deliver to ${place || "your location"}. Change delivery location`}
              className={`flex min-w-0 flex-1 items-center gap-0.5 rounded-md text-left ${focusRing}`}
            >
              <span className="flex min-w-0 flex-col leading-tight">
                <span className="text-[11px] text-[#6E6862]">Deliver to</span>
                <span className="truncate text-[13.5px] font-bold">{place || "Set delivery location"}</span>
              </span>
              <ChevronDown className="h-[18px] w-[18px] shrink-0 self-end" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={() => setCommerceMode(toQuick ? "quick" : "standard")}
              aria-label={toQuick ? "Switch to Quick delivery" : "Switch to Shop"}
              className={`flex shrink-0 items-center gap-[3px] rounded-full bg-app-ink px-2.5 py-[5px] text-[11.5px] font-bold text-white shadow-[0_2px_4px_rgba(0,0,0,0.15)] active:scale-95 ${focusRing}`}
            >
              {toQuick ? (
                <Zap className="h-3.5 w-3.5" fill="currentColor" aria-hidden="true" />
              ) : (
                <ShoppingBag className="h-3.5 w-3.5" aria-hidden="true" />
              )}
              {toQuick ? "Quick" : "Shop"}
            </button>
          </div>

          {/* Search + bell, wishlist, bag */}
          <div className="mt-2 flex items-center gap-1 px-3">
            <form role="search" onSubmit={search.submit} ref={search.boxRef} className="relative min-w-0 flex-1">
              <div className={`${pill} focus-within:ring-2 focus-within:ring-app-champagne`}>
                <Search className="h-[19px] w-[19px] shrink-0 text-app-muted" aria-hidden="true" />
                <div className="relative min-w-0 flex-1">
                  <label htmlFor="wh-mobile-search" className="sr-only">
                    Search
                  </label>
                  <input
                    ref={inputRef}
                    id="wh-mobile-search"
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
                    aria-controls="wh-mobile-suggestions"
                    aria-autocomplete="list"
                    className="h-[30px] w-full bg-transparent text-[13px] text-app-ink focus:outline-none"
                  />
                  {q ? null : (
                    <RotatingSearchHint words={words} className="pointer-events-none absolute inset-x-0 top-1/2 -translate-y-1/2" />
                  )}
                </div>
                {micButton}
              </div>
              {search.open ? (
                <SearchSuggestions
                  listId="wh-mobile-suggestions"
                  items={suggestions}
                  activeIndex={search.activeIndex}
                  onPick={(item) => {
                    search.setOpen(false)
                    pick(item)
                  }}
                  onHover={search.setActiveIndex}
                />
              ) : null}
            </form>
            <HeaderIcon to="/notifications" label="Notifications" icon={Bell} />
            <HeaderIcon to={storePath("/wishlist")} label="Wishlist" icon={Heart} />
            <HeaderIcon
              to={storePath("/cart")}
              label={`Cart, ${cartCount} item${cartCount === 1 ? "" : "s"}`}
              icon={ShoppingBag}
              badge={cartCount}
            />
          </div>

          {/* Round category photos: "All", then the categories */}
          {isHome ? (
            <nav
              aria-label="Categories"
              className="mt-2 flex h-[72px] items-start overflow-x-auto px-2.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            >
              <Link
                to={storePath("/")}
                aria-current="page"
                className={`flex w-[62px] shrink-0 flex-col items-center rounded-lg ${focusRing}`}
              >
                <span className="flex h-[46px] w-[46px] items-center justify-center rounded-full border-2 border-[#F0D5BE] bg-app-ink shadow-[0_2px_4px_rgba(25,20,17,0.08)]">
                  <LayoutGrid className="h-[18px] w-[18px] text-white" fill="currentColor" aria-hidden="true" />
                </span>
                <span className="mt-1 max-w-[62px] truncate rounded-full bg-[#F6D8B6] px-[7px] py-0.5 text-[10.5px] font-bold leading-tight">
                  All
                </span>
              </Link>
              {circles.map((c) => (
                <Link
                  key={c.id}
                  to={storePath(`/category/${slugify(c.name)}`)}
                  className={`flex w-[62px] shrink-0 flex-col items-center rounded-lg active:scale-95 ${focusRing}`}
                >
                  <span className="flex h-[46px] w-[46px] items-center justify-center overflow-hidden rounded-full border border-white bg-app-alt shadow-[0_2px_4px_rgba(25,20,17,0.08)]">
                    {c.image ? (
                      <img src={c.image} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" />
                    ) : (
                      <span className="text-[15px] font-semibold text-app-muted" aria-hidden="true">
                        {c.name.charAt(0).toUpperCase()}
                      </span>
                    )}
                  </span>
                  <span className="mt-1 max-w-[62px] truncate px-[7px] py-0.5 text-[10.5px] font-medium leading-tight">
                    {c.name}
                  </span>
                </Link>
              ))}
            </nav>
          ) : null}
        </div>
      </header>

      {/* Compact search, pinned once the big header has scrolled away (_StickySearch) */}
      <div
        aria-hidden={!compact}
        className={`fixed inset-x-0 top-0 z-50 flex items-center gap-1 bg-app-cream pb-2 pl-3 pr-2 pt-[calc(6px+env(safe-area-inset-top))] font-app text-app-ink shadow-[0_2px_8px_rgba(0,0,0,0.08)] transition-[transform,opacity,visibility] duration-200 ease-out motion-reduce:transition-none lg:hidden ${
          compact ? "visible translate-y-0 opacity-100" : "invisible pointer-events-none -translate-y-full opacity-0"
        }`}
      >
        <div className={`${pill} min-w-0 flex-1`}>
          <button
            type="button"
            onClick={focusSearch}
            aria-label="Search"
            className={`flex min-w-0 flex-1 items-center gap-1.5 self-stretch rounded-full text-left ${focusRing}`}
          >
            <Search className="h-[19px] w-[19px] shrink-0 text-app-muted" aria-hidden="true" />
            <RotatingSearchHint words={words} className="min-w-0 flex-1" />
          </button>
          {micButton}
        </div>
        <HeaderIcon to={storePath("/wishlist")} label="Wishlist" icon={Heart} />
        <HeaderIcon
          to={storePath("/cart")}
          label={`Cart, ${cartCount} item${cartCount === 1 ? "" : "s"}`}
          icon={ShoppingBag}
          badge={cartCount}
        />
      </div>
    </>
  )
}
