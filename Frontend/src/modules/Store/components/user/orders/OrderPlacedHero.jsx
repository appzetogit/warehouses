import { useEffect, useState } from "react"
import { Check, Copy, Home, Package, ShoppingBag, Truck } from "lucide-react"
import { copyToClipboard } from "./OrderDetailCards"

/**
 * Presentational pieces for the "Order placed" page, after the customer
 * app's order success screen (warehouse_user order_success_screen.dart).
 */

const CONFETTI_COLORS = ["#E9C19A", "#A15C35", "#58321D", "#3F7D55", "#F1E4D6", "#2E9D57", "#C08A1E"]

const reducedMotion = () =>
  typeof window !== "undefined" && Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches)

/** A short paper burst from the top of the screen; off under reduced motion. */
export function ConfettiBurst({ pieces = 36, duration = 2600 }) {
  const [show, setShow] = useState(() => !reducedMotion())
  useEffect(() => {
    if (!show) return undefined
    const t = setTimeout(() => setShow(false), duration + 600)
    return () => clearTimeout(t)
  }, [show, duration])
  if (!show) return null
  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-[120] overflow-hidden motion-reduce:hidden">
      <style>{`@keyframes wh-confetti-fall{0%{transform:translate3d(0,-10vh,0) rotate(0);opacity:1}85%{opacity:1}100%{transform:translate3d(var(--dx),95vh,0) rotate(var(--rot));opacity:0}}`}</style>
      {Array.from({ length: pieces }, (_, i) => {
        // Deterministic spread so renders match.
        const left = (i * 37) % 100
        const delay = ((i * 53) % 40) * 12
        const dx = (((i * 29) % 21) - 10) * 6
        const rot = (((i * 71) % 7) - 3) * 160
        const w = 6 + (i % 3) * 2
        return (
          <span
            key={i}
            className="absolute top-0 block rounded-[1px]"
            style={{
              left: `${left}%`,
              width: w,
              height: w * 1.6,
              background: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
              "--dx": `${dx}px`,
              "--rot": `${rot}deg`,
              animation: `wh-confetti-fall ${duration - delay}ms cubic-bezier(.2,.6,.4,1) ${delay}ms both`,
            }}
          />
        )
      })}
    </div>
  )
}

/** Brown bag circle with a green tick badge. */
export function BagHero() {
  return (
    <div className="relative mx-auto flex h-[180px] w-full items-center justify-center">
      <span aria-hidden="true" className="absolute bottom-3 h-8 w-[150px] rounded-full bg-app-brown/10 blur-[2px]" />
      <span className="relative motion-safe:animate-[wh-bag-pop_700ms_cubic-bezier(.34,1.56,.64,1)_both]">
        <style>{`@keyframes wh-bag-pop{0%{transform:scale(.4);opacity:0}100%{transform:scale(1);opacity:1}}`}</style>
        <span className="flex h-[128px] w-[128px] items-center justify-center rounded-full bg-gradient-to-br from-[#8A5A3C] to-app-brown text-white shadow-[0_10px_24px_rgba(88,50,29,0.35)]">
          <ShoppingBag className="h-14 w-14" strokeWidth={1.75} aria-hidden="true" />
        </span>
        <span className="absolute -bottom-0.5 -right-0.5 flex h-[42px] w-[42px] items-center justify-center rounded-full border-[3px] border-white bg-[#2E9D57] text-white">
          <Check className="h-6 w-6" strokeWidth={3} aria-hidden="true" />
        </span>
      </span>
    </div>
  )
}

/** Order number(s) with copy, and the order date. */
export function OrderNumberCard({ label = "Order Number", orderNo, date }) {
  return (
    <section className="flex items-stretch rounded-2xl border border-app-line bg-white p-3.5 shadow-[0_2px_8px_rgba(25,20,17,0.07)]">
      <div className="min-w-0 flex-1">
        <p className="text-[12.5px] text-app-muted">{label}</p>
        <div className="mt-1 flex items-center gap-1.5">
          <span className="break-all text-[16px] font-bold text-app-ink">{orderNo}</span>
          <button
            type="button"
            onClick={() => copyToClipboard(orderNo, "Order number copied")}
            aria-label="Copy order number"
            className="shrink-0 rounded-md p-1 text-app-brown hover:bg-app-tint-strong"
          >
            <Copy className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      </div>
      {date ? (
        <>
          <span aria-hidden="true" className="mx-3 w-px bg-[#E6E6E6]" />
          <div className="min-w-0 shrink-0">
            <p className="text-[12.5px] text-app-muted">Order Date</p>
            <p className="mt-1 text-[13.5px] font-semibold text-app-ink">{date}</p>
          </div>
        </>
      ) : null}
    </section>
  )
}

const STEP_ICONS = [ShoppingBag, Package, Truck, Home]

/**
 * Four-stop horizontal timeline: steps are { label, sub, done }; dashes
 * between stops are brown once the next stop is reached.
 */
export function PlacedTimeline({ steps = [] }) {
  return (
    <section className="rounded-2xl border border-app-line bg-white px-2 pb-3 pt-3.5 shadow-[0_2px_8px_rgba(25,20,17,0.07)]">
      <ol className="flex items-start" aria-label="Order progress">
        {steps.map((step, i) => {
          const Icon = STEP_ICONS[i] || Package
          const dash = (done) => (
            <span
              aria-hidden="true"
              className={`h-0 flex-1 border-t-2 border-dashed ${done ? "border-app-brown" : "border-[#CFCBC7]"}`}
            />
          )
          return (
            <li key={step.label} className="flex min-w-0 flex-1 flex-col items-center">
              <span className="flex w-full items-center">
                {i === 0 ? <span className="flex-1" /> : dash(step.done)}
                <span
                  className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full ${
                    step.done ? "bg-app-brown text-white" : "bg-[#EFEDEB] text-[#8E8882]"
                  }`}
                >
                  <Icon className="h-5 w-5" aria-hidden="true" />
                </span>
                {i === steps.length - 1 ? <span className="flex-1" /> : dash(steps[i + 1]?.done)}
              </span>
              <span className={`mt-2 px-0.5 text-center text-[11.5px] font-bold leading-tight ${step.done ? "text-app-brown" : "text-app-ink"}`}>
                {step.label}
              </span>
              {step.sub ? (
                <span className={`px-0.5 text-center text-[10.5px] leading-snug ${step.done ? "text-app-brown" : "text-app-muted"}`}>{step.sub}</span>
              ) : null}
            </li>
          )
        })}
      </ol>
    </section>
  )
}
