import { useState, useEffect, useRef } from "react"
import { Link, useNavigate } from "react-router-dom"
import { Search, MoreVertical, ChevronRight, Star, AlertCircle, Loader2, Clock, X, Share2, MessageCircle, Send, Copy, Mail, MessagesSquare, Link2, Check, Package, ShoppingCart, Store, Truck } from "lucide-react"
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

// Status pills on the desktop list; "Processing" is placed, confirmed and being packed.
const ORDER_TABS = ["All", "Processing", "Shipped", "Delivered", "Cancelled"]

/** Which pill an order (as transformed on this page) falls under. */
function orderBucket(order) {
  const s = String(order?.status || "")
  if (s === "delivered") return "Delivered"
  if (s === "cancelled" || s === "seller_cancelled" || s.toLowerCase().includes("cancel")) return "Cancelled"
  if (s === "outForDelivery") return "Shipped"
  return "Processing"
}

/** Status chip colours as on the phone: red cancelled, green delivered, orange on the way, amber otherwise. */
function chipToneFor(order) {
  const bucket = orderBucket(order)
  if (bucket === "Cancelled") return { bg: "bg-[#FFEAED]", fg: "text-[#E11D48]", dot: "bg-[#E11D48]", Icon: X }
  if (bucket === "Delivered") return { bg: "bg-[#DCFCE7]", fg: "text-[#16A34A]", dot: "bg-[#16A34A]", Icon: Check }
  if (bucket === "Shipped") return { bg: "bg-[#FFEDD5]", fg: "text-[#EA580C]", dot: "bg-[#EA580C]", Icon: Truck }
  return { bg: "bg-[#FEF3C7]", fg: "text-[#D97706]", dot: "bg-[#D97706]", Icon: Clock }
}

export default function Orders() {
  const companyName = useCompanyName()
  const navigate = useNavigate()

  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState("")
  const [statusTab, setStatusTab] = useState("All")
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

  // Page shell (lg+): the customer app's "My Orders" look, centred on wide screens.
  const pageHeader = (subtitle) => (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <h1 className="font-app-display text-[38px] font-bold leading-none text-app-brown-deep dark:text-white">My Orders</h1>
        <p className="mt-2 text-[14px] font-medium text-app-muted">{subtitle}</p>
      </div>
      {orders.length > 0 ? (
        <label className="flex h-[46px] w-full max-w-[380px] items-center gap-2 rounded-[14px] border border-app-line bg-white px-[14px] shadow-[0_1px_6px_rgba(0,0,0,0.024)] focus-within:border-app-brown dark:border-gray-800 dark:bg-[#1a1a1a]">
          <Search className="h-5 w-5 shrink-0 text-[#9E958E]" aria-hidden="true" />
          <input
            type="search"
            placeholder="Search by store or product"
            aria-label="Search orders"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="min-w-0 flex-1 bg-transparent text-[13.5px] text-app-ink outline-none placeholder:text-[#A79C94] dark:text-gray-100"
          />
          {searchQuery ? (
            <button
              type="button"
              onClick={() => setSearchQuery("")}
              aria-label="Clear search"
              className="flex h-6 w-6 items-center justify-center rounded-full text-[#9E958E] hover:bg-app-alt"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          ) : null}
        </label>
      ) : null}
    </div>
  )

  if (loading) {
    return (
      <div className="min-h-screen bg-app-cream pb-12 font-app dark:bg-[#0a0a0a]">
        <div className="mx-auto max-w-5xl px-8 pt-8">
          {pageHeader("Track, manage and buy again")}
          <div className="mt-6 space-y-4" role="status" aria-label="Loading orders">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="rounded-[18px] border border-app-line bg-white p-5 dark:border-gray-800 dark:bg-[#1a1a1a]">
                <div className="flex gap-5">
                  <div className="h-[110px] w-[96px] animate-pulse rounded-[14px] bg-app-alt" />
                  <div className="flex-1 space-y-2.5 pt-1">
                    <div className="h-5 w-32 animate-pulse rounded-xl bg-app-alt" />
                    <div className="h-3.5 w-1/3 animate-pulse rounded bg-app-alt" />
                    <div className="h-4 w-1/2 animate-pulse rounded bg-app-alt" />
                    <div className="h-3.5 w-1/4 animate-pulse rounded bg-app-alt" />
                  </div>
                  <div className="h-[38px] w-40 animate-pulse rounded-[20px] bg-app-alt" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  if (orders.length === 0) {
    return (
      <div className="min-h-screen bg-app-cream pb-12 font-app dark:bg-[#0a0a0a]">
        <div className="mx-auto max-w-5xl px-8 pt-8">
          {pageHeader("Track, manage and buy again")}
          <div className="mt-6 flex flex-col items-center rounded-[18px] border border-app-line bg-white px-6 py-14 text-center dark:border-gray-800 dark:bg-[#1a1a1a]">
            <span className="flex h-16 w-16 items-center justify-center rounded-full bg-app-sand">
              <Package className="h-8 w-8 text-app-brown" aria-hidden="true" />
            </span>
            <p className="mt-4 text-[18px] font-bold text-app-brown-deep dark:text-white">No orders yet</p>
            <p className="mt-1 text-[13px] text-app-muted">You haven&apos;t placed any orders yet</p>
            <Link
              to="/"
              className="mt-5 flex h-[42px] items-center rounded-[20px] bg-app-brown px-7 text-[14px] font-bold text-white hover:bg-app-brown-deep focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app-brown"
            >
              Start Shopping
            </Link>
          </div>
        </div>
      </div>
    )
  }

  const shownOrders = filteredOrders.filter((order) => statusTab === "All" || orderBucket(order) === statusTab)
  const tabCounts = orders.reduce((acc, order) => {
    const bucket = orderBucket(order)
    acc[bucket] = (acc[bucket] || 0) + 1
    return acc
  }, { All: orders.length })

  return (
    <div className="min-h-screen bg-app-cream pb-12 font-app dark:bg-[#0a0a0a]">
      <div className="mx-auto max-w-5xl px-8 pt-8">
        {pageHeader(`${orders.length} order${orders.length === 1 ? "" : "s"} · Track, manage and buy again`)}

        {/* Status pills */}
        <div className="mt-5 flex flex-wrap gap-2" role="tablist" aria-label="Filter orders by status">
          {ORDER_TABS.map((t) => (
            <button
              key={t}
              type="button"
              role="tab"
              aria-selected={statusTab === t}
              onClick={() => setStatusTab(t)}
              className={`rounded-full px-4 py-2 text-[13px] font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app-brown ${
                statusTab === t ? "bg-app-brown text-white" : "bg-app-sand text-app-brown-deep hover:bg-app-tint-strong"
              }`}
            >
              {t}
              {tabCounts[t] ? (
                <span className={`ml-1 text-[11px] ${statusTab === t ? "text-white/75" : "text-app-muted"}`}>{tabCounts[t]}</span>
              ) : null}
            </button>
          ))}
        </div>

        {/* Orders List */}
        <div className="mt-5 space-y-4">
          {shownOrders.length === 0 ? (
            <div className="flex flex-col items-center rounded-[18px] border border-app-line bg-white px-6 py-12 text-center dark:border-gray-800 dark:bg-[#1a1a1a]">
              <span className="flex h-14 w-14 items-center justify-center rounded-full bg-app-sand">
                <Package className="h-7 w-7 text-app-brown" aria-hidden="true" />
              </span>
              <p className="mt-3 text-[16px] font-bold text-app-brown-deep dark:text-white">
                {searchQuery.trim() ? "No orders found matching your search" : `Nothing ${statusTab.toLowerCase()} right now`}
              </p>
              {searchQuery.trim() ? (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  className="mt-4 h-[38px] rounded-[20px] border-[1.2px] border-app-brown px-5 text-[13px] font-bold text-app-brown hover:bg-app-tint"
                >
                  Clear search
                </button>
              ) : null}
            </div>
          ) : (
            shownOrders.map((order) => {
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
              // First item's photo; then the store's; then the placeholder.
              const firstItemImage = order.items?.[0]?.image
              const sellerImage = firstItemImage
                || order.sellerImage
                || imagePlaceholder
              const location = order.sellerLocation || `${order.address?.city || ''}, ${order.address?.state || ''}`.trim() || 'Location not available'
              const tone = chipToneFor(order)
              const ToneIcon = tone.Icon
              const headlineText = isSellerCancelled
                ? "Seller Cancelled"
                : isUserCancelled && !order.shopLabel
                  ? "Cancelled by You"
                  : order.shopLabel || order.statusText
              const firstItem = order.items?.[0] || {}
              const itemCount = order.items?.length || 0
              const qty = (order.items || []).reduce((n, item) => n + (Number(item.quantity) || 1), 0)

              return (
                <article key={order.id} className="relative rounded-[18px] border border-[#EFE8E2] bg-white p-5 shadow-[0_2px_8px_rgba(0,0,0,0.04)] dark:border-gray-800 dark:bg-[#1a1a1a]">
                  <div className="flex gap-5">
                    {/* Photo */}
                    <Link
                      to={`/orders/${order.id}`}
                      className="relative h-[110px] w-[96px] shrink-0 overflow-hidden rounded-[14px] bg-app-alt focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app-brown"
                      aria-label={`View order from ${order.seller}`}
                    >
                      <img
                        src={sellerImage}
                        alt=""
                        className="h-full w-full object-cover"
                        onError={(e) => {
                          e.target.src = imagePlaceholder
                        }}
                      />
                    </Link>

                    {/* What and where */}
                    <div className="min-w-0 flex-1">
                      <span className={`inline-flex max-w-full items-center gap-[5px] rounded-xl px-2 py-[3.5px] ${tone.bg}`}>
                        <span className={`flex h-[14px] w-[14px] shrink-0 items-center justify-center rounded-full ${tone.dot}`}>
                          <ToneIcon className="h-2.5 w-2.5 text-white" strokeWidth={3} aria-hidden="true" />
                        </span>
                        <span className={`truncate text-[12px] font-bold ${tone.fg}`}>{headlineText}</span>
                      </span>
                      <p className="mt-1.5 truncate text-[12px] font-medium text-app-muted">
                        {formatDate(order.createdAt)}  •  Order #{order.orderId || order.id}
                      </p>
                      <p className="mt-1 truncate text-[16px] font-extrabold text-app-ink dark:text-white">
                        {firstItem.name || "Order"}
                        {itemCount > 1 ? ` +${itemCount - 1} more` : ""}
                      </p>
                      <p className="mt-0.5 truncate text-[12.5px] font-medium text-app-muted">
                        Qty: {qty}
                        {firstItem.variantName ? `  |  ${firstItem.variantName}` : ""}
                      </p>
                      <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[12px] text-app-muted">
                        <span className="inline-flex min-w-0 items-center gap-1">
                          <Store className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                          <span className="truncate font-semibold text-app-brown-deep dark:text-gray-200">{order.seller}</span>
                        </span>
                        <span aria-hidden="true">·</span>
                        <span className="truncate">{location}</span>
                        {order.sellerId && (
                          <Link to={`/sellers/${order.sellerId}`} className="font-semibold text-app-brown hover:underline">
                            Visit store
                          </Link>
                        )}
                      </p>
                      {order.deliveryPartnerName && (
                        <p className="mt-1 text-[12px] text-app-muted">
                          <span className="font-medium text-app-ink dark:text-gray-200">Delivery:</span> {order.deliveryPartnerName}
                          {order.deliveryPartnerPhone && ` | ${order.deliveryPartnerPhone}`}
                        </p>
                      )}
                    </div>

                    {/* Total, menu */}
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <button
                        type="button"
                        onClick={() => toggleMenuForOrder(order.id)}
                        aria-label="More actions"
                        aria-expanded={activeMenuOrderId === order.id}
                        className="-mr-1.5 -mt-1.5 rounded-full p-1.5 text-[#9E958E] transition-colors hover:bg-app-alt"
                      >
                        <MoreVertical className="h-5 w-5" />
                      </button>
                      <p className="text-[12px] text-app-muted">Total</p>
                      <p className="text-[18px] font-black tabular-nums text-app-ink dark:text-white">{"₹"}{order.total.toFixed(2)}</p>
                      {paymentBadge && (
                        <span className={`rounded px-1.5 py-0.5 text-[10.5px] font-semibold ${PAYMENT_BADGE_TONE[paymentBadge.tone]}`}>
                          {paymentBadge.text}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Three-dots dropdown menu */}
                  {activeMenuOrderId === order.id && (
                    <div className="absolute right-4 top-12 z-20 w-44 rounded-xl border border-app-line bg-white py-1 text-[13px] shadow-lg dark:border-gray-800 dark:bg-[#1a1a1a]">
                      <button
                        type="button"
                        onClick={() => handleShareSeller(order)}
                        className="w-full px-3 py-2 text-left text-app-ink hover:bg-app-tint dark:text-gray-200 dark:hover:bg-gray-800"
                      >
                        Share Seller
                      </button>
                      <button
                        type="button"
                        onClick={() => handleViewOrderDetails(order)}
                        className="w-full px-3 py-2 text-left text-app-ink hover:bg-app-tint dark:text-gray-200 dark:hover:bg-gray-800"
                      >
                        Order Details
                      </button>
                    </div>
                  )}

                  {/* Items and bill, folded away */}
                  <details className="group mt-4 rounded-[14px] bg-app-tint px-4 py-2.5 dark:bg-[#222]">
                    <summary className="flex cursor-pointer list-none items-center justify-between gap-2 text-[12.5px] font-semibold text-app-brown [&::-webkit-details-marker]:hidden">
                      <span>
                        {itemCount} item{itemCount === 1 ? "" : "s"} · Payment: {order.paymentMethodText}
                      </span>
                      <ChevronRight className="h-4 w-4 transition-transform group-open:rotate-90" aria-hidden="true" />
                    </summary>
                    <div className="mt-3 grid gap-6 border-t border-app-line pt-3 md:grid-cols-[minmax(0,1fr)_260px] dark:border-gray-800">
                      <ul className="space-y-2.5">
                        {order.items && order.items.length > 0 ? (
                          order.items.map((item, idx) => {
                            const itemName = item.name || item.productName || 'Item'
                            const itemQuantity = item.quantity || 1
                            const itemPrice = item.price || 0
                            const itemTotal = itemQuantity * itemPrice
                            return (
                              <li key={item._id || item.id || item.itemId || idx} className="flex items-start gap-3">
                                {item.image ? (
                                  <span className="h-11 w-11 shrink-0 overflow-hidden rounded-[10px] bg-white">
                                    <img
                                      src={item.image}
                                      alt=""
                                      className="h-full w-full object-cover"
                                      onError={(e) => {
                                        e.target.style.display = 'none'
                                      }}
                                    />
                                  </span>
                                ) : null}
                                <span className="min-w-0 flex-1">
                                  <span className="block text-[13px] font-medium text-app-ink dark:text-gray-200">
                                    {itemQuantity} x {itemName}
                                  </span>
                                  {item.variantName ? <span className="block text-[11.5px] text-app-muted">{item.variantName}</span> : null}
                                  {item.description ? <span className="block truncate text-[11.5px] text-app-muted">{item.description}</span> : null}
                                </span>
                                <span className="shrink-0 text-right">
                                  <span className="block text-[13px] font-semibold tabular-nums text-app-ink dark:text-gray-200">{"₹"}{itemTotal.toFixed(2)}</span>
                                  {itemQuantity > 1 && (
                                    <span className="block text-[11px] text-app-muted">{"₹"}{itemPrice.toFixed(2)} each</span>
                                  )}
                                </span>
                              </li>
                            )
                          })
                        ) : (
                          <li className="text-[13px] text-app-muted">No items found</li>
                        )}
                      </ul>
                      <div className="space-y-1.5 text-[12px]">
                        {order.subtotal > 0 && (
                          <div className="flex justify-between"><span className="text-app-muted">Subtotal</span><span className="font-medium text-app-ink dark:text-gray-200">{"₹"}{order.subtotal.toFixed(2)}</span></div>
                        )}
                        <div className="flex justify-between">
                          <span className="text-app-muted">Delivery Fee</span>
                          <span className="font-medium text-app-ink dark:text-gray-200">{order.deliveryFee > 0 ? `₹${order.deliveryFee.toFixed(2)}` : "Free"}</span>
                        </div>
                        {order.quickDeliveryFee > 0 && (
                          <div className="flex justify-between font-semibold text-app-brown"><span>Quick Mode</span><span>{"₹"}{order.quickDeliveryFee.toFixed(2)}</span></div>
                        )}
                        {order.packagingFee > 0 && (
                          <div className="flex justify-between"><span className="text-app-muted">Packaging</span><span className="font-medium text-app-ink dark:text-gray-200">{"₹"}{order.packagingFee.toFixed(2)}</span></div>
                        )}
                        <div className="flex justify-between">
                          <span className="text-app-muted">Platform Fee</span>
                          <span className="font-medium text-app-ink dark:text-gray-200">{order.basePlatformFee > 0 ? `₹${order.basePlatformFee.toFixed(2)}` : "Free"}</span>
                        </div>
                        {order.tax > 0 && (
                          <div className="flex justify-between"><span className="text-app-muted">Tax</span><span className="font-medium text-app-ink dark:text-gray-200">{"₹"}{order.tax.toFixed(2)}</span></div>
                        )}
                        {order.pricing?.discount > 0 && (
                          <div className="flex justify-between font-medium text-app-ok"><span>Discount</span><span>-{"₹"}{order.pricing.discount.toFixed(2)}</span></div>
                        )}
                        {order.coinsDiscount > 0 && (
                          <div className="flex justify-between font-medium text-app-ok"><span>Coins</span><span>-{"₹"}{order.coinsDiscount.toFixed(2)}</span></div>
                        )}
                        {order.pricing?.couponCode && (
                          <div className="flex justify-between"><span className="text-app-muted">Coupon Applied</span><span className="font-medium text-app-ink dark:text-gray-200">{order.pricing.couponCode}</span></div>
                        )}
                        <div className="mt-1.5 flex justify-between border-t border-app-line pt-1.5 dark:border-gray-800">
                          <span className="text-[13px] font-semibold text-app-ink dark:text-gray-200">Total</span>
                          <span className="text-[14px] font-bold tabular-nums text-app-ink dark:text-white">{"₹"}{order.total.toFixed(2)}</span>
                        </div>
                      </div>
                    </div>
                  </details>

                  {/* Footer: status notes, rating and the two buttons */}
                  <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                    <div className="min-w-0 text-[12px]">
                      {order.deliveredAt && (
                        <p className="text-app-muted">Delivered on {formatDate(order.deliveredAt)}</p>
                      )}
                      {order.shopLabel && !isDelivered ? (
                        isCancelled && order.cancellationReason ? (
                          <p className="text-app-muted">Reason: {order.cancellationReason}</p>
                        ) : null
                      ) : isSellerCancelled ? (
                        <p className="flex items-center gap-1.5 text-app-muted">
                          <AlertCircle className="h-4 w-4 shrink-0 text-[#E11D48]" aria-hidden="true" />
                          If prepaid, refund is sent automatically to the original payment method.
                        </p>
                      ) : paymentFailed ? (
                        <p className="flex items-center gap-1.5 font-semibold text-[#E11D48]">
                          <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
                          Payment Failed
                        </p>
                      ) : isDelivered && order.sellerRating && (!order.deliveryPartnerId || order.deliveryPartnerRating) ? (
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-app-ink dark:text-gray-200">You Rated</span>
                          <span className="flex h-5 items-center gap-0.5 rounded bg-app-brown px-1.5 text-[10.5px] font-semibold text-white">
                            Seller {order.sellerRating}<Star className="h-2.5 w-2.5 fill-current" aria-hidden="true" />
                          </span>
                          {order.deliveryPartnerId && (
                            <span className="flex h-5 items-center gap-0.5 rounded bg-app-brown-mid px-1.5 text-[10.5px] font-semibold text-white">
                              Delivery {order.deliveryPartnerRating}<Star className="h-2.5 w-2.5 fill-current" aria-hidden="true" />
                            </span>
                          )}
                        </div>
                      ) : isDelivered ? (
                        <button
                          type="button"
                          onClick={() => handleOpenRating(order)}
                          className="inline-flex items-center gap-1 font-semibold text-app-brown hover:underline"
                        >
                          <Star className="h-3.5 w-3.5" aria-hidden="true" />
                          Rate seller &amp; delivery
                        </button>
                      ) : (
                        <div>
                          {order.status === 'pending_payment' ? (
                            <Link to={`/orders/${order.id}`} className="font-semibold text-app-brown underline-offset-2 hover:underline">
                              Payment pending — complete it now
                            </Link>
                          ) : null}
                          {/* Countdown Timer */}
                          {countdowns[order.id] && countdowns[order.id] > 0 && (
                            <p className="mt-0.5 flex items-center gap-1 font-medium text-app-brown">
                              <Clock size={12} aria-hidden="true" />
                              <span>{countdowns[order.id]} min{countdowns[order.id] !== 1 ? 's' : ''} remaining</span>
                            </p>
                          )}
                        </div>
                      )}
                    </div>

                    <div className="flex shrink-0 items-center gap-2">
                      {isDelivered && !paymentFailed && (
                        <button
                          type="button"
                          onClick={() => handleReorder(order)}
                          className="flex h-[38px] items-center gap-1.5 rounded-[20px] border-[1.2px] border-[#4A2C19] px-4 text-[13px] font-bold text-[#4A2C19] transition-colors hover:bg-app-tint focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app-brown dark:border-gray-500 dark:text-gray-200"
                        >
                          <ShoppingCart className="h-4 w-4" aria-hidden="true" />
                          Buy Again
                        </button>
                      )}
                      <Link
                        to={`/orders/${order.id}`}
                        className="flex h-[38px] items-center gap-1 rounded-[20px] bg-[#4A2C19] px-5 text-[13px] font-bold text-white transition-colors hover:bg-app-brown-deep focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app-brown"
                      >
                        View Details
                        <ChevronRight className="h-4 w-4" aria-hidden="true" />
                      </Link>
                    </div>
                  </div>
                </article>
              )
            })
          )}
        </div>

        {/* Footer Branding */}
        <div className="mt-10 flex justify-center">
          <p className="font-app-display text-4xl font-bold capitalize tracking-tight text-app-line dark:text-zinc-900">{companyName}</p>
        </div>
      </div>

      {/* Rating & Feedback Modal */}
      {ratingModal.open && ratingModal.order && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4 animate-in fade-in duration-200">
          <div className="w-full max-w-md rounded-3xl bg-white dark:bg-zinc-900 shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300 font-app">
            {/* Header with gradient */}
            <div className="bg-gradient-to-r from-app-brown to-app-brown-mid px-6 py-5">
              <div className="flex items-center justify-between mb-2">
                <h2 className="text-xl font-bold text-white flex items-center gap-2">
                  <Star className="w-5 h-5 fill-white" />
                  Rate Your Delivery
                </h2>
                <button
                  type="button"
                  onClick={handleCloseRating}
                  aria-label="Close rating"
                  className="text-white/80 hover:text-white transition-colors p-1 rounded-full hover:bg-white/20"
                >
                  <X className="h-5 w-5" aria-hidden="true" />
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
                  className="w-full rounded-xl border-2 border-gray-200 dark:border-zinc-800 bg-transparent px-4 py-2 text-sm text-gray-800 dark:text-gray-200 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-app-brown/30 focus:border-app-brown resize-none transition-all"
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
                    className="w-full rounded-xl border-2 border-gray-200 dark:border-zinc-800 bg-transparent px-4 py-2 text-sm text-gray-800 dark:text-gray-200 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-app-brown/30 focus:border-app-brown resize-none transition-all"
                    placeholder="Delivery partner feedback (optional)"
                  />
                </div>
              )}

              {/* Submit Button */}
              <button
                type="button"
                disabled={ratingSubmitDisabled}
                onClick={handleSubmitRating}
                className="w-full rounded-xl bg-app-brown text-white text-base font-bold py-3.5 hover:bg-app-brown-deep disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2 shadow-[0_12px_24px_rgba(88,50,29,0.25)]"
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
                  className="w-full rounded-2xl bg-app-brown px-4 py-3 text-sm font-semibold text-white flex items-center justify-center gap-2 hover:bg-app-brown-deep transition-colors"
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
