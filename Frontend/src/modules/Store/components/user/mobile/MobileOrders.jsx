import { useEffect, useMemo, useState } from "react"
import { Link, useNavigate } from "react-router-dom"
import { Check, ChevronRight, Clock, Loader2, Package, Search, ShoppingCart, Truck, X, Zap } from "lucide-react"
import { toast } from "sonner"
import { orderAPI } from "@/services/api"
import { mediaUrl } from "../desktop/desktopCart"
import MobileTopBar from "./MobileTopBar"
import CancelOrderSheet, { canCancelOrder } from "../orders/CancelOrderSheet"
import { shopStatusLabel } from "@store/utils/shopOrderFlow"

/**
 * "My Orders" on phones, in the customer app's look (warehouse_user
 * orders_screen): big title, a search over the loaded orders, status pills
 * and one cream/brown card per store's order with Buy Again / View Details.
 */

// "Processing" is the old "Ordered" bucket (placed, packed, waiting on the store).
const TABS = ["All", "Processing", "Shipped", "Delivered", "Cancelled", "Returns"]
const PAGE_SIZE = 20

/** The orders and pagination out of a list response. */
function readPage(res) {
  const d = res?.data?.data
  const list = d?.orders || d?.data || (Array.isArray(d) ? d : [])
  return { list: Array.isArray(list) ? list : [], pagination: d?.pagination || null }
}

const CANCELLED = ["cancelled_by_user", "cancelled_by_seller", "cancelled_by_admin"]
const MOVING = ["picked_up", "reached_drop"]

const statusOf = (o) => String(o?.orderStatus || o?.status || "")
const isCourier = (o) => o?.fulfilmentMode === "standard"

/** Which tab an order belongs to, besides "All" and "Returns". */
function bucketOf(o) {
  const s = statusOf(o)
  if (CANCELLED.includes(s)) return "Cancelled"
  if (s === "delivered") return "Delivered"
  if (MOVING.includes(s) || (isCourier(o) && o?.shipment?.awb)) return "Shipped"
  return "Processing"
}

/** 0 placed, 1 packed, 2 on the way, 3 delivered. */
function stepOf(o) {
  const s = statusOf(o)
  if (s === "delivered") return 3
  const courier = String(o?.shipment?.status || o?.shipment?.currentStatus || "").toLowerCase()
  if (s === "reached_drop" || courier.includes("out_for_delivery") || courier.includes("out for delivery")) return 2
  if (s === "picked_up" || (isCourier(o) && o?.shipment?.awb)) return isCourier(o) ? 1.5 : 2
  if (["preparing", "ready_for_pickup", "reached_pickup"].includes(s)) return 1
  return 0
}

const RETURN_LABEL = {
  requested: "Return Requested",
  approved: "Return Approved, Pickup Soon",
  rejected: "Return Declined",
  received: "Return received, refund on its way",
  refunded: "Refunded",
  replaced: "Replacement on Its Way",
}

function headline(o) {
  const s = statusOf(o)
  if (o?.latestReturn) {
    if (o.latestReturn.resolution === "replacement" && o.latestReturn.status === "received") return "Item received, replacement being sent"
    return RETURN_LABEL[o.latestReturn.status] || "Return in Progress"
  }
  if (s === "pending_payment") return "Waiting for payment"
  // Shop orders: "Waiting for store confirmation", "Rejected by store", "Refund started"...
  if (isCourier(o) && s !== "delivered") return shopStatusLabel(o)
  if (s === "cancelled_by_user") return "You cancelled this order"
  if (CANCELLED.includes(s)) return "Cancelled"
  if (s === "delivered") {
    const at = o?.deliveryState?.deliveredAt || o?.deliveredAt || o?.updatedAt
    return at ? `Delivered on ${new Date(at).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}` : "Delivered"
  }
  const step = stepOf(o)
  return step >= 2 ? "On the Way" : step >= 1 ? "Being Packed" : "Order Placed"
}

/** Chip colours: red cancelled/declined, green delivered, orange out for delivery, amber otherwise. */
function chipTone(o) {
  const s = statusOf(o)
  const r = o?.latestReturn?.status
  if (CANCELLED.includes(s) || r === "rejected") return { bg: "bg-[#FFEAED]", fg: "text-[#E11D48]", dot: "bg-[#E11D48]", Icon: X }
  if (r === "refunded" || (s === "delivered" && !o?.latestReturn)) return { bg: "bg-[#DCFCE7]", fg: "text-[#16A34A]", dot: "bg-[#16A34A]", Icon: Check }
  if (!o?.latestReturn && s !== "delivered" && stepOf(o) >= 2) return { bg: "bg-[#FFEDD5]", fg: "text-[#EA580C]", dot: "bg-[#EA580C]", Icon: Truck }
  return { bg: "bg-[#FEF3C7]", fg: "text-[#D97706]", dot: "bg-[#D97706]", Icon: Clock }
}

/** What the search box matches: product names, order id/number and the store. */
function matchesQuery(o, q) {
  if (!q) return true
  const hay = [o?._id, o?.id, o?.order_id, o?.orderId, o?.orderNumber, o?.sellerId?.sellerName, ...(o?.items || []).map((i) => i?.name)]
    .filter(Boolean)
    .join(" ")
    .toLowerCase()
  return hay.includes(q)
}

const BROWN_BTN = "flex h-[34px] shrink-0 items-center justify-center gap-1 rounded-[20px] px-3 text-[12px] font-bold active:scale-[0.98]"
const BROWN_OUTLINE = `${BROWN_BTN} border-[1.2px] border-[#4A2C19] text-[#4A2C19] active:bg-[#F5EFE8]`

function OrderCard({ order, onChanged }) {
  const navigate = useNavigate()
  const [cancelling, setCancelling] = useState(false)
  const seller = order?.sellerId && typeof order.sellerId === "object" ? order.sellerId : {}
  const items = order?.items || []
  const first = items[0] || {}
  const s = statusOf(order)
  const cancelled = CANCELLED.includes(s)
  const courier = isCourier(order)
  const id = String(order._id || order.id)
  const shortId = String(order.order_id || order.orderId || id).slice(-8).toUpperCase()
  const total = Number(order?.pricing?.total ?? order?.total ?? 0)
  const modePath = (path) => (courier ? path : `/quick${path}`)
  const qty = items.reduce((n, i) => n + (Number(i.quantity) || 1), 0)
  const tone = chipTone(order)
  const ToneIcon = tone.Icon
  const canReturn = s === "delivered" && courier && (!order.latestReturn || order.latestReturn.status === "rejected")
  const canCancel = canCancelOrder(order)
  const date = order.createdAt
    ? new Date(order.createdAt).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", year: "numeric" })
    : ""

  return (
    <article className="rounded-[18px] border border-[#EFE8E2] bg-white p-[14px] shadow-[0_2px_8px_rgba(0,0,0,0.04)]">
      <Link to={`/orders/${id}/details`} className="flex gap-[14px] rounded-[14px]">
        <span className="relative h-[96px] w-[86px] shrink-0 overflow-hidden rounded-[14px] bg-app-alt">
          {first.image ? (
            <img src={mediaUrl(first.image)} alt="" className="h-full w-full object-cover" />
          ) : (
            <Package className="absolute inset-0 m-auto h-7 w-7 text-[#B9AEA6]" aria-hidden="true" />
          )}
        </span>
        <span className="min-w-0 flex-1">
          <span className={`inline-flex max-w-full items-center gap-[5px] rounded-xl px-2 py-[3.5px] ${tone.bg}`}>
            <span className={`flex h-[14px] w-[14px] shrink-0 items-center justify-center rounded-full ${tone.dot}`}>
              <ToneIcon className="h-2.5 w-2.5 text-white" strokeWidth={3} aria-hidden="true" />
            </span>
            <span className={`truncate text-[11.5px] font-bold ${tone.fg}`}>{headline(order)}</span>
          </span>
          <span className="mt-[5px] block truncate text-[11.5px] font-medium text-app-muted">
            {date ? `${date}  •  ` : ""}Order #{shortId}
          </span>
          <span className="mt-1 flex items-center gap-1">
            <span className="min-w-0 flex-1 truncate text-[14.5px] font-extrabold text-app-ink">
              {first.name}
              {items.length > 1 ? ` +${items.length - 1} more` : ""}
            </span>
            <ChevronRight className="h-5 w-5 shrink-0 text-[#9E958E]" aria-hidden="true" />
          </span>
          <span className="mt-[3px] block truncate text-[12px] font-medium text-app-muted">
            {`Qty: ${qty}  |  Size: ${first.variantName || "Free Size"}`}
          </span>
          <span className="mt-[3px] flex items-center gap-1 text-[11px] text-app-muted">
            {courier ? <Truck className="h-3 w-3 shrink-0" aria-hidden="true" /> : <Zap className="h-3 w-3 shrink-0" aria-hidden="true" />}
            <span className="truncate">
              {courier ? "Shop" : "Quick"} · {seller.sellerName || "Store"}
            </span>
          </span>
          {cancelled && order.cancellationReason ? (
            <span className="mt-0.5 block truncate text-[11px] text-app-muted">Reason: {order.cancellationReason}</span>
          ) : null}
        </span>
      </Link>

      <div className="mt-[14px] flex items-center gap-1.5">
        <span className="min-w-0 flex-1 truncate text-[15px] font-black text-app-ink">
          {order?.replacementOf?.orderId ? "Free Replacement" : `Total ₹${total.toLocaleString("en-IN")}`}
        </span>
        {!cancelled && s !== "delivered" ? (
          <Link to={`/orders/${id}`} className={BROWN_OUTLINE}>
            <Truck className="h-3.5 w-3.5" aria-hidden="true" /> Track
          </Link>
        ) : (
          <button type="button" onClick={() => navigate(`${modePath("/cart")}?reorder=${encodeURIComponent(id)}`)} className={BROWN_OUTLINE}>
            <ShoppingCart className="h-3.5 w-3.5" aria-hidden="true" /> Buy Again
          </button>
        )}
        <Link to={`/orders/${id}/details`} className={`${BROWN_BTN} bg-[#4A2C19] text-white`}>
          View Details
        </Link>
      </div>

      {canCancel || canReturn ? (
        <div className="mt-2.5 flex flex-wrap justify-end gap-x-4 gap-y-1 border-t border-[#F3EDE8] pt-2.5 text-[12px] font-semibold">
          {canReturn ? (
            <Link to={`/orders/${id}/details#returns`} className="text-[#4A2C19] underline underline-offset-2">
              Return / Replace
            </Link>
          ) : null}
          {canCancel ? (
            <button type="button" onClick={() => setCancelling(true)} className="text-[#E11D48] underline underline-offset-2">
              Cancel order
            </button>
          ) : null}
        </div>
      ) : null}

      {cancelling ? (
        <CancelOrderSheet
          order={order}
          onClose={() => setCancelling(false)}
          onCancelled={(updated) => {
            setCancelling(false)
            // Take the whole cancelled order (refund, history) but keep the populated store.
            const next = updated && typeof updated === "object" ? { ...updated } : {}
            if (next.sellerId && typeof next.sellerId !== "object") delete next.sellerId
            onChanged?.(id, { orderStatus: "cancelled_by_user", payment: order.payment, ...next })
          }}
        />
      ) : null}
    </article>
  )
}

export default function MobileOrders() {
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)
  const [tab, setTab] = useState("All")
  const [query, setQuery] = useState("")
  // Pages loaded so far and what the server says is there in all.
  const [page, setPage] = useState(1)
  const [pages, setPages] = useState(1)
  const [total, setTotal] = useState(null)
  const [loadingMore, setLoadingMore] = useState(false)

  useEffect(() => {
    let cancelled = false
    orderAPI
      .getOrders({ page: 1, limit: PAGE_SIZE })
      .then((res) => {
        if (cancelled) return
        const { list, pagination } = readPage(res)
        setOrders(list)
        setPage(1)
        setPages(Number(pagination?.pages) || 1)
        setTotal(Number.isFinite(Number(pagination?.total)) ? Number(pagination.total) : null)
      })
      .catch(() => !cancelled && setFailed(true))
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [])

  const loadMore = async () => {
    if (loadingMore || page >= pages) return
    setLoadingMore(true)
    try {
      const next = page + 1
      const { list, pagination } = readPage(await orderAPI.getOrders({ page: next, limit: PAGE_SIZE }))
      setOrders((prev) => {
        const seen = new Set(prev.map((o) => String(o._id || o.id)))
        return [...prev, ...list.filter((o) => !seen.has(String(o._id || o.id)))]
      })
      setPage(next)
      if (pagination?.pages) setPages(Number(pagination.pages) || next)
      if (Number.isFinite(Number(pagination?.total))) setTotal(Number(pagination.total))
    } catch {
      toast.error("Couldn't load more orders. Try again.")
    } finally {
      setLoadingMore(false)
    }
  }

  const totalCount = total ?? orders.length
  const hasMore = page < pages

  const counts = useMemo(() => {
    const c = { All: orders.length, Returns: 0 }
    for (const o of orders) {
      c[bucketOf(o)] = (c[bucketOf(o)] || 0) + 1
      if (o.latestReturn) c.Returns += 1
    }
    return c
  }, [orders])

  const q = query.trim().toLowerCase()
  const shown = orders.filter(
    (o) => (tab === "All" ? true : tab === "Returns" ? !!o.latestReturn : bucketOf(o) === tab) && matchesQuery(o, q),
  )

  return (
    <div className="min-h-screen bg-[#FBF8F5] pb-8 font-app lg:hidden">
      <MobileTopBar title="" subtitle={loading || failed ? "" : `${totalCount} order${totalCount === 1 ? "" : "s"}`} actions={["search", "cart"]} />

      <div className="px-4 pb-3 pt-3">
        <h2 className="text-[28px] font-extrabold leading-tight text-[#3E271D]">My Orders</h2>
        <p className="mt-[3px] text-[14px] font-medium text-[#8C7F77]">Track, manage and buy again</p>
      </div>

      <div className="px-4">
        <label className="flex h-[46px] items-center gap-2 rounded-[14px] border border-[#EDE7E1] bg-white px-[14px] shadow-[0_1px_6px_rgba(0,0,0,0.024)]">
          <Search className="h-5 w-5 shrink-0 text-[#9E958E]" aria-hidden="true" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search orders by product, order ID..."
            aria-label="Search orders"
            className="min-w-0 flex-1 bg-transparent text-[13.5px] text-app-ink outline-none placeholder:text-[#A79C94]"
          />
          {query ? (
            <button type="button" onClick={() => setQuery("")} aria-label="Clear search" className="flex h-6 w-6 items-center justify-center rounded-full text-[#9E958E] active:bg-[#F5EFE8]">
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          ) : null}
        </label>
      </div>

      <div className="sticky top-14 z-30 flex gap-2 overflow-x-auto bg-[#FBF8F5] px-4 py-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" role="tablist">
        {TABS.map((t) => (
          <button
            key={t}
            type="button"
            role="tab"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            className={`shrink-0 rounded-full px-4 py-2 text-[13px] font-semibold ${tab === t ? "bg-[#4A2C19] text-white" : "bg-[#F5EFE8] text-[#3E271D]"}`}
          >
            {t}
            {!loading && counts[t] ? <span className={`ml-1 text-[11px] ${tab === t ? "text-white/75" : "text-[#8C7F77]"}`}>{counts[t]}</span> : null}
          </button>
        ))}
      </div>

      <div className="space-y-[14px] px-4 pt-1">
        {loading ? (
          Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="rounded-[18px] border border-[#EFE8E2] bg-white p-[14px]" role="status" aria-label="Loading orders">
              <div className="flex gap-[14px]">
                <div className="h-[96px] w-[86px] animate-pulse rounded-[14px] bg-app-alt" />
                <div className="flex-1 space-y-2 pt-1">
                  <div className="h-4 w-24 animate-pulse rounded-xl bg-app-alt" />
                  <div className="h-3 w-2/3 animate-pulse rounded bg-app-alt" />
                  <div className="h-3.5 w-3/4 animate-pulse rounded bg-app-alt" />
                  <div className="h-3 w-1/2 animate-pulse rounded bg-app-alt" />
                </div>
              </div>
              <div className="mt-[14px] flex items-center gap-1.5">
                <div className="h-4 flex-1 animate-pulse rounded bg-app-alt" />
                <div className="h-[34px] w-24 animate-pulse rounded-[20px] bg-app-alt" />
                <div className="h-[34px] w-24 animate-pulse rounded-[20px] bg-app-alt" />
              </div>
            </div>
          ))
        ) : failed ? (
          <p className="rounded-[18px] border border-[#EFE8E2] bg-white p-8 text-center text-[14px] text-app-muted">
            Couldn&apos;t load your orders. Pull down or try again in a moment.
          </p>
        ) : shown.length ? (
          shown.map((o) => (
            <OrderCard
              key={o._id || o.id}
              order={o}
              onChanged={(id, patch) => setOrders((list) => list.map((x) => (String(x._id || x.id) === id ? { ...x, ...patch } : x)))}
            />
          ))
        ) : (
          <div className="flex flex-col items-center rounded-[18px] border border-[#EFE8E2] bg-white px-6 py-10 text-center">
            <span className="flex h-14 w-14 items-center justify-center rounded-full bg-[#F5EFE8]">
              <Package className="h-7 w-7 text-[#4A2C19]" aria-hidden="true" />
            </span>
            <p className="mt-3 text-[16px] font-bold text-[#3E271D]">
              {q
                ? "No orders match your search"
                : tab === "All"
                  ? "No orders yet"
                  : tab === "Returns"
                    ? "No returns"
                    : `Nothing ${tab.toLowerCase()} right now`}
            </p>
            {q ? (
              <button type="button" onClick={() => setQuery("")} className="mt-4 h-[38px] rounded-[20px] border-[1.2px] border-[#4A2C19] px-5 text-[13px] font-bold text-[#4A2C19]">
                Clear search
              </button>
            ) : tab === "All" ? (
              <Link to="/" className="mt-4 flex h-[40px] items-center rounded-[20px] bg-[#4A2C19] px-6 text-[14px] font-bold text-white">
                Start Shopping
              </Link>
            ) : null}
          </div>
        )}
        {!loading && !failed && hasMore ? (
          <button
            type="button"
            onClick={loadMore}
            disabled={loadingMore}
            className="flex h-11 w-full items-center justify-center gap-2 rounded-[20px] border-[1.2px] border-[#4A2C19] bg-white text-[14px] font-bold text-[#4A2C19] active:bg-[#F5EFE8] disabled:opacity-60"
          >
            {loadingMore ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
            {loadingMore ? "Loading…" : `Load more orders (${Math.max(0, totalCount - orders.length)} more)`}
          </button>
        ) : null}
      </div>
    </div>
  )
}
