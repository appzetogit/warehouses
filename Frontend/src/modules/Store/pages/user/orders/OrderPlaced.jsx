import { useCallback, useEffect, useState } from "react"
import { Link, useParams } from "react-router-dom"
import { AlertCircle, CalendarDays, Check, CreditCard, Loader2, MapPin, Package, RefreshCw, Store } from "lucide-react"
import { orderAPI } from "@store/api"
import { useBusinessSettings } from "@store/components/user/desktop/useDesktopShell"
import { arrivalText, expectedDelivery, paymentMethodLabel, rupees, storeNameOf } from "@store/utils/shopOrderFlow"
import { ShopAddressBlock, ShopItemList } from "./ShopOrderDetails"

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
      <div className="flex min-h-[60vh] items-center justify-center bg-wh-page text-wh-muted">
        <Loader2 className="h-6 w-6 animate-spin" aria-label="Loading your order" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 bg-wh-page px-4 text-center">
        <AlertCircle className="h-8 w-8 text-red-500" aria-hidden="true" />
        <p className="text-[15px] font-semibold text-wh-text">{error}</p>
        <p className="max-w-sm text-[13px] text-wh-muted">If you were charged, your order is safe; you'll find it in My Orders.</p>
        <div className="flex gap-2">
          <button type="button" onClick={load} className="flex items-center gap-1.5 rounded-lg border border-wh-border px-4 py-2 text-[13px] font-semibold text-wh-text">
            <RefreshCw className="h-4 w-4" aria-hidden="true" /> Try again
          </button>
          <Link to="/orders" className="rounded-lg bg-wh-brand px-4 py-2 text-[13px] font-semibold text-wh-brand-ink">
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

  return (
    <div className="min-h-screen bg-wh-page pb-24 lg:pb-12">
      <div className="mx-auto max-w-5xl px-4 py-6 lg:py-10">
        <section className="rounded-2xl border border-wh-border bg-wh-surface p-5 text-center sm:p-8">
          <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-green-600 text-white shadow-[0_6px_20px_rgba(22,163,74,0.35)]">
            <Check className="h-9 w-9" strokeWidth={3} aria-hidden="true" />
          </span>
          <h1 className="mt-4 text-[22px] font-bold text-wh-text lg:text-[26px]">Order placed</h1>
          <p className="mt-1 text-[15px] text-wh-text">{name ? `Thank you, ${name}!` : "Thank you!"}</p>
          <p className="mx-auto mt-2 max-w-md text-[13px] text-wh-muted">
            The store will confirm your order soon — we'll notify you.
          </p>
          <p className="mt-3 text-[13px] text-wh-muted">
            {several ? "Order numbers: " : "Order number: "}
            <span className="font-semibold text-wh-text">{orders.map((o) => o.order_id || o._id).join(", ")}</span>
          </p>
          {range ? (
            <p className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-green-50 px-3 py-1.5 text-[13px] font-semibold text-green-700 dark:bg-green-950/30 dark:text-green-300">
              <CalendarDays className="h-4 w-4" aria-hidden="true" /> {arrivalText(range)}
            </p>
          ) : null}
          <div className="mx-auto mt-5 flex max-w-md flex-col gap-2 sm:flex-row">
            <Link
              to={viewTo}
              replace
              className="flex h-11 flex-1 items-center justify-center rounded-xl bg-gradient-to-r from-[#d95d08] via-[#ea580c] to-[#f97316] text-[14px] font-bold text-white"
            >
              {several ? "View my orders" : "View order"}
            </Link>
            <Link to="/" className="flex h-11 flex-1 items-center justify-center rounded-xl border border-wh-border text-[14px] font-semibold text-wh-text">
              Continue shopping
            </Link>
          </div>
        </section>

        <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-6">
          <div className="space-y-4">
            {orders.map((o) => (
              <section key={o._id} className="rounded-2xl border border-wh-border bg-wh-surface p-4 sm:p-5">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <h2 className="flex items-center gap-2 text-[15px] font-bold text-wh-text">
                    {several ? <Store className="h-4 w-4 text-wh-muted" aria-hidden="true" /> : <Package className="h-4 w-4 text-wh-muted" aria-hidden="true" />}
                    {several ? storeNameOf(o) || "Store" : `Items (${(o.items || []).length})`}
                  </h2>
                  <span className="text-[12px] text-wh-muted">
                    {several ? `${o.order_id || ""} · ${rupees(o?.pricing?.total)}` : storeNameOf(o) ? `Sold by ${storeNameOf(o)}` : ""}
                  </span>
                </div>
                <ShopItemList items={o.items || []} />
              </section>
            ))}
          </div>

          <aside className="space-y-4">
            <section className="rounded-2xl border border-wh-border bg-wh-surface p-4 sm:p-5">
              <h2 className="mb-3 flex items-center gap-2 text-[15px] font-bold text-wh-text">
                <CreditCard className="h-4 w-4 text-wh-muted" aria-hidden="true" /> Payment
              </h2>
              <div className="flex justify-between text-[14px]">
                <span className="text-wh-muted">{cash ? "To pay on delivery" : "Amount paid"}</span>
                <span className="font-bold text-wh-text">{rupees(total)}</span>
              </div>
              <p className="mt-1 text-[13px] text-wh-muted">{paymentMethodLabel(first)}</p>
            </section>
            <section className="rounded-2xl border border-wh-border bg-wh-surface p-4 sm:p-5">
              <h2 className="mb-3 flex items-center gap-2 text-[15px] font-bold text-wh-text">
                <MapPin className="h-4 w-4 text-wh-muted" aria-hidden="true" /> Delivering to
              </h2>
              <ShopAddressBlock address={address} />
            </section>
          </aside>
        </div>
      </div>
    </div>
  )
}
