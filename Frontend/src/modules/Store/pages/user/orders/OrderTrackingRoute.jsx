import { useEffect, useState } from "react"
import { Link, useLocation, useNavigate, useParams } from "react-router-dom"
import { AlertCircle, Loader2, RefreshCw } from "lucide-react"
import { orderAPI } from "@store/api"
import OrderTracking from "./OrderTracking"
import ShopOrderDetails from "./ShopOrderDetails"
import { isShopOrder } from "@store/utils/shopOrderFlow"

/** "CHK-..." is a checkout (one payment that may hold orders from several stores), not an order. */
export const isCheckoutId = (id) => /^CHK-/i.test(String(id || ""))

const errorText = (err) => {
  const status = err?.response?.status
  if (status === 404) return "We couldn't find this order"
  return err?.response?.data?.message || "Couldn't load this order"
}

/**
 * The order page, also reachable by a checkout number: a checkout that holds
 * one order opens that order, one that holds several opens My Orders. Links
 * made with the checkout number (the confirmation used to send them) keep
 * working instead of saying "Order not found". A Shop (courier) order opens
 * its own page; only a confirmed Quick order opens the live tracker. If the
 * lookup fails we say so and offer to retry, rather than guessing.
 */
export default function OrderTrackingRoute() {
  const { orderId } = useParams()
  const location = useLocation()
  const navigate = useNavigate()
  const checkout = isCheckoutId(orderId)
  // Bumped by "Try again" to repeat the lookup.
  const [attempt, setAttempt] = useState(0)
  // What the lookup found: null while asking, then { id, attempt, shop, order } or { id, attempt, error }.
  const [kind, setKind] = useState(null)

  useEffect(() => {
    if (checkout) return undefined
    let alive = true
    orderAPI
      .getOrderDetails(orderId)
      .then((res) => {
        const order = res?.data?.data?.order || null
        if (!alive) return
        if (!order) setKind({ id: orderId, attempt, error: res?.data?.message || "We couldn't find this order" })
        else setKind({ id: orderId, attempt, shop: isShopOrder(order), order })
      })
      .catch((err) => { if (alive) setKind({ id: orderId, attempt, error: errorText(err) }) })
    return () => { alive = false }
  }, [checkout, orderId, attempt])

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
      .catch((err) => { if (alive) setKind({ id: orderId, attempt, error: errorText(err) }) })
    return () => { alive = false }
  }, [checkout, orderId, attempt, location.pathname, location.search, navigate])

  const current = kind?.id === orderId && kind?.attempt === attempt ? kind : null

  if (current?.error) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 bg-wh-page px-4 text-center">
        <AlertCircle className="h-8 w-8 text-red-500" aria-hidden="true" />
        <p className="text-[15px] font-semibold text-wh-text">{current.error}</p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setAttempt((n) => n + 1)}
            className="flex items-center gap-1.5 rounded-lg border border-wh-border px-4 py-2 text-[13px] font-semibold text-wh-text"
          >
            <RefreshCw className="h-4 w-4" aria-hidden="true" /> Try again
          </button>
          <Link to="/orders" className="rounded-lg bg-wh-brand px-4 py-2 text-[13px] font-semibold text-wh-brand-ink">
            My orders
          </Link>
        </div>
      </div>
    )
  }
  if (!checkout && current?.order) {
    return current.shop ? <ShopOrderDetails key={orderId} initialOrder={current.order} /> : <OrderTracking />
  }
  return (
    <div className="flex min-h-[50vh] items-center justify-center text-gray-500">
      <Loader2 className="h-6 w-6 animate-spin" aria-label="Opening your order" />
    </div>
  )
}
