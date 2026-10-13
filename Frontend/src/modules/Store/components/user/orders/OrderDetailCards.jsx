import { Link } from "react-router-dom"
import { toast } from "sonner"
import { ArrowLeft, Check, ChevronRight, Copy, Package, Truck, X } from "lucide-react"

/**
 * Presentational pieces for the phone order pages, after the customer app's
 * order details screen (warehouse_user order_details_screen.dart): cream page,
 * white cards, a brown status card with a timeline and a pinned action bar.
 * No data fetching or order logic lives here.
 */

/** Page background used by the order pages. */
export const ORDER_PAGE_BG = "bg-[#FBF4ED]"

/** Copy text to the clipboard, where the browser allows it. */
export async function copyToClipboard(text, done = "Copied") {
  const value = String(text ?? "")
  if (!value) return
  try {
    if (typeof navigator === "undefined" || !navigator.clipboard?.writeText) throw new Error("no clipboard")
    await navigator.clipboard.writeText(value)
    toast.success(done)
  } catch {
    toast.error("Couldn't copy")
  }
}

/** "12 Oct, 2:05 pm" */
export const stepTime = (d) => {
  if (!d) return ""
  const date = new Date(d)
  if (Number.isNaN(date.getTime())) return ""
  return date.toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })
}

export function DetailCard({ as: Tag = "section", className = "", children, ...rest }) {
  return (
    <Tag
      className={`rounded-2xl border border-app-line bg-white shadow-[0_2px_10px_rgba(25,20,17,0.04)] ${className}`}
      {...rest}
    >
      {children}
    </Tag>
  )
}

export function SectionHeading({ title, aside = null }) {
  return (
    <div className="flex items-center justify-between gap-3 px-1 pt-2">
      <h2 className="text-[16px] font-bold text-app-ink">{title}</h2>
      {aside ? <span className="min-w-0 truncate text-[13px] text-app-muted">{aside}</span> : null}
    </div>
  )
}

/** Sticky phone top bar: back arrow, title and an optional right-hand slot. */
export function OrderTopBar({ title = "Order Details", onBack, right = null }) {
  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-app-line bg-[#FBF4ED]/95 px-2 backdrop-blur">
      <button
        type="button"
        onClick={onBack}
        aria-label="Back"
        className="flex h-10 w-10 items-center justify-center rounded-full text-app-ink hover:bg-app-tint-strong"
      >
        <ArrowLeft className="h-5 w-5" aria-hidden="true" />
      </button>
      <h1 className="min-w-0 flex-1 truncate text-[18px] font-bold text-app-ink">{title}</h1>
      {right}
    </header>
  )
}

/** Thumbnail with a package icon when there is no photo. */
export function ItemThumb({ src, className = "h-[106px] w-[88px]" }) {
  return (
    <span className={`relative block shrink-0 overflow-hidden rounded-xl border border-app-line bg-app-alt ${className}`}>
      {src ? (
        <img src={src} alt="" loading="lazy" className="h-full w-full object-cover" />
      ) : (
        <Package className="absolute inset-0 m-auto h-6 w-6 text-app-muted" aria-hidden="true" />
      )}
    </span>
  )
}

/**
 * "ORDER #" header card: first item's photo, the order number with a copy
 * button, a title line, a meta line and an optional chip and footer.
 */
export function OrderIdCard({ orderNo, image, title, meta, chip, chipIcon: ChipIcon, footer, onCopy }) {
  const copy = onCopy || (() => copyToClipboard(orderNo, "Order number copied"))
  return (
    <DetailCard className="p-3.5">
      <div className="flex items-start gap-3.5">
        <ItemThumb src={image} />
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold uppercase tracking-[0.05em] text-app-muted">Order #</p>
          <div className="mt-0.5 flex items-center gap-2">
            <span className="truncate text-[15.5px] font-extrabold text-app-ink">{orderNo}</span>
            <button
              type="button"
              onClick={copy}
              aria-label="Copy order number"
              className="-m-1 shrink-0 rounded-md p-1 text-app-ink hover:bg-app-tint-strong"
            >
              <Copy className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
          {title ? <p className="mt-1 line-clamp-1 text-[14px] font-bold text-app-ink">{title}</p> : null}
          {meta ? <p className="mt-0.5 text-[12px] font-medium text-app-muted">{meta}</p> : null}
          {chip ? (
            <span className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-[#F7F1EB] px-2.5 py-1 text-[11.5px] font-semibold text-app-brown">
              {ChipIcon ? <ChipIcon className="h-3.5 w-3.5" aria-hidden="true" /> : null}
              {chip}
            </span>
          ) : null}
        </div>
      </div>
      {footer ? <div className="mt-3 rounded-xl bg-[#F7F2EC] px-3 py-2.5 text-[12px] font-medium text-app-ink">{footer}</div> : null}
    </DetailCard>
  )
}

/**
 * Vertical progress: done nodes and lines in brown, pending in grey, the
 * current step ringed. Steps are { key, label, done, current, at, bad, sub }.
 */
export function VerticalTimeline({ steps = [] }) {
  return (
    <ol aria-label="Order progress">
      {steps.map((step, i) => {
        const last = i === steps.length - 1
        const next = last ? null : steps[i + 1]
        const lineDone = Boolean(next?.done)
        return (
          <li key={step.key || i} className="relative flex gap-3 pb-4 last:pb-0">
            {!last ? (
              <span
                aria-hidden="true"
                className={`absolute left-[9px] top-[22px] bottom-0 w-[2px] rounded ${
                  lineDone ? (next.bad ? "bg-[#F4A6B4]" : "bg-app-brown") : "bg-[#CFCBC7]"
                }`}
              />
            ) : null}
            <span className="relative z-[1] mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center">
              {step.bad ? (
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#E11D48] text-white">
                  <X className="h-3 w-3" strokeWidth={3} aria-hidden="true" />
                </span>
              ) : step.current ? (
                <span className="flex h-5 w-5 items-center justify-center rounded-full border-[2.5px] border-app-brown bg-white">
                  <span className="h-[7px] w-[7px] rounded-full bg-app-brown" />
                </span>
              ) : step.done ? (
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-app-brown text-white">
                  <Check className="h-3 w-3" strokeWidth={3} aria-hidden="true" />
                </span>
              ) : (
                <span className="h-[15px] w-[15px] rounded-full border-2 border-[#CFCBC7] bg-white" />
              )}
            </span>
            <span className="flex min-w-0 flex-1 items-start justify-between gap-3">
              <span className="min-w-0">
                <span
                  className={`block text-[13.5px] leading-5 ${
                    step.bad
                      ? "font-bold text-[#B4232F]"
                      : step.current
                        ? "font-bold text-app-brown"
                        : step.done
                          ? "font-semibold text-[#5A524C]"
                          : "font-medium text-app-muted"
                  }`}
                >
                  {step.label}
                </span>
                {step.sub ? <span className="block text-[12px] text-app-muted">{step.sub}</span> : null}
              </span>
              {step.at ? <span className="shrink-0 text-[12px] font-medium leading-5 text-app-muted">{stepTime(step.at)}</span> : null}
            </span>
          </li>
        )
      })}
    </ol>
  )
}

const TONE_ICON = { progress: Truck, delivered: Check, cancelled: X }
const TONE_BADGE = { progress: "In progress", delivered: "Delivered", cancelled: "Cancelled" }

/**
 * Status card: a brown banner with the status line, then the timeline and
 * anything else passed as children (expected date, refund note...).
 */
export function StatusTimelineCard({ tone = "progress", badge, title, subtitle, steps = [], children }) {
  const Icon = TONE_ICON[tone] || Truck
  const cancelled = tone === "cancelled"
  return (
    <DetailCard className="overflow-hidden">
      <div className="flex items-center gap-3.5 bg-gradient-to-br from-[#6E4129] via-app-brown to-app-brown-deep p-4 text-white">
        <span
          className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full ${
            cancelled ? "bg-[#E11D48]" : tone === "delivered" ? "bg-app-ok" : "bg-white/15"
          }`}
        >
          <Icon className="h-6 w-6" strokeWidth={tone === "progress" ? 2 : 3} aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <span
            className={`inline-block rounded-xl px-2.5 py-0.5 text-[11px] font-bold ${
              cancelled ? "bg-[#FFDEE4] text-[#9F1239]" : "bg-white/15 text-app-champagne"
            }`}
          >
            {badge || TONE_BADGE[tone]}
          </span>
          <p className="mt-1 text-[18px] font-extrabold leading-snug">{title}</p>
          {subtitle ? <p className="mt-0.5 text-[12px] font-medium leading-relaxed text-white/80">{subtitle}</p> : null}
        </div>
      </div>
      {steps.length ? (
        <div className="px-4 pb-3 pt-4">
          <VerticalTimeline steps={steps} />
        </div>
      ) : null}
      {children ? <div className="space-y-3 px-4 pb-4 pt-1">{children}</div> : null}
    </DetailCard>
  )
}

/** One product line as its own card. `price` may be text or a node. */
export function ItemDetailCard({ image, name, variant, qty, price, extra = null }) {
  return (
    <DetailCard className="flex gap-3 p-3">
      <ItemThumb src={image} className="h-[88px] w-[72px]" />
      <div className="min-w-0 flex-1">
        <p className="line-clamp-2 text-[14px] font-semibold leading-snug text-app-ink">{name}</p>
        {variant ? <p className="mt-0.5 text-[12px] text-app-muted">{variant}</p> : null}
        {qty != null ? <p className="mt-0.5 text-[12px] text-app-muted">Qty: {qty}</p> : null}
        {extra}
        {price != null ? <div className="mt-1.5 text-[15px] font-bold text-app-ink">{price}</div> : null}
      </div>
    </DetailCard>
  )
}

/**
 * Bill rows ({ label, value, tone }) and the total band. tone "save" shows
 * green, "brand" brown.
 */
export function BillSummaryCard({ rows = [], totalLabel = "Order total", total, footer = null }) {
  const toneClass = (tone) => (tone === "save" ? "text-app-ok" : tone === "brand" ? "font-semibold text-app-brown" : "")
  return (
    <DetailCard className="overflow-hidden">
      <div className="space-y-2.5 p-4">
        {rows.map((row) => (
          <div key={row.label} className="flex items-start justify-between gap-3 text-[13.5px]">
            <span className={toneClass(row.tone) || "text-[#4A423D]"}>{row.label}</span>
            <span className={`text-right tabular-nums ${toneClass(row.tone) || "font-medium text-app-ink"}`}>{row.value}</span>
          </div>
        ))}
      </div>
      <div className="flex items-center justify-between gap-3 bg-[#FBF4ED] px-4 py-3">
        <span className="text-[15px] font-bold text-app-ink">{totalLabel}</span>
        <span className="text-[16px] font-extrabold text-app-ink tabular-nums">{total}</span>
      </div>
      {footer}
    </DetailCard>
  )
}

/** Green "You saved" strip. */
export function SavedBanner({ amount, suffix = "on this order" }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-[#BFE3CB] bg-[#EAF6EE] px-3.5 py-3">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#2E9D57] text-white">
        <Check className="h-4 w-4" strokeWidth={3} aria-hidden="true" />
      </span>
      <p className="text-[14.5px] font-semibold text-app-ink">
        Yay! You saved <span className="font-extrabold text-[#2E9D57]">{amount}</span> {suffix}
      </p>
    </div>
  )
}

/** Name, address lines and phone. */
export function AddressCard({ icon: Icon, title, name, lines = [], phone }) {
  return (
    <DetailCard className="flex gap-3 p-4">
      {Icon ? (
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-app-tint-strong text-app-brown">
          <Icon className="h-5 w-5" aria-hidden="true" />
        </span>
      ) : null}
      <div className="min-w-0 text-[13px] leading-relaxed text-app-muted">
        {title ? <p className="text-[14px] font-bold text-app-ink">{title}</p> : null}
        {name ? <p className="font-semibold text-app-ink">{name}</p> : null}
        {lines.filter(Boolean).map((line, i) => (
          <p key={i}>{line}</p>
        ))}
        {phone ? <p className="mt-1">Phone: {phone}</p> : null}
      </div>
    </DetailCard>
  )
}

/** Cancel as a quiet red link with an optional note under it. */
export function CancelLink({ onClick, label = "Cancel order", note }) {
  return (
    <div className="pt-1 text-center">
      <button
        type="button"
        onClick={onClick}
        className="text-[13.5px] font-semibold text-[#E11D48] underline decoration-[#FDA4AF] underline-offset-4 hover:decoration-[#E11D48]"
      >
        {label}
      </button>
      {note ? <p className="mt-1 text-[11.5px] text-app-muted">{note}</p> : null}
    </div>
  )
}

/** A chevron row inside a card, e.g. "Track on courier site". */
export function CardLinkRow({ href, to, icon: Icon, children }) {
  const cls = "flex items-center gap-2 rounded-xl bg-[#F7F2EC] px-3 py-2.5 text-[12.5px] font-semibold text-app-ink"
  const body = (
    <>
      {Icon ? <Icon className="h-4 w-4 text-app-brown" aria-hidden="true" /> : null}
      <span className="min-w-0 flex-1">{children}</span>
      <ChevronRight className="h-4 w-4 text-app-muted" aria-hidden="true" />
    </>
  )
  if (href) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className={cls}>
        {body}
      </a>
    )
  }
  return (
    <Link to={to} className={cls}>
      {body}
    </Link>
  )
}

/** Room to leave under the content for OrderBottomBar. */
export const BOTTOM_BAR_PAD = "pb-[calc(88px+env(safe-area-inset-bottom))]"

/**
 * Pinned bar of equal buttons (Reorder | View Invoice | Get Help). Each action
 * is { key, label, icon, to | onClick, tone: "help" }. It sits above the
 * phone tab bar so the order's own actions stay in reach.
 */
export function OrderBottomBar({ actions = [], className = "" }) {
  const list = actions.filter(Boolean)
  if (!list.length) return null
  return (
    <div
      className={`fixed inset-x-0 bottom-0 z-[95] border-t border-[#EDE7E1] bg-white px-3.5 pb-[calc(10px+env(safe-area-inset-bottom))] pt-2.5 font-app ${className}`}
    >
      <div className="mx-auto flex max-w-3xl gap-2">
        {list.map(({ key, label, icon: Icon, to, onClick, tone }) => {
          const cls = `flex h-[46px] min-w-0 flex-1 items-center justify-center gap-1.5 rounded-xl px-1.5 text-[12.5px] font-bold ${
            tone === "help" ? "border-[1.2px] border-[#FDA4AF] bg-[#FFF0F2] text-[#E11D48]" : "bg-[#FBF4ED] text-app-brown hover:bg-app-tint-strong"
          }`
          const body = (
            <>
              {Icon ? <Icon className="h-4 w-4 shrink-0" aria-hidden="true" /> : null}
              <span className="truncate">{label}</span>
            </>
          )
          return to ? (
            <Link key={key || label} to={to} className={cls}>
              {body}
            </Link>
          ) : (
            <button key={key || label} type="button" onClick={onClick} className={cls}>
              {body}
            </button>
          )
        })}
      </div>
    </div>
  )
}
