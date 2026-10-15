/**
 * Desktop (lg+) cart pieces in the customer app's look, laid out for wide
 * screens. Presentational only: totals, labels and handlers come in as props
 * from Cart.jsx, nothing here prices, validates or calls the API. The cart
 * lines, bill and payment cards themselves are the phone parts
 * (PhoneCartParts.jsx), so phone and desktop show the same rows and figures.
 */
import { ChevronRight, Loader2, PartyPopper, ShieldCheck } from "lucide-react"
import CartSwitch from "./CartSwitch"

const money = (n) => `₹${Math.round(Number(n) || 0).toLocaleString("en-IN")}`

/** Shop / Quick switch in sand and brown, sized for the desktop heading. */
export const desktopCartSwitchClass = [
  "w-[360px]",
  "[&_[role=tablist]]:bg-app-sand",
  "[&_[aria-selected=true]]:bg-app-brown",
  "[&_[aria-selected=false]]:text-app-brown",
  "[&_[aria-selected=false]>span]:bg-white",
  "[&_[aria-selected=false]>span]:text-app-brown",
  "[&>p]:text-app-muted",
].join(" ")

/** "Shopping Cart" title with the item count and the Shop / Quick switch. */
export function DesktopCartHeading({ count }) {
  return (
    <div className="flex items-end justify-between gap-6 border-b border-app-line pb-4 dark:border-gray-800">
      <div className="min-w-0">
        <h1 className="font-app-display text-[34px] font-bold leading-none text-app-brown-deep dark:text-white">
          Shopping Cart
        </h1>
        <p className="mt-1.5 text-[13px] text-app-muted">
          {count > 0 ? `${count} item${count === 1 ? "" : "s"} in your cart` : "Nothing here yet"}
        </p>
      </div>
      <CartSwitch className={desktopCartSwitchClass} />
    </div>
  )
}

/** Total, "You saved" strip and the brown Place Order button. */
export function DesktopPlaceOrderCard({ total, savings = 0, label, onClick, disabled = false, busy = false, showChevron = true, className = "" }) {
  return (
    <section
      aria-label="Place your order"
      className={`rounded-[18px] border border-app-line bg-white p-4 font-app dark:border-gray-800 dark:bg-[#1a1a1a] ${className}`}
    >
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-[14px] font-semibold text-app-ink dark:text-white">Total to pay</span>
        <span className="text-[22px] font-extrabold tabular-nums text-app-ink dark:text-white">{money(total)}</span>
      </div>
      <p className="text-[11px] text-app-muted">Incl. all taxes and charges</p>
      {savings > 0 ? (
        <div className="mt-3 flex items-center gap-1.5 rounded-lg bg-[#EAF6EE] px-3 py-2 text-[12px] font-semibold text-[#2E7D32] dark:bg-emerald-950/30 dark:text-emerald-300">
          <PartyPopper className="h-4 w-4 shrink-0" aria-hidden="true" />
          You saved {money(savings)} on this order
        </div>
      ) : null}
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        className="mt-3 flex h-12 w-full items-center justify-center gap-1 rounded-[12px] bg-app-brown px-6 text-[15px] font-bold text-white transition-colors hover:bg-app-brown-deep focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app-brown disabled:cursor-not-allowed disabled:bg-[#BDB5AE]"
      >
        {busy ? <Loader2 className="h-[18px] w-[18px] animate-spin" aria-hidden="true" /> : null}
        <span>{label}</span>
        {!busy && showChevron ? <ChevronRight className="h-[18px] w-[18px]" aria-hidden="true" /> : null}
      </button>
      <p className="mt-2.5 flex items-center justify-center gap-1 text-[11px] text-app-muted">
        <ShieldCheck className="h-3.5 w-3.5 text-app-ok" aria-hidden="true" />
        Safe and secure checkout
      </p>
    </section>
  )
}
