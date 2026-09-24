import { useEffect, useState } from "react"
import { Link } from "react-router-dom"
import {
  ChevronRight,
  Heart,
  ShoppingCart,
  Zap,
  Bike,
  Store,
  RefreshCw,
  ShieldCheck,
  Clock,
  Sparkles,
  Star,
  CheckCircle2,
  Flame,
  Check,
} from "lucide-react"
import { useStoreMode } from "@store/context/StoreModeContext"
import { useCart } from "@store/context/CartContext"
import { toast } from "sonner"

// Reusable Image component with animated shimmer skeleton & smooth fade-in
function ImageWithSkeleton({
  src,
  alt,
  className = "",
  imgClassName = "",
  loading = "lazy",
  objectFit = "cover",
  ...props
}) {
  const [isLoaded, setIsLoaded] = useState(false)
  const [hasError, setHasError] = useState(false)

  return (
    <div className={`relative overflow-hidden bg-gray-100 ${className}`}>
      {/* Animated shimmer gradient while loading */}
      {!isLoaded && !hasError && (
        <div className="absolute inset-0 z-0 bg-gradient-to-r from-gray-200 via-gray-100 to-gray-200 animate-pulse" />
      )}
      <img
        src={src}
        alt={alt}
        loading={loading}
        onLoad={() => setIsLoaded(true)}
        onError={() => setHasError(true)}
        className={`w-full h-full object-${objectFit} transition-all duration-500 ease-out ${
          isLoaded ? "opacity-100 scale-100 blur-0" : "opacity-0 scale-95 blur-xs"
        } ${imgClassName}`}
        {...props}
      />
    </div>
  )
}

// Multi-Banner Carousel Data with HD imagery and crisp typography
const CAROUSEL_BANNERS = [
  {
    id: "banner-fashion",
    tag: "NEW SEASON",
    tagColor: "bg-[#ea580c] text-white",
    title: "Fashion In",
    highlight: "Minutes",
    highlightColor: "text-[#ea580c]",
    subtitle: "Trendy styles. Everyday comfort. From trusted local stores.",
    badgeTop: "UP TO",
    badgeVal: "50%",
    badgeBot: "OFF",
    buttonText: "Shop Now",
    image: "/uploads/quick/fashion/banners/banner-1-fashion-in-minutes.webp?v=4",
    link: "/quick/category/t-shirts",
    bgClass: "from-[#FFF9F5] via-[#FFF3E8] to-[#FFEBD9]",
    badgeBg: "bg-[#ea580c] text-white",
  },
  {
    id: "banner-stores",
    tag: "LOCAL STORES",
    tagColor: "bg-blue-600 text-white",
    title: "Zudio & Trends In",
    highlight: "30 Mins",
    highlightColor: "text-blue-600",
    subtitle: "Top fashion stores in Indore delivering express to your door.",
    badgeTop: "FLAT",
    badgeVal: "40%",
    badgeBot: "OFF",
    buttonText: "Explore Stores",
    image: "/uploads/quick/fashion/banners/banner-2-local-stores.webp?v=4",
    link: "/quick/sellers",
    bgClass: "from-[#F3F8FF] via-[#E8F2FF] to-[#D9ECFF]",
    badgeBg: "bg-blue-600 text-white",
  },
  {
    id: "banner-festive",
    tag: "FESTIVE DROPS",
    tagColor: "bg-amber-600 text-white",
    title: "Instant Festive",
    highlight: "Glamour",
    highlightColor: "text-amber-600",
    subtitle: "Kurtas, ethnic sets & regal fits for your celebrations tonight.",
    badgeTop: "UP TO",
    badgeVal: "60%",
    badgeBot: "OFF",
    buttonText: "View Festive",
    image: "/uploads/quick/fashion/banners/banner-3-festive-ethnic.webp?v=4",
    link: "/quick/category/kurtas",
    bgClass: "from-[#FFFDF3] via-[#FFFBE8] to-[#FEF3C7]",
    badgeBg: "bg-amber-600 text-white",
  },
  {
    id: "banner-street",
    tag: "STREETWEAR",
    tagColor: "bg-zinc-900 text-white",
    title: "Sneakers & Fresh",
    highlight: "Street Kicks",
    highlightColor: "text-zinc-900",
    subtitle: "Oversized graphic drop-shoulders & cloud-cushioned kicks.",
    badgeTop: "STARTING",
    badgeVal: "₹499",
    badgeBot: "ONLY",
    buttonText: "Shop Kicks",
    image: "/uploads/quick/fashion/banners/banner-4-sneakers-streetwear.webp?v=4",
    link: "/quick/category/footwear",
    bgClass: "from-[#F5F5F7] via-[#EAEAED] to-[#DDDDDF]",
    badgeBg: "bg-zinc-900 text-white",
  },
]

const TRUST_ITEMS = [
  { icon: Bike, title: "Delivery in", subtitle: "30-60 min", color: "text-[#ea580c]" },
  { icon: Store, title: "Verified", subtitle: "Local Stores", color: "text-[#ea580c]" },
  { icon: RefreshCw, title: "Easy Returns", subtitle: "& Exchange", color: "text-[#ea580c]" },
  { icon: ShieldCheck, title: "100%", subtitle: "Secure Shopping", color: "text-[#ea580c]" },
]

const FASHION_CATEGORIES = [
  { name: "Men", image: "/uploads/quick/fashion/categories/men.webp?v=3", link: "/quick/category/men" },
  { name: "Women", image: "/uploads/quick/fashion/categories/women.webp?v=3", link: "/quick/category/women" },
  { name: "Kids", image: "/uploads/quick/fashion/categories/kids.webp?v=3", link: "/quick/category/kids" },
  { name: "T-Shirts", image: "/uploads/quick/fashion/categories/tshirts.webp?v=3", link: "/quick/category/t-shirts" },
  { name: "Jeans", image: "/uploads/quick/fashion/categories/jeans.webp?v=3", link: "/quick/category/jeans" },
  { name: "Footwear", image: "/uploads/quick/fashion/categories/footwear.webp?v=3", link: "/quick/category/footwear" },
  { name: "Accessories", image: "/uploads/quick/fashion/categories/accessories.webp?v=3", link: "/quick/category/accessories" },
]

const TRENDING_PRODUCTS = [
  {
    id: "prod-polo-tshirt",
    name: "Men Polo T-Shirt",
    brand: "Trends Fashion",
    price: 599,
    mrp: 999,
    discount: "40% OFF",
    eta: "32 min",
    image: "/uploads/quick/fashion/products/polo.webp?v=3",
    sizes: ["S", "M", "L", "XL"],
    link: "/quick/category/t-shirts",
  },
  {
    id: "prod-oversized-tshirt",
    name: "Oversized T-Shirt",
    brand: "Zudio",
    price: 699,
    mrp: 1199,
    discount: "42% OFF",
    eta: "28 min",
    image: "/uploads/quick/fashion/products/oversized.webp?v=3",
    sizes: ["S", "M", "L", "XL"],
    link: "/quick/category/t-shirts",
  },
  {
    id: "prod-regular-jeans",
    name: "Regular Fit Jeans",
    brand: "Max",
    price: 999,
    mrp: 1699,
    discount: "41% OFF",
    eta: "35 min",
    image: "/uploads/quick/fashion/products/jeans.webp?v=3",
    sizes: ["28", "30", "32", "34"],
    link: "/quick/category/jeans",
  },
  {
    id: "prod-casual-sneakers",
    name: "Casual Sneakers",
    brand: "Pantaloons",
    price: 1499,
    mrp: 2499,
    discount: "40% OFF",
    eta: "22 min",
    image: "/uploads/quick/fashion/products/sneakers.webp?v=3",
    sizes: ["6", "7", "8", "9"],
    link: "/quick/category/footwear",
  },
]

const FLASH_DEALS = [
  {
    id: "deal-graphic-tee",
    name: "Graphic Cotton Tee",
    brand: "Zudio",
    price: 299,
    mrp: 699,
    discount: "57% OFF",
    eta: "25 min",
    image: "/uploads/quick/fashion/products/graphic-tee.webp?v=2",
    sizes: ["S", "M", "L", "XL"],
    link: "/quick/category/t-shirts",
  },
  {
    id: "deal-sliders",
    name: "Streetwear Sliders",
    brand: "Trends Fashion",
    price: 399,
    mrp: 899,
    discount: "55% OFF",
    eta: "28 min",
    image: "/uploads/quick/fashion/products/sliders.webp?v=2",
    sizes: ["6", "7", "8", "9", "10"],
    link: "/quick/category/footwear",
  },
  {
    id: "deal-shorts",
    name: "Cotton Cargo Shorts",
    brand: "Max",
    price: 349,
    mrp: 799,
    discount: "56% OFF",
    eta: "30 min",
    image: "/uploads/quick/fashion/products/shorts.webp?v=2",
    sizes: ["30", "32", "34", "36"],
    link: "/quick/category/jeans",
  },
  {
    id: "deal-cap",
    name: "Classic Baseball Cap",
    brand: "Pantaloons",
    price: 199,
    mrp: 499,
    discount: "60% OFF",
    eta: "20 min",
    image: "/uploads/quick/fashion/products/cap.webp?v=2",
    sizes: ["Free Size"],
    link: "/quick/category/accessories",
  },
]

const LOCAL_STORES = [
  {
    id: "store-trends",
    name: "Trends Fashion",
    logo: "/uploads/quick/fashion/stores/trends.webp?v=2",
    distance: "1.2 km",
    deliveryTime: "30-40 min",
    tags: ["Men", "Women", "Kids"],
    link: "/quick/sellers",
  },
  {
    id: "store-zudio",
    name: "Zudio",
    logo: "/uploads/quick/fashion/stores/zudio.webp?v=2",
    distance: "2.1 km",
    deliveryTime: "35-45 min",
    tags: ["Men", "Women"],
    link: "/quick/sellers",
  },
  {
    id: "store-max",
    name: "Max",
    logo: "/uploads/quick/fashion/stores/max.webp?v=2",
    distance: "2.3 km",
    deliveryTime: "30-40 min",
    tags: ["Men", "Women", "Kids"],
    link: "/quick/sellers",
  },
  {
    id: "store-pantaloons",
    name: "Pantaloons",
    logo: "/uploads/quick/fashion/stores/pantaloons.webp?v=2",
    distance: "2.8 km",
    deliveryTime: "40-50 min",
    tags: ["Men", "Women"],
    link: "/quick/sellers",
  },
]

const POPULAR_COLLECTIONS = [
  {
    name: "Festive Wear",
    subtitle: "Ethnic & Traditional",
    image: "/uploads/quick/fashion/collections/festive.webp?v=4",
    link: "/quick/category/kurtas",
  },
  {
    name: "Casual Wear",
    subtitle: "Everyday Comfort",
    image: "/uploads/quick/fashion/collections/casual.webp?v=4",
    link: "/quick/category/t-shirts",
  },
  {
    name: "Winter Wear",
    subtitle: "Jackets & Hoodies",
    image: "/uploads/quick/fashion/collections/winter.webp?v=4",
    link: "/quick/category/jackets",
  },
  {
    name: "Active Wear",
    subtitle: "Gym & Sports",
    image: "/uploads/quick/fashion/collections/active.webp?v=4",
    link: "/quick/category/t-shirts",
  },
  {
    name: "Footwear",
    subtitle: "Step in Style",
    image: "/uploads/quick/fashion/collections/footwear.webp?v=4",
    link: "/quick/category/footwear",
  },
]

const OCCASIONS = [
  {
    title: "Party Night",
    tagline: "Weekend Drip",
    image: "/uploads/quick/fashion/occasions/party.webp",
    link: "/quick/category/dresses",
  },
  {
    title: "College Fits",
    tagline: "Casual Cool",
    image: "/uploads/quick/fashion/occasions/college.webp",
    link: "/quick/category/t-shirts",
  },
  {
    title: "Office Casuals",
    tagline: "Sharp Everyday",
    image: "/uploads/quick/fashion/occasions/office.webp",
    link: "/quick/category/men",
  },
  {
    title: "Vacation Vibes",
    tagline: "Breezy & Resort",
    image: "/uploads/quick/fashion/occasions/vacation.webp",
    link: "/quick/category/women",
  },
]

const STREET_STYLE_REVIEWS = [
  {
    user: "Sakshi K.",
    handle: "@sakshi_indore",
    rating: 5,
    item: "Festive Kurta Set",
    store: "Trends Fashion",
    comment: "Got this delivered in 35 mins right before a family dinner! Super soft fabric & pristine packaging.",
    time: "25 min ago",
  },
  {
    user: "Rohan M.",
    handle: "@rohan.streetwear",
    rating: 5,
    item: "Oversized Streetwear Tee",
    store: "Zudio",
    comment: "Delivered faster than pizza lol! True oversized fit and 100% thick cotton. Love the quick mode 🔥",
    time: "1 hour ago",
  },
  {
    user: "Aditi S.",
    handle: "@aditi.fits",
    rating: 5,
    item: "Regular Fit Comfort Jeans",
    store: "Max Fashion",
    comment: "Doorstep size exchange is a lifesaver. Sizing was on point. Definitely my go-to fashion app now!",
    time: "3 hours ago",
  },
]

export default function QuickMobileHome() {
  const { storePath } = useStoreMode()
  const { addToCart } = useCart()
  const [selectedSizes, setSelectedSizes] = useState({})
  const [wishlist, setWishlist] = useState({})
  const [addedIds, setAddedIds] = useState({})

  // Carousel State
  const [currentSlide, setCurrentSlide] = useState(0)
  const [touchStart, setTouchStart] = useState(null)
  const [touchEnd, setTouchEnd] = useState(null)
  const [isPaused, setIsPaused] = useState(false)

  // Auto-flow carousel every 4.5 seconds
  useEffect(() => {
    if (isPaused) return
    const timer = setInterval(() => {
      setCurrentSlide((prev) => (prev + 1) % CAROUSEL_BANNERS.length)
    }, 4500)
    return () => clearInterval(timer)
  }, [isPaused])

  const handleTouchStart = (e) => {
    setTouchStart(e.targetTouches[0].clientX)
  }

  const handleTouchMove = (e) => {
    setTouchEnd(e.targetTouches[0].clientX)
  }

  const handleTouchEnd = () => {
    if (!touchStart || !touchEnd) return
    const distance = touchStart - touchEnd
    const minSwipeDistance = 35
    if (distance > minSwipeDistance) {
      setCurrentSlide((prev) => (prev + 1) % CAROUSEL_BANNERS.length)
    } else if (distance < -minSwipeDistance) {
      setCurrentSlide((prev) => (prev - 1 + CAROUSEL_BANNERS.length) % CAROUSEL_BANNERS.length)
    }
    setTouchStart(null)
    setTouchEnd(null)
  }

  // Flash deal countdown timer
  const [timeLeft, setTimeLeft] = useState({ hours: 2, minutes: 45, seconds: 18 })

  useEffect(() => {
    const timer = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev.seconds > 0) return { ...prev, seconds: prev.seconds - 1 }
        if (prev.minutes > 0) return { ...prev, minutes: 59, seconds: 59 }
        if (prev.hours > 0) return { hours: prev.hours - 1, minutes: 59, seconds: 59 }
        return { hours: 3, minutes: 0, seconds: 0 }
      })
    }, 1000)
    return () => clearInterval(timer)
  }, [])

  const handleSizeSelect = (productId, size) => {
    setSelectedSizes((prev) => ({ ...prev, [productId]: size }))
  }

  const toggleWishlist = (productId) => {
    setWishlist((prev) => {
      const next = !prev[productId]
      toast.success(next ? "Added to Wishlist" : "Removed from Wishlist")
      return { ...prev, [productId]: next }
    })
  }

  const handleAddProduct = (prod) => {
    const chosenSize = selectedSizes[prod.id] || prod.sizes[0]
    addToCart({
      id: prod.id,
      itemId: prod.id,
      productId: prod.id,
      name: prod.name,
      price: prod.price,
      otherPrice: prod.mrp,
      image: prod.image,
      sellerName: prod.brand,
      quantity: 1,
      variantName: `Size: ${chosenSize}`,
      channels: { quick: { enabled: true, stock: 20 }, shop: { enabled: true, stock: 50 } },
    })

    // Trigger visual button feedback
    setAddedIds((prev) => ({ ...prev, [prod.id]: true }))
    toast.success(`Added ${prod.name} (${chosenSize}) to cart!`)
    setTimeout(() => {
      setAddedIds((prev) => ({ ...prev, [prod.id]: false }))
    }, 1400)
  }

  return (
    <div className="wh-desktop min-h-screen w-full max-w-full overflow-x-hidden bg-[#F8F9FA] pb-16 lg:hidden">
      {/* 1. Multi-Banner Carousel: Auto-flow, Touch-Swipeable, Crisp Vector Text & HD Photography */}
      <div
        className="px-3 pt-3"
        onMouseEnter={() => setIsPaused(true)}
        onMouseLeave={() => setIsPaused(false)}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        <div className="relative w-full overflow-hidden rounded-2xl shadow-sm border border-black/5 bg-[#FAF8F5]">
          <div
            className="flex transition-transform duration-500 ease-out"
            style={{ transform: `translateX(-${currentSlide * 100}%)` }}
          >
            {CAROUSEL_BANNERS.map((banner) => (
              <Link
                key={banner.id}
                to={storePath(banner.link)}
                className={`group relative flex-none w-full aspect-[434/180] overflow-hidden bg-gradient-to-r ${banner.bgClass} flex items-center`}
              >
                {/* High-res photography on right with smooth gradient fade */}
                <div className="absolute right-0 top-0 bottom-0 w-[55%] overflow-hidden">
                  <ImageWithSkeleton
                    src={banner.image}
                    alt={banner.title}
                    loading="eager"
                    className="h-full w-full"
                    imgClassName="transition-transform duration-500 group-hover:scale-105"
                  />
                  <div className="absolute inset-0 bg-gradient-to-r from-white/95 via-transparent to-transparent pointer-events-none" />
                </div>

                {/* Left Text / Vector Typography & Badges */}
                <div className="relative z-10 flex h-full w-[65%] flex-col justify-between p-3.5 sm:p-4">
                  <div>
                    <span
                      className={`inline-block rounded-full px-2 py-0.5 text-[8.5px] font-black uppercase tracking-wider ${banner.tagColor} shadow-2xs`}
                    >
                      {banner.tag}
                    </span>
                    <h2 className="mt-1 text-[17px] sm:text-[20px] font-black leading-tight tracking-tight text-gray-950">
                      {banner.title} <span className={banner.highlightColor}>{banner.highlight}</span>
                    </h2>
                    <p className="mt-0.5 text-[9.5px] font-medium text-gray-600 line-clamp-1 leading-snug">
                      {banner.subtitle}
                    </p>
                  </div>

                  <div className="flex items-center gap-2 pt-1">
                    {/* Discount badge */}
                    <div
                      className={`flex h-8 w-8 shrink-0 flex-col items-center justify-center rounded-full ${banner.badgeBg} shadow-sm leading-none p-0.5`}
                    >
                      <span className="text-[6px] font-bold tracking-tighter">{banner.badgeTop}</span>
                      <span className="text-[9.5px] font-black leading-none">{banner.badgeVal}</span>
                      <span className="text-[6px] font-extrabold tracking-tighter">{banner.badgeBot}</span>
                    </div>

                    {/* CTA button */}
                    <span className="inline-flex items-center gap-1 rounded-full bg-gray-950 px-3 py-1 text-[10.5px] font-black text-white shadow-xs group-hover:bg-[#ea580c] active:scale-95 transition-all">
                      {banner.buttonText} →
                    </span>
                  </div>
                </div>
              </Link>
            ))}
          </div>

          {/* Interactive Pagination Dots */}
          <div className="absolute bottom-2 left-1/2 flex -translate-x-1/2 items-center gap-1.5 pointer-events-auto z-20">
            {CAROUSEL_BANNERS.map((_, idx) => (
              <button
                key={idx}
                type="button"
                onClick={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  setCurrentSlide(idx)
                }}
                aria-label={`Go to slide ${idx + 1}`}
                className={`transition-all duration-300 rounded-full h-1.5 ${
                  currentSlide === idx ? "w-5 bg-[#ea580c]" : "w-1.5 bg-black/30 hover:bg-black/50"
                }`}
              />
            ))}
          </div>
        </div>
      </div>

      {/* 2. Value Props / Trust Strip */}
      <div className="mt-3.5 px-3">
        <div className="grid grid-cols-4 gap-2">
          {TRUST_ITEMS.map((item, idx) => {
            const Icon = item.icon
            return (
              <div
                key={idx}
                className="flex flex-col items-center justify-center rounded-xl bg-white p-2 text-center shadow-2xs border border-gray-100/90 transition-transform active:scale-95"
              >
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-orange-50 text-[#ea580c] mb-1">
                  <Icon className="h-4 w-4" />
                </div>
                <span className="text-[10px] font-medium text-gray-500 leading-tight">
                  {item.title}
                </span>
                <span className="text-[11px] font-bold text-gray-900 leading-tight">
                  {item.subtitle}
                </span>
              </div>
            )
          })}
        </div>
      </div>

      {/* 3. Shop by Category (Lazy Loaded with Shimmer Skeletons) */}
      <section className="mt-5 px-3">
        <div className="flex items-center justify-between pb-2.5">
          <h2 className="text-[16px] font-black tracking-tight text-gray-950">Shop by Category</h2>
          <Link
            to={storePath("/categories")}
            className="flex items-center text-[12px] font-bold text-[#ea580c] hover:underline"
          >
            View All <ChevronRight className="h-3.5 w-3.5" />
          </Link>
        </div>

        <div className="flex gap-2.5 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {FASHION_CATEGORIES.map((cat) => (
            <Link
              key={cat.name}
              to={storePath(cat.link)}
              className="flex w-[62px] shrink-0 flex-col items-center group active:scale-95 transition-transform"
            >
              <div className="aspect-[62/76] w-full overflow-hidden rounded-xl bg-gray-50 shadow-2xs border border-gray-200/80">
                <ImageWithSkeleton
                  src={cat.image}
                  alt={cat.name}
                  loading="lazy"
                  className="h-full w-full"
                  imgClassName="transition-transform duration-300 group-hover:scale-105"
                />
              </div>
              <span className="mt-1 text-center text-[11px] font-bold text-gray-800 line-clamp-1">
                {cat.name}
              </span>
            </Link>
          ))}
        </div>
      </section>

      {/* 4. Trending Near You (Lazy Loaded & Interactive Add To Cart Animation) */}
      <section className="mt-6 px-3">
        <div className="flex items-start justify-between pb-2.5">
          <div>
            <h2 className="text-[16px] font-black tracking-tight text-gray-950">Trending Near You</h2>
            <p className="text-[11px] text-gray-500">Popular products from local stores</p>
          </div>
          <Link
            to={storePath("/category/t-shirts")}
            className="mt-0.5 flex items-center text-[12px] font-bold text-[#ea580c] hover:underline"
          >
            View All <ChevronRight className="h-3.5 w-3.5" />
          </Link>
        </div>

        <div className="flex gap-3 overflow-x-auto pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {TRENDING_PRODUCTS.map((prod) => {
            const chosenSize = selectedSizes[prod.id] || prod.sizes[0]
            const isLiked = wishlist[prod.id]
            const isAdded = addedIds[prod.id]

            return (
              <div
                key={prod.id}
                className="flex w-[165px] shrink-0 flex-col rounded-2xl bg-white p-2.5 shadow-sm border border-gray-100 transition-shadow hover:shadow-md"
              >
                {/* Image container with ETA & Wishlist */}
                <div className="relative aspect-square w-full overflow-hidden rounded-xl bg-white flex items-center justify-center border border-gray-50 p-1">
                  <ImageWithSkeleton
                    src={prod.image}
                    alt={prod.name}
                    objectFit="contain"
                    className="h-full w-full"
                    imgClassName="transition-transform duration-300 hover:scale-105"
                  />

                  {/* Wishlist Button */}
                  <button
                    type="button"
                    onClick={() => toggleWishlist(prod.id)}
                    aria-label="Add to Wishlist"
                    className="absolute top-1.5 right-1.5 z-10 flex h-7 w-7 items-center justify-center rounded-full bg-white/90 shadow-2xs backdrop-blur-xs transition-transform active:scale-90"
                  >
                    <Heart
                      className={`h-4 w-4 ${isLiked ? "fill-rose-500 text-rose-500" : "text-gray-400"}`}
                    />
                  </button>

                  {/* ETA Badge */}
                  <div className="absolute bottom-1.5 left-1.5 z-10 flex items-center gap-1 rounded-md bg-amber-400/95 px-1.5 py-0.5 text-[10px] font-black text-gray-950 shadow-2xs">
                    <Zap className="h-3 w-3 fill-gray-950" />
                    <span>{prod.eta}</span>
                  </div>
                </div>

                {/* Brand & Title */}
                <div className="mt-2">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">
                    {prod.brand}
                  </span>
                  <h3 className="text-[12.5px] font-bold text-gray-900 line-clamp-1 leading-snug">
                    {prod.name}
                  </h3>
                </div>

                {/* Price Row */}
                <div className="mt-1 flex items-baseline gap-1.5">
                  <span className="text-[14px] font-black text-gray-950">₹{prod.price}</span>
                  <span className="text-[11px] text-gray-400 line-through">₹{prod.mrp}</span>
                  <span className="text-[11px] font-bold text-[#ea580c]">{prod.discount}</span>
                </div>

                {/* Size Selector */}
                <div className="mt-2 flex gap-1">
                  {prod.sizes.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => handleSizeSelect(prod.id, s)}
                      className={`flex h-6 min-w-[24px] items-center justify-center rounded-md px-1 text-[10px] font-bold transition-colors ${
                        chosenSize === s
                          ? "bg-gray-900 text-white"
                          : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                      }`}
                    >
                      {s}
                    </button>
                  ))}
                </div>

                {/* Interactive Add to Cart Button */}
                <button
                  type="button"
                  onClick={() => handleAddProduct(prod)}
                  className={`mt-2.5 flex w-full items-center justify-center gap-1.5 rounded-xl py-1.5 text-[12px] font-bold shadow-xs transition-all active:scale-95 ${
                    isAdded
                      ? "bg-emerald-600 text-white shadow-emerald-200"
                      : "bg-[#ea580c] hover:bg-[#c2410c] text-white"
                  }`}
                >
                  {isAdded ? (
                    <>
                      <Check className="h-3.5 w-3.5 stroke-[3]" />
                      Added!
                    </>
                  ) : (
                    <>
                      <ShoppingCart className="h-3.5 w-3.5" />
                      Add
                    </>
                  )}
                </button>
              </div>
            )
          })}
        </div>
      </section>

      {/* 5. FLASH DEALS • Under ₹499 */}
      <section className="mt-6 px-3">
        <div className="rounded-2xl bg-gradient-to-br from-amber-500 via-orange-500 to-[#ea580c] p-3 text-white shadow-sm">
          {/* Header with live timer */}
          <div className="flex items-center justify-between pb-2.5">
            <div className="flex items-center gap-1.5">
              <Flame className="h-5 w-5 text-amber-200 animate-pulse fill-amber-200" />
              <div>
                <h2 className="text-[15px] font-black leading-none text-white tracking-tight">
                  Flash Deals • Under ₹499
                </h2>
                <span className="text-[10px] text-orange-100 font-medium">Limited stock from local outlets</span>
              </div>
            </div>

            {/* Countdown Badge */}
            <div className="flex items-center gap-1 rounded-lg bg-black/30 px-2 py-1 text-[11px] font-black tracking-wider text-amber-200 backdrop-blur-xs">
              <Clock className="h-3 w-3 text-amber-200" />
              <span>
                {String(timeLeft.hours).padStart(2, "0")}:{String(timeLeft.minutes).padStart(2, "0")}:
                {String(timeLeft.seconds).padStart(2, "0")}
              </span>
            </div>
          </div>

          {/* Flash Deal Product Cards */}
          <div className="flex gap-2.5 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {FLASH_DEALS.map((deal) => {
              const chosenSize = selectedSizes[deal.id] || deal.sizes[0]
              const isAdded = addedIds[deal.id]

              return (
                <div
                  key={deal.id}
                  className="flex w-[150px] shrink-0 flex-col rounded-xl bg-white p-2 text-gray-900 shadow-sm"
                >
                  <div className="relative aspect-square w-full overflow-hidden rounded-lg bg-gray-50">
                    <ImageWithSkeleton
                      src={deal.image}
                      alt={deal.name}
                      className="h-full w-full"
                    />
                    <span className="absolute top-1 left-1 z-10 rounded bg-[#ea580c] px-1.5 py-0.5 text-[9px] font-black text-white shadow-2xs">
                      {deal.discount}
                    </span>
                    <span className="absolute bottom-1 right-1 z-10 rounded bg-black/60 px-1.5 py-0.5 text-[8.5px] font-bold text-white backdrop-blur-xs flex items-center gap-0.5">
                      <Zap className="h-2.5 w-2.5 text-amber-300 fill-amber-300" /> {deal.eta}
                    </span>
                  </div>

                  <span className="mt-1.5 text-[10px] font-semibold text-gray-500 uppercase tracking-wider">
                    {deal.brand}
                  </span>
                  <span className="text-[12px] font-bold text-gray-900 line-clamp-1 leading-snug">
                    {deal.name}
                  </span>

                  <div className="mt-1 flex items-baseline gap-1.5">
                    <span className="text-[13px] font-black text-gray-950">₹{deal.price}</span>
                    <span className="text-[10px] text-gray-400 line-through">₹{deal.mrp}</span>
                  </div>

                  {/* Size pills */}
                  <div className="mt-1.5 flex gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                    {deal.sizes.map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => handleSizeSelect(deal.id, s)}
                        className={`h-5 min-w-[20px] rounded px-1 text-[9px] font-bold transition-colors ${
                          chosenSize === s
                            ? "bg-gray-900 text-white"
                            : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                        }`}
                      >
                        {s}
                      </button>
                    ))}
                  </div>

                  <button
                    type="button"
                    onClick={() => handleAddProduct(deal)}
                    className={`mt-2 flex w-full items-center justify-center gap-1 rounded-lg py-1 text-[11px] font-bold transition-all active:scale-95 ${
                      isAdded
                        ? "bg-emerald-600 text-white"
                        : "bg-[#ea580c] hover:bg-[#c2410c] text-white shadow-2xs"
                    }`}
                  >
                    {isAdded ? (
                      <>
                        <Check className="h-3 w-3 stroke-[3]" /> Added!
                      </>
                    ) : (
                      <>
                        <ShoppingCart className="h-3 w-3" /> Add
                      </>
                    )}
                  </button>
                </div>
              )
            })}
          </div>
        </div>
      </section>

      {/* 6. Shop by Occasion */}
      <section className="mt-6 px-3">
        <div className="flex items-center justify-between pb-2.5">
          <div>
            <h2 className="text-[16px] font-black tracking-tight text-gray-950">Shop by Occasion</h2>
            <p className="text-[11px] text-gray-500">Curated looks for every plan</p>
          </div>
          <Link
            to={storePath("/categories")}
            className="text-[12px] font-bold text-[#ea580c] hover:underline"
          >
            Explore <ChevronRight className="inline h-3.5 w-3.5" />
          </Link>
        </div>

        <div className="grid grid-cols-2 gap-2.5">
          {OCCASIONS.map((occ) => (
            <Link
              key={occ.title}
              to={storePath(occ.link)}
              className="group relative block aspect-[16/10] overflow-hidden rounded-xl shadow-2xs border border-gray-100"
            >
              <ImageWithSkeleton
                src={occ.image}
                alt={occ.title}
                className="h-full w-full"
                imgClassName="transition-transform duration-500 group-hover:scale-105"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent flex flex-col justify-end p-2.5 text-white">
                <span className="text-[9.5px] font-medium text-amber-200 tracking-wide uppercase">
                  {occ.tagline}
                </span>
                <span className="text-[13px] font-black leading-tight drop-shadow-xs">
                  {occ.title}
                </span>
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* 7. Stores Delivering Near You */}
      <section className="mt-6 px-3">
        <div className="flex items-start justify-between pb-2.5">
          <div>
            <h2 className="text-[16px] font-black tracking-tight text-gray-950">
              Stores Delivering Near You
            </h2>
            <p className="text-[11px] text-gray-500">Fashion stores around your location</p>
          </div>
          <Link
            to={storePath("/sellers")}
            className="mt-0.5 flex items-center text-[12px] font-bold text-[#ea580c] hover:underline"
          >
            View All <ChevronRight className="h-3.5 w-3.5" />
          </Link>
        </div>

        <div className="flex gap-2.5 overflow-x-auto pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {LOCAL_STORES.map((store) => (
            <Link
              key={store.id}
              to={storePath(store.link)}
              className="flex w-[155px] shrink-0 flex-col rounded-2xl bg-white p-3 shadow-sm border border-gray-100 group active:scale-95 transition-transform"
            >
              <div className="flex items-center gap-2.5">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gray-50 border border-gray-100 p-1 shadow-2xs">
                  <ImageWithSkeleton
                    src={store.logo}
                    alt={store.name}
                    objectFit="contain"
                    className="h-full w-full"
                  />
                </div>
                <div className="min-w-0">
                  <h3 className="text-[12.5px] font-bold text-gray-900 truncate">{store.name}</h3>
                  <span className="inline-block rounded bg-orange-50 px-1 py-0.5 text-[9px] font-bold text-[#ea580c]">
                    {store.distance}
                  </span>
                </div>
              </div>

              <div className="mt-2.5 flex items-center gap-1 text-[10.5px] font-semibold text-gray-500">
                <Clock className="h-3 w-3 text-[#ea580c]" />
                <span>{store.deliveryTime}</span>
              </div>

              <div className="mt-2 flex flex-wrap gap-1">
                {store.tags.map((t) => (
                  <span
                    key={t}
                    className="rounded bg-gray-100 px-1.5 py-0.5 text-[9px] font-medium text-gray-600"
                  >
                    {t}
                  </span>
                ))}
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* 8. Popular Collections */}
      <section className="mt-6 px-3">
        <div className="flex items-center justify-between pb-2.5">
          <h2 className="text-[16px] font-black tracking-tight text-gray-950">Popular Collections</h2>
          <Link
            to={storePath("/categories")}
            className="flex items-center text-[12px] font-bold text-[#ea580c] hover:underline"
          >
            View All <ChevronRight className="h-3.5 w-3.5" />
          </Link>
        </div>

        <div className="flex gap-2.5 overflow-x-auto pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {POPULAR_COLLECTIONS.map((col) => (
            <Link
              key={col.name}
              to={storePath(col.link)}
              className="group relative flex w-[140px] shrink-0 flex-col overflow-hidden rounded-2xl bg-white shadow-sm border border-gray-100"
            >
              <div className="aspect-[4/5] w-full overflow-hidden bg-gray-100">
                <ImageWithSkeleton
                  src={col.image}
                  alt={col.name}
                  loading="lazy"
                  className="h-full w-full"
                  imgClassName="transition-transform duration-300 group-hover:scale-105"
                />
              </div>
              <div className="p-2.5">
                <h3 className="text-[12px] font-bold text-gray-900 line-clamp-1">{col.name}</h3>
                <p className="text-[10px] text-gray-500 line-clamp-1">{col.subtitle}</p>
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* 9. Street Style & Verified Local Reviews */}
      <section className="mt-6 px-3">
        <div className="flex items-center justify-between pb-2.5">
          <div>
            <h2 className="text-[16px] font-black tracking-tight text-gray-950">
              Indore Street Style ✨
            </h2>
            <p className="text-[11px] text-gray-500">Loved by 50,000+ local fashion shoppers</p>
          </div>
          <span className="flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700">
            <CheckCircle2 className="h-3 w-3" /> Verified
          </span>
        </div>

        <div className="flex gap-2.5 overflow-x-auto pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {STREET_STYLE_REVIEWS.map((rev, idx) => (
            <div
              key={idx}
              className="flex w-[210px] shrink-0 flex-col justify-between rounded-2xl bg-white p-3 shadow-2xs border border-gray-100"
            >
              <div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1">
                    {[...Array(rev.rating)].map((_, i) => (
                      <Star key={i} className="h-3 w-3 fill-amber-400 text-amber-400" />
                    ))}
                  </div>
                  <span className="text-[9.5px] text-gray-400">{rev.time}</span>
                </div>

                <p className="mt-2 text-[11px] text-gray-700 italic leading-relaxed">
                  "{rev.comment}"
                </p>
              </div>

              <div className="mt-3 border-t border-gray-100 pt-2">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold text-gray-900">{rev.user}</span>
                  <span className="text-[9px] text-[#ea580c] font-semibold">{rev.store}</span>
                </div>
                <span className="text-[9.5px] text-gray-400">{rev.item}</span>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* 10. Why Warehouses Quick Fashion? */}
      <section className="mt-6 px-3">
        <div className="rounded-2xl bg-gradient-to-r from-orange-50 to-amber-50 p-3.5 border border-orange-100">
          <div className="flex items-center gap-1.5 pb-2">
            <Sparkles className="h-4 w-4 text-[#ea580c]" />
            <h3 className="text-[13px] font-black text-gray-900">Why Warehouses Quick?</h3>
          </div>
          <div className="grid grid-cols-2 gap-2 text-[11px]">
            <div className="rounded-lg bg-white p-2 shadow-2xs border border-orange-100/60">
              <span className="font-bold text-gray-900 block">⚡ 30-60 Min Delivery</span>
              <span className="text-[10px] text-gray-500">From Indore's top fashion retail stores</span>
            </div>
            <div className="rounded-lg bg-white p-2 shadow-2xs border border-orange-100/60">
              <span className="font-bold text-gray-900 block">👕 Doorstep Trial</span>
              <span className="text-[10px] text-gray-500">Try it on, keep only what fits you best</span>
            </div>
            <div className="rounded-lg bg-white p-2 shadow-2xs border border-orange-100/60">
              <span className="font-bold text-gray-900 block">🔄 24-Hr Easy Swap</span>
              <span className="text-[10px] text-gray-500">Instant size exchange without hassles</span>
            </div>
            <div className="rounded-lg bg-white p-2 shadow-2xs border border-orange-100/60">
              <span className="font-bold text-gray-900 block">🛡️ 100% Original</span>
              <span className="text-[10px] text-gray-500">Official store bills & brand tags attached</span>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}
