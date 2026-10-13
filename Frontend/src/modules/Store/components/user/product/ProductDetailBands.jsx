import { useState } from "react"
import { ChevronDown, RotateCcw, Truck } from "lucide-react"
import { toast } from "sonner"

/**
 * Bands of the phone product page that only present data, after the
 * customer app's product_details_screen.dart (_Band, _Details, _TrustRow).
 */

export const focusRing = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app-brown"
/** For full-width rows, where an outside ring would be clipped. */
export const focusRingInset = "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-app-brown"

/** A full-width white band; the page is built from these on a cream page. */
export function Band({ children, gap = "mt-2", className = "", ...rest }) {
  return (
    <section className={`w-full bg-white px-[14px] py-[14px] ${gap} ${className}`} {...rest}>
      {children}
    </section>
  )
}

function Pair({ k, v }) {
  return (
    <div className="min-w-0">
      <dt className="text-[12.5px] text-app-muted">{k}</dt>
      <dd className="mt-[3px] break-words text-[14.5px] font-medium text-app-ink">{v}</dd>
    </div>
  )
}

/** "Product Highlights" with COPY and a two-column key/value grid. */
export function ProductHighlights({ rows }) {
  if (!rows.length) return null
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(rows.map(([k, v]) => `${k}: ${v}`).join("\n"))
      toast.success("Copied")
    } catch {
      toast.error("Could not copy")
    }
  }
  return (
    <Band className="pb-[18px] pt-4" aria-labelledby="pd-highlights">
      <div className="flex items-center justify-between gap-3">
        <h2 id="pd-highlights" className="text-[17px] font-extrabold text-app-ink">Product Highlights</h2>
        <button
          type="button"
          onClick={copy}
          aria-label="Copy product highlights"
          className={`rounded px-1 text-[13.5px] font-extrabold text-app-brown ${focusRing}`}
        >
          COPY
        </button>
      </div>
      <dl className="mt-4 grid grid-cols-2 gap-x-3 gap-y-4">
        {rows.map(([k, v]) => (
          <Pair key={k} k={k} v={v} />
        ))}
      </dl>
    </Band>
  )
}

/** Collapsible "Additional Details": description lines, then shipping and returns. */
export function AdditionalDetails({ bullets, rows }) {
  const [open, setOpen] = useState(false)
  if (!bullets.length && !rows.length) return null
  return (
    <section className="mt-px w-full bg-white">
      <h2>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-controls="pd-additional"
          className={`flex w-full items-center justify-between px-[14px] py-4 text-left text-[17px] font-extrabold text-app-ink ${focusRingInset}`}
        >
          Additional Details
          <ChevronDown className={`h-5 w-5 text-app-muted transition-transform ${open ? "rotate-180" : ""}`} aria-hidden="true" />
        </button>
      </h2>
      {open ? (
        <div id="pd-additional" className="px-[14px] pb-4">
          {bullets.length ? (
            <ul className="space-y-1.5">
              {bullets.map((b, i) => (
                <li key={i} className="flex gap-2 text-[13px] leading-[1.45] text-[#555]">
                  <span className="mt-[8px] h-[5px] w-[5px] shrink-0 rounded-full bg-app-muted" aria-hidden="true" />
                  <span>{b}</span>
                </li>
              ))}
            </ul>
          ) : null}
          {rows.length ? (
            <dl className={`grid grid-cols-2 gap-x-3 gap-y-4 ${bullets.length ? "mt-3" : ""}`}>
              {rows.map(([k, v]) => (
                <Pair key={k} k={k} v={v} />
              ))}
            </dl>
          ) : null}
        </div>
      ) : null}
    </section>
  )
}

/** Delivery time and return window, as far as they are known. */
export function TrustRow({ delivery, returnDays }) {
  const items = [
    delivery ? { icon: Truck, label: `Delivery in ${delivery}` } : null,
    returnDays ? { icon: RotateCcw, label: `${returnDays}-day Returns` } : null,
  ].filter(Boolean)
  if (!items.length) return null
  return (
    <section className="mt-2 flex w-full bg-white py-[14px]" aria-label="Delivery and returns">
      {items.map(({ icon: Icon, label }, i) => (
        <div key={label} className={`flex flex-1 flex-col items-center px-2 text-center ${i > 0 ? "border-l border-[#E2E2E2]" : ""}`}>
          <Icon className="h-[26px] w-[26px] text-app-brown" strokeWidth={1.6} aria-hidden="true" />
          <span className="mt-1.5 text-[12px] font-medium text-app-ink">{label}</span>
        </div>
      ))}
    </section>
  )
}
