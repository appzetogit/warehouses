/**
 * Phone cart pieces in the customer app's look (warehouse_user: StepAppBar,
 * DeliveryStrip, CartLineTile, BillDetailsCard, StepBottomBar). Presentational
 * only: every action comes in as a prop from Cart.jsx, nothing here prices,
 * validates or calls the API.
 */
import { forwardRef } from "react"
import { Link } from "react-router-dom"
import {
  ArrowLeft,
  ChevronRight,
  ChevronUp,
  Loader2,
  MapPin,
  Minus,
  PartyPopper,
  Plus,
  Share2,
  ShoppingBag,
  Store,
  Tag,
} from "lucide-react"

const RUPEE = "₹"
const money = (n) => `${RUPEE}${Math.round(Number(n) || 0).toLocaleString("en-IN")}`

/** White card used for every block on the phone cart. */
export function PhoneCard({ as: Tag_ = "div", className = "", children, ...rest }) {
  return (
    <Tag_
      className={`rounded-[14px] border border-[#EBEBEB] bg-white dark:border-gray-800 dark:bg-[#1a1a1a] ${className}`}
      {...rest}
    >
      {children}
    </Tag_>
  )
}

/** Back arrow, caps title and a "STEP n/m" pill. */
export function StepHeader({ title, step, onBack, onShare, children }) {
  return (
    <div className="sticky top-0 z-30 flex-shrink-0 border-b border-[#E5E5E5] bg-white font-app dark:border-gray-800 dark:bg-[#141414]">
      <div className="flex h-12 items-center gap-1 pr-3.5">
        <button
          type="button"
          onClick={onBack}
          aria-label="Back"
          className="flex h-12 w-12 items-center justify-center text-app-ink dark:text-gray-200"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <h1 className="flex-1 truncate text-[13px] font-semibold uppercase tracking-[0.4px] text-app-ink dark:text-white">
          {title}
        </h1>
        {onShare ? (
          <button
            type="button"
            onClick={onShare}
            aria-label="Share cart"
            className="mr-1 flex h-8 w-8 items-center justify-center rounded-full text-app-muted hover:bg-app-alt"
          >
            <Share2 className="h-4 w-4" />
          </button>
        ) : null}
        {step ? (
          <span className="rounded-full border border-app-brown/30 bg-app-tint px-3 py-[5px] text-[9.5px] font-semibold text-app-brown">
            {step}
          </span>
        ) : null}
      </div>
      {children}
    </div>
  )
}

/** Shop / Quick cart switch, in sand and brown. Wraps the shared CartSwitch. */
export const phoneCartSwitchClass = [
  "px-3.5 pb-3",
  "[&_[role=tablist]]:bg-app-sand",
  "[&_[aria-selected=true]]:bg-app-brown",
  "[&_[aria-selected=false]]:text-app-brown",
  "[&_[aria-selected=false]>span]:bg-white",
  "[&_[aria-selected=false]>span]:text-app-brown",
  "[&>p]:text-app-muted",
].join(" ")

/** "Deliver to" line with an outlined Change button. */
export function DeliveryStrip({ text, onChange, warning, className = "" }) {
  return (
    <PhoneCard className={`flex items-center gap-2.5 px-3.5 py-2.5 font-app ${className}`}>
      <MapPin className="h-5 w-5 shrink-0 fill-app-brown text-white" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        {warning ? (
          <span className="mb-1 inline-block rounded-xl bg-[#FDE4E4] px-2 py-[3px] text-[10px] font-medium text-[#D32F2F]">
            {warning}
          </span>
        ) : null}
        <p className="text-[11px] leading-tight text-[#757575]">Deliver to</p>
        <p className="truncate text-[13.5px] font-bold leading-snug text-app-ink dark:text-white">{text}</p>
      </div>
      <button
        type="button"
        onClick={onChange}
        className="flex shrink-0 items-center gap-0.5 rounded-lg border-[1.2px] border-app-brown px-3 py-[5px] text-[12px] font-bold text-app-brown"
      >
        Change
        <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
      </button>
    </PhoneCard>
  )
}

/** Seller block header: store icon, name and a green ETA chip. */
export function SellerHeader({ name, itemCount, eta }) {
  return (
    <div className="flex items-center gap-2.5 border-b border-[#EEEEEE] px-3 py-2.5 dark:border-gray-800">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#F7F1EC] text-app-brown">
        <Store className="h-4 w-4" aria-hidden="true" />
      </span>
      <p className="min-w-0 flex-1 truncate text-[13.5px] font-bold text-app-ink dark:text-white">
        {name}
        {itemCount ? (
          <span className="ml-1 text-[11px] font-normal text-app-muted">
            ({itemCount} {itemCount === 1 ? "item" : "items"})
          </span>
        ) : null}
      </p>
      {eta ? (
        <span className="shrink-0 rounded-full border border-[#C8E6C9] bg-[#E8F5E9] px-2 py-0.5 text-[10.5px] font-semibold text-[#2E7D32]">
          {eta}
        </span>
      ) : null}
    </div>
  )
}

/** Small bordered chip such as "Size: M". */
export function InfoChip({ children }) {
  return (
    <span className="inline-flex items-center rounded-md border border-[#E2E2E6] bg-[#F7F7F8] px-2 py-[3px] text-[11.5px] text-app-ink dark:border-gray-700 dark:bg-[#222] dark:text-gray-200">
      {children}
    </span>
  )
}

const lineActionDesktop =
  "rounded py-1 text-[12.5px] font-semibold text-app-brown hover:underline focus-visible:outline-2 focus-visible:outline-app-brown dark:text-gray-200"

/** One cart line: photo, name, price with discount, chips, stepper and actions. */
export function CartLineTile({
  name,
  href,
  image,
  price,
  mrp,
  variantLabel,
  quantity,
  onDecrease,
  onIncrease,
  onSaveForLater,
  onRemove,
  roomy = false,
}) {
  // roomy: the desktop cart (lg+) uses a larger photo and type; phones never pass it.
  const big = (phone, desktop) => (roomy ? desktop : phone)
  const unit = Number(price) || 0
  const strike = Number(mrp) || 0
  const off = strike > unit ? Math.round(((strike - unit) / strike) * 100) : 0
  return (
    <div className="border-b border-[#EEEEEE] last:border-b-0 dark:border-gray-800">
      <div className={big("flex items-start gap-2.5 px-3 py-2.5", "flex items-start gap-4 px-4 py-3.5")}>
        <Link
          to={href}
          className={big("h-[82px] w-[76px] shrink-0 overflow-hidden rounded-[10px] bg-app-alt dark:bg-gray-800", "h-[120px] w-[104px] shrink-0 overflow-hidden rounded-[12px] bg-app-alt dark:bg-gray-800")}
        >
          {image ? (
            <img
              src={image}
              alt={name}
              loading="lazy"
              className="h-full w-full object-cover"
              onError={(e) => {
                e.currentTarget.style.display = "none"
              }}
            />
          ) : (
            <span className="flex h-full w-full items-center justify-center text-gray-300">
              <ShoppingBag className="h-6 w-6" aria-hidden="true" />
            </span>
          )}
        </Link>
        <div className="min-w-0 flex-1">
          <Link to={href} className={big("line-clamp-2 text-[13px] font-semibold leading-[1.25] text-app-ink dark:text-white", "line-clamp-2 text-[15px] font-semibold leading-[1.3] text-app-ink hover:text-app-brown dark:text-white")}>
            {name}
          </Link>
          <div className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
            <span className={big("text-[14px] font-extrabold tabular-nums text-app-ink dark:text-white", "text-[16px] font-extrabold tabular-nums text-app-ink dark:text-white")}>{money(unit)}</span>
            {strike > unit ? (
              <span className={big("text-[11px] tabular-nums text-[#9E9E9E] line-through", "text-[12.5px] tabular-nums text-[#9E9E9E] line-through")}>{money(strike)}</span>
            ) : null}
            {off > 0 ? (
              <span className={big("rounded bg-[#FFEBEE] px-[5px] py-px text-[9.5px] font-bold text-[#D32F2F]", "rounded bg-[#FFEBEE] px-1.5 py-px text-[10.5px] font-bold text-[#D32F2F]")}>{off}% OFF</span>
            ) : null}
          </div>
          <div className={big("mt-1.5 flex flex-wrap items-center gap-1.5", "mt-2.5 flex flex-wrap items-center gap-2.5")}>
            {variantLabel ? <InfoChip>{variantLabel}</InfoChip> : null}
            <div className="flex h-7 items-center rounded-md border border-app-brown bg-white dark:bg-[#1a1a1a]">
              <button
                type="button"
                aria-label={`Decrease quantity of ${name}`}
                onClick={onDecrease}
                className="flex h-full w-7 items-center justify-center text-app-brown"
              >
                <Minus className="h-3.5 w-3.5" />
              </button>
              <span className="min-w-[22px] text-center text-[12px] font-bold tabular-nums text-app-brown">{quantity}</span>
              <button
                type="button"
                aria-label={`Increase quantity of ${name}`}
                onClick={onIncrease}
                className="flex h-full w-7 items-center justify-center text-app-brown"
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </div>
      </div>
      <div className={big("flex border-t border-[#EEEEEE] dark:border-gray-800", "-mt-1 flex items-center gap-3 pb-3 pl-[136px]")}>
        {onSaveForLater ? (
          <>
            <button
              type="button"
              onClick={onSaveForLater}
              className={roomy ? lineActionDesktop : "flex-1 py-2 text-[11.5px] font-medium text-[#222222] dark:text-gray-200"}
            >
              Save for later
            </button>
            <span className={roomy ? "h-4 w-px bg-app-line dark:bg-gray-800" : "my-1.5 w-px bg-[#EEEEEE] dark:bg-gray-800"} aria-hidden="true" />
          </>
        ) : null}
        <button
          type="button"
          aria-label={`Remove ${name} from cart`}
          onClick={onRemove}
          className={roomy ? lineActionDesktop : "flex-1 py-2 text-[11.5px] font-medium text-[#222222] dark:text-gray-200"}
        >
          Remove
        </button>
      </div>
    </div>
  )
}

/** "Apply a coupon" row; green when a coupon is on. */
export function CouponRow({ appliedCode, savedText, subText, onOpen, onRemove, className = "" }) {
  if (appliedCode) {
    return (
      <div
        className={`flex items-center gap-3 rounded-[14px] border border-[#C8E6C9] bg-[#E8F5E9] px-3.5 py-3 font-app dark:border-emerald-900 dark:bg-emerald-950/30 ${className}`}
      >
        <Tag className="h-5 w-5 shrink-0 text-[#2E7D32]" aria-hidden="true" />
        <button type="button" onClick={onOpen} className="min-w-0 flex-1 text-left">
          <p className="truncate text-[13px] font-bold text-[#2E7D32]">&lsquo;{appliedCode}&rsquo; applied</p>
          {savedText ? <p className="truncate text-[11px] text-[#2E7D32]/80">{savedText}</p> : null}
        </button>
        <button type="button" onClick={onRemove} className="shrink-0 text-[12px] font-bold text-[#D32F2F]">
          Remove
        </button>
      </div>
    )
  }
  return (
    <PhoneCard as="button" type="button" onClick={onOpen} className={`flex w-full items-center gap-3 px-3.5 py-3 text-left font-app ${className}`}>
      <Tag className="h-5 w-5 shrink-0 text-app-brown" aria-hidden="true" />
      <span className="min-w-0 flex-1">
        <span className="block text-[13px] font-bold text-app-ink dark:text-white">Apply a coupon</span>
        <span className="block truncate text-[11px] text-app-muted">{subText || "Get extra savings on your order"}</span>
      </span>
      <span className="flex shrink-0 items-center text-[12px] font-bold text-app-brown">
        View offers
        <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
      </span>
    </PhoneCard>
  )
}

/** Bill card shell; rows are passed in as children. */
export const BillDetailsCard = forwardRef(function BillDetailsCard({ toPay, savings, children, className = "" }, ref) {
  return (
    <PhoneCard className={`scroll-mt-16 p-3.5 font-app ${className}`} ref={ref}>
      <p className="mb-2.5 text-[14px] font-bold text-app-ink dark:text-white">Bill details</p>
      <div className="space-y-[7px]">{children}</div>
      <div className="my-2.5 h-px bg-[#EEEEEE] dark:bg-gray-800" />
      <div className="flex items-center justify-between">
        <span className="text-[15px] font-extrabold text-app-ink dark:text-white">To pay</span>
        <span className="text-[15px] font-extrabold tabular-nums text-app-ink dark:text-white">{toPay}</span>
      </div>
      {savings > 0 ? (
        <div className="mt-2.5 flex items-center gap-1.5 rounded-lg bg-[#EAF6EE] px-2.5 py-[7px] text-[11.5px] font-semibold text-[#2E7D32]">
          <PartyPopper className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          You saved {money(savings)} on this order
        </div>
      ) : null}
    </PhoneCard>
  )
})

/** One bill line: label (with optional note) and a value. */
export function BillRow({ label, note, value, tone = "default" }) {
  const valueClass =
    tone === "free" || tone === "discount"
      ? "font-semibold text-[#2E7D32]"
      : "font-semibold text-[#222222] dark:text-gray-200"
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0 flex-1">
        <p className="text-[12px] text-[#555555] dark:text-gray-400">{label}</p>
        {note ? <p className="text-[10px] leading-snug text-[#888888]">{note}</p> : null}
      </div>
      <div className={`shrink-0 whitespace-nowrap text-right text-[12px] tabular-nums ${valueClass}`}>{value}</div>
    </div>
  )
}

const PAY_ICON_TINT = {
  cash: "bg-[#FDF1E4] text-[#E08A2E]",
  razorpay: "bg-[#E8F5E9] text-[#2E7D32]",
  wallet: "bg-app-tint text-app-brown",
}

/** Payment method card: one selectable row per available option. */
export function PaymentMethodCard({ options, selected, onSelect, className = "" }) {
  return (
    <PhoneCard className={`p-3.5 font-app ${className}`}>
      <p className="mb-2.5 text-[14px] font-bold text-app-ink dark:text-white">Payment method</p>
      <div className="space-y-2">
        {options.map((option) => {
          const on = selected === option.id
          return (
            <button
              key={option.id}
              type="button"
              disabled={option.disabled}
              aria-pressed={on}
              onClick={() => onSelect(option)}
              className={`flex w-full items-center gap-3 rounded-xl bg-white px-3 py-2.5 text-left dark:bg-[#1a1a1a] ${
                on ? "border-[1.5px] border-app-brown" : "border border-[#E0E0E0] dark:border-gray-700"
              } ${option.disabled ? "cursor-not-allowed opacity-50" : ""}`}
            >
              <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${PAY_ICON_TINT[option.id] || "bg-app-alt text-app-brown"}`}>
                {option.icon}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5">
                  <span className="text-[13px] font-semibold text-app-ink dark:text-white">{option.name}</span>
                  {option.badge ? (
                    <span className="rounded-full bg-[#E8F5E9] px-1.5 py-px text-[8px] font-bold tracking-wider text-[#2E7D32]">
                      {option.badge}
                    </span>
                  ) : null}
                </span>
                <span className="block truncate text-[11px] text-app-muted">
                  {option.description}
                  {option.subInfo && !option.disabled ? ` · ${option.subInfo}` : ""}
                </span>
                {option.disabled && option.disabledText ? (
                  <span className="block text-[10px] font-semibold text-[#D32F2F]">{option.disabledText}</span>
                ) : null}
              </span>
              <span
                className={`flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full border-2 ${
                  on ? "border-app-brown" : "border-[#C9C9C9]"
                }`}
                aria-hidden="true"
              >
                {on ? <span className="h-2 w-2 rounded-full bg-app-brown" /> : null}
              </span>
            </button>
          )
        })}
      </div>
    </PhoneCard>
  )
}

/** Sticky bottom bar: total, savings chip, price-details link and the main button. */
export function StepBottomBar({ total, savings = 0, onViewPrice, label, showChevron = true, busy = false, disabled = false, onClick }) {
  return (
    <div
      className="fixed bottom-0 left-0 right-0 z-30 border-t border-[#EBEBEB] bg-white px-4 pt-2 font-app dark:border-gray-800 dark:bg-[#161616]"
      style={{ paddingBottom: "max(0.5rem, env(safe-area-inset-bottom, 0px))" }}
    >
      <div className="mx-auto flex max-w-md items-center gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="text-[18px] font-black tabular-nums text-app-ink dark:text-white">{money(total)}</span>
            {savings > 0 ? (
              <span className="rounded bg-[#E8F5E9] px-1.5 py-0.5 text-[9px] font-bold text-[#2E7D32]">{money(savings)} OFF</span>
            ) : null}
          </div>
          {onViewPrice ? (
            <button
              type="button"
              onClick={onViewPrice}
              className="mt-0.5 flex items-center gap-0.5 text-[10px] font-bold text-app-brown"
            >
              VIEW PRICE DETAILS
              <ChevronUp className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          ) : null}
        </div>
        <button
          type="button"
          onClick={onClick}
          disabled={disabled}
          className="flex h-[42px] shrink-0 items-center justify-center gap-1 rounded-[10px] bg-app-brown px-6 text-[14px] font-bold text-white transition-colors disabled:cursor-not-allowed disabled:bg-[#BDB5AE]"
        >
          {busy ? <Loader2 className="h-[18px] w-[18px] animate-spin" aria-hidden="true" /> : null}
          <span>{label}</span>
          {!busy && showChevron ? <ChevronRight className="h-[18px] w-[18px]" aria-hidden="true" /> : null}
        </button>
      </div>
    </div>
  )
}
