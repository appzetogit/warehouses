import { useCallback, useEffect, useState } from "react"
import { Link, useParams } from "react-router-dom"
import { AlertCircle, CalendarDays, CreditCard, Loader2, MapPin, RefreshCw, Store } from "lucide-react"
import { orderAPI } from "@store/api"
import { resolveMediaUrl } from "@/shared/utils/mediaUrl"
import { useBusinessSettings } from "@store/components/user/desktop/useDesktopShell"
import {
  arrivalText,
  expectedDelivery,
  formatShopDay,
  paymentMethodLabel,
  rupees,
  shopTimeline,
  storeNameOf,
  variantText,
} from "@store/utils/shopOrderFlow"
import { AddressCard, DetailCard, ItemDetailCard, ORDER_PAGE_BG, SavedBanner } from "@store/components/user/orders/OrderDetailCards"
import { BagHero, ConfettiBurst, OrderNumberCard, PlacedTimeline } from "@store/components/user/orders/OrderPlacedHero"

const isCheckoutId = (id) => /^CHK-/i.test(String(id || ""))

/** The checkout's orders (or the one order), each with its store filled in where we can. */
async function loadPlacedOrders(id) {
  if (!isCheckoutId(id)) {
    const res = await orderAPI.getOrderDetails(id, { force: true })
    const order = res?.data?.data?.order
    return order ? [order] : []
  }
  const res = await orderAPI.getCheckout(id)
  const data = res?.data?.data || {}
  const children = (data.childOrderIds || data.childOrders || []).filter((o) => o && typeof o === "object")
  // The checkout returns bare orders; the order endpoint adds the store's name.
  return Promise.all(
    children.map((child) =>
      orderAPI
        .getOrderDetails(String(child._id), { force: true })
        .then((r) => r?.data?.data?.order || child)
        .catch(() => child),
    ),
  )
}

/**
 * "Order placed": where a Shop checkout lands once the store has the order.
 * Takes a checkout number (CHK-...) or an order id.
 */
export default function OrderPlaced() {
  const { id } = useParams()
  const { settings } = useBusinessSettings()
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

  const load = useCallback(async () => {
    setLoading(true)
    setError("")
    try {
      const list = await loadPlacedOrders(id)
      if (!list.length) throw new Error("We couldn't find this order")
      setOrders(list)
    } catch (err) {
      setError(err?.response?.data?.message || err?.message || "Couldn't load your order")
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => {
    load()
  }, [load])

  if (loading) {
    return (
      <div className={`flex min-h-[60vh] items-center justify-center ${ORDER_PAGE_BG} font-app text-app-muted`}>
        <Loader2 className="h-6 w-6 animate-spin" aria-label="Loading your order" />
      </div>
    )
  }

  if (error) {
    return (
      <div className={`flex min-h-[60vh] flex-col items-center justify-center gap-3 ${ORDER_PAGE_BG} px-4 text-center font-app`}>
        <AlertCircle className="h-8 w-8 text-red-500" aria-hidden="true" />
        <p className="text-[15px] font-semibold text-app-ink">{error}</p>
        <p className="max-w-sm text-[13px] text-app-muted">If you were charged, your order is safe; you'll find it in My Orders.</p>
        <div className="flex gap-2">
          <button type="button" onClick={load} className="flex items-center gap-1.5 rounded-xl border border-app-line bg-white px-4 py-2 text-[13px] font-semibold text-app-ink">
            <RefreshCw className="h-4 w-4" aria-hidden="true" /> Try again
          </button>
          <Link to="/orders" className="rounded-xl bg-app-brown px-4 py-2 text-[13px] font-semibold text-white">
            My orders
          </Link>
        </div>
      </div>
    )
  }


  const first = orders[0]
  const address = first.deliveryAddress || first.address || {}
  const name = String(address.fullName || address.name || first.customerName || first.userId?.name || "").trim().split(/\s+/)[0]
  const total = orders.reduce((sum, o) => sum + (Number(o?.pricing?.total) || 0), 0)
  const cash = String(first?.payment?.method || "") === "cash"
  const days = settings?.standardDeliveryDays || {}
  const range = expectedDelivery(first, { min: Number(days.min) || 2, max: Number(days.max) || 4 })
  const several = orders.length > 1
  const viewTo = several ? "/orders" : `/orders/${first._id}`

  // What the order data says was saved: coupon, coins and any struck-through prices.
  const saved = orders.reduce((sum, o) => {
    const p = o?.pricing || {}
    const coins = Number(o?.coinsDiscount ?? p.coinsDiscount) || 0
    const struck = Math.max(0, (Number(p.originalItemTotal) || 0) - (Number(p.subtotal) || 0))
    return sum + (Number(p.discount) || 0) + coins + struck
  }, 0)

  // Four stops, each done once the order's own timeline has reached it.
  const reached = new Set(shopTimeline(first).filter((s) => s.done && s.key !== "cancelled").map((s) => s.key))
  const placedAt = first.createdAt ? new Date(first.createdAt) : null
  const timeline = [
    {
      label: "Order Placed",
      sub: placedAt ? placedAt.toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }) : "",
      done: true,
    },
    { label: "Shipped", sub: reached.has("shipped") ? "Done" : "", done: reached.has("shipped") },
    { label: "Out for Delivery", sub: reached.has("out_for_delivery") ? "Done" : "", done: reached.has("out_for_delivery") },
    {
      label: "Delivered",
      sub: reached.has("delivered") ? "Delivered" : range?.to ? `Expected ${formatShopDay(range.to)}` : "",
      done: reached.has("delivered"),
    },
  ]
  const orderNumbers = orders.map((o) => o.order_id || o._id).join(", ")
  const orderDate = placedAt ? placedAt.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : ""

  return (
    <div className={`min-h-screen ${ORDER_PAGE_BG} pb-24 font-app lg:pb-12`}>
      <ConfettiBurst />
      <div className="mx-auto max-w-xl px-4 pb-6 pt-2 lg:pt-8">
        <BagHero />
        <h1 className="text-center text-[26px] font-bold leading-tight text-app-ink">Order Placed Successfully!</h1>
        <p className="mt-1.5 text-center text-[14.5px] text-[#4A423D]">
          {name ? `Thank you for shopping with us, ${name}` : "Thank you for shopping with us"}
        </p>
        <p className="mx-auto mt-1 max-w-sm text-center text-[12.5px] text-app-muted">The store will confirm your order soon — we'll notify you.</p>

        <div className="mt-5 space-y-3">
          <OrderNumberCard label={several ? "Order Numbers" : "Order Number"} orderNo={orderNumbers} date={orderDate} />
          <PlacedTimeline steps={timeline} />
          {range ? (
            <p className="flex items-center justify-center gap-1.5 text-[13px] font-semibold text-app-brown">
              <CalendarDays className="h-4 w-4" aria-hidden="true" /> {arrivalText(range)}
            </p>
          ) : null}
          {saved > 0 ? <SavedBanner amount={rupees(saved)} /> : null}

          {orders.map((o) => {
            const lines = o.items || []
            return (
              <section key={o._id} className="space-y-2.5">
                <div className="flex items-center justify-between gap-2 px-1 pt-2">
                  <h2 className="flex min-w-0 items-center gap-2 text-[15.5px] font-bold text-app-ink">
                    {several ? <Store className="h-4 w-4 shrink-0 text-app-brown" aria-hidden="true" /> : null}
                    <span className="truncate">
                      {several ? storeNameOf(o) || "Store" : `${lines.length} ${lines.length === 1 ? "Item" : "Items"} in this order`}
                    </span>
                  </h2>
                  <span className="shrink-0 text-[12px] text-app-muted">
                    {several ? `${o.order_id || ""} · ${rupees(o?.pricing?.total)}` : storeNameOf(o) ? `Sold by ${storeNameOf(o)}` : ""}
                  </span>
                </div>
                {lines.map((item, i) => {
                  const qty = Number(item.quantity) || 1
                  return (
                    <ItemDetailCard
                      key={`${item.itemId || item.name}-${i}`}
                      image={item.image ? resolveMediaUrl(item.image) : ""}
                      name={item.name}
                      variant={variantText(item)}
                      qty={qty}
                      price={rupees((Number(item.price) || 0) * qty)}
                    />
                  )
                })}
              </section>
            )
          })}

          <DetailCard className="flex items-center gap-3 p-4">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-app-tint-strong text-app-brown">
              <CreditCard className="h-5 w-5" aria-hidden="true" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[14px] font-bold text-app-ink">{cash ? "To pay on delivery" : "Amount paid"}</p>
              <p className="text-[12.5px] text-app-muted">{paymentMethodLabel(first)}</p>
            </div>
            <span className="text-[16px] font-extrabold text-app-ink">{rupees(total)}</span>
          </DetailCard>

          <AddressCard
            icon={MapPin}
            title="Delivery to"
            name={address.fullName || address.name}
            lines={[
              [address.street, address.additionalDetails].filter(Boolean).join(", "),
              `${[address.city, address.state].filter(Boolean).join(", ")}${address.zipCode ? ` ${address.zipCode}` : ""}`.trim(),
            ]}
            phone={address.phone}
          />

          <div className="flex flex-col gap-2.5 pt-2 sm:flex-row">
            <Link
              to={viewTo}
              replace
              className="flex h-12 flex-1 items-center justify-center rounded-xl bg-app-brown text-[14.5px] font-bold text-white hover:bg-app-brown-deep"
            >
              {several ? "View my orders" : "View order"}
            </Link>
            <Link
              to="/"
              className="flex h-12 flex-1 items-center justify-center rounded-xl border-[1.5px] border-app-brown bg-white text-[14.5px] font-bold text-app-brown hover:bg-app-tint"
            >
              Continue shopping
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
