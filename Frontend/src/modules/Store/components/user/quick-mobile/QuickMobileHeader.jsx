import { useEffect, useMemo, useRef, useState } from "react"
import { Link, useLocation, useNavigate } from "react-router-dom"
import { ArrowLeft, ChevronDown, MapPin, Menu, Mic, Search, ShoppingCart } from "lucide-react"
import { useDeliveryLocation } from "@store/context/DeliveryLocationContext"
import { useStoreMode } from "@store/context/StoreModeContext"
import { useCart } from "@store/context/CartContext"
import { BRAND_LOGO_ON_DARK } from "@/config/brandMark"
import { useLocationSelector } from "../UserLayout"
import SearchSuggestions, { useSearchSuggestions, useSuggestionKeyboard } from "../desktop/SearchSuggestions"
import { usePublicCategories } from "../desktop/useDesktopShell"

const SpeechRecognition =
  typeof window !== "undefined" ? window.SpeechRecognition || window.webkitSpeechRecognition : null

const FASHION_CHIPS = [
  { label: "T-shirts", icon: "👕", link: "/quick/category/t-shirts" },
  { label: "Jeans", icon: "👖", link: "/quick/category/jeans" },
  { label: "Shoes", icon: "👟", link: "/quick/category/footwear" },
  { label: "Jackets", icon: "🧥", link: "/quick/category/jackets" },
  { label: "Kurtas", icon: "👗", link: "/quick/category/kurtas" },
  { label: "Dresses", icon: "👗", link: "/quick/category/dresses" },
  { label: "Bags", icon: "👜", link: "/quick/category/bags" },
]

export default function QuickMobileHeader() {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const isHome = /^\/quick\/?$/.test(pathname)
  const { storePath, fulfilmentMode, isQuick } = useStoreMode()
  const { effectiveLocation, setCommerceMode, zoneId } = useDeliveryLocation()
  const { openLocationSelector } = useLocationSelector()
  const { getCartCount } = useCart()
  const cartCount = getCartCount()
  const { categories } = usePublicCategories(zoneId)

  const [q, setQ] = useState("")
  const [listening, setListening] = useState(false)

  const city = effectiveLocation?.city || "Indore"

  const goToSearch = (term) => navigate(`${storePath("/search")}?${new URLSearchParams({ q: term })}`)

  const suggestions = useSearchSuggestions({ term: q, categories, fulfilmentMode, zoneId })
  const pick = (item) => {
    if (item.type === "product") return navigate(storePath(`/product/${item.id}`))
    if (item.type === "category") return navigate(storePath(`/category/${item.slug}`))
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

  return (
    <header className="wh-desktop sticky top-0 z-50 w-full max-w-full overflow-x-hidden bg-gradient-to-r from-[#ea580c] via-[#f97316] to-[#ea580c] pb-2 pt-2.5 text-white shadow-md lg:hidden">
      {/* Row 1: Menu / Back, Logo, Delivery Location, Mode Switcher, Cart */}
      <div className="flex items-center gap-1.5 px-3">
        {!isHome ? (
          <button
            type="button"
            onClick={() => navigate(-1)}
            aria-label="Back"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white hover:bg-black/10"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
        ) : (
          <Link
            to="/categories"
            aria-label="Browse categories"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white hover:bg-black/10"
          >
            <Menu className="h-5 w-5" />
          </Link>
        )}

        {/* Logo */}
        <Link to={storePath("/")} className="shrink-0 flex items-center pr-1">
          <img
            src={BRAND_LOGO_ON_DARK}
            alt="The Warehouses"
            className="h-[28px] w-auto max-w-[80px] object-contain drop-shadow-sm"
          />
        </Link>

        {/* Deliver to Indore */}
        <button
          type="button"
          onClick={openLocationSelector}
          className="flex min-w-0 max-w-[110px] flex-col text-left leading-tight sm:max-w-[140px]"
        >
          <span className="flex items-center gap-0.5 truncate text-[12px] font-bold">
            <MapPin className="h-3 w-3 shrink-0 text-white" />
            <span className="truncate">{city}</span>
            <ChevronDown className="h-3 w-3 shrink-0" />
          </span>
          <span className="truncate text-[10px] font-medium text-amber-200">
            Delivery in 30-60 min
          </span>
        </button>

        {/* Shop | Quick Pill Toggle */}
        <div
          role="group"
          aria-label="Choose store mode"
          className="ml-auto flex shrink-0 items-center rounded-full bg-black/25 p-0.5 border border-white/20 shadow-xs"
        >
          <button
            type="button"
            aria-pressed={!isQuick}
            onClick={() => setCommerceMode("standard")}
            className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold transition-all ${
              !isQuick ? "bg-white text-gray-950 shadow-xs" : "text-white/90 hover:text-white"
            }`}
          >
            Shop
          </button>
          <button
            type="button"
            aria-pressed={isQuick}
            onClick={() => setCommerceMode("quick")}
            className={`flex items-center gap-0.5 rounded-full px-2.5 py-0.5 text-[11px] font-bold transition-all ${
              isQuick ? "bg-white text-gray-950 shadow-xs" : "text-white/90 hover:text-white"
            }`}
          >
            <span className="text-amber-500">⚡</span> Quick
          </button>
        </div>

        {/* Cart */}
        <Link
          to={storePath("/cart")}
          aria-label={`Cart: ${cartCount} items`}
          className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white hover:bg-black/10"
        >
          <ShoppingCart className="h-5 w-5" />
          {cartCount > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-white px-1 text-[10px] font-black leading-none text-[#ea580c] shadow-xs">
              {cartCount > 9 ? "9+" : cartCount}
            </span>
          )}
        </Link>
      </div>

      {/* Row 2: Search Bar */}
      <div className="mt-2 px-3">
        <form role="search" onSubmit={search.submit} ref={search.boxRef} className="relative w-full">
          <div className="flex h-10 w-full items-center gap-2 rounded-xl bg-white px-3 shadow-xs">
            <Search className="h-4 w-4 shrink-0 text-gray-400" />
            <label htmlFor="wh-quick-search" className="sr-only">
              Search
            </label>
            <input
              id="wh-quick-search"
              type="search"
              value={q}
              onChange={(e) => {
                setQ(e.target.value)
                search.setOpen(true)
              }}
              onFocus={() => search.setOpen(true)}
              onKeyDown={search.handleKeyDown}
              placeholder="Search for shirts, jackets, shoes, brands, size and more..."
              autoComplete="off"
              role="combobox"
              aria-expanded={search.open && suggestions.length > 0}
              aria-controls="wh-quick-suggestions"
              aria-autocomplete="list"
              className="min-w-0 flex-1 bg-transparent text-[13px] text-gray-900 placeholder:text-gray-400 focus:outline-none"
            />
            {SpeechRecognition ? (
              <button
                type="button"
                onClick={listen}
                aria-label={listening ? "Listening" : "Voice search"}
                className="shrink-0 p-1 text-[#ea580c]"
              >
                <Mic className="h-4 w-4" />
              </button>
            ) : null}
          </div>

          {search.open && (
            <SearchSuggestions
              listId="wh-quick-suggestions"
              items={suggestions}
              activeIndex={search.activeIndex}
              onPick={(item) => {
                search.setOpen(false)
                pick(item)
              }}
              onHover={search.setActiveIndex}
            />
          )}
        </form>
      </div>

      {/* Row 3: Category Chips */}
      {isHome && (
        <div className="mt-2 flex gap-1.5 overflow-x-auto px-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {FASHION_CHIPS.map((chip) => (
            <Link
              key={chip.label}
              to={chip.link}
              className="flex shrink-0 items-center gap-1 rounded-full bg-white/95 px-3 py-1 text-[11px] font-bold text-gray-800 shadow-2xs hover:bg-white active:scale-95 transition-all"
            >
              <span>{chip.icon}</span>
              <span>{chip.label}</span>
            </Link>
          ))}
        </div>
      )}
    </header>
  )
}
