import { useEffect, useState } from "react"
import { useLocation, useNavigate, useParams } from "react-router-dom"
import { Loader2 } from "lucide-react"
import { orderAPI } from "@store/api"
import OrderTracking from "./OrderTracking"
import ShopOrderDetails from "./ShopOrderDetails"
import { isShopOrder } from "@store/utils/shopOrderFlow"

/** "CHK-..." is a checkout (one payment that may hold orders from several stores), not an order. */
export const isCheckoutId = (id) => /^CHK-/i.test(String(id || ""))

/**
 * The order page, also reachable by a checkout number: a checkout that holds
 * one order opens that order, one that holds several opens My Orders. Links
 * made with the checkout number (the confirmation used to send them) keep
 * working instead of saying "Order not found". A Shop (courier) order opens
 * its own page; a Quick order, or one we couldn't look up, the live tracker.
 */
export default function OrderTrackingRoute() {
  const { orderId } = useParams()
  const location = useLocation()
  const navigate = useNavigate()
  const checkout = isCheckoutId(orderId)
  const [failed, setFailed] = useState(false)
  // Which page an order id gets: null while asking, then { id, shop, order }.
  const [kind, setKind] = useState(null)

  useEffect(() => {
    if (checkout) return undefined
    let alive = true
    orderAPI
      .getOrderDetails(orderId)
      .then((res) => {
        const order = res?.data?.data?.order || null
        if (alive) setKind({ id: orderId, shop: isShopOrder(order), order })
      })
      .catch(() => { if (alive) setKind({ id: orderId, shop: false, order: null }) })
    return () => { alive = false }
  }, [checkout, orderId])

  useEffect(() => {
    if (!checkout) return undefined
    let alive = true
    const ordersPath = location.pathname.replace(/\/[^/]+\/?$/, "")
    orderAPI
      .getCheckout(orderId)
      .then((res) => {
        if (!alive) return
        const data = res?.data?.data || {}
        const orders = (data.childOrderIds || data.childOrders || []).filter((o) => o && typeof o === "object")
        if (orders.length === 1 && orders[0]._id) {
          navigate(`${ordersPath}/${orders[0]._id}${location.search}`, { replace: true })
        } else {
          navigate(ordersPath, { replace: true })
        }
      })
      .catch(() => { if (alive) setFailed(true) })
    return () => { alive = false }
  }, [checkout, orderId, location.pathname, location.search, navigate])

  if (!checkout && kind?.id === orderId) {
    return kind.shop ? <ShopOrderDetails key={orderId} initialOrder={kind.order} /> : <OrderTracking />
  }
  if (failed) return <OrderTracking />
  return (
    <div className="flex min-h-[50vh] items-center justify-center text-gray-500">
      <Loader2 className="h-6 w-6 animate-spin" aria-label="Opening your order" />
    </div>
  )
}
