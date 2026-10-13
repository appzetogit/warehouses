import { useCallback, useEffect, useState } from "react"
import { Link, useNavigate, useParams } from "react-router-dom"
import { toast } from "sonner"
import {
  AlertCircle,
  ArrowLeft,
  Banknote,
  CalendarDays,
  Check,
  Copy,
  CreditCard,
  ExternalLink,
  FileText,
  Headphones,
  HelpCircle,
  Loader2,
  MapPin,
  Package,
  RefreshCw,
  RotateCcw,
  Store,
  Truck,
  Wallet,
  XCircle,
} from "lucide-react"
import { orderAPI } from "@store/api"
import { resolveMediaUrl } from "@/shared/utils/mediaUrl"
import { useBusinessSettings } from "@store/components/user/desktop/useDesktopShell"
import useIsDesktop from "@store/components/user/desktop/useIsDesktop"
import CancelOrderSheet, { canCancelOrder } from "@store/components/user/orders/CancelOrderSheet"
import {
  AddressCard,
  BillSummaryCard,
  BOTTOM_BAR_PAD,
  CancelLink,
  CardLinkRow,
  DetailCard,
  ItemDetailCard,
  ORDER_PAGE_BG,
  OrderBottomBar,
  OrderIdCard,
  OrderTopBar,
  SectionHeading,
  StatusTimelineCard,
} from "@store/components/user/orders/OrderDetailCards"
import CompletePaymentCard from "@store/components/user/CompletePaymentCard"
import OrderItemsReviewPanel from "@store/components/user/reviews/OrderItemsReviewPanel"
import OrderReturnsSection from "./OrderReturnsSection"
import {
  arrivalText,
  expectedDelivery,
  isCancelledStatus,
  isOrderPaid,
  isShopOrderFinished,
  paymentMethodLabel,
  priceRows,
  refundWhereText,
  reorderPath,
  rupees,
  shopRefund,
  shopStatusLabel,
  shopTimeline,
  storeNameOf,
  totalLabel,
  variantText,
} from "@store/utils/shopOrderFlow"

const POLL_MS = 30 * 1000

const dateTime = (d) =>
  d ? new Date(d).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }) : ""
const dateOnly = (d) => (d ? new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "")

/** Photo, name, size/colour, quantity and price of each line. */
export function ShopItemList({ items = [] }) {
  return (
    <ul className="divide-y divide-wh-border">
      {items.map((item, i) => {
        const variant = variantText(item)
        const qty = Number(item.quantity) || 1
        const src = item.image ? resolveMediaUrl(item.image) : ""
        return (
          <li key={`${item.itemId || item.name}-${i}`} className="flex gap-3 py-3 first:pt-0 last:pb-0">
            <span className="relative h-20 w-16 shrink-0 overflow-hidden rounded-lg border border-wh-border bg-wh-page">
              {src ? (
                <img src={src} alt="" loading="lazy" className="h-full w-full object-cover" />
              ) : (
                <Package className="absolute inset-0 m-auto h-6 w-6 text-wh-muted" aria-hidden="true" />
              )}
            </span>
            <span className="min-w-0 flex-1">
              <span className="line-clamp-2 text-[14px] font-medium text-wh-text">{item.name}</span>
              {variant ? <span className="mt-0.5 block text-[12px] text-wh-muted">{variant}</span> : null}
              <span className="mt-1 block text-[12px] text-wh-muted">Qty {qty}</span>
            </span>
            <span className="shrink-0 text-[14px] font-semibold text-wh-text">{rupees((Number(item.price) || 0) * qty)}</span>
          </li>
        )
      })}
    </ul>
  )
}

/** Who it goes to and where. */
export function ShopAddressBlock({ address = {} }) {
  const name = address.fullName || address.name
  const line2 = [address.city, address.state].filter(Boolean).join(", ")
  return (
    <div className="text-[13px] leading-relaxed text-wh-text">
      {name ? <p className="font-semibold">{name}</p> : null}
      <p>{[address.street, address.additionalDetails].filter(Boolean).join(", ")}</p>
      <p>
        {line2}
        {address.zipCode ? ` ${address.zipCode}` : ""}
      </p>
      {address.phone ? <p className="mt-1 text-wh-muted">Phone: {address.phone}</p> : null}
    </div>
  )
}

const Card = ({ title, icon: Icon, children, className = "" }) => (
  <section className={`rounded-2xl border border-wh-border bg-wh-surface p-4 sm:p-5 ${className}`}>
    {title ? (
      <h2 className="mb-3 flex items-center gap-2 text-[15px] font-bold text-wh-text">
        {Icon ? <Icon className="h-4 w-4 text-wh-muted" aria-hidden="true" /> : null}
        {title}
      </h2>
    ) : null}
    {children}
  </section>
)

function Timeline({ steps }) {
  return (
    <ol className="relative" aria-label="Order progress">
      {steps.map((step, i) => {
        const last = i === steps.length - 1
        const bad = step.key === "cancelled"
        const nextDone = !last && steps[i + 1].done
        return (
          <li key={step.key} className="relative flex gap-3 pb-5 last:pb-0">
            {!last ? (
              <span
                aria-hidden="true"
                className={`absolute left-[11px] top-6 h-[calc(100%-24px)] w-[2px] ${nextDone ? (steps[i + 1].key === "cancelled" ? "bg-red-300" : "bg-green-600") : "bg-wh-border"}`}
              />
            ) : null}
            <span
              className={`relative z-[1] flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${
                bad ? "bg-red-600 text-white" : step.done ? "bg-green-600 text-white" : "border-2 border-wh-border bg-wh-surface"
              }`}
            >
              {bad ? <XCircle className="h-4 w-4" aria-hidden="true" /> : step.done ? <Check className="h-3.5 w-3.5" strokeWidth={3} aria-hidden="true" /> : null}
            </span>
            <span className="min-w-0 pt-0.5">
              <span
                className={`block text-[14px] ${
                  step.current ? (bad ? "font-bold text-red-700" : "font-bold text-wh-text") : step.done ? "font-medium text-wh-text" : "text-wh-muted"
                }`}
              >
                {step.label}
              </span>
              {step.at ? <span className="block text-[12px] text-wh-muted">{dateTime(step.at)}</span> : null}
            </span>
          </li>
        )
      })}
    </ol>
  )
}

/** Price breakdown whose rows add up to the order total. */
export function PriceRows({ order, totalText = "Order total" }) {
  const p = order?.pricing || {}
  const rows = priceRows(order)
  return (
    <div className="space-y-1.5 text-[13px]">
      {rows.map(([label, value, zero]) => (
        <div key={label} className="flex justify-between gap-3">
          <span className="text-wh-muted">{label}</span>
          <span className={value < 0 ? "text-green-700" : "text-wh-text"}>
            {value === 0 && zero ? zero : value < 0 ? `− ${rupees(-value)}` : rupees(value)}
          </span>
        </div>
      ))}
      <div className="mt-2 flex justify-between border-t border-wh-border pt-2 text-[15px] font-bold text-wh-text">
        <span>{totalText}</span>
        <span>{rupees(p.total)}</span>
      </div>
    </div>
  )
}

/** What the status banner says: its tone, headline and one line of detail. */
function statusSummary(order) {
  const status = String(order?.orderStatus || "")
  const label = shopStatusLabel(order)
  const store = storeNameOf(order) || "the store"
  const delivered = status === "delivered"

  if (isCancelledStatus(status)) {
    const refund = shopRefund(order)
    const cash = String(order?.payment?.method || "") === "cash"
    const charged = !cash && status !== "pending_payment" && isOrderPaid(order)
    return {
      tone: "cancelled",
      label,
      reason: order?.cancellationReason || "",
      text:
        refund.state === "processed"
          ? `Refund of ${rupees(refund.amount)} completed${refund.at ? ` on ${dateOnly(refund.at)}` : ""}. ${refundWhereText(order, { done: true })}`
          : refund.state === "pending"
            ? `Refund of ${rupees(refund.amount)} started${refund.at ? ` on ${dateOnly(refund.at)}` : ""}. ${refundWhereText(order)}`
            : refund.state === "failed"
              ? `Your refund of ${rupees(refund.amount)} is delayed. Our team will process it, and we'll let you know once it's done.`
              : !charged
                ? "Nothing was charged, so there's nothing to refund."
                : `The amount you paid will be refunded. ${refundWhereText(order)}`,
    }
  }

  return {
    tone: delivered ? "delivered" : "progress",
    label,
    reason: "",
    text:
      status === "created"
        ? `Waiting for ${store} to confirm your order. We'll notify you as soon as they do.`
        : status === "pending_payment"
          ? "Complete the payment to send this order to the store."
          : delivered
            ? `Delivered${order?.deliveredAt ? ` on ${dateOnly(order.deliveredAt)}` : ""}. Enjoy your purchase!`
            : `${store} is getting your order to you.`,
  }
}

function StatusBanner({ order }) {
  const { tone, label, reason, text } = statusSummary(order)

  if (tone === "cancelled") {
    return (
      <section className="rounded-2xl border border-red-200 bg-red-50 p-4 sm:p-5 dark:border-red-900/50 dark:bg-red-950/30">
        <p className="flex items-center gap-2 text-[17px] font-bold text-red-700 dark:text-red-300">
          <AlertCircle className="h-5 w-5" aria-hidden="true" /> {label}
        </p>
        {reason ? <p className="mt-1 text-[13px] text-red-800 dark:text-red-200">Reason: {reason}</p> : null}
        <p className="mt-2 text-[13px] text-wh-text">{text}</p>
      </section>
    )
  }

  const delivered = tone === "delivered"
  return (
    <section
      className={`rounded-2xl p-4 text-white sm:p-5 ${delivered ? "bg-green-600" : "bg-gradient-to-r from-[#d95d08] via-[#ea580c] to-[#f97316]"}`}
    >
      <p className="text-[18px] font-bold">{label}</p>
      <p className="mt-1 text-[13px] text-white/90">{text}</p>
    </section>
  )
}

/**
 * Phone layout (below lg), after the customer app's order details screen.
 * Same data and actions as the desktop layout; only the look differs.
 */
function ShopOrderPhone({ order, id, range, shipment, store, canCancel, delivered, onBack, onCancel, onCopyAwb, onPaid }) {
  const items = order.items || []
  const first = items[0]
  const more = items.length - 1
  const qty = items.reduce((sum, item) => sum + (Number(item.quantity) || 1), 0)
  const summary = statusSummary(order)
  const address = order.deliveryAddress || order.address || {}
  const cash = String(order?.payment?.method || "").toLowerCase() === "cash"
  const rows = priceRows(order).map(([label, value, zero]) => ({
    label,
    value: value === 0 && zero ? zero : value < 0 ? `− ${rupees(-value)}` : rupees(value),
    tone: value < 0 || (value === 0 && zero) ? "save" : undefined,
  }))
  const steps = shopTimeline(order).map((step) => ({ ...step, bad: step.key === "cancelled" }))

  return (
    <div className={`min-h-screen ${ORDER_PAGE_BG} font-app ${BOTTOM_BAR_PAD}`}>
      <OrderTopBar title="Order Details" onBack={onBack} />

      <div className="mx-auto max-w-2xl space-y-3 px-4 pt-3">
        <CompletePaymentCard order={order} onPaid={onPaid} />

        <OrderIdCard
          orderNo={order.order_id || id}
          image={first?.image ? resolveMediaUrl(first.image) : ""}
          title={first ? (more > 0 ? `${first.name} + ${more} more` : first.name) : ""}
          meta={[`Qty: ${qty}`, first ? variantText(first) : ""].filter(Boolean).join("  |  ")}
          chip={paymentMethodLabel(order)}
          chipIcon={cash ? Banknote : Wallet}
          footer={
            <span className="flex items-center gap-2">
              <CalendarDays className="h-4 w-4 shrink-0 text-app-brown" aria-hidden="true" />
              <span className="min-w-0">
                Placed on {dateOnly(order.createdAt)}
                {store ? ` · Sold by ${store}` : ""}
              </span>
            </span>
          }
        />

        <StatusTimelineCard tone={summary.tone} title={summary.label} subtitle={summary.text} steps={steps}>
          {summary.reason ? (
            <p className="rounded-xl bg-[#FFF0F2] px-3.5 py-2.5 text-[12.5px] text-[#9F1239]">Reason: {summary.reason}</p>
          ) : null}
          {range ? (
            <div className="rounded-xl bg-[#F7F2EC] px-3.5 py-2.5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.05em] text-app-muted">Expected delivery</p>
              <p className="mt-0.5 text-[14px] font-bold text-app-brown">{arrivalText(range)}</p>
              {!shipment?.etd ? <p className="mt-0.5 text-[11.5px] text-app-muted">We'll update this once the courier picks it up.</p> : null}
            </div>
          ) : null}
        </StatusTimelineCard>

        {shipment?.awb ? (
          <DetailCard className="space-y-3 p-4">
            <div className="flex items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-app-tint-strong text-app-brown">
                <Truck className="h-5 w-5" aria-hidden="true" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[14px] font-bold text-app-ink">{shipment.courierName || "Courier partner"}</p>
                <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[12.5px] text-app-muted">
                  Tracking no. <span className="font-mono text-app-ink">{shipment.awb}</span>
                  <button type="button" onClick={onCopyAwb} aria-label="Copy tracking number" className="rounded p-1 text-app-ink hover:bg-app-tint-strong">
                    <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                </p>
              </div>
            </div>
            {shipment.trackingUrl ? (
              <CardLinkRow href={shipment.trackingUrl} icon={ExternalLink}>
                Track on the courier's site
              </CardLinkRow>
            ) : null}
          </DetailCard>
        ) : null}

        <SectionHeading title="Item Details" aside={store ? `Sold by ${store}` : `${items.length} ${items.length === 1 ? "item" : "items"}`} />
        {items.map((item, i) => {
          const n = Number(item.quantity) || 1
          return (
            <ItemDetailCard
              key={`${item.itemId || item.name}-${i}`}
              image={item.image ? resolveMediaUrl(item.image) : ""}
              name={item.name}
              variant={variantText(item)}
              qty={n}
              price={rupees((Number(item.price) || 0) * n)}
            />
          )
        })}

        {delivered ? (
          <>
            {/* Return or replace (the orders list links here with #returns) */}
            <div id="returns" className="-mx-4 scroll-mt-20">
              <OrderReturnsSection order={order} />
            </div>
            <OrderItemsReviewPanel order={order} />
          </>
        ) : null}

        <SectionHeading title="Bill Summary" />
        <BillSummaryCard
          rows={rows}
          totalLabel={totalLabel(order)}
          total={rupees(order?.pricing?.total)}
          footer={
            <p className="flex items-center gap-2 border-t border-app-line px-4 py-3 text-[12.5px] text-app-muted">
              <CreditCard className="h-4 w-4 text-app-brown" aria-hidden="true" />
              {paymentMethodLabel(order)}
            </p>
          }
        />

        <SectionHeading title="Delivery Address" />
        <AddressCard
          icon={MapPin}
          name={address.fullName || address.name}
          lines={[
            [address.street, address.additionalDetails].filter(Boolean).join(", "),
            `${[address.city, address.state].filter(Boolean).join(", ")}${address.zipCode ? ` ${address.zipCode}` : ""}`.trim(),
          ]}
          phone={address.phone}
        />

        {canCancel ? <CancelLink onClick={onCancel} note="You can cancel until your order leaves the store." /> : null}
      </div>

      <OrderBottomBar
        className="lg:hidden"
        actions={[
          delivered ? { key: "reorder", label: "Reorder", icon: RotateCcw, to: reorderPath(order) } : null,
          { key: "invoice", label: "View Invoice", icon: FileText, to: `/orders/${id}/invoice` },
          { key: "help", label: "Get Help", icon: Headphones, to: `/help/orders/${id}`, tone: "help" },
        ]}
      />
    </div>
  )
}

/**
 * A Shop (courier) order: where it is, what's in it, what was paid and
 * where it's going. Refreshes every 30 seconds until it's delivered or
 * cancelled.
 */
export default function ShopOrderDetails({ initialOrder = null }) {
  const { orderId } = useParams()
  const navigate = useNavigate()
  const { settings } = useBusinessSettings()
  const [order, setOrder] = useState(initialOrder)
  const [loading, setLoading] = useState(!initialOrder)
  const [error, setError] = useState("")
  const [cancelling, setCancelling] = useState(false)
  // Phones get the app-style layout; lg and up keep the two-column page.
  const isDesktop = useIsDesktop()

  const load = useCallback(
    async (quiet = false) => {
      if (!quiet) setLoading(true)
      try {
        const res = await orderAPI.getOrderDetails(orderId, { force: true })
        const next = res?.data?.data?.order
        if (!next) throw new Error(res?.data?.message || "Order not found")
        setOrder(next)
        setError("")
      } catch (err) {
        if (!quiet) setError(err?.response?.data?.message || err?.message || "Couldn't load this order")
      } finally {
        if (!quiet) setLoading(false)
      }
    },
    [orderId],
  )

  useEffect(() => {
    if (!initialOrder) load()
  }, [initialOrder, load])

  const finished = order ? isShopOrderFinished(order) : false
  useEffect(() => {
    if (!order || finished) return undefined
    const t = setInterval(() => {
      if (document.visibilityState === "visible") load(true)
    }, POLL_MS)
    return () => clearInterval(t)
  }, [order, finished, load])

  // A link with #returns lands on the returns section once it has rendered.
  const hasOrder = Boolean(order)
  useEffect(() => {
    if (!hasOrder || window.location.hash !== "#returns") return undefined
    const t = setTimeout(() => document.getElementById("returns")?.scrollIntoView({ behavior: "smooth", block: "start" }), 400)
    return () => clearTimeout(t)
  }, [hasOrder])

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center bg-wh-page text-wh-muted">
        <Loader2 className="h-6 w-6 animate-spin" aria-label="Loading your order" />
      </div>
    )
  }

  if (error || !order) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 bg-wh-page px-4 text-center">
        <AlertCircle className="h-8 w-8 text-red-500" aria-hidden="true" />
        <p className="text-[15px] font-semibold text-wh-text">{error || "Order not found"}</p>
        <div className="flex gap-2">
          <button type="button" onClick={() => load()} className="flex items-center gap-1.5 rounded-lg border border-wh-border px-4 py-2 text-[13px] font-semibold text-wh-text">
            <RefreshCw className="h-4 w-4" aria-hidden="true" /> Try again
          </button>
          <Link to="/orders" className="rounded-lg bg-wh-brand px-4 py-2 text-[13px] font-semibold text-wh-brand-ink">
            My orders
          </Link>
        </div>
      </div>
    )
  }

  const id = String(order._id || orderId)
  const status = String(order.orderStatus || "")
  const shipment = order.shipment && typeof order.shipment === "object" ? order.shipment : null
  const store = storeNameOf(order)
  const days = settings?.standardDeliveryDays || {}
  const range = !isCancelledStatus(status) && status !== "delivered" ? expectedDelivery(order, { min: Number(days.min) || 2, max: Number(days.max) || 4 }) : null
  const canCancel = canCancelOrder(order)
  const delivered = status === "delivered"

  const copyAwb = async () => {
    try {
      await navigator.clipboard.writeText(String(shipment.awb))
      toast.success("Tracking number copied")
    } catch {
      toast.error("Couldn't copy")
    }
  }

  const goBack = () => (window.history.length > 1 ? navigate(-1) : navigate("/orders"))

  const cancelSheet = cancelling ? (
    <CancelOrderSheet
      order={order}
      onClose={() => setCancelling(false)}
      onCancelled={(updated) => {
        setCancelling(false)
        setOrder((prev) => ({ ...prev, ...(updated && typeof updated === "object" ? updated : {}) }))
        load(true)
      }}
    />
  ) : null

  if (!isDesktop) {
    return (
      <>
        <ShopOrderPhone
          order={order}
          id={id}
          range={range}
          shipment={shipment}
          store={store}
          canCancel={canCancel}
          delivered={delivered}
          onBack={goBack}
          onCancel={() => setCancelling(true)}
          onCopyAwb={copyAwb}
          onPaid={() => load()}
        />
        {cancelSheet}
      </>
    )
  }

  return (
    <div className="min-h-screen bg-wh-page pb-24 lg:pb-12">
      <div className="mx-auto max-w-6xl px-4 py-4 lg:py-8">
        <header className="mb-4 flex items-start gap-3">
          <button
            type="button"
            onClick={goBack}
            aria-label="Back"
            className="mt-0.5 rounded-full p-1.5 text-wh-text hover:bg-wh-surface"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div className="min-w-0 flex-1">
            <h1 className="text-[18px] font-bold text-wh-text lg:text-[22px]">Order {order.order_id || ""}</h1>
            <p className="text-[12px] text-wh-muted">
              Placed on {dateOnly(order.createdAt)}
              {store ? ` · Sold by ${store}` : ""}
            </p>
          </div>
        </header>

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px] lg:gap-6">
          <div className="space-y-4">
            <CompletePaymentCard order={order} onPaid={() => load()} />
            <StatusBanner order={order} />

            <Card title="Order status" icon={Truck}>
              <Timeline steps={shopTimeline(order)} />
            </Card>

            {shipment?.awb ? (
              <Card title="Courier" icon={Truck}>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[14px] font-semibold text-wh-text">{shipment.courierName || "Courier partner"}</p>
                    <p className="mt-0.5 flex items-center gap-1.5 text-[13px] text-wh-muted">
                      Tracking no. <span className="font-mono text-wh-text">{shipment.awb}</span>
                      <button type="button" onClick={copyAwb} aria-label="Copy tracking number" className="rounded p-1 hover:bg-wh-page">
                        <Copy className="h-3.5 w-3.5" />
                      </button>
                    </p>
                  </div>
                  {shipment.trackingUrl ? (
                    <a
                      href={shipment.trackingUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1.5 rounded-lg bg-wh-brand px-4 py-2 text-[13px] font-bold text-wh-brand-ink"
                    >
                      Track <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                    </a>
                  ) : null}
                </div>
              </Card>
            ) : null}

            <Card title={`Items (${(order.items || []).length})`} icon={Package}>
              {store ? (
                <p className="mb-3 flex items-center gap-1.5 text-[12px] text-wh-muted">
                  <Store className="h-3.5 w-3.5" aria-hidden="true" /> {store}
                </p>
              ) : null}
              <ShopItemList items={order.items || []} />
            </Card>

            {delivered ? (
              <>
                {/* Return or replace (the orders list links here with #returns) */}
                <div id="returns" className="-mx-4 scroll-mt-20">
                  <OrderReturnsSection order={order} />
                </div>
                <OrderItemsReviewPanel order={order} />
              </>
            ) : null}
          </div>

          <aside className="space-y-4">
            {range ? (
              <Card title="Expected delivery" icon={CalendarDays}>
                <p className="text-[15px] font-bold text-green-700">{arrivalText(range)}</p>
                {!shipment?.etd ? <p className="mt-1 text-[12px] text-wh-muted">We'll update this once the courier picks it up.</p> : null}
              </Card>
            ) : null}

            <Card title="Price details" icon={FileText}>
              <PriceRows order={order} />
            </Card>

            <Card title="Payment" icon={CreditCard}>
              <p className="text-[13px] text-wh-text">{paymentMethodLabel(order)}</p>
            </Card>

            <Card title="Delivery address" icon={MapPin}>
              <ShopAddressBlock address={order.deliveryAddress || order.address || {}} />
            </Card>

            <div className="space-y-2">
              {delivered ? (
                <Link
                  to={reorderPath(order)}
                  className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-wh-brand text-[14px] font-bold text-wh-brand-ink"
                >
                  <RotateCcw className="h-4 w-4" aria-hidden="true" /> Buy again
                </Link>
              ) : null}
              {canCancel ? (
                <button
                  type="button"
                  onClick={() => setCancelling(true)}
                  className="flex h-11 w-full items-center justify-center rounded-xl border border-red-600 text-[14px] font-bold text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30"
                >
                  Cancel order
                </button>
              ) : null}
              <Link
                to={`/orders/${id}/invoice`}
                className="flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-wh-border bg-wh-surface text-[14px] font-semibold text-wh-text"
              >
                <FileText className="h-4 w-4" aria-hidden="true" /> Invoice
              </Link>
              <Link
                to={`/help/orders/${id}`}
                className="flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-wh-border bg-wh-surface text-[14px] font-semibold text-wh-text"
              >
                <HelpCircle className="h-4 w-4" aria-hidden="true" /> Need help?
              </Link>
            </div>
          </aside>
        </div>
      </div>

      {cancelSheet}
    </div>
  )
}
