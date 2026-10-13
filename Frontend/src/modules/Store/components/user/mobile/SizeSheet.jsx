import { useEffect } from "react"
import { createPortal } from "react-dom"
import { X } from "lucide-react"

/**
 * The size choice a phone opens from a product tile's Add, styled after the
 * customer app's "SELECT PREFERENCES" sheet: a sheet from the bottom with every
 * size (or variant) of the product as chips, sold-out ones struck through.
 * Picking one adds that size. Closes on the backdrop, ×, or Escape.
 *
 * options: [{ key, label, ok, variant }]
 * selected: the key of the option already picked on this tile, if any.
 */
export default function SizeSheet({ title, optionName = "size", price, options = [], selected = "", onPick, onClose }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose() }
    document.addEventListener("keydown", onKey)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      document.removeEventListener("keydown", onKey)
      document.body.style.overflow = prevOverflow
    }
  }, [onClose])

  const groupLabel = optionName === "size" ? "Select Size" : `Select ${optionName.charAt(0).toUpperCase()}${optionName.slice(1)}`

  return createPortal(
    <div className="fixed inset-0 z-[120] flex items-end justify-center font-app" role="dialog" aria-modal="true" aria-label={`Choose a ${optionName}`}>
      <button type="button" aria-label="Close" onClick={onClose} className="absolute inset-0 bg-black/40" />
      <div className="relative w-full max-w-md rounded-t-[24px] bg-[#FFFCFA] pb-[max(1rem,env(safe-area-inset-bottom))] shadow-2xl">
        <span aria-hidden="true" className="mx-auto mt-2.5 block h-1 w-10 rounded-full bg-app-line" />
        <div className="flex items-center justify-between gap-3 py-1 pl-4 pr-1.5">
          <p className="text-[13.5px] font-semibold uppercase tracking-[0.4px] text-app-ink">Select Preferences</p>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-10 w-10 items-center justify-center rounded-full text-app-ink active:bg-app-alt"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>
        <div className="h-px bg-app-line" />
        <div className="p-4">
          <p className="line-clamp-1 text-[12px] text-app-muted">
            {title}
            {price ? ` · ₹${Number(price).toLocaleString("en-IN")}` : ""}
          </p>
          <p className="mb-2.5 mt-3 text-[13px] font-semibold text-app-ink">{groupLabel}</p>
          <div className="flex flex-wrap gap-2">
            {options.map((o) => {
              const isOn = selected !== "" && String(o.key) === String(selected)
              return (
                <button
                  key={o.key}
                  type="button"
                  disabled={!o.ok}
                  aria-pressed={isOn}
                  onClick={() => onPick(o)}
                  className={`min-w-[48px] rounded-lg px-4 py-2 text-[12px] transition-colors ${
                    !o.ok
                      ? "cursor-not-allowed border border-app-line bg-white font-semibold text-[#BDB5AE] line-through"
                      : isOn
                        ? "border-[1.5px] border-app-brown bg-app-tint font-extrabold text-app-brown"
                        : "border border-app-line bg-white font-semibold text-app-ink active:border-[1.5px] active:border-app-brown active:bg-app-tint active:font-extrabold active:text-app-brown"
                  }`}
                >
                  {o.label}
                </button>
              )
            })}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}
