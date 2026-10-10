import { useState, useEffect, useRef } from "react"
import { Link, useNavigate } from "react-router-dom"
import { ArrowLeft, Search, MoreVertical, ChevronRight, Star, RotateCcw, AlertCircle, Loader2, Clock, X, Share2, MessageCircle, Send, Copy, Mail, MessagesSquare, Link2 } from "lucide-react"
import { orderAPI } from "@store/api"
import { toast } from "sonner"
import { getCompanyNameAsync } from "@store/utils/businessSettings"
import { useCompanyName } from "@store/hooks/useCompanyName"
import { imagePlaceholder } from "@store/constants/images"
import { isShopOrder, orderStatusLabel, paymentMethodLabel, reorderPath, shopStatusLabel, variantText } from "@store/utils/shopOrderFlow"
const debugLog = (...args) => { }
const debugWarn = (...args) => { }
const debugError = (...args) => { }

const toNum = (value) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

const PAYMENT_BADGE_TONE = {
  good: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  bad: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  wait: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
  plain: 'bg-gray-100 text-gray-700 dark:bg-slate-700 dark:text-gray-300',
}

/** The payment status in words, or null when there's nothing worth saying. */
function paymentBadgeFor(order, { delivered = false, cancelled = false } = {}) {
  const status = String(order?.payment?.status || '').toLowerCase()
  if (!status) return null
  if (status === 'cod_pending') {
    if (delivered) return { text: 'Paid', tone: 'good' }
    return cancelled ? null : { text: 'Pay on delivery', tone: 'wait' }
  }
  if (status === 'paid' || status === 'authorized' || status === 'completed') return { text: 'Paid', tone: 'good' }
  if (status === 'refunded') return { text: 'Refunded', tone: 'plain' }
  if (status === 'failed') return { text: 'Payment failed', tone: 'bad' }
  if (cancelled) return null
  if (status === 'created' || status === 'pending' || status === 'pending_qr') return { text: 'Not paid yet', tone: 'wait' }
  return { text: status.replace(/_/g, ' '), tone: 'plain' }
}

export default function Orders() {
  const companyName = useCompanyName()
  const navigate = useNavigate()

  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState("")
  const [ratingModal, setRatingModal] = useState({ open: false, order: null })
  const [activeMenuOrderId, setActiveMenuOrderId] = useState(null)
  const [showShareModal, setShowShareModal] = useState(false)
  const [sharePayload, setSharePayload] = useState(null)
  const [selectedSellerRating, setSelectedSellerRating] = useState(null)
  const [selectedDeliveryRating, setSelectedDeliveryRating] = useState(null)
  const [sellerFeedbackText, setSellerFeedbackText] = useState("")
  const [deliveryFeedbackText, setDeliveryFeedbackText] = useState("")
  const [submittingRating, setSubmittingRating] = useState(false)
  const [countdowns, setCountdowns] = useState({})
  // Track orders that have shown rating popup - persist in localStorage
  const [shownRatingForOrders, setShownRatingForOrders] = useState(() => {
    try {
      const stored = localStorage.getItem('shownRatingForOrders')
      return stored ? new Set(JSON.parse(stored)) : new Set()
    } catch {
      return new Set()
    }
  })

  // Save to localStorage whenever shownRatingForOrders changes
  useEffect(() => {
    try {
      localStorage.setItem('shownRatingForOrders', JSON.stringify(Array.from(shownRatingForOrders)))
    } catch (error) {
      debugError('Error saving shownRatingForOrders to localStorage:', error)
    }
  }, [shownRatingForOrders])

  // Calculate countdown for an order
  const calculateCountdown = (order) => {
    if (!order ||
      order.status === 'delivered' ||
      String(order.status).toLowerCase().includes('cancel')) {
      return null
    }

    const createdAt = new Date(order.createdAt)
    const now = new Date()
    const elapsedMinutes = Math.floor((now - createdAt) / (1000 * 60))

    // Get max ETA (use eta.max if available, otherwise estimatedDeliveryTime)
    const maxETA = order.eta?.max || order.estimatedDeliveryTime || 30
    const remainingMinutes = Math.max(0, maxETA - elapsedMinutes)

    return remainingMinutes > 0 ? remainingMinutes : null
  }

  // Update countdowns for all active orders
  useEffect(() => {
    const updateCountdowns = () => {
      const newCountdowns = {}
      orders.forEach(order => {
        const remaining = calculateCountdown(order)
        if (remaining !== null) {
          newCountdowns[order.id] = remaining
        }
      })
      setCountdowns(newCountdowns)
    }

    updateCountdowns()
    const interval = setInterval(() => {
      if (typeof document !== "undefined" && document.hidden) return
      updateCountdowns()
    }, 10000) // Update every 10 seconds for better UX

    const handleVisibilityChange = () => {
      if (typeof document !== "undefined" && !document.hidden) {
        updateCountdowns()
      }
    }
    document.addEventListener("visibilitychange", handleVisibilityChange)

    return () => {
      clearInterval(interval)
      document.removeEventListener("visibilitychange", handleVisibilityChange)
    }
  }, [orders])

  // Get order status text
  // Groups the API's statuses into the few this page styles; the words
  // shown come from orderStatusLabel (statusText).
  const getOrderStatus = (order) => {
    const status = order.status
    if (status === 'delivered' || status === 'completed') return 'delivered'
    if (['out_for_delivery', 'outForDelivery', 'picked_up', 'reached_drop'].includes(status)) return 'outForDelivery'
    if (['ready', 'preparing', 'ready_for_pickup', 'reached_pickup'].includes(status)) return 'preparing'
    if (status === 'created') return 'placed'
    if (String(status).toLowerCase().includes('cancel')) return 'cancelled'
    return status || 'confirmed'
  }

  // Auto-show rating popup when order is delivered (only once per order)
  useEffect(() => {
    if (orders.length === 0 || ratingModal.open) {
      return
    }

    debugLog('?? Checking for delivered orders to show rating popup...', {
      totalOrders: orders.length,
      shownRatingForOrders: Array.from(shownRatingForOrders)
    })

    // Find delivered orders that haven't been rated and haven't shown popup yet
    const deliveredOrders = orders.filter(order => {
      // Check originalStatus first (from backend), then fallback to transformed status
      const originalStatus = order.originalStatus || order.status || ''
      const transformedStatus = order.status || ''

      // Check if order is delivered - check both original and transformed status
      const isDelivered =
        originalStatus === 'delivered' ||
        originalStatus === 'completed' ||
        originalStatus.toLowerCase() === 'delivered' ||
        originalStatus.toLowerCase() === 'completed' ||
        transformedStatus === 'delivered' ||
        transformedStatus === 'completed' ||
        transformedStatus.toLowerCase() === 'delivered' ||
        transformedStatus.toLowerCase() === 'completed'

      const hasSellerRating = Number.isFinite(Number(order.sellerRating))
      const hasDeliveryPartner = !!(order.deliveryPartnerId || order.deliveryPartnerName)
      const hasDeliveryRating = Number.isFinite(Number(order.deliveryPartnerRating))
      const hasRating = hasSellerRating && (!hasDeliveryPartner || hasDeliveryRating)

      const orderId = order.id || order._id || order.mongoId
      const hasShownPopup = shownRatingForOrders.has(orderId)

      // Also check if order has deliveredAt timestamp (indicates it was delivered)
      const hasDeliveredAt = order.deliveredAt !== null && order.deliveredAt !== undefined

      const shouldShow = (isDelivered || hasDeliveredAt) && !hasRating && !hasShownPopup

      debugLog(`?? Order ${orderId}:`, {
        originalStatus,
        transformedStatus,
        isDelivered,
        hasDeliveredAt,
        hasRating,
        sellerRating: order.sellerRating,
        deliveryPartnerRating: order.deliveryPartnerRating,
        hasShownPopup,
        shouldShow
      })

      return shouldShow
    })

    debugLog('? Found delivered orders needing rating:', deliveredOrders.length)

    // Show popup for the first delivered order that needs rating
    if (deliveredOrders.length > 0) {
      const orderToRate = deliveredOrders[0]
      const orderId = orderToRate.id || orderToRate._id || orderToRate.mongoId

      debugLog('?? Showing rating popup for order:', {
        orderId,
        seller: orderToRate.seller,
        status: orderToRate.status
      })

      // Mark as shown to prevent multiple popups (before showing to prevent race conditions)
      setShownRatingForOrders(prev => new Set([...prev, orderId]))

      // Small delay to ensure smooth UX
      setTimeout(() => {
        debugLog('? Opening rating modal for order:', {
          orderId: orderId,
          seller: orderToRate.seller,
          status: orderToRate.status,
          originalStatus: orderToRate.originalStatus
        })
        setRatingModal({ open: true, order: orderToRate })
        setSelectedSellerRating(null)
        setSelectedDeliveryRating(null)
        setSellerFeedbackText("")
        setDeliveryFeedbackText("")
      }, 800) // Show after 0.8 seconds
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orders, shownRatingForOrders, ratingModal.open])

  // Whether any order on screen can still change; polling stops when none can.
  const hasActiveOrderRef = useRef(false)
  useEffect(() => {
    hasActiveOrderRef.current = orders.some((o) => {
      const s = String(o.originalStatus || o.status || "").toLowerCase()
      return s !== "delivered" && s !== "completed" && !s.includes("cancel")
    })
  }, [orders])

  // Fetch orders from backend API
  useEffect(() => {
    const FETCH_LIMIT = 100
    let alive = true

    const pageOrders = (resp) => {
      if (resp?.data?.success && resp?.data?.data?.orders) return resp.data.data.orders || []
      if (resp?.data?.orders) return resp.data.orders || []
      if (resp?.data?.data && Array.isArray(resp.data.data)) return resp.data.data || []
      return []
    }
    const pageCount = (resp) => resp?.data?.data?.pagination?.pages || resp?.data?.pagination?.pages || 1

    // Every page on first load; a refresh only needs the newest page, since
    // that is where orders that can still change are.
    const fetchOrdersData = async ({ firstPageOnly = false } = {}) => {
      const firstResponse = await orderAPI.getOrders({ limit: FETCH_LIMIT, page: 1 })
      const firstPageOrders = pageOrders(firstResponse)
      const totalPages = pageCount(firstResponse)
      if (firstPageOnly || totalPages <= 1) return firstPageOrders

      const pagePromises = []
      for (let p = 2; p <= totalPages; p += 1) {
        pagePromises.push(orderAPI.getOrders({ limit: FETCH_LIMIT, page: p }))
      }
      const pageResponses = await Promise.all(pagePromises)
      return [...firstPageOrders, ...pageResponses.flatMap(pageOrders)]
    }

    // Transform an API order to the shape this page renders.
    const transformOrder = (order) => {
      const createdAt = order.createdAt ? new Date(order.createdAt) : new Date()

      const backendStatus = order.orderStatus || order.status
      const isCancelled =
        backendStatus === 'cancelled' ||
        backendStatus === 'cancelled_by_user' ||
        backendStatus === 'cancelled_by_seller' ||
        backendStatus === 'cancelled_by_admin'
      const cancellationReason = order.cancellationReason || ''
      // The API says who cancelled: 'customer' | 'seller' | 'admin'; older orders only have the status or reason.
      const isSellerCancelled = isCancelled && (
        order.cancelledBy === 'seller' ||
        backendStatus === 'cancelled_by_seller' ||
        /rejected by seller|seller rejected|seller cancelled|seller is too busy|item not available|outside delivery area|kitchen closing|technical issue|order not accepted within time limit|seller did not respond/i.test(cancellationReason)
      )
      const isUserCancelled = isCancelled && !isSellerCancelled && (
        order.cancelledBy === 'customer' ||
        order.cancelledBy === 'user' ||
        backendStatus === 'cancelled_by_user'
      )

      const originalStatus = backendStatus
      const sellerRating = order.ratings?.seller?.rating || null
      const deliveryPartnerRating = order.ratings?.deliveryPartner?.rating || null

      const pricing = order.pricing || {}
      const itemSubtotal = (order.items || []).reduce((sum, item) => {
        const qty = toNum(item?.quantity || 1)
        const price = toNum(item?.price || item?.unitPrice || 0)
        return sum + (qty * price)
      }, 0)
      const subtotal = toNum(pricing.subtotal ?? pricing.itemTotal ?? pricing.itemsTotal ?? itemSubtotal)
      // Delivery shown with its GST, as at checkout.
      const deliveryFee = toNum(pricing.deliveryFee ?? pricing.deliveryCharge ?? pricing.shippingFee ?? 0) + toNum(pricing.deliveryFeeGst ?? 0)
      const packagingFee = toNum(pricing.packagingFee ?? pricing.packagingCharges ?? 0)
      const platformFee = toNum(pricing.platformFee ?? pricing.serviceFee ?? pricing.convenienceFee ?? 0)
      const quickDeliveryFee = toNum(pricing.quickDeliveryFee ?? 0)
      const tax = toNum(pricing.tax ?? pricing.taxesAndCharges ?? pricing.taxAndCharges ?? 0)
      const discount = toNum(pricing.discount ?? 0)
      const coinsDiscount = toNum(order.coinsDiscount ?? pricing.coinsDiscount ?? 0)
      const computedTotal = Math.max(0, subtotal + deliveryFee + packagingFee + platformFee + tax - discount - coinsDiscount)
      const total = toNum(pricing.total ?? order.total ?? computedTotal) || computedTotal

      return {
        id: order._id?.toString() || order.orderId || `ORD-${order._id}`,
        mongoId: order._id,
        orderId: order.order_id || order.orderId || order._id?.toString(), // Keep orderId for display
        status: isSellerCancelled ? 'seller_cancelled' : getOrderStatus({ ...order, status: backendStatus }),
        originalStatus: originalStatus, // Keep original status for reference
        statusText: orderStatusLabel(order),
        fulfilmentMode: order.fulfilmentMode,
        createdAt: createdAt.toISOString(),
        address: order.address || order.deliveryAddress || {},
        items: (order.items || []).map(item => ({
          itemId: item.itemId || item._id || item.id,
          name: item.name || item.productName || 'Item',
          variantName: variantText(item),
          quantity: item.quantity || 1,
          price: item.price || 0,
          image: item.image || null,
          description: item.description || null,
          isVeg: typeof item.isVeg === "boolean" ? item.isVeg : null,
          _id: item._id || item.id,
          id: item.id || item._id
        })),
        total,
        subtotal,
        deliveryFee,
        packagingFee,
        platformFee,
        quickDeliveryFee,
        basePlatformFee: Math.max(0, platformFee - quickDeliveryFee),
        tax,
        coinsDiscount,
        pricing: { ...pricing, discount }, // Keep full pricing object for discounts, coupons
        payment: order.payment || {},
        paymentMethod: order.payment?.method || order.paymentMethod,
        paymentMethodText: paymentMethodLabel(order),
        seller: order.sellerId?.sellerName || order.sellerId?.name || order.sellerName || 'Seller',
        sellerId: order.sellerId?._id || order.sellerId,
        sellerSlug: order.sellerId?.slug || null,
        sellerImage: order.sellerId?.profileImage?.url || order.sellerId?.profileImage || null,
        sellerLocation: order.sellerId?.location?.area || order.sellerId?.location?.city || order.address?.city || order.deliveryAddress?.city || '',
        sellerRating,
        deliveryPartnerRating,
        ratings: order.ratings || {},
        rating: sellerRating || null,
        review: order.review || null,
        tracking: order.tracking || {},
        cancellationReason: cancellationReason,
        // Shop (courier) orders say where they are in their own words.
        shopLabel: isShopOrder(order) ? shopStatusLabel(order) : null,
        isSellerCancelled: isSellerCancelled,
        isUserCancelled: isUserCancelled,
        cancelledBy: order.cancelledBy,
        eta: order.eta || { min: order.estimatedDeliveryTime || 30, max: order.estimatedDeliveryTime || 30 },
        estimatedDeliveryTime: order.estimatedDeliveryTime || 30,
        preparationTime: order.preparationTime || 0,
        deliveredAt: order.deliveredAt || null,
        deliveryPartnerId: order.deliveryPartnerId?._id || order.deliveryPartnerId || null,
        deliveryPartnerName: order.deliveryPartnerId?.name || order.deliveryPartnerName || null,
        deliveryPartnerPhone: order.deliveryPartnerId?.phone || order.deliveryPartnerPhone || null,
        note: order.note || null
      }
    }

    const byNewest = (a, b) => new Date(b.createdAt) - new Date(a.createdAt)

    // quiet: a background refresh. It keeps what is on screen (open menus,
    // the rating sheet), merges the newest page in, and says nothing if the
    // network hiccups.
    const fetchOrders = async ({ quiet = false } = {}) => {
      try {
        if (!quiet) setLoading(true)
        const ordersData = await fetchOrdersData({ firstPageOnly: quiet })
        if (!alive) return
        const fresh = ordersData.map(transformOrder)

        if (quiet) {
          setOrders((prev) => {
            const freshById = new Map(fresh.map((o) => [o.id, o]))
            const kept = prev.map((o) => {
              const next = freshById.get(o.id)
              if (!next) return o
              freshById.delete(o.id)
              // Keep a rating given on this page if the server hasn't caught up.
              return { ...next, sellerRating: next.sellerRating ?? o.sellerRating, deliveryPartnerRating: next.deliveryPartnerRating ?? o.deliveryPartnerRating }
            })
            return [...freshById.values(), ...kept].sort(byNewest)
          })
          return
        }

        fresh.sort(byNewest)
        debugLog('Orders fetched:', fresh.length)
        setOrders(fresh)
      } catch (error) {
        if (quiet || !alive) {
          debugWarn('Background order refresh failed:', error)
          return
        }
        debugError('Error fetching user orders:', error)
        let errorMessage = 'Failed to load orders'
        if (error?.response?.status === 401) {
          errorMessage = 'Please login to view your orders'
        } else if (error?.response?.data?.message) {
          errorMessage = error.response.data.message
        }
        toast.error(errorMessage)
        setOrders([])
      } finally {
        if (!quiet && alive) setLoading(false)
      }
    }

    fetchOrders()

    // Refresh every 20 seconds while an order is still on its way, so a
    // delivery shows up without reloading. Paused in background tabs and once
    // every order is delivered or cancelled.
    const pollInterval = setInterval(() => {
      if (typeof document !== "undefined" && document.hidden) return
      if (!hasActiveOrderRef.current) return
      fetchOrders({ quiet: true })
    }, 20000)

    // When user returns to tab, refresh quietly for fresh status.
    const handleVisibilityChange = () => {
      if (typeof document !== "undefined" && !document.hidden && hasActiveOrderRef.current) {
        fetchOrders({ quiet: true })
      }
    }
    document.addEventListener("visibilitychange", handleVisibilityChange)

    return () => {
      alive = false
      clearInterval(pollInterval)
      document.removeEventListener("visibilitychange", handleVisibilityChange)
    }
  }, [])

  // Format date helper
  const formatDate = (dateString) => {
    const date = new Date(dateString)
    const day = date.getDate().toString().padStart(2, '0')
    const month = date.toLocaleDateString('en-US', { month: 'short' })
    const hours = date.getHours()
    const minutes = date.getMinutes().toString().padStart(2, '0')
    const ampm = hours >= 12 ? 'PM' : 'AM'
    const displayHours = hours % 12 || 12

    return `${day} ${month}, ${displayHours}:${minutes}${ampm}`
  }

  // Filter orders based on search query
  const filteredOrders = orders.filter(order => {
    if (!searchQuery.trim()) return true

    const query = searchQuery.toLowerCase()
    const sellerMatch = order.seller?.toLowerCase().includes(query)
    const itemsMatch = order.items.some(item =>
      (item.name || item.productName || '').toLowerCase().includes(query)
    )

    return sellerMatch || itemsMatch
  })

  const ratingModalHasDeliveryPartner = !!(ratingModal.order?.deliveryPartnerId || ratingModal.order?.deliveryPartnerName)
  const ratingSubmitDisabled = submittingRating ||
    selectedSellerRating === null ||
    (ratingModalHasDeliveryPartner && selectedDeliveryRating === null)

  // Handle reorder
  // Same items and sizes back in the right cart (Shop or Quick) at today's
  // prices; ReorderIntake on the cart page adds them and says what made it.
  const handleReorder = (order) => {
    navigate(reorderPath({ _id: order.mongoId || order.id, fulfilmentMode: order.fulfilmentMode }))
  }

  // Three-dots menu handlers
  const toggleMenuForOrder = (orderId) => {
    setActiveMenuOrderId((current) => (current === orderId ? null : orderId))
  }

  const openShareModal = (payload) => {
    setSharePayload(payload)
    setShowShareModal(true)
  }

  const tryNativeShare = async (payload) => {
    if (typeof navigator === "undefined" || !navigator.share) return false
    try {
      await navigator.share(payload)
      return true
    } catch (error) {
      if (error?.name === "AbortError") return true
      return false
    }
  }

  const copyToClipboard = async (text) => {
    const textArea = document.createElement("textarea")
    textArea.value = text
    textArea.style.position = "fixed"
    textArea.style.opacity = "0"
    document.body.appendChild(textArea)
    textArea.select()
    try {
      document.execCommand("copy")
      toast.success("Link copied to clipboard!")
    } catch (err) {
      toast.error("Failed to copy link")
    }
    document.body.removeChild(textArea)
  }

  const openShareTarget = (target) => {
    if (!sharePayload?.url) return

    const text = sharePayload.text || ""
    const url = sharePayload.url
    const encodedText = encodeURIComponent(text)
    const encodedUrl = encodeURIComponent(url)

    let shareLink = ""

    if (target === "whatsapp") {
      shareLink = `https://wa.me/?text=${encodeURIComponent(`${text} ${url}`)}`
    } else if (target === "telegram") {
      shareLink = `https://t.me/share/url?url=${encodedUrl}&text=${encodedText}`
    } else if (target === "email") {
      shareLink = `mailto:?subject=${encodeURIComponent(sharePayload.title || "Check this out")}&body=${encodeURIComponent(`${text}\n\n${url}`)}`
    } else if (target === "sms") {
      shareLink = `sms:?body=${encodeURIComponent(`${text} ${url}`)}`
    } else if (target === "facebook") {
      shareLink = `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`
    } else if (target === "x") {
      shareLink = `https://twitter.com/intent/tweet?text=${encodeURIComponent(`${text} ${url}`)}`
    } else if (target === "linkedin") {
      shareLink = `https://www.linkedin.com/sharing/share-offsite/?url=${encodedUrl}`
    }

    if (shareLink) {
      window.open(shareLink, "_blank", "noopener,noreferrer")
      setShowShareModal(false)
    }
  }

  const copyShareLink = async () => {
    if (!sharePayload?.url) return
    await copyToClipboard(sharePayload.url)
    setShowShareModal(false)
  }

  const handleSystemShareFromModal = async () => {
    if (!sharePayload) return
    const shared = await tryNativeShare(sharePayload)
    if (shared) {
      setShowShareModal(false)
      toast.success("Shared successfully")
    }
  }

  const handleShareSeller = async (order) => {
    const companyName = await getCompanyNameAsync()
    const location =
      order.sellerLocation ||
      `${order.address?.city || ""}, ${order.address?.state || ""}`.trim()
    const sellerPath = order.sellerSlug || order.sellerId
    const shareUrl = sellerPath
      ? `${window.location.origin}/sellers/${sellerPath}`
      : `${window.location.origin}/orders/${order.id}`

    const shareText = `Check out ${order.seller} on ${companyName}.
Location: ${location || "Location not available"}
Order again from this seller in the ${companyName} app.`

    const payload = {
      title: order.seller,
      text: shareText,
      url: shareUrl,
    }

    try {
      const shared = await tryNativeShare(payload)
      if (shared) {
        toast.success("Seller shared successfully")
        return
      }

      openShareModal(payload)
    } catch (error) {
      if (error?.name !== "AbortError") {
        debugError("Error sharing seller:", error)
        toast.error("Failed to share seller")
      }
    } finally {
      setActiveMenuOrderId(null)
    }
  }

  const handleViewOrderDetails = (order) => {
    setActiveMenuOrderId(null)
    navigate(`/orders/${order.id}/details`)
  }

  // Open rating modal for an order
  const handleOpenRating = (order) => {
    setRatingModal({ open: true, order })
    setSelectedSellerRating(order.sellerRating || null)
    setSelectedDeliveryRating(order.deliveryPartnerRating || null)
    setSellerFeedbackText(order.ratings?.seller?.comment || "")
    setDeliveryFeedbackText(order.ratings?.deliveryPartner?.comment || "")
  }

  const handleCloseRating = () => {
    setRatingModal({ open: false, order: null })
    setSelectedSellerRating(null)
    setSelectedDeliveryRating(null)
    setSellerFeedbackText("")
    setDeliveryFeedbackText("")
  }

  // Submit rating & feedback to backend
  const handleSubmitRating = async () => {
    const hasDeliveryPartner = !!(ratingModal.order?.deliveryPartnerId || ratingModal.order?.deliveryPartnerName)
    const isMissingDeliveryRating = hasDeliveryPartner && selectedDeliveryRating === null
    if (!ratingModal.order || selectedSellerRating === null || isMissingDeliveryRating) {
      toast.error("Please select all required ratings first")
      return
    }

    try {
      setSubmittingRating(true)

      const order = ratingModal.order

      const response = await orderAPI.submitOrderRatings(order.id, {
        sellerRating: selectedSellerRating,
        deliveryPartnerRating: hasDeliveryPartner ? selectedDeliveryRating : undefined,
        sellerComment: sellerFeedbackText || undefined,
        deliveryPartnerComment: hasDeliveryPartner ? (deliveryFeedbackText || undefined) : undefined,
      })
      const updatedOrder = response?.data?.data?.order || response?.data?.order || null

      // Update local state so UI shows "You rated"
      setOrders(prev =>
        prev.map(o =>
          o.id === order.id ? {
            ...o,
            sellerRating: updatedOrder?.ratings?.seller?.rating ?? selectedSellerRating,
            deliveryPartnerRating: updatedOrder?.ratings?.deliveryPartner?.rating ?? (hasDeliveryPartner ? selectedDeliveryRating : null),
            ratings: updatedOrder?.ratings || {
              seller: { rating: selectedSellerRating, comment: sellerFeedbackText || "" },
              deliveryPartner: hasDeliveryPartner ? { rating: selectedDeliveryRating, comment: deliveryFeedbackText || "" } : undefined
            },
            rating: updatedOrder?.ratings?.seller?.rating ?? selectedSellerRating
          } : o
        )
      )

      toast.success("Thanks for rating your order!")

      // Mark this order as rated so popup doesn't show again (before closing modal)
      const orderId = order.id || order._id || order.mongoId
      setShownRatingForOrders(prev => new Set([...prev, orderId]))

      handleCloseRating()
    } catch (error) {
      debugError("Error submitting order ratings:", error)
      toast.error(
        error?.response?.data?.message ||
        "Failed to submit ratings. Please try again."
      )
    } finally {
      setSubmittingRating(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-[#0a0a0a] pb-10">
        <div className="bg-white dark:bg-zinc-900 p-4 flex items-center shadow-sm sticky top-0 z-10 border-b border-gray-100 dark:border-zinc-800">
          <Link to="/">
            <ArrowLeft className="w-6 h-6 text-gray-700 dark:text-gray-200 cursor-pointer" />
          </Link>
          <h1 className="ml-4 text-xl font-semibold text-gray-800 dark:text-white">Your Orders</h1>
        </div>
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 text-wh-brand-ink animate-spin" />
        </div>
      </div>
    )
  }

  if (orders.length === 0) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-[#0a0a0a] pb-10">
        <div className="bg-white dark:bg-zinc-900 p-4 flex items-center shadow-sm sticky top-0 z-10 border-b border-gray-100 dark:border-zinc-800">
          <Link to="/">
            <ArrowLeft className="w-6 h-6 text-gray-700 dark:text-gray-200 cursor-pointer" />
          </Link>
          <h1 className="ml-4 text-xl font-semibold text-gray-800 dark:text-white">Your Orders</h1>
        </div>
        <div className="px-4 py-8 text-center">
          <p className="text-gray-600 dark:text-gray-400">You haven't placed any orders yet</p>
          <Link to="/">
            <button className="mt-4 text-wh-brand-ink font-medium">Start Ordering</button>
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-slate-950 pb-10 font-sans">
      {/* Header */}
      <div className="bg-white dark:bg-slate-900 p-4 flex items-center shadow-sm sticky top-0 z-10 border-b border-gray-100 dark:border-slate-800">
        <Link to="/">
          <ArrowLeft className="w-6 h-6 text-gray-700 dark:text-gray-200 cursor-pointer" />
        </Link>
        <h1 className="ml-4 text-xl font-semibold text-gray-800 dark:text-white">Your Orders</h1>
      </div>

      {/* Search Bar */}
      <div className="p-4 bg-white dark:bg-slate-900 mt-1">
        <div className="flex items-center bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg px-3 py-2 shadow-sm">
          <Search className="w-5 h-5 text-wh-brand-ink" />
          <input
            type="text"
            placeholder="Search by store or product"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="flex-1 ml-3 outline-none text-gray-600 dark:text-gray-200 bg-transparent placeholder-gray-400"
          />
        </div>
      </div>

      {/* Orders List */}
      <div className="px-4 py-2 space-y-4">
        {filteredOrders.length === 0 ? (
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-8 text-center">
            <p className="text-gray-600">No orders found matching your search</p>
          </div>
        ) : (
          filteredOrders.map((order) => {
            // Check payment method - COD/wallet orders have 'pending' status which is normal
            const isCodOrWallet = order.payment?.method === 'cash' ||
              order.payment?.method === 'cod' ||
              order.payment?.method === 'wallet' ||
              order.paymentMethod === 'cash' ||
              order.paymentMethod === 'cod' ||
              order.paymentMethod === 'wallet'

            // Payment failed only for online payments (razorpay) that actually failed
            // Don't show payment failed for COD/wallet or cancelled orders
            const isCancelled = order.status === 'cancelled' || order.status === 'seller_cancelled'
            const paymentFailed = !isCodOrWallet &&
              !isCancelled &&
              (order.payment?.status === 'failed')

            const isDelivered = order.status === 'delivered'
            const paymentBadge = paymentBadgeFor(order, { delivered: isDelivered, cancelled: isCancelled })
            const isSellerCancelled = order.isSellerCancelled || order.status === 'seller_cancelled'
            const isUserCancelled = order.isUserCancelled || (isCancelled && (order.cancelledBy === 'customer' || order.cancelledBy === 'user'))
            // Prefer food image from first item; fallback to seller image, then generic food photo
            const firstItemImage = order.items?.[0]?.image
            const sellerImage = firstItemImage
              || order.sellerImage
              || imagePlaceholder
            const location = order.sellerLocation || `${order.address?.city || ''}, ${order.address?.state || ''}`.trim() || 'Location not available'

            return (
              <div key={order.id} className="relative bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-gray-100 dark:border-slate-800 overflow-hidden">
                {/* Card Header: Seller Info */}
                <div className="flex items-start justify-between p-4 pb-2">
                  <div className="flex gap-3">
                    {/* Seller Image */}
                    <div className="w-14 h-14 rounded-lg bg-gray-200 overflow-hidden flex-shrink-0">
                      <img
                        src={sellerImage}
                        alt={order.seller}
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          e.target.src = imagePlaceholder
                        }}
                      />
                    </div>

                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-gray-800 dark:text-white text-lg leading-tight">{order.seller}</h3>
                      <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">
                        Order ID: <span className="font-semibold text-gray-700 dark:text-gray-300">{order.orderId || order.id}</span>
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{location}</p>
                      {order.deliveryPartnerName && (
                        <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                          <span className="font-medium">Delivery:</span> {order.deliveryPartnerName}
                          {order.deliveryPartnerPhone && ` | ${order.deliveryPartnerPhone}`}
                        </p>
                      )}
                      {order.sellerId && (
                        <Link to={`/sellers/${order.sellerId}`}>
                          <button className="text-xs text-wh-brand-ink font-medium flex items-center mt-1 hover:text-wh-brand-ink">
                            Visit store <span className="ml-0.5">&gt;</span>
                          </button>
                        </Link>
                      )}
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => toggleMenuForOrder(order.id)}
                    className="p-1 rounded-full hover:bg-gray-100 transition-colors"
                  >
                    <MoreVertical className="w-5 h-5 text-gray-400" />
                  </button>
                </div>

                {/* Three-dots dropdown menu */}
                {activeMenuOrderId === order.id && (
                  <div className="absolute right-3 top-10 z-20 w-40 rounded-xl bg-white shadow-lg border border-gray-100 py-1 text-xs">
                    <button
                      type="button"
                      onClick={() => handleShareSeller(order)}
                      className="w-full text-left px-3 py-2 hover:bg-gray-50 text-gray-800"
                    >
                      Share Seller
                    </button>
                    <button
                      type="button"
                      onClick={() => handleViewOrderDetails(order)}
                      className="w-full text-left px-3 py-2 hover:bg-gray-50 text-gray-800"
                    >
                      Order Details
                    </button>
                  </div>
                )}

                {/* Separator */}
                <div className="border-t border-dashed border-gray-200 dark:border-slate-700 mx-4 my-1"></div>

                {/* Items List */}
                <div className="px-4 py-2 space-y-2">
                  {order.items && order.items.length > 0 ? (
                    order.items.map((item, idx) => {
                      const isVeg = typeof item.isVeg === "boolean" ? item.isVeg : null
                      const itemName = item.name || item.productName || 'Item'
                      const itemQuantity = item.quantity || 1
                      const itemPrice = item.price || 0
                      const itemTotal = itemQuantity * itemPrice
                      const itemImage = item.image || null

                      return (
                        <div key={item._id || item.id || item.itemId || idx} className="flex items-start gap-3">
                          {/* Item Image */}
                          {itemImage && (
                            <div className="w-12 h-12 rounded-lg bg-gray-100 overflow-hidden flex-shrink-0">
                              <img
                                src={itemImage}
                                alt={itemName}
                                className="w-full h-full object-cover"
                                onError={(e) => {
                                  e.target.style.display = 'none'
                                }}
                              />
                            </div>
                          )}

                          <div className="flex-1 min-w-0">
                            <div className="flex items-start gap-2">
                              {/* Veg/Non-Veg Icon */}
                              {typeof isVeg === "boolean" && (
                                <div className={`w-4 h-4 border ${isVeg ? 'border-green-600' : 'border-red-600'} flex items-center justify-center p-[2px] flex-shrink-0 mt-0.5`}>
                                  <div className={`w-full h-full rounded-full ${isVeg ? 'bg-green-600' : 'bg-red-600'}`}></div>
                                </div>
                              )}
                              <div className="flex-1 min-w-0">
                                <span className="text-sm text-gray-800 dark:text-gray-200 font-medium block">
                                  {itemQuantity} x {itemName}
                                </span>
                                {item.variantName ? (
                                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{item.variantName}</p>
                                ) : null}
                                {item.description && (
                                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 line-clamp-1">{item.description}</p>
                                )}
                              </div>
                              <div className="text-right flex-shrink-0">
                                <span className="text-sm font-semibold text-gray-800 dark:text-gray-200">{"\u20B9"}{itemTotal.toFixed(2)}</span>
                                {itemQuantity > 1 && (
                                  <p className="text-xs text-gray-500 dark:text-gray-400">{"\u20B9"}{itemPrice.toFixed(2)} each</p>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      )
                    })
                  ) : (
                    <p className="text-sm text-gray-500">No items found</p>
                  )}
                </div>

                {/* Order Summary Section */}
                <div className="px-4 py-3 bg-gray-50 dark:bg-slate-950/50 rounded-lg mx-4 mb-2">
                  <div className="space-y-1.5">
                    {order.subtotal > 0 && (
                      <div className="flex justify-between text-xs">
                        <span className="text-gray-600 dark:text-gray-400">Subtotal</span>
                        <span className="text-gray-800 dark:text-gray-200 font-medium">{"\u20B9"}{order.subtotal.toFixed(2)}</span>
                      </div>
                    )}
                    <div className="flex justify-between text-xs">
                      <span className="text-gray-600 dark:text-gray-400">Delivery Fee</span>
                      <span className="text-gray-800 dark:text-gray-200 font-medium">
                        {order.deliveryFee > 0 ? `\u20B9${order.deliveryFee.toFixed(2)}` : "Free"}
                      </span>
                    </div>
                    {order.quickDeliveryFee > 0 && (
                      <div className="flex justify-between text-xs font-semibold">
                        <span className="text-wh-brand-ink">Quick Mode</span>
                        <span className="text-wh-brand-ink">{"\u20B9"}{order.quickDeliveryFee.toFixed(2)}</span>
                      </div>
                    )}
                    {order.packagingFee > 0 && (
                      <div className="flex justify-between text-xs">
                        <span className="text-gray-600 dark:text-gray-400">Packaging</span>
                        <span className="text-gray-800 dark:text-gray-200 font-medium">{"\u20B9"}{order.packagingFee.toFixed(2)}</span>
                      </div>
                    )}
                    <div className="flex justify-between text-xs">
                      <span className="text-gray-600 dark:text-gray-400">Platform Fee</span>
                      <span className="text-gray-800 dark:text-gray-200 font-medium">
                        {order.basePlatformFee > 0 ? `\u20B9${order.basePlatformFee.toFixed(2)}` : "Free"}
                      </span>
                    </div>
                    {order.tax > 0 && (
                      <div className="flex justify-between text-xs">
                        <span className="text-gray-600 dark:text-gray-400">Tax</span>
                        <span className="text-gray-800 dark:text-gray-200 font-medium">{"\u20B9"}{order.tax.toFixed(2)}</span>
                      </div>
                    )}
                    {order.pricing?.discount > 0 && (
                      <div className="flex justify-between text-xs">
                        <span className="text-green-600 dark:text-green-400">Discount</span>
                        <span className="text-green-600 dark:text-green-400 font-medium">-{"\u20B9"}{order.pricing.discount.toFixed(2)}</span>
                      </div>
                    )}
                    {order.coinsDiscount > 0 && (
                      <div className="flex justify-between text-xs">
                        <span className="text-green-600 dark:text-green-400">Coins</span>
                        <span className="text-green-600 dark:text-green-400 font-medium">-{"₹"}{order.coinsDiscount.toFixed(2)}</span>
                      </div>
                    )}
                    {order.pricing?.couponCode && (
                      <div className="flex justify-between text-xs">
                        <span className="text-gray-600 dark:text-gray-400">Coupon Applied</span>
                        <span className="text-gray-800 dark:text-gray-200 font-medium">{order.pricing.couponCode}</span>
                      </div>
                    )}
                    <div className="border-t border-gray-200 dark:border-slate-700 pt-1.5 mt-1.5">
                      <div className="flex justify-between">
                        <span className="text-sm font-semibold text-gray-800 dark:text-gray-200">Total</span>
                        <span className="text-base font-bold text-gray-900 dark:text-white">{"\u20B9"}{order.total.toFixed(2)}</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Date and Payment Info */}
                <div className="px-4 py-2 flex items-center justify-between">
                  <div className="flex-1">
                    <p className="text-xs text-gray-400">Order placed on {formatDate(order.createdAt)}</p>
                    {order.deliveredAt && (
                      <p className="text-xs text-gray-400 mt-0.5">Delivered on {formatDate(order.deliveredAt)}</p>
                    )}
                    {order.payment && (
                      <p className="text-xs text-gray-500 mt-1">
                        Payment: <span className="font-medium">{order.paymentMethodText}</span>
                        {paymentBadge && (
                          <span className={`ml-2 px-1.5 py-0.5 rounded text-[10px] font-medium ${PAYMENT_BADGE_TONE[paymentBadge.tone]}`}>
                            {paymentBadge.text}
                          </span>
                        )}
                      </p>
                    )}
                    {order.shopLabel ? (
                      <p className={`text-xs font-medium mt-1 ${isCancelled ? "text-red-500" : isDelivered ? "text-green-600" : "text-wh-brand-ink"}`}>{order.shopLabel}</p>
                    ) : (<>
                    {isDelivered && !paymentFailed && (
                      <p className="text-xs font-medium text-green-600 mt-1">Delivered</p>
                    )}
                    {isSellerCancelled && (
                      <p className="text-xs font-medium text-red-500 mt-1">Seller Cancelled</p>
                    )}
                    {isUserCancelled && (
                      <p className="text-xs font-medium text-gray-500 mt-1">Cancelled by You</p>
                    )}
                    {isCancelled && !isSellerCancelled && !isUserCancelled && (
                      <p className="text-xs font-medium text-gray-500 mt-1">Cancelled</p>
                    )}
                    </>)}
                  </div>
                  <div className="flex items-center ml-4">
                    <Link to={`/orders/${order.id}`}>
                      <button className="text-xs text-wh-brand-ink font-medium hover:text-wh-brand-ink flex items-center gap-1">
                        View Details
                        <ChevronRight className="w-4 h-4" />
                      </button>
                    </Link>
                  </div>
                </div>

                {/* Separator */}
                <div className="border-t border-gray-100 dark:border-zinc-800 mx-4"></div>

                {/* Card Footer: Actions */}
                <div className="px-4 py-3 flex items-center justify-between">
                  {/* Left Side: Rating or Error */}
                  {order.shopLabel && !isDelivered ? (
                    <div>
                      <p className="text-xs font-semibold text-gray-700 dark:text-gray-300">{order.shopLabel}</p>
                      {isCancelled && order.cancellationReason ? (
                        <p className="text-xs text-gray-500 mt-0.5">Reason: {order.cancellationReason}</p>
                      ) : null}
                    </div>
                  ) : isSellerCancelled ? (
                    <div className="flex flex-col gap-1">
                      <div className="flex items-center gap-2">
                        <div className="bg-red-100 p-1 rounded-full">
                          <AlertCircle className="w-4 h-4 text-red-500" />
                        </div>
                        <span className="text-xs font-semibold text-red-500">Seller Cancelled</span>
                      </div>
                      <p className="text-xs text-gray-600 ml-7">If prepaid, refund is sent automatically to the original payment method.</p>
                    </div>
                  ) : paymentFailed ? (
                    <div className="flex items-center gap-2">
                      <div className="bg-red-100 p-1 rounded-full">
                        <AlertCircle className="w-4 h-4 text-red-500" />
                      </div>
                      <span className="text-xs font-semibold text-red-500">Payment Failed</span>
                    </div>
                  ) : isDelivered && order.sellerRating && (!order.deliveryPartnerId || order.deliveryPartnerRating) ? (
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm text-gray-800">You Rated</span>
                        <div className="flex bg-yellow-400 text-white px-1 rounded text-[10px] items-center gap-0.5 h-4">
                          R {order.sellerRating}<Star className="w-2 h-2 fill-current" />
                        </div>
                        {order.deliveryPartnerId && (
                          <div className="flex bg-blue-500 text-white px-1 rounded text-[10px] items-center gap-0.5 h-4">
                            D {order.deliveryPartnerRating}<Star className="w-2 h-2 fill-current" />
                          </div>
                        )}
                      </div>
                    </div>
                  ) : isDelivered ? (
                    <div>
                      <p className="text-xs text-gray-500">Order Delivered</p>
                      <button
                        type="button"
                        onClick={() => handleOpenRating(order)}
                        className="text-xs text-wh-brand-ink font-medium mt-0.5 flex items-center"
                      >
                        Rate seller & delivery <span className="ml-0.5">&gt;</span>
                      </button>
                    </div>
                  ) : (
                    <div>
                      {order.status === 'pending_payment' ? (
                        <Link to={`/orders/${order.id}`} className="text-xs font-medium text-wh-brand-ink underline-offset-2 hover:underline">
                          Payment pending — tap to complete
                        </Link>
                      ) : (
                        <p className="text-xs text-gray-500">{order.statusText}</p>
                      )}
                      {/* Countdown Timer */}
                      {countdowns[order.id] && countdowns[order.id] > 0 && (
                        <div className="flex items-center gap-1 mt-1 text-xs text-wh-brand-ink font-medium">
                          <Clock size={12} />
                          <span>{countdowns[order.id]} min{countdowns[order.id] !== 1 ? 's' : ''} remaining</span>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Right Side: Reorder Button */}
                  {isDelivered && !paymentFailed && (
                    <button
                      onClick={() => handleReorder(order)}
                      className="bg-wh-brand hover:bg-wh-brand-600 text-wh-text px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-1 shadow-sm transition-colors"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      Reorder
                    </button>
                  )}
                </div>
              </div>
            )
          })
        )}
      </div>

      {/* Footer Branding */}
      <div className="flex justify-center mt-8 mb-4">
        <h1 className="text-4xl font-black text-gray-200 dark:text-zinc-900 tracking-tighter italic capitalize">{companyName}</h1>
      </div>

      {/* Rating & Feedback Modal */}
      {ratingModal.open && ratingModal.order && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4 animate-in fade-in duration-200">
          <div className="w-full max-w-md rounded-3xl bg-white dark:bg-zinc-900 shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300">
            {/* Header with gradient */}
            <div className="bg-gradient-to-r from-wh-brand to-wh-brand-600 px-6 py-5">
              <div className="flex items-center justify-between mb-2">
                <h2 className="text-xl font-bold text-white flex items-center gap-2">
                  <Star className="w-5 h-5 fill-white" />
                  Rate Your Delivery
                </h2>
                <button
                  type="button"
                  onClick={handleCloseRating}
                  className="text-white/80 hover:text-white transition-colors p-1 rounded-full hover:bg-white/20"
                >
                  <span className="text-xl">x</span>
                </button>
              </div>
              <p className="text-sm text-white/90">{ratingModal.order.seller}</p>
            </div>

            <div className="px-6 py-6">
              <div className="mb-6">
                <p className="text-sm font-semibold text-gray-900 dark:text-white mb-3">
                  Seller rating (out of 5)
                </p>
                <div className="flex items-center justify-center gap-2 mb-3">
                  {Array.from({ length: 5 }, (_, i) => i + 1).map((num) => {
                    const isActive = (selectedSellerRating || 0) >= num
                    return (
                      <button
                        key={`seller-${num}`}
                        type="button"
                        onClick={() => setSelectedSellerRating(num)}
                        className="p-2 transition-transform hover:scale-125 active:scale-95"
                      >
                        <Star
                          className={`w-10 h-10 transition-all ${isActive
                            ? "text-yellow-400 fill-yellow-400 drop-shadow-lg"
                            : "text-gray-300 dark:text-zinc-800 hover:text-yellow-200"
                            }`}
                        />
                      </button>
                    )
                  })}
                </div>
                <textarea
                  rows={2}
                  value={sellerFeedbackText}
                  onChange={(e) => setSellerFeedbackText(e.target.value)}
                  className="w-full rounded-xl border-2 border-gray-200 dark:border-zinc-800 bg-transparent px-4 py-2 text-sm text-gray-800 dark:text-gray-200 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-wh-brand focus:border-wh-brand resize-none transition-all"
                  placeholder="Seller feedback (optional)"
                />
              </div>

              {ratingModalHasDeliveryPartner && (
                <div className="mb-6">
                  <p className="text-sm font-semibold text-gray-900 dark:text-white mb-3">
                    Delivery partner rating (out of 5)
                  </p>
                  <div className="flex items-center justify-center gap-2 mb-3">
                    {Array.from({ length: 5 }, (_, i) => i + 1).map((num) => {
                      const isActive = (selectedDeliveryRating || 0) >= num
                      return (
                        <button
                          key={`delivery-${num}`}
                          type="button"
                          onClick={() => setSelectedDeliveryRating(num)}
                          className="p-2 transition-transform hover:scale-125 active:scale-95"
                        >
                          <Star
                            className={`w-10 h-10 transition-all ${isActive
                              ? "text-yellow-400 fill-yellow-400 drop-shadow-lg"
                              : "text-gray-300 dark:text-zinc-800 hover:text-yellow-200"
                              }`}
                          />
                        </button>
                      )
                    })}
                  </div>
                  <textarea
                    rows={2}
                    value={deliveryFeedbackText}
                    onChange={(e) => setDeliveryFeedbackText(e.target.value)}
                    className="w-full rounded-xl border-2 border-gray-200 dark:border-zinc-800 bg-transparent px-4 py-2 text-sm text-gray-800 dark:text-gray-200 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-wh-brand focus:border-wh-brand resize-none transition-all"
                    placeholder="Delivery partner feedback (optional)"
                  />
                </div>
              )}

              {/* Submit Button */}
              <button
                type="button"
                disabled={ratingSubmitDisabled}
                onClick={handleSubmitRating}
                className="w-full rounded-xl text-wh-text text-base font-bold py-3.5 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2"
                style={{
                  background:
                    "linear-gradient(135deg, rgba(var(--module-theme-rgb,253,146,11),0.94), var(--module-theme-color,#FD920B))",
                  boxShadow:
                    "0 12px 24px rgba(var(--module-theme-rgb,253,146,11),0.30)",
                }}
              >
                {submittingRating ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Submitting...
                  </>
                ) : (
                  <>
                    <Star className="w-5 h-5 fill-white" />
                    Submit Ratings
                  </>
                )}
              </button>

              {ratingSubmitDisabled && (
                <p className="text-xs text-center text-red-500 mt-2">Please select all required ratings to continue</p>
              )}
            </div>
          </div>
        </div>
      )}

      {showShareModal && sharePayload && (
        <div 
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 px-4 pb-4 pt-10 sm:items-center backdrop-blur-[2px]"
          onClick={() => setShowShareModal(false)}
        >
          <div 
            className="w-full max-w-sm rounded-3xl bg-white dark:bg-zinc-900 shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-gray-100 dark:border-zinc-800 px-5 py-4">
              <div>
                <h3 className="text-base font-semibold text-gray-900 dark:text-white">Share Seller</h3>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Native share available ho to sab supported apps wahan dikhenge</p>
              </div>
              <button
                type="button"
                onClick={() => setShowShareModal(false)}
                className="rounded-full p-2 text-gray-500 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-zinc-800"
                aria-label="Close share modal"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="px-5 py-5 space-y-3">
              {typeof navigator !== "undefined" && navigator.share && (
                <button
                  type="button"
                  onClick={handleSystemShareFromModal}
                  className="w-full rounded-2xl bg-wh-brand px-4 py-3 text-sm font-semibold text-wh-text flex items-center justify-center gap-2 hover:bg-wh-brand-600 transition-colors"
                >
                  <Share2 className="w-4 h-4" />
                  Share via Apps
                </button>
              )}

              <div className="grid grid-cols-3 gap-3">
                <button
                  type="button"
                  onClick={() => openShareTarget("whatsapp")}
                  className="rounded-2xl border border-gray-200 dark:border-zinc-800 px-3 py-4 text-xs font-medium text-gray-700 dark:text-gray-300 flex flex-col items-center gap-2 hover:bg-gray-50 dark:hover:bg-zinc-800"
                >
                  <MessageCircle className="w-5 h-5 text-green-600" />
                  WhatsApp
                </button>
                <button
                  type="button"
                  onClick={() => openShareTarget("telegram")}
                  className="rounded-2xl border border-gray-200 dark:border-zinc-800 px-3 py-4 text-xs font-medium text-gray-700 dark:text-gray-300 flex flex-col items-center gap-2 hover:bg-gray-50 dark:hover:bg-zinc-800"
                >
                  <Send className="w-5 h-5 text-sky-500" />
                  Telegram
                </button>
                <button
                  type="button"
                  onClick={() => openShareTarget("email")}
                  className="rounded-2xl border border-gray-200 dark:border-zinc-800 px-3 py-4 text-xs font-medium text-gray-700 dark:text-gray-300 flex flex-col items-center gap-2 hover:bg-gray-50 dark:hover:bg-zinc-800"
                >
                  <Mail className="w-5 h-5 text-rose-500" />
                  Email
                </button>
                <button
                  type="button"
                  onClick={() => openShareTarget("sms")}
                  className="rounded-2xl border border-gray-200 dark:border-zinc-800 px-3 py-4 text-xs font-medium text-gray-700 dark:text-gray-300 flex flex-col items-center gap-2 hover:bg-gray-50 dark:hover:bg-zinc-800"
                >
                  <MessagesSquare className="w-5 h-5 text-violet-500" />
                  SMS
                </button>
                <button
                  type="button"
                  onClick={() => openShareTarget("facebook")}
                  className="rounded-2xl border border-gray-200 dark:border-zinc-800 px-3 py-4 text-xs font-medium text-gray-700 dark:text-gray-300 flex flex-col items-center gap-2 hover:bg-gray-50 dark:hover:bg-zinc-800"
                >
                  <Share2 className="w-5 h-5 text-blue-600" />
                  Facebook
                </button>
                <button
                  type="button"
                  onClick={() => openShareTarget("x")}
                  className="rounded-2xl border border-gray-200 dark:border-zinc-800 px-3 py-4 text-xs font-medium text-gray-700 dark:text-gray-300 flex flex-col items-center gap-2 hover:bg-gray-50 dark:hover:bg-zinc-800"
                >
                  <Link2 className="w-5 h-5 text-gray-900 dark:text-white" />
                  X
                </button>
                <button
                  type="button"
                  onClick={() => openShareTarget("linkedin")}
                  className="rounded-2xl border border-gray-200 dark:border-zinc-800 px-3 py-4 text-xs font-medium text-gray-700 dark:text-gray-300 flex flex-col items-center gap-2 hover:bg-gray-50 dark:hover:bg-zinc-800"
                >
                  <Share2 className="w-5 h-5 text-blue-700" />
                  LinkedIn
                </button>
                <button
                  type="button"
                  onClick={copyShareLink}
                  className="rounded-2xl border border-gray-200 dark:border-zinc-800 px-3 py-4 text-xs font-medium text-gray-700 dark:text-gray-300 flex flex-col items-center gap-2 hover:bg-gray-50 dark:hover:bg-zinc-800"
                >
                  <Copy className="w-5 h-5 text-gray-600 dark:text-gray-400" />
                  Copy Link
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
