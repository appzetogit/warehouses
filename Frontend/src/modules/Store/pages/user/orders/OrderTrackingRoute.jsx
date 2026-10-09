import { useEffect, useState } from "react"
import { useLocation, useNavigate, useParams } from "react-router-dom"
import { Loader2 } from "lucide-react"
import { orderAPI } from "@store/api"
import OrderTracking from "./OrderTracking"

/** "CHK-..." is a checkout (one payment that may hold orders from several stores), not an order. */
export const isCheckoutId = (id) => /^CHK-/i.test(String(id || ""))

/**
 * The order page, also reachable by a checkout number: a checkout that holds
 * one order opens that order, one that holds several opens My Orders. Links
 * made with the checkout number (the confirmation used to send them) keep
 * working instead of saying "Order not found".
 */
export default function OrderTrackingRoute() {
  const { orderId } = useParams()
  const location = useLocation()
  const navigate = useNavigate()
  const checkout = isCheckoutId(orderId)
  const [failed, setFailed] = useState(false)

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

  if (!checkout) return <OrderTracking />
  if (failed) return <OrderTracking />
  return (
    <div className="flex min-h-[50vh] items-center justify-center text-gray-500">
      <Loader2 className="h-6 w-6 animate-spin" aria-label="Opening your order" />
    </div>
  )
}
