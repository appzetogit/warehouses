import { Link, useLocation, useNavigate } from "react-router-dom"
import { useEffect, useState, useRef } from "react"
import { ChevronDown, ShoppingCart, Wallet, Search, Mic, Zap, Package, ShieldCheck } from "lucide-react"
import { Button } from "@store/components/ui/button"
import { Input } from "@store/components/ui/input"
import { Switch } from "@store/components/ui/switch"
import { useDeliveryLocation } from "@store/context/DeliveryLocationContext"
import { useCart } from "@store/context/CartContext"
import { useLocationSelector, useSearchOverlay } from "./UserLayout"
import { useProfile } from "@store/context/ProfileContext"
import { FaLocationDot } from "react-icons/fa6"
import { AnimatePresence, motion } from "framer-motion"
import brandMark from "@/config/brandMark"
import { getCachedSettings, loadBusinessSettings } from "@store/utils/businessSettings"
import { clearHomeScrollState } from "@store/utils/homeScrollRestore"
const debugLog = (...args) => {}
const debugWarn = (...args) => {}
const debugError = (...args) => {}


export default function DesktopNavbar() {
    const location = useLocation()
    const navigate = useNavigate()
    const {
        effectiveLocation: userLocation,
        displayAddressText,
        loading: locationLoading,
        commerceMode,
        setCommerceMode,
    } = useDeliveryLocation()
    const { getCartCount } = useCart()
    const { openLocationSelector } = useLocationSelector()
    const { setSearchValue } = useSearchOverlay()
    const { vegMode, setVegMode } = useProfile()
    const [heroSearch, setHeroSearch] = useState("")
    const [logoUrl, setLogoUrl] = useState(null)
    const [companyName, setCompanyName] = useState(null)
    const [hasScrolledPastBanner, setHasScrolledPastBanner] = useState(false)
    const navRef = useRef(null)
    const cartCount = getCartCount()


    // Show area if available, otherwise show city
    // Priority: area > city > "Select"
    const areaName = userLocation?.area && userLocation?.area.trim() ? userLocation.area.trim() : null
    const cityName = userLocation?.city || null
    const stateName = userLocation?.state || null
    // Main location name: Show area if available, otherwise show city, otherwise "Select"
    const mainLocationName = areaName || cityName || "Select"
    // Secondary location: Show only city when area is available (as per design image)
    const secondaryLocation = areaName
        ? (cityName || "")  // Show only city when area is available
        : (cityName && stateName ? `${cityName}, ${stateName}` : cityName || stateName || "")

    const handleLocationClick = () => {
        // Open location selector overlay
        openLocationSelector()
    }

    // Check active routes - support both /user/* and /* paths
    const isProfile = location.pathname.startsWith("/food/user/profile") || location.pathname.startsWith("/food/profile")
    const isDelivery = !isProfile && (location.pathname === "/food/user" || location.pathname === "/food" || (location.pathname.startsWith("/food/user") && !location.pathname.includes("/profile")))
    const isBannerRoute =
        location.pathname === "/food/user" ||
        location.pathname === "/food"

    // Load business settings logo
    useEffect(() => {
        const loadLogo = async () => {
            try {
                const cached = getCachedSettings()
                if (cached) {
                    if (cached.logo?.url) {
                        setLogoUrl(cached.logo.url)
                    }
                    if (cached.companyName) {
                        setCompanyName(cached.companyName)
                    }
                } else {
                    const settings = await loadBusinessSettings()
                    if (settings) {
                        if (settings.logo?.url) {
                            setLogoUrl(settings.logo.url)
                        }
                        if (settings.companyName) {
                            setCompanyName(settings.companyName)
                        }
                    }
                }
            } catch (error) {
                debugError('Error loading logo:', error)
            }
        }
        loadLogo()

        // Listen for business settings updates
        const handleSettingsUpdate = () => {
            const cached = getCachedSettings()
            if (cached) {
                if (cached.logo?.url) {
                    setLogoUrl(cached.logo.url)
                }
                if (cached.companyName) {
                    setCompanyName(cached.companyName)
                }
            }
        }
        window.addEventListener('businessSettingsUpdated', handleSettingsUpdate)

        return () => {
            window.removeEventListener('businessSettingsUpdated', handleSettingsUpdate)
        }
    }, [])

    useEffect(() => {
        if (!isBannerRoute) {
            setHasScrolledPastBanner(true)
            return
        }

        const handleScroll = () => {
            const heroShell =
                document.querySelector('[data-home-hero-shell="true"]') ||
                document.querySelector('[data-banner-shell="true"]')
            const navElement = navRef.current

            if (!heroShell || !navElement) {
                setHasScrolledPastBanner(false)
                return
            }

            const heroRect = heroShell.getBoundingClientRect()
            const navHeight = navElement.getBoundingClientRect().height || 0
            setHasScrolledPastBanner(heroRect.bottom <= navHeight)
        }

        handleScroll()
        window.addEventListener("scroll", handleScroll, { passive: true })
        window.addEventListener("resize", handleScroll)

        return () => {
            window.removeEventListener("scroll", handleScroll)
            window.removeEventListener("resize", handleScroll)
        }
    }, [isBannerRoute])

    return (
        <nav
            ref={navRef}
            className={`hidden md:flex flex-col fixed top-0 left-0 right-0 z-50 py-2 transition-all duration-300 ${(isBannerRoute && !hasScrolledPastBanner)
                ? "bg-transparent !bg-transparent border-0 shadow-none"
                : "bg-white dark:bg-[#1a1a1a] border-b border-gray-200 dark:border-gray-800 shadow-sm"
                }`}
        >
            {/* Top Row: Location - Search - Icons */}
            <div className={`w-full ${(isBannerRoute && !hasScrolledPastBanner) ? "border-b border-transparent" : "border-b border-gray-100 dark:border-gray-800"}`}>
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="flex items-center justify-between h-16 gap-4">
                        {/* Left: Logo & Location */}
                        <div className="flex items-center gap-4 lg:gap-6 flex-shrink-0">
                            {/* Logo */}
                            <Link
                              to="/food/user"
                              onClick={() => clearHomeScrollState()}
                              className="flex items-center justify-center flex-shrink-0"
                            >
                                {logoUrl || companyName ? (
                                    <img
                                        src={logoUrl || brandMark}
                                        alt={companyName || "Company Logo"}
                                        className="h-10 w-auto md:h-14 lg:h-16 object-contain"
                                        onError={(e) => {
                                            if (e.target.src !== brandMark) {
                                                e.target.src = brandMark
                                            }
                                        }}
                                    />
                                ) : (
                                    <img src={brandMark} alt={companyName || "Logo"} className="h-10 w-auto md:h-14 lg:h-16 object-contain" />
                                )}
                            </Link>

                            {/* Location Selector */}
                            <Button
                                variant="ghost"
                                onClick={handleLocationClick}
                                disabled={locationLoading}
                                className="h-auto px-0 py-0 hover:bg-transparent transition-colors flex-shrink-0"
                            >
                                {locationLoading ? (
                                    <span className="text-sm font-bold text-black dark:text-white">
                                        Loading...
                                    </span>
                                ) : (
                                    <div className="flex flex-col items-start min-w-0">
                                        <div className="flex items-center gap-1.5 lg:gap-2">
                                            <FaLocationDot
                                                className="h-5 w-5 lg:h-6 lg:w-6 text-black dark:text-white flex-shrink-0"
                                                fill="currentColor"
                                                strokeWidth={2}
                                            />
                                            <span className="text-sm lg:text-base font-bold text-black dark:text-white whitespace-nowrap">
                                                {mainLocationName}
                                            </span>
                                            <ChevronDown className="h-4 w-4 lg:h-5 lg:w-5 text-black dark:text-white flex-shrink-0" strokeWidth={2.5} />
                                        </div>
                                        {secondaryLocation && (
                                            <span className="text-xs lg:text-sm font-bold text-gray-600 dark:text-gray-400 mt-0.5 whitespace-nowrap">
                                                {secondaryLocation}
                                            </span>
                                        )}
                                    </div>
                                )}
                            </Button>
                        </div>

                        {/* Center: Search Bar & Veg Mode */}
                        <div className="flex-1 max-w-3xl mx-4 flex items-center gap-4">
                            {/* Search Bar */}
                            <div className="relative flex-1">
                                <div className="relative bg-gray-100 dark:bg-[#2a2a2a] rounded-lg transition-all duration-300 focus-within:ring-2 focus-within:ring-[#EB590E] focus-within:bg-white dark:focus-within:bg-[#1a1a1a] border border-transparent focus-within:border-[#EB590E]/20">
                                    <div className="flex items-center px-3 py-2">
                                        <Search className="h-4 w-4 text-gray-500 flex-shrink-0 mr-3" />
                                        <Input
                                            value={heroSearch}
                                            onChange={(e) => {
                                                const nextValue = e.target.value
                                                setHeroSearch(nextValue)
                                                setSearchValue(nextValue)
                                            }}
                                            onKeyDown={(e) => {
                                                if (e.key === "Enter" && heroSearch.trim()) {
                                                    navigate(`/food/search?q=${encodeURIComponent(heroSearch.trim())}`)
                                                }
                                            }}
                                            className="h-6 p-0 border-0 bg-transparent text-sm font-medium placeholder:text-gray-500 focus-visible:ring-0 focus-visible:ring-offset-0"
                                            placeholder="Search for sellers, food..."
                                        />
                                        {heroSearch && (
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                className="h-5 w-5 p-0 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-full ml-1"
                                                onClick={() => setHeroSearch("")}
                                            >
                                                <span className="sr-only">Clear</span>
                                                <span aria-hidden="true">�</span>
                                            </Button>
                                        )}
                                    </div>
                                </div>
                            </div>

                            {/* VEG MODE Toggle - Moved here */}
                            <div className="flex items-center gap-2 flex-shrink-0">
                                <div className="flex flex-col items-end">
                                    <span className="text-[10px] font-bold text-gray-700 dark:text-gray-300 leading-none">VEG</span>
                                    <span className="text-[8px] font-bold text-gray-500 dark:text-gray-400 leading-none">MODE</span>
                                </div>
                                <Switch
                                    checked={vegMode}
                                    onCheckedChange={setVegMode}
                                    className="data-[state=checked]:bg-green-600 data-[state=unchecked]:bg-gray-300 dark:data-[state=unchecked]:bg-gray-600 h-5 w-9"
                                />
                            </div>
                        </div>

                        {/* Right: Admin Portal, Wallet and Cart Icons */}
                        <div className="flex items-center gap-2 lg:gap-3 flex-shrink-0">
                            {/* Switch to Admin Portal Button */}
                            <Link to="/admin/store">
                                <Button
                                    variant="outline"
                                    size="sm"
                                    className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border-indigo-200 text-indigo-700 bg-indigo-50/90 hover:bg-indigo-100 hover:text-indigo-800 dark:border-indigo-800 dark:text-indigo-300 dark:bg-indigo-950/40 transition-all shadow-sm"
                                    title="Open Admin Dashboard"
                                >
                                    <ShieldCheck className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                                    <span>Admin Portal</span>
                                </Button>
                            </Link>

                            {/* Wallet Icon */}
                            <Link to="/food/user/wallet">
                                <Button
                                    variant="ghost"
                                    className="h-10 w-10 lg:h-12 lg:w-12 rounded-full p-0 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                                    title="Wallet"
                                >
                                    <Wallet className="!h-5 !w-5 text-gray-700 dark:text-gray-300" strokeWidth={2} />
                                </Button>
                            </Link>

                            {/* Cart Icon */}
                            <Link to="/food/user/cart">
                                <Button
                                    variant="ghost"
                                    className="relative h-10 w-10 lg:h-12 lg:w-12 rounded-full p-0 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                                    title="Cart"
                                >
                                    <ShoppingCart className="!h-5 !w-5 text-gray-700 dark:text-gray-300" strokeWidth={2} />
                                    {cartCount > 0 && (
                                        <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 rounded-full flex items-center justify-center ring-2 ring-white dark:ring-gray-800">
                                            <span className="text-[11px] font-bold text-white">{cartCount > 99 ? "99+" : cartCount}</span>
                                        </span>
                                    )}
                                </Button>
                            </Link>
                        </div>
                    </div>
                </div>
            </div>

            {/* Bottom Row: Mode Switcher Tab & Quick Navigation */}
            <div className={`w-full py-2 border-t border-gray-100 dark:border-neutral-800/80 ${(isBannerRoute && !hasScrolledPastBanner) ? "bg-white/80 dark:bg-[#1a1a1a]/80 backdrop-blur-md" : "bg-white dark:bg-[#1a1a1a]"}`}>
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="flex items-center justify-between h-11">
                        {/* Navigation Links */}
                        <div className="flex items-center space-x-6">
                            <Link
                                to="/food/user"
                                onClick={() => clearHomeScrollState()}
                                className={`text-xs font-bold tracking-wide uppercase transition-colors ${
                                    isDelivery ? "text-orange-600 dark:text-orange-500" : "text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
                                }`}
                            >
                                Storefront
                            </Link>
                            <Link
                                to="/food/user/categories"
                                className="text-xs font-semibold text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors"
                            >
                                Categories
                            </Link>
                            <Link
                                to="/food/user/sellers"
                                className="text-xs font-semibold text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors"
                            >
                                Stores & Sellers
                            </Link>
                            <Link
                                to="/food/user/offers"
                                className="text-xs font-semibold text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors"
                            >
                                Offers & Deals
                            </Link>
                        </div>

                        {/* Central Prominent Delivery Mode Switcher Tab */}
                        <div className="flex items-center p-0.5 bg-gray-100 dark:bg-neutral-800 rounded-full border border-gray-200 dark:border-neutral-700 shadow-inner">
                            <button
                                type="button"
                                onClick={() => setCommerceMode("quick")}
                                className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-bold transition-all ${
                                    commerceMode === "quick"
                                        ? "bg-gradient-to-r from-amber-500 to-orange-500 text-white shadow-sm scale-[1.02]"
                                        : "text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white"
                                }`}
                            >
                                <Zap className="w-3.5 h-3.5 fill-current" />
                                <span>⚡ Quick (15-30m)</span>
                            </button>
                            <button
                                type="button"
                                onClick={() => setCommerceMode("standard")}
                                className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-bold transition-all ${
                                    commerceMode === "standard"
                                        ? "bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-sm scale-[1.02]"
                                        : "text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white"
                                }`}
                            >
                                <Package className="w-3.5 h-3.5" />
                                <span>📦 Standard Courier</span>
                            </button>
                        </div>

                        {/* Profile Tab */}
                        <div className="flex items-center">
                            <Link
                                to="/food/user/profile"
                                className={`text-xs font-bold tracking-wide uppercase transition-colors ${
                                    isProfile ? "text-orange-600 dark:text-orange-500" : "text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
                                }`}
                            >
                                Profile
                            </Link>
                        </div>
                    </div>
                </div>
            </div>
        </nav>
    )
}


