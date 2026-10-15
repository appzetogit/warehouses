import { useStoreMode } from "@store/context/StoreModeContext"
import { channelAvailability, stockLabel } from "@store/utils/channelStock"
import { useState, useEffect, useRef, Component, useMemo } from "react"
import { useParams, useNavigate, useSearchParams } from "react-router-dom"
import { sellerAPI, orderAPI } from "@store/api"
import { API_BASE_URL } from "@store/api/config"
import { toast } from "sonner"
import { useDeliveryLocation } from "@store/context/DeliveryLocationContext"
import { getUserSellerDistance, normalizeSellerLocation } from "@store/utils/geo"
import { fetchDrivingDistanceKm, formatDistanceLabel } from "@store/utils/roadDistance"
import { AlertCircle } from "lucide-react"
import { Button } from "@store/components/ui/button"
import AnimatedPage from "@store/components/user/AnimatedPage"
import { useCart } from "@store/context/CartContext"
import { isModuleAuthenticated } from "@store/utils/auth"
import { getSellerAvailabilityStatus } from "@store/utils/sellerAvailability"
import useAppBackNavigation from "@store/hooks/useAppBackNavigation"
import {
  buildCartLineId,
  getDefaultProductVariant,
  getProductDisplayOtherPrice,
  getProductDisplayPrice,
  getProductVariants,
  hasProductVariants,
} from "@store/utils/productVariants"
import { SellerDetailSkeleton } from "@store/components/ui/loading-skeletons"
import StoreDesktop from "@store/components/user/desktop/StoreDesktop"

const debugLog = (...args) => {}
const debugWarn = (...args) => {}
const debugError = (...args) => {}

const PRODUCT_IMAGE_FALLBACK = "https://picsum.photos/seed/food-fallback/800/600"

const resolveSellerImageUrl = (image) => {
  if (!image) return null
  if (typeof image === "string") {
    const trimmed = image.trim()
    return trimmed || null
  }
  return image?.url || image?.src || null
}

const buildHeroImages = (seller) => {
  if (!seller) return [PRODUCT_IMAGE_FALLBACK]
  const images = []
  const pushUnique = (value) => {
    const url = resolveSellerImageUrl(value)
    if (url && !images.includes(url)) images.push(url)
  }
  if (Array.isArray(seller.coverImages)) seller.coverImages.forEach(pushUnique)
  pushUnique(seller.profileImage)
  const mainImage = resolveSellerImageUrl(seller.image)
  if (mainImage && !images.includes(mainImage)) pushUnique(mainImage)
  return images.length > 0 ? images : [PRODUCT_IMAGE_FALLBACK]
}

function SellerDetailsContent() {
  const { fulfilmentMode, storePath } = useStoreMode()
  const { slug } = useParams()
  const navigate = useNavigate()
  const goBack = useAppBackNavigation()
  // Drop sticky listing distance once — old 6.9 cache was locking details.
  useEffect(() => {
    try {
      sessionStorage.removeItem("store_last_opened_seller_distance")
    } catch (_) {}
  }, [])
  const [searchParams] = useSearchParams()
  const targetDishId = useMemo(() => String(searchParams.get('dish') || '').trim(), [searchParams])
  const { addToCart, updateQuantity, removeFromCart, getCartItem } = useCart()
  const {
    effectiveLocation: userLocation,
    zoneId,
    isOutOfService,
  } = useDeliveryLocation()
  const [availabilityTick, setAvailabilityTick] = useState(Date.now())

  const getLineItemIdForDish = (item, variant = null) =>
    buildCartLineId(item?.id || item?._id || "", variant?.id || variant?._id || "")

  const isRecommendedItem = (item) => {
    return item.isRecommended === true && typeof item.isRecommended === "boolean"
  }

  // Seller data state
  const [seller, setSeller] = useState(null)
  const [loadingSeller, setLoadingSeller] = useState(true)
  const [sellerError, setSellerError] = useState(null)
  const fetchedSellerRef = useRef(false) // Track if seller has been fetched for current slug
  const fetchedSlugRef = useRef(null)

  useEffect(() => {
    const tickAvailability = () => {
      if (typeof document !== "undefined" && document.hidden) return
      setAvailabilityTick(Date.now())
    }

    const intervalId = setInterval(tickAvailability, 60000)
    const handleVisibilityChange = () => {
      if (typeof document !== "undefined" && !document.hidden) {
        setAvailabilityTick(Date.now())
      }
    }
    document.addEventListener("visibilitychange", handleVisibilityChange)

    return () => {
      clearInterval(intervalId)
      document.removeEventListener("visibilitychange", handleVisibilityChange)
    }
  }, [])


  // Fetch seller data from API
  useEffect(() => {
    const fetchSeller = async () => {
      if (!slug) return

      // Prevent re-fetching for the same slug. Mobile location/zone updates can
      // trigger transient refetch failures that clear already-rendered content.
      if (fetchedSellerRef.current && fetchedSlugRef.current === slug && seller) {
        return
      }

      try {
        // Keep the existing page visible on background retries.
        setLoadingSeller(!fetchedSellerRef.current && !seller)
        setSellerError(null)

        debugLog('Fetching seller with slug:', slug)
        let response = null
        let apiSeller = null

        // Seller API (works for both ObjectId and slug)
        if (!apiSeller) {
          try {
            // First, try to get seller directly by slug/ID (no zoneId needed)
            try {
              response = await sellerAPI.getSellerById(slug)
              if (response?.data?.success && response?.data?.data) {
                apiSeller = response.data.data
                debugLog('? Found seller in seller API by slug/ID:', apiSeller)
              }
            } catch (directLookupError) {
              // If direct lookup fails, try searching by name.
              // Fallback without zoneId so missing live location never blocks this page.
              debugLog('? Direct lookup failed, trying search by name...')

                const searchVariants = zoneId
                  ? [{ limit: 100, zoneId: zoneId, _ts: Date.now() }, { limit: 100, _ts: Date.now() }]
                  : [{ limit: 100, _ts: Date.now() }]

                for (const searchParams of searchVariants) {
                  try {
                    const searchResponse = await sellerAPI.getSellers(searchParams, { noCache: true })
                    const sellers = searchResponse?.data?.data?.sellers || searchResponse?.data?.data || []

                    // Try to find by slug match or name match
                    const sellerName = slug.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase())
                    const matchingSeller = sellers.find(r =>
                      r.slug === slug ||
                      r.name?.toLowerCase().replace(/\s+/g, '-') === slug.toLowerCase() ||
                      r.name?.toLowerCase() === sellerName.toLowerCase()
                    )

                    if (matchingSeller) {
                      // Get full seller details by ID
                      const fullResponse = await sellerAPI.getSellerById(matchingSeller._id || matchingSeller.sellerId)
                      if (fullResponse.data && fullResponse.data.success && fullResponse.data.data) {
                        apiSeller = fullResponse.data.data
                        debugLog('? Found seller in seller API by name search:', apiSeller)
                        break
                      }
                    }
                  } catch (searchError) {
                    debugWarn('? Search fallback failed for params:', searchParams, searchError?.message)
                  }
                }
            }
          } catch (sellerError) {
            debugError('? Seller not found in seller API either:', sellerError)
          }
        }

        if (apiSeller) {
          debugLog('? Fetched seller from API:', apiSeller)
          debugLog('? Seller data keys:', Object.keys(apiSeller))
          debugLog('? Seller name field:', apiSeller?.name)
          debugLog('? Seller sellerId:', apiSeller?.sellerId)
          debugLog('? Seller _id:', apiSeller?._id)
          debugLog('? Seller.seller:', apiSeller?.seller)

          // Some responses nest the seller data under `seller`
          const actualSeller = apiSeller?.seller || apiSeller

          // Helper function to format address with zone and pin code
          const formatSellerAddress = (locationObj) => {
            if (!locationObj) return "Location"

            // If location is a string, return it as is
            if (typeof locationObj === 'string') {
              return locationObj
            }

            // PRIORITY 1: Use formattedAddress if it's complete and has pin code
            // formattedAddress usually has the most complete information from Google Maps
            if (locationObj.formattedAddress && locationObj.formattedAddress.trim() !== "" && locationObj.formattedAddress !== "Select location") {
              const isCoordinates = /^-?\d+\.\d+,\s*-?\d+\.\d+$/.test(locationObj.formattedAddress.trim())
              if (!isCoordinates) {
                const formattedAddr = locationObj.formattedAddress.trim()
                // Check if it contains a pin code (6 digit number)
                const hasPinCode = /\b\d{6}\b/.test(formattedAddr)
                // If it has pin code, it's complete - use it directly
                if (hasPinCode) {
                  // Clean up the address - remove Google Plus Code if present (e.g., "PV6X+JXX, ")
                  const cleanedAddr = formattedAddr.replace(/^[A-Z0-9]+\+[A-Z0-9]+,\s*/i, '')
                  return cleanedAddr
                }
                // If it has multiple parts (3+), it's likely complete
                if (formattedAddr.split(',').length >= 3) {
                  const cleanedAddr = formattedAddr.replace(/^[A-Z0-9]+\+[A-Z0-9]+,\s*/i, '')
                  return cleanedAddr
                }
              }
            }

            // PRIORITY 2: Build address from location object components (with zone and pin code)
            // This ensures we always show zone and pin code if available
            const addressParts = []

            // Add addressLine1 if available
            if (locationObj.addressLine1 && locationObj.addressLine1.trim() !== "") {
              addressParts.push(locationObj.addressLine1.trim())
            }

            // Add addressLine2 if available
            if (locationObj.addressLine2 && locationObj.addressLine2.trim() !== "") {
              addressParts.push(locationObj.addressLine2.trim())
            }

            // Add area (zone) if available
            if (locationObj.area && locationObj.area.trim() !== "") {
              addressParts.push(locationObj.area.trim())
            }

            // Add city if available
            if (locationObj.city && locationObj.city.trim() !== "") {
              addressParts.push(locationObj.city.trim())
            }

            // Add state if available
            if (locationObj.state && locationObj.state.trim() !== "") {
              addressParts.push(locationObj.state.trim())
            }

            // Add pin code (priority: pincode > zipCode > postalCode)
            const pinCode = locationObj.pincode || locationObj.zipCode || locationObj.postalCode
            if (pinCode && pinCode.toString().trim() !== "") {
              addressParts.push(pinCode.toString().trim())
            }

            // If we have at least 3 parts (complete address), use it
            if (addressParts.length >= 3) {
              return addressParts.join(', ')
            }

            // If we have at least 2 parts, use it
            if (addressParts.length >= 2) {
              return addressParts.join(', ')
            }

            // PRIORITY 3: Fallback to formattedAddress (even if incomplete)
            if (locationObj.formattedAddress && locationObj.formattedAddress.trim() !== "" && locationObj.formattedAddress !== "Select location") {
              const isCoordinates = /^-?\d+\.\d+,\s*-?\d+\.\d+$/.test(locationObj.formattedAddress.trim())
              if (!isCoordinates) {
                const cleanedAddr = locationObj.formattedAddress.trim().replace(/^[A-Z0-9]+\+[A-Z0-9]+,\s*/i, '')
                return cleanedAddr
              }
            }

            // PRIORITY 4: Fallback to address field
            if (locationObj.address && locationObj.address.trim() !== "") {
              return locationObj.address.trim()
            }

            // PRIORITY 5: Last fallback - use area or city
            return locationObj.area || locationObj.city || "Location"
          }

          // Get location object for address formatting
          const locationObj = actualSeller?.location || apiSeller?.location
          debugLog('? Location Object for formatting:', locationObj)
          debugLog('? formattedAddress field:', locationObj?.formattedAddress)
          const formattedAddress = formatSellerAddress(locationObj)
          debugLog('? Final Formatted Address:', formattedAddress)

          // Same Haversine + coordinate parsing as delivery new-order.
          const locationForDistance = normalizeSellerLocation(locationObj) || locationObj
          const measured = getUserSellerDistance(userLocation?.deliveryAddress || userLocation, locationForDistance)
          const calculatedDistance = measured?.label || null
          if (calculatedDistance) {
            debugLog('? Calculated distance from user to seller:', calculatedDistance, 'km:', measured.km)
          } else {
            debugWarn('? Cannot calculate distance - missing coordinates:', {
              hasUserLocation: !!(userLocation?.latitude || userLocation?.coordinates),
              hasSellerLocation: !!locationObj,
              userLocation,
              locationObj,
            })
          }

          // Resolve display category with broad API compatibility
          const categoryFromArray = (list) => {
            if (!Array.isArray(list) || list.length === 0) return null
            const firstEntry = list[0]
            if (typeof firstEntry === "string") return firstEntry
            if (firstEntry && typeof firstEntry === "object") {
              return firstEntry.name || firstEntry.label || firstEntry.title || null
            }
            return null
          }

          const resolvedTopCategory =
            actualSeller?.topCategory ||
            apiSeller?.topCategory ||
            categoryFromArray(actualSeller?.topCategories) ||
            categoryFromArray(apiSeller?.topCategories) ||
            categoryFromArray(actualSeller?.categories) ||
            categoryFromArray(apiSeller?.categories) ||
            actualSeller?.category ||
            apiSeller?.category ||
            null

          const onboardingStep2 = actualSeller?.onboarding?.step2 || apiSeller?.onboarding?.step2 || {}
          const onboardingStep4 = actualSeller?.onboarding?.step4 || apiSeller?.onboarding?.step4 || {}
          const normalizedProfileImage = actualSeller?.profileImage || apiSeller?.profileImage || onboardingStep2?.profileImageUrl || null
          const normalizedCoverImages =
            Array.isArray(actualSeller?.coverImages) && actualSeller.coverImages.length > 0
              ? actualSeller.coverImages
              : Array.isArray(apiSeller?.coverImages) && apiSeller.coverImages.length > 0
                ? apiSeller.coverImages
                : []
          const normalizedMenuImages =
            Array.isArray(actualSeller?.menuImages) && actualSeller.menuImages.length > 0
              ? actualSeller.menuImages
              : Array.isArray(apiSeller?.menuImages) && apiSeller.menuImages.length > 0
                ? apiSeller.menuImages
                : Array.isArray(onboardingStep2?.menuImageUrls)
                  ? onboardingStep2.menuImageUrls
                  : []
          const normalizedSellerOffers = actualSeller?.sellerOffers || apiSeller?.sellerOffers || {}

          // Transform API data to match expected format with comprehensive fallbacks
          // Handle both nested and flat seller data structures
          const transformedSeller = {
            id: actualSeller?.sellerId || actualSeller?._id || actualSeller?.id || apiSeller?.sellerId || apiSeller?._id || null,
            mongoId: actualSeller?._id || apiSeller?._id || null,
            name:
              actualSeller?.name ||
              actualSeller?.sellerName ||
              apiSeller?.name ||
              apiSeller?.sellerName ||
              "Unknown Seller",
            topCategory: resolvedTopCategory,
            rating: actualSeller?.rating || apiSeller?.rating || actualSeller?.averageRating || apiSeller?.averageRating || 4.5,
            reviews: actualSeller?.totalRatings || apiSeller?.totalRatings || actualSeller?.reviewCount || apiSeller?.reviewCount || actualSeller?.reviews?.length || apiSeller?.reviews?.length || 0,
            deliveryTime: actualSeller?.estimatedDeliveryTime || apiSeller?.estimatedDeliveryTime || actualSeller?.deliveryTime || apiSeller?.deliveryTime || actualSeller?.avgDeliveryTime || apiSeller?.avgDeliveryTime || "25-30 mins",
            distance: calculatedDistance || "—",
            location: formattedAddress,
            locationObject: locationForDistance || locationObj, // Normalized location for distance recalculation
            image: normalizedCoverImages?.[0]?.url
              || normalizedCoverImages?.[0]
              || normalizedProfileImage?.url
              || normalizedProfileImage
              || actualSeller?.image
              || apiSeller?.image
              || null,
            priceRange: actualSeller?.priceRange || apiSeller?.priceRange || onboardingStep4?.priceRange || "$$",
            offers: Array.isArray(actualSeller?.offers) ? actualSeller.offers : (Array.isArray(apiSeller?.offers) ? apiSeller.offers : []), // Will be populated from menu/offers API later
            offerText: actualSeller?.offer || apiSeller?.offer || onboardingStep4?.offer,
            offerCount: actualSeller?.offerCount || apiSeller?.offerCount || 0,
            sellerOffers: {
              goldOffer: {
                title: normalizedSellerOffers?.goldOffer?.title || "Gold exclusive offer",
                description: apiSeller?.sellerOffers?.goldOffer?.description || "Free delivery above ₹99",
                unlockText: normalizedSellerOffers?.goldOffer?.unlockText || "join Gold to unlock",
                buttonText: apiSeller?.sellerOffers?.goldOffer?.buttonText || "Add Gold - ₹1",
              },
              coupons: Array.isArray(normalizedSellerOffers?.coupons)
                ? normalizedSellerOffers.coupons
                : [],
            },
            outlets: Array.isArray(actualSeller?.outlets) ? actualSeller.outlets : (Array.isArray(apiSeller?.outlets) ? apiSeller.outlets : []),
            categories: Array.isArray(actualSeller?.categories) ? actualSeller.categories : (Array.isArray(apiSeller?.categories) ? apiSeller.categories : []),
            menu: Array.isArray(actualSeller?.menu) ? actualSeller.menu : (Array.isArray(apiSeller?.menu) ? apiSeller.menu : []),
            slug: actualSeller?.slug || apiSeller?.slug || actualSeller?.name?.toLowerCase().replace(/\s+/g, '-') || apiSeller?.name?.toLowerCase().replace(/\s+/g, '-') || slug || "unknown",
            sellerId: actualSeller?.sellerId || actualSeller?._id || actualSeller?.id || apiSeller?.sellerId || apiSeller?._id || apiSeller?.id || null,
            // Add other fields with defaults
            featuredDish: actualSeller?.featuredDish || apiSeller?.featuredDish || onboardingStep4?.featuredDish || "Special Item",
            featuredPrice: actualSeller?.featuredPrice || apiSeller?.featuredPrice || onboardingStep4?.featuredPrice || 249,
            // Additional safety fields
            openDays: Array.isArray(actualSeller?.openDays)
              ? actualSeller.openDays
              : (Array.isArray(apiSeller?.openDays) ? apiSeller.openDays : (Array.isArray(onboardingStep2?.openDays) ? onboardingStep2.openDays : [])),
            deliveryTimings: actualSeller?.deliveryTimings || apiSeller?.deliveryTimings || {
              openingTime: actualSeller?.openingTime || apiSeller?.openingTime || onboardingStep2?.deliveryTimings?.openingTime || "09:00",
              closingTime: actualSeller?.closingTime || apiSeller?.closingTime || onboardingStep2?.deliveryTimings?.closingTime || "22:00",
            },
            outletTimings: actualSeller?.outletTimings || apiSeller?.outletTimings || null,
            profileImage: normalizedProfileImage,
            coverImages: normalizedCoverImages,
            menuImages: normalizedMenuImages,
            // Menu sections for display (will be populated from menu API)
            menuSections: [],
            // Onboarding data including FSSAI license
            onboarding: actualSeller?.onboarding || apiSeller?.onboarding || null,
            // Availability fields for grayscale styling
            isActive: actualSeller?.isActive !== false, // Default to true if not specified
            isAcceptingOrders: actualSeller?.isAcceptingOrders !== false, // Default to true if not specified
          }

          debugLog('? Transformed seller:', transformedSeller)
          debugLog('? Seller ID for menu fetch:', transformedSeller.id)

          if (!transformedSeller.id) {
            debugError('? No seller ID found! Cannot fetch menu.')
          }

          setSeller(transformedSeller)
          fetchedSellerRef.current = true // Mark as fetched
          fetchedSlugRef.current = slug

          // Outlet timings are included in the seller API; fetch only as fallback.
          if (!transformedSeller.outletTimings) {
            try {
              const outletSellerId = transformedSeller.mongoId || actualSeller?._id || apiSeller?._id
              if (outletSellerId) {
                const outletResponse = await sellerAPI.getOutletTimingsBySellerId(outletSellerId)
                const outletTimingsData = outletResponse?.data?.data?.outletTimings || outletResponse?.data?.outletTimings
                if (outletTimingsData) {
                  setSeller((prev) => ({ ...prev, outletTimings: outletTimingsData }))
                }
              }
            } catch (outletError) {
              debugWarn("Outlet timings fetch failed, falling back to delivery timings:", outletError?.message)
            }
          }

          // Fetch menu and inventory for this seller
          // If no seller ID, try to find matching seller by name
          let sellerIdForMenu = transformedSeller.id

          if (!sellerIdForMenu) {
            debugWarn('? No seller ID available, searching for seller by name...')
            try {
              const searchVariants = zoneId
                ? [{ limit: 100, zoneId: zoneId, _ts: Date.now() }, { limit: 100, _ts: Date.now() }]
                : [{ limit: 100, _ts: Date.now() }]

              for (const searchParams of searchVariants) {
                const searchResponse = await sellerAPI.getSellers(searchParams, { noCache: true })
                const sellers = searchResponse?.data?.data?.sellers || searchResponse?.data?.data || []

                // Try to find by exact name match
                const matchingSeller = sellers.find(r =>
                  r.name?.toLowerCase().trim() === transformedSeller.name?.toLowerCase().trim()
                )

                if (matchingSeller) {
                  sellerIdForMenu = matchingSeller._id || matchingSeller.sellerId || matchingSeller.id
                  debugLog('? Found matching seller by name, ID:', sellerIdForMenu)

                  // Update the seller ID in state
                  setSeller(prev => ({
                    ...prev,
                    id: sellerIdForMenu,
                    sellerId: sellerIdForMenu
                  }))
                  break
                }
              }

              if (!sellerIdForMenu) {
                debugWarn('? No matching seller found by name')
              }
            } catch (searchError) {
              debugError('? Error searching for seller:', searchError)
            }
          }

          const normalizedLookupIds = [
            sellerIdForMenu,
            slug,
            transformedSeller.id,
            transformedSeller.sellerId,
            transformedSeller.mongoId,
            apiSeller?.sellerId,
            apiSeller?._id,
            actualSeller?.sellerId,
            actualSeller?._id,
            actualSeller?.slug,
          ]
            .filter(Boolean)
            .map((value) => String(value).trim())
            .filter((value, index, arr) => arr.indexOf(value) === index)

          if (normalizedLookupIds.length > 0) {
            let hasPreviousOrderForSeller = false
            if (isModuleAuthenticated('user')) {
              try {
                const normalize = (value) => (value ? String(value).trim().toLowerCase() : "")
                const targetSellerName = normalize(transformedSeller.name)
                const targetSellerIds = new Set(
                  [
                    ...normalizedLookupIds,
                    transformedSeller.id,
                    transformedSeller.sellerId,
                    apiSeller?.sellerId,
                    apiSeller?._id,
                    actualSeller?.sellerId,
                    actualSeller?._id,
                  ].map(normalize).filter(Boolean)
                )

                const FETCH_LIMIT = 100
                const firstResponse = await orderAPI.getOrders({ limit: FETCH_LIMIT, page: 1 })
                let allOrders = []
                let totalPages = 1

                if (firstResponse?.data?.success && firstResponse?.data?.data?.orders) {
                  allOrders = firstResponse.data.data.orders || []
                  totalPages = firstResponse.data.data?.pagination?.pages || 1
                } else if (firstResponse?.data?.orders) {
                  allOrders = firstResponse.data.orders || []
                  totalPages = firstResponse.data?.pagination?.pages || 1
                } else if (Array.isArray(firstResponse?.data?.data)) {
                  allOrders = firstResponse.data.data || []
                }

                if (totalPages > 1) {
                  const pagePromises = []
                  for (let p = 2; p <= totalPages; p += 1) {
                    pagePromises.push(orderAPI.getOrders({ limit: FETCH_LIMIT, page: p }))
                  }

                  const pageResponses = await Promise.all(pagePromises)
                  const remainingOrders = pageResponses.flatMap((resp) => {
                    if (resp?.data?.success && resp?.data?.data?.orders) return resp.data.data.orders || []
                    if (resp?.data?.orders) return resp.data.orders || []
                    if (Array.isArray(resp?.data?.data)) return resp.data.data || []
                    return []
                  })
                  allOrders = [...allOrders, ...remainingOrders]
                }

                hasPreviousOrderForSeller = allOrders.some((order) => {
                  const orderSellerField = order?.sellerId
                  const candidateIds = [
                    order?.sellerId,
                    orderSellerField?._id,
                    orderSellerField?.id,
                    orderSellerField?.sellerId,
                    order?.seller,
                    order?.seller_id,
                  ].map(normalize).filter(Boolean)

                  if (candidateIds.some((id) => targetSellerIds.has(id))) {
                    return true
                  }

                  const candidateNames = [
                    order?.sellerName,
                    orderSellerField?.name,
                    order?.seller?.name,
                  ].map(normalize).filter(Boolean)

                  return !!targetSellerName && candidateNames.includes(targetSellerName)
                })
              } catch (orderCheckError) {
                debugWarn("Could not verify previous orders for recommendation section:", orderCheckError)
              }
            }

            try {
              debugLog('? Fetching menu for seller ID:', sellerIdForMenu)
              let menuResponse = null
              let resolvedMenuLookupId = null
              for (const lookupId of normalizedLookupIds) {
                try {
                  debugLog('? Fetching menu for seller lookup ID:', lookupId)
                  const response = await sellerAPI.getMenuBySellerId(lookupId, { noCache: true, params: { fulfilmentMode } })
                  if (response?.data?.success) {
                    menuResponse = response
                    resolvedMenuLookupId = lookupId
                    break
                  }
                } catch (lookupError) {
                  if (lookupError?.response?.status !== 404) {
                    throw lookupError
                  }
                }
              }
              if (!menuResponse) {
                throw Object.assign(new Error('Menu not found'), { response: { status: 404 } })
              }
              debugLog('? Menu resolved using lookup ID:', resolvedMenuLookupId)
              if (menuResponse.data && menuResponse.data.success && menuResponse.data.data && menuResponse.data.data.menu) {
                const rawSections = menuResponse.data.data.menu.sections || []
                const toArray = (value) => {
                  if (Array.isArray(value)) return value
                  if (!value || typeof value !== "object") return []
                  return Object.values(value).filter((entry) => entry && typeof entry === "object")
                }
                const normalizeItem = (item = {}) => {
                   const isRecommended = item.isRecommended === true || item.isRecommended === 1 || String(item.isRecommended) === "true"
                   const isSpicy = item.isSpicy === true || item.isSpicy === 1 || String(item.isSpicy) === "true"
                   let foodType = item.foodType || null
                   if (typeof foodType === 'string') {
                     if (foodType.toLowerCase() === 'veg') foodType = 'Veg'
                     else if (foodType.toLowerCase() === 'non-veg' || foodType.toLowerCase() === 'nonveg') foodType = 'Non-Veg'
                   }
                   return {
                     ...item,
                      id: String(item.id || item._id || `${Date.now()}-${Math.random()}`),
                      name: item.name || "Unnamed Item",
                      foodType,
                      price: getProductDisplayPrice(item),
                      variants: getProductVariants(item),
                      variations: getProductVariants(item),
                      isAvailable: channelAvailability(item, (fulfilmentMode === "quick" ? "quick" : "shop")).inStock,
                      stockNote: channelAvailability(item, (fulfilmentMode === "quick" ? "quick" : "shop")).low ? stockLabel(channelAvailability(item, (fulfilmentMode === "quick" ? "quick" : "shop"))) : null,
                      isRecommended,
                      isSpicy,
                     description: typeof item.description === "string" ? item.description : "",
                   }
                 }
                const menuSections = toArray(rawSections).map((section, sectionIndex) => ({
                  ...section,
                  id: String(section.id || section._id || `section-${sectionIndex}`),
                  name: section.name || section.title || "Unnamed Section",
                  items: toArray(section.items).map(normalizeItem),
                  subsections: toArray(section.subsections).map((subsection, subsectionIndex) => ({
                    ...subsection,
                    id: String(subsection.id || subsection._id || `subsection-${sectionIndex}-${subsectionIndex}`),
                    name: subsection.name || "Unnamed Subsection",
                    items: toArray(subsection.items).map(normalizeItem),
                  })),
                }))

                // Collect all recommended items from all sections
                // Only include items that are both recommended (isRecommended === true) AND available (isAvailable !== false)
                const recommendedItems = []
                menuSections.forEach(section => {
                  // Check direct items - only include if isRecommended is explicitly true (strict check) AND item is available
                  if (section.items && Array.isArray(section.items)) {
                    section.items.forEach(item => {
                      // Strict check: isRecommended must be exactly boolean true
                      // This will exclude: false, undefined, null, 0, "", and any other falsy values
                      if (isRecommendedItem(item) && item.isAvailable !== false) {
                        recommendedItems.push(item)
                      }
                    })
                  }
                  // Check subsection items - only include if isRecommended is explicitly true (strict check) AND item is available
                  if (section.subsections && Array.isArray(section.subsections)) {
                    section.subsections.forEach(subsection => {
                      if (subsection.items && Array.isArray(subsection.items)) {
                        subsection.items.forEach(item => {
                          // Strict check: isRecommended must be exactly boolean true
                          // This will exclude: false, undefined, null, 0, "", and any other falsy values
                          if (isRecommendedItem(item) && item.isAvailable !== false) {
                            recommendedItems.push(item)
                          }
                        })
                      }
                    })
                  }
                })

                // Debug log to verify recommended items and their isRecommended values
                debugLog('Recommended items collected:', recommendedItems.map(item => ({
                  name: item.name,
                  isRecommended: item.isRecommended,
                  isRecommendedType: typeof item.isRecommended,
                  preparationTime: item.preparationTime
                })))

                // Debug log to check preparationTime in menu sections
                debugLog('Menu sections with preparationTime:', menuSections.map(section => ({
                  sectionName: section.name,
                  items: section.items?.map(item => ({
                    name: item.name,
                    preparationTime: item.preparationTime
                  })) || []
                })))

                // Dynamically inject the specifically searched dish at the very top if targetDishId is present
                let searchedDishSection = null
                if (targetDishId) {
                  const allItemsInMenu = []
                  menuSections.forEach(s => {
                    if (s.items) allItemsInMenu.push(...s.items)
                    if (s.subsections) {
                      s.subsections.forEach(ss => {
                        if (ss.items) allItemsInMenu.push(...ss.items)
                      })
                    }
                  })
                  const matchedItem = allItemsInMenu.find(item => String(item.id || item._id || "").trim() === targetDishId)
                  if (matchedItem) {
                    searchedDishSection = { 
                      name: "Result for Your Search", 
                      items: [matchedItem], 
                      subsections: [],
                      isSearchResult: true 
                    }
                  }
                }

                let finalMenuSections = [...menuSections]
                if (hasPreviousOrderForSeller) {
                  finalMenuSections = [{ name: "Recommended for You", items: recommendedItems, subsections: [] }, ...finalMenuSections]
                }
                if (searchedDishSection) {
                  finalMenuSections = [searchedDishSection, ...finalMenuSections]
                }

                setSeller(prev => ({
                  ...prev,
                  menuSections: finalMenuSections,
                }))

                debugLog('Fetched menu sections with recommended items:', finalMenuSections)
              }
            } catch (menuError) {
              if (menuError.response && menuError.response.status === 404) {
                debugLog('? Menu not found for this seller.')
              } else {
                debugError('? Error fetching menu:', menuError)
              }
            }

            try {
              // The store's products for this storefront, grouped into
              // categories: GET /catalog/products?sellerId=&fulfilmentMode=
              // returns { products: [...] } and takes a Mongo id only.
              const productSellerId = normalizedLookupIds.find((value) => /^[a-f0-9]{24}$/i.test(value))
              if (productSellerId) {
                const response = await sellerAPI.getPublicProducts({ sellerId: productSellerId, fulfilmentMode, limit: 1000 })
                const products = response?.data?.data?.products || []
                const byCategory = new Map()
                for (const product of Array.isArray(products) ? products : []) {
                  const name = product.categoryName || "Other"
                  if (!byCategory.has(name)) byCategory.set(name, [])
                  byCategory.get(name).push(product)
                }
                const normalizedInventory = [...byCategory.entries()].map(([name, items], index) => ({
                  id: `category-${index}`,
                  name,
                  description: "",
                  itemCount: items.length,
                  inStock: items.some((item) => channelAvailability(item, (fulfilmentMode === "quick" ? "quick" : "shop")).inStock),
                  items: items.map((item) => ({
                    id: String(item._id || item.id),
                    name: item.name || "Unnamed Item",
                    inStock: channelAvailability(item, (fulfilmentMode === "quick" ? "quick" : "shop")).inStock,
                    isVeg: item.foodType === "Veg" ? true : item.foodType === "Non-Veg" ? false : null,
                    stockQuantity: channelAvailability(item, (fulfilmentMode === "quick" ? "quick" : "shop")).qty ?? "Unlimited",
                    unit: "piece",
                    expiryDate: null,
                    lastRestocked: null,
                  })),
                  order: index,
                }))

                setSeller(prev => ({
                  ...prev,
                  inventory: normalizedInventory,
                }))
              }
            } catch (inventoryError) {
              debugError('? Error fetching store products:', inventoryError)
            }
          }
        } else {
          debugError('? No seller data found in API response')
          debugError('? Response:', response)
          debugError('? apiSeller:', apiSeller)
          if (!fetchedSellerRef.current) {
            setSellerError('Seller not found')
            setSeller(null)
          }
        }
      } catch (error) {
        // Check if it's a network error (backend not running)
        const isNetworkError = error.code === 'ERR_NETWORK' || error.message === 'Network Error'

        // Check if it's a 404 error (seller doesn't exist)
        const is404Error = error.response?.status === 404

        if (isNetworkError) {
          // Network error - backend is not running
          // Don't show "Seller not found" for network errors
          // The axios interceptor will show a toast notification
          debugError('Network error fetching seller (backend may not be running):', error)
          if (!fetchedSellerRef.current) {
            setSellerError('Backend server is not connected. Please make sure the backend is running.')
            setSeller(null)
          }
        } else if (is404Error) {
          // 404 error - seller doesn't exist in database
          debugLog(`Seller "${slug}" not found in database`)
          if (!fetchedSellerRef.current) {
            setSellerError('Seller not found')
            setSeller(null)
          }
        } else {
          // Other errors
          debugError('Error fetching seller:', error)
          if (!fetchedSellerRef.current) {
            setSellerError(error.message || 'Failed to load seller')
            setSeller(null)
          }
        }
      } finally {
        setLoadingSeller(false)
      }
    }

    // Reset fetched flag only when URL slug changes.
    // Do not compare with seller.slug because canonical API slug may differ
    // from route slug (e.g. "seller-2513"), causing refetch loops.
    if (fetchedSellerRef.current && fetchedSlugRef.current !== slug) {
      fetchedSellerRef.current = false
      fetchedSlugRef.current = null
    }

    fetchSeller()
  }, [slug, zoneId, fulfilmentMode])

  // Track previous distance label to avoid loops
  const prevDistanceRef = useRef(null)

  // Recalculate straight-line distance when user/seller location updates
  useEffect(() => {
    if (!seller?.locationObject || !userLocation) return
    if (seller?.distanceSource === "road") return

    const measured = getUserSellerDistance(
      userLocation?.deliveryAddress || userLocation,
      normalizeSellerLocation(seller.locationObject) || seller.locationObject,
    )
    if (!measured?.label) return

    const calculatedDistance = measured.label
    if (calculatedDistance === prevDistanceRef.current) return
    prevDistanceRef.current = calculatedDistance

    setSeller((prev) => {
      if (!prev || prev.distance === calculatedDistance || prev.distanceSource === "road") return prev
      return { ...prev, distance: calculatedDistance, distanceSource: "haversine" }
    })
  }, [
    userLocation?.latitude,
    userLocation?.longitude,
    userLocation?.coordinates?.[0],
    userLocation?.coordinates?.[1],
    seller?.locationObject,
    seller?.id,
    seller?.distanceSource,
  ])

  // Prefer Google road distance (matches delivery Rest→User / tripDistanceKm).
  useEffect(() => {
    let cancelled = false
    if (!seller?.locationObject || !userLocation) return undefined

    const run = async () => {
      const km = await fetchDrivingDistanceKm(
        userLocation?.deliveryAddress || userLocation,
        seller.locationObject,
      )
      if (cancelled || !Number.isFinite(Number(km))) return
      const label = formatDistanceLabel(km)
      if (!label) return
      prevDistanceRef.current = label
      setSeller((prev) => {
        if (!prev || (prev.distance === label && prev.distanceSource === "road")) return prev
        return { ...prev, distance: label, distanceSource: "road" }
      })
    }

    run()
    return () => {
      cancelled = true
    }
  }, [
    userLocation?.latitude,
    userLocation?.longitude,
    userLocation?.coordinates?.[0],
    userLocation?.coordinates?.[1],
    seller?.locationObject,
    seller?.id,
  ])

  // Helper function to update item quantity in both local state and cart
  const updateItemQuantity = (item, newQuantity, event = null, preferredVariant = null) => {
    // Check authentication
    if (!isModuleAuthenticated('user')) {
      toast.error("Please login to add items to cart")
      navigate('/auth/login', { state: { from: location.pathname } })
      return
    }

    // CRITICAL: Check if user is in service zone or seller is available
    if (isOutOfService) {
      toast.error('You are outside the service zone. Please select a location within the service area.');
      return;
    }

    // Shop (courier) orders wait for the store to accept; only Quick needs it open now.
    const availability = getSellerAvailabilityStatus(seller)
    if (fulfilmentMode === "quick" && !availability.isOpen) {
      toast.error("Seller is currently offline. Please try again later.")
      return
    }

    const resolvedVariant = preferredVariant || getDefaultProductVariant(item)
    const lineItemId = getLineItemIdForDish(item, resolvedVariant)

    // CRITICAL: Validate seller data before adding to cart
    if (!seller || !seller.name) {
      debugError('? Cannot add item to cart: Seller data is missing!');
      toast.error('Seller information is missing. Please refresh the page.');
      return;
    }

    // Ensure we have a valid sellerId
    const validSellerId = seller?.sellerId || seller?._id || seller?.id;
    if (!validSellerId) {
      debugError('? Cannot add item to cart: Seller ID is missing!', {
        seller: seller,
        sellerId: seller?.sellerId,
        _id: seller?._id,
        id: seller?.id
      });
      toast.error('Seller ID is missing. Please refresh the page.');
      return;
    }

    // Log for debugging
    debugLog('? Adding item to cart:', {
      itemName: item.name,
      sellerName: seller.name,
      sellerId: validSellerId,
      seller_id: seller._id,
      seller_sellerId: seller.sellerId
    });

    // Prepare cart item with all required properties
    const cartItem = {
      id: lineItemId,
      lineItemId,
      itemId: item.id,
      name: item.name,
      price: resolvedVariant?.price ?? item.price,
      otherPrice:
        Number(resolvedVariant?.otherPrice) > 0
          ? Number(resolvedVariant.otherPrice)
          : getProductDisplayOtherPrice(item),
      variantId: resolvedVariant?.id || "",
      variantName: resolvedVariant?.name || "",
      variantPrice: resolvedVariant?.price ?? item.price,
      image: item.image,
      seller: seller.name, // Use seller.name directly (already validated)
      sellerId: validSellerId, // Use validated sellerId
      description: item.description,
      originalPrice: item.originalPrice,
      foodType: item.foodType,
      isVeg: item.foodType === "Veg" ? true : item.foodType === "Non-Veg" ? false : null,
      preparationTime: item.preparationTime // Add preparationTime property
    }

    // Get source position for animation from event target
    // Prefer currentTarget (the button) over target (might be icon inside button)
    let sourcePosition = null
    if (event) {
      // Use currentTarget (the button element) for accurate button position
      // If currentTarget is not available, try to find the button element
      let buttonElement = event.currentTarget
      if (!buttonElement && event.target) {
        // If we clicked on an icon inside, find the closest button
        buttonElement = event.target.closest('button') || event.target
      }

      if (buttonElement) {
        // Store button reference and current viewport position
        // We'll recalculate position right before animation to account for scroll
        const rect = buttonElement.getBoundingClientRect()
        const scrollX = window.pageXOffset || window.scrollX || 0
        const scrollY = window.pageYOffset || window.scrollY || 0

        // Store both viewport position and scroll at capture time
        // This allows us to adjust for scroll changes later
        sourcePosition = {
          // Viewport-relative position at capture time
          viewportX: rect.left + rect.width / 2,
          viewportY: rect.top + rect.height / 2,
          // Scroll position at capture time
          scrollX: scrollX,
          scrollY: scrollY,
          // Store button identifier to potentially find it again
          itemId: lineItemId,
        }
      }
    }

    // Update cart context
    if (newQuantity <= 0) {
      // Pass sourcePosition and product info for removal animation
      const productInfo = {
        id: lineItemId,
        name: item.name,
        imageUrl: item.image,
      }
      removeFromCart(lineItemId, sourcePosition, productInfo)
    } else {
      const existingCartItem = getCartItem(lineItemId)
      if (existingCartItem) {
        // Prepare product info for animation
        const productInfo = {
          id: lineItemId,
          name: item.name,
          imageUrl: item.image,
        }

        // If incrementing quantity, trigger add animation with sourcePosition
        if (newQuantity > existingCartItem.quantity && sourcePosition) {
          const result = addToCart(cartItem, sourcePosition, { quantity: newQuantity - existingCartItem.quantity })
          if (result?.ok === false) {
            if (result.needsConfirmation) return
            toast.error(result.error || 'Cannot add item from different seller. Please clear cart first.')
            return
          }
        }
        // If decreasing quantity, trigger removal animation with sourcePosition
        else if (newQuantity < existingCartItem.quantity && sourcePosition) {
          updateQuantity(lineItemId, newQuantity, sourcePosition, productInfo)
        }
        // Otherwise just update quantity without animation
        else {
          updateQuantity(lineItemId, newQuantity)
        }
      } else {
        // Add to cart first (adds with quantity 1), then update to desired quantity
        // Pass sourcePosition when adding a new item
        const result = addToCart(cartItem, sourcePosition, { quantity: newQuantity })
        if (result?.ok === false) {
          if (result.needsConfirmation) return
          toast.error(result.error || 'Cannot add item from different seller. Please clear cart first.')
          return
        }
      }
    }
  }

  const heroImages = useMemo(() => buildHeroImages(seller), [seller])

  // Show loading state
  if (loadingSeller) {
    return <SellerDetailSkeleton />
  }

  // Show error state if seller not found or network error
  if (sellerError && !seller) {
    const isNetworkError = sellerError.includes('Backend server is not connected')
    const isNotFoundError = sellerError === 'Seller not found'

    return (
      <AnimatedPage>
        <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
          <div className="flex flex-col items-center gap-4 text-center">
            <AlertCircle className={`h-12 w-12 ${isNetworkError ? 'text-orange-500' : 'text-red-500'}`} />
            <div>
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">
                {isNetworkError ? 'Connection Error' : isNotFoundError ? 'Seller not found' : 'Error'}
              </h2>
              <p className="text-sm text-gray-600 mb-4 max-w-md">{sellerError}</p>
              {isNetworkError && (
                <p className="text-xs text-gray-500 mb-4">
                  Make sure the backend server is running at {API_BASE_URL.replace('/api', '')}
                </p>
              )}
              <Button onClick={goBack} variant="outline">
                Go Back
              </Button>
            </div>
          </div>
        </div>
      </AnimatedPage>
    )
  }

  // Show error if seller is still null
  if (!seller) {
    return (
      <AnimatedPage>
        <div className="min-h-screen bg-gray-50 flex items-center justify-center">
          <div className="flex flex-col items-center gap-4">
            <AlertCircle className="h-12 w-12 text-red-500" />
            <span className="text-sm text-gray-600">Seller Not Found</span>
            <Button onClick={goBack} variant="outline">
              Go Back
            </Button>
          </div>
        </div>
      </AnimatedPage>
    )
  }

  const availabilityStatus = getSellerAvailabilityStatus(seller, new Date(availabilityTick))
  const isSellerOffline = fulfilmentMode === "quick" && !availabilityStatus.isOpen
  const displayHeroImages = heroImages.length > 0 ? heroImages : [PRODUCT_IMAGE_FALLBACK]


  // Store header and product grid with a category rail.
  return (
    <StoreDesktop
      seller={seller}
      sections={seller.menuSections || []}
      coverImage={displayHeroImages[0]}
      isOpen={!isSellerOffline && !isOutOfService}
      onAddToCart={(item) => {
        if (hasProductVariants(item)) {
          navigate(storePath(`/product/${item.id}`))
          return
        }
        const current = getCartItem(getLineItemIdForDish(item))?.quantity || 0
        updateItemQuantity(item, current + 1)
      }}
    />
  )
}

class SellerDetailsErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError() {
    return { hasError: true }
  }

  componentDidCatch(error, info) {
    debugError("SellerDetails crashed:", error, info)
  }

  render() {
    if (this.state.hasError) {
      return (
        <AnimatedPage>
          <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
            <div className="flex flex-col items-center gap-4 text-center">
              <AlertCircle className="h-12 w-12 text-red-500" />
              <div>
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">
                  Something went wrong
                </h2>
                <p className="text-sm text-gray-600 mb-4 max-w-md">
                  We could not load this seller page right now.
                </p>
                <Button onClick={() => window.location.reload()} variant="outline">
                  Reload Page
                </Button>
              </div>
            </div>
          </div>
        </AnimatedPage>
      )
    }

    return this.props.children
  }
}

export default function SellerDetails() {
  return (
    <SellerDetailsErrorBoundary>
      <SellerDetailsContent />
    </SellerDetailsErrorBoundary>
  )
}
