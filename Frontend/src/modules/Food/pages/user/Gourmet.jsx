import { useState, useEffect, useMemo } from "react"
import { Link, useNavigate } from "react-router-dom"
import { ArrowLeft, Star, Clock, Bookmark, BadgePercent } from "lucide-react"
import { Button } from "@food/components/ui/button"
import { Card, CardContent } from "@food/components/ui/card"
import api, { publicGetOnce } from "@food/api"
import useAppBackNavigation from "@food/hooks/useAppBackNavigation"
import { toast } from "sonner"
import { API_BASE_URL } from "@food/api/config"
import OptimizedImage from "@food/components/OptimizedImage"
import { SellerGridSkeleton } from "@food/components/ui/loading-skeletons"
import { useDelayedLoading } from "@food/hooks/useDelayedLoading"
import { useDeliveryLocation } from "@food/context/DeliveryLocationContext"

// Import banner
import gourmetBanner from "@food/assets/groumetpagebanner.png"

const debugLog = (...args) => {}
const debugWarn = (...args) => {}
const debugError = (...args) => {}

export default function Gourmet() {
  const navigate = useNavigate()
  const goBack = useAppBackNavigation()
  const [favorites, setFavorites] = useState(new Set())
  const [gourmetSellers, setGourmetSellers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const {
    effectiveLocation,
    zoneId,
    zoneStatus,
    zoneLoading,
  } = useDeliveryLocation()
  
  const showGourmetSkeleton = useDelayedLoading(loading || zoneStatus === 'loading' || zoneLoading)

  const backendOrigin = (API_BASE_URL || "").replace(/\/api\/v1\/?$/, "")

  const resolveImageUrl = (url) => {
    if (typeof url !== "string") return ""
    const trimmed = url.trim()
    if (!trimmed) return ""
    if (/^(https?:|\/\/|data:|blob:)/i.test(trimmed)) return trimmed
    if (!backendOrigin) return trimmed
    return `${backendOrigin.replace(/\/$/, "")}${trimmed.startsWith("/") ? trimmed : `/${trimmed}`}`
  }

  // Fetch Gourmet sellers from public API
  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    const fetchGourmetSellers = async () => {
      if (!zoneId) {
        if (zoneStatus !== 'loading' && !zoneLoading) {
          setGourmetSellers([]);
          setLoading(false);
        }
        return;
      }

      try {
        setError(null)
        const response = await api.get('/food/hero-banners/gourmet/public', {
          params: { zoneId }
        })
        
        if (cancelled) return;
        
        const data = response?.data?.data
        const list = data?.sellers ?? (Array.isArray(data) ? data : [])
        setGourmetSellers(list);
      } catch (err) {
        if (cancelled) return;
        const errorMessage = err?.response?.data?.message || err?.message || 'Failed to load Gourmet sellers'
        setError(errorMessage)
        setGourmetSellers([])
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    fetchGourmetSellers()
    
    return () => {
      cancelled = true;
    }
  }, [zoneId, zoneStatus, zoneLoading])

  const toggleFavorite = (id) => {
    setFavorites(prev => {
      const newSet = new Set(prev)
      if (newSet.has(id)) {
        newSet.delete(id)
      } else {
        newSet.add(id)
      }
      return newSet
    })
  }

  return (
    <div className="min-h-screen bg-white dark:bg-[#0a0a0a]">
      {/* Banner Section */}
      <div className="relative w-full overflow-hidden min-h-[25vh] md:min-h-[30vh]">
        {/* Back Button */}
        <button
          onClick={goBack}
          className="absolute top-4 left-4 md:top-6 md:left-6 z-20 w-10 h-10 md:w-12 md:h-12 bg-gray-800/60 backdrop-blur-sm rounded-full flex items-center justify-center hover:bg-gray-800/80 transition-colors"
        >
          <ArrowLeft className="h-5 w-5 md:h-6 md:w-6 text-white" />
        </button>

        {/* Banner Image */}
        <div className="absolute inset-0 z-0">
          <img
            src={gourmetBanner}
            alt="Gourmet Dining"
            className="w-full h-full object-cover"
          />
        </div>
      </div>

      {/* Content */}
      <div className="px-4 sm:px-6 md:px-8 lg:px-10 py-6 md:py-8 lg:py-10 space-y-4 md:space-y-6">
        <div className="max-w-7xl mx-auto space-y-4 md:space-y-6">
          {/* Header */}
          <div className="mb-2">
            <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-gray-100">Premium Gourmet Sellers</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Exquisite dining experiences delivered to your doorstep</p>
          </div>

          {/* Seller Count */}
          <p className="text-xs sm:text-sm font-semibold text-gray-400 dark:text-gray-500 tracking-widest uppercase">
            {showGourmetSkeleton ? '...' : gourmetSellers.length} GOURMET SELLERS
          </p>

          {/* Loading State */}
          {showGourmetSkeleton && <SellerGridSkeleton count={4} />}

          {/* Error State */}
          {error && !loading && (
            <div className="flex flex-col items-center justify-center py-20">
              <p className="text-red-500 dark:text-red-400 text-center">{error}</p>
              <Button onClick={() => window.location.reload()} className="mt-4">Retry</Button>
            </div>
          )}

          {/* Seller Cards */}
          {!showGourmetSkeleton && !error && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
              {gourmetSellers.length === 0 ? (
                <div className="col-span-full text-center py-12">
                  <p className="text-gray-500 dark:text-gray-400">No Gourmet sellers available at the moment</p>
                </div>
              ) : (
                gourmetSellers.map((item) => {
                  const seller = item.seller || item
                  const sellerSlug = seller.slug || seller.sellerName?.toLowerCase().replace(/\s+/g, "-") || seller.name?.toLowerCase().replace(/\s+/g, "-") || ""
                  const sellerId = seller._id || seller.sellerId || seller.id
                  const isFavorite = favorites.has(sellerId)

                  // Calculate distance if coordinates are available
                  const calculateDistance = (lat1, lng1, lat2, lng2) => {
                    const R = 6371; // Earth's radius in kilometers
                    const dLat = ((lat2 - lat1) * Math.PI) / 180;
                    const dLng = ((lng2 - lng1) * Math.PI) / 180;
                    const a =
                      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
                      Math.cos((lat1 * Math.PI) / 180) *
                        Math.cos((lat2 * Math.PI) / 180) *
                        Math.sin(dLng / 2) *
                        Math.sin(dLng / 2);
                    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
                    return R * c; // Distance in kilometers
                  };

                  let distanceStr = '1.2 km'
                  const sellerLat = seller.location?.latitude || seller.location?.coordinates?.[1]
                  const sellerLng = seller.location?.longitude || seller.location?.coordinates?.[0]
                  
                  if (location?.latitude && location?.longitude && sellerLat && sellerLng) {
                    const d = calculateDistance(location.latitude, location.longitude, sellerLat, sellerLng)
                    distanceStr = `${d.toFixed(1)} km`
                  } else if (seller.distance) {
                    distanceStr = seller.distance
                  }

                  // Get seller cover image with priority: coverImages > menuImages > profileImage
                  const coverImages = seller.coverImages && seller.coverImages.length > 0
                    ? seller.coverImages.map(img => img.url || img).filter(Boolean)
                    : []

                  const menuImages = seller.menuImages && seller.menuImages.length > 0
                    ? seller.menuImages.map(img => img.url || img).filter(Boolean)
                    : []

                  const rawSellerImage =
                    coverImages.length > 0
                      ? coverImages[0]
                      : (menuImages.length > 0
                        ? menuImages[0]
                        : (seller.profileImage?.url || seller.profileImage || seller.image || ""))

                  const sellerImage = resolveImageUrl(rawSellerImage)

                  return (
                    <Link key={sellerId} to={`/user/sellers/${sellerSlug}`}>
                      <Card className="overflow-hidden cursor-pointer border-0 group bg-white dark:bg-[#1a1a1a] shadow-md hover:shadow-xl transition-all duration-300 py-0 rounded-2xl mb-4">
                        {/* Image Section */}
                        <div className="relative h-44 sm:h-52 md:h-56 w-full overflow-hidden rounded-t-2xl">
                          {sellerImage ? (
                            <OptimizedImage
                              src={sellerImage}
                              alt={seller.sellerName || seller.name}
                              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                            />
                          ) : (
                            <div className="w-full h-full bg-slate-200 dark:bg-slate-800 flex items-center justify-center">
                              <span className="text-slate-600 dark:text-slate-300 text-sm font-semibold">
                                No image
                              </span>
                            </div>
                          )}

                          {/* Bookmark Icon - Top Right */}
                          <Button
                            variant="ghost"
                            size="icon"
                            className="absolute top-3 right-3 h-9 w-9 bg-white/90 backdrop-blur-sm rounded-lg hover:bg-white transition-colors"
                            onClick={(e) => {
                              e.preventDefault()
                              e.stopPropagation()
                              toggleFavorite(sellerId)
                            }}
                          >
                            <Bookmark className={`h-5 w-5 ${isFavorite ? "fill-gray-800 dark:fill-gray-200 text-gray-800 dark:text-gray-200" : "text-gray-600 dark:text-gray-400"}`} strokeWidth={2} />
                          </Button>
                        </div>

                        {/* Content Section */}
                        <CardContent className="p-3 sm:p-4">
                          {/* Seller Name & Rating */}
                          <div className="flex items-start justify-between gap-2 mb-2">
                            <div className="flex-1 min-w-0">
                              <h3 className="text-lg sm:text-xl font-bold text-gray-900 dark:text-gray-100 line-clamp-1">
                                {seller.sellerName || seller.name}
                              </h3>
                            </div>
                            <div className="flex-shrink-0 bg-green-600 text-white px-2 py-1 rounded-lg flex items-center gap-1">
                              <span className="text-sm font-bold">{seller.rating?.toFixed(1) || '0.0'}</span>
                              <Star className="h-3 w-3 fill-white text-white" />
                            </div>
                          </div>

                          {/* Delivery Time & Distance */}
                          <div className="flex items-center gap-1 text-sm text-gray-500 dark:text-gray-400 mb-2">
                            <Clock className="h-4 w-4" strokeWidth={1.5} />
                            <span className="font-medium">{seller.estimatedDeliveryTime || '25-30 mins'}</span>
                            <span className="mx-1">|</span>
                            <span className="font-medium">{distanceStr}</span>
                          </div>

                          {/* Offer Badge */}
                          {seller.offer && (
                            <div className="flex items-center gap-2 text-sm">
                              <BadgePercent className="h-4 w-4 text-[#EB590E] dark:text-[#F97316]" strokeWidth={2} />
                              <span className="text-gray-700 dark:text-gray-300 font-medium">{seller.offer}</span>
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    </Link>
                  )
                })
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
