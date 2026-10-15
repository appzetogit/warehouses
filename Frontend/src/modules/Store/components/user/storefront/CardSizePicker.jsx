import { useEffect, useRef } from "react"
import { X } from "lucide-react"
import { channelAvailability } from "@store/utils/channelStock"

/**
 * The size (or colour) choice a product card opens from its Add to Cart, so
 * the customer picks and adds without leaving the list. Styled as the
 * customer app's "SELECT PREFERENCES" sheet: brown-outlined chips on a tint
 * for the chosen one, sold-out options struck through and not pickable.
 * Closes on Escape, on a click outside, or with ×.
 *
 * `selectedId`: the variant last added from this card, shown as chosen.
 */
export default function CardSizePicker({ product, channel = "shop", onPick, onClose, triggerRef = null, selectedId = "" }) {
  const ref = useRef(null)
  const variants = (Array.isArray(product?.variants) ? product.variants : []).filter((v) => v && v.isActive !== false)
  const optionName = variants[0]?.attributes?.[0]?.name || "size"

  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose() }
    const onDown = (e) => {
      if (!ref.current || ref.current.contains(e.target)) return
      // The button that opened the picker toggles it itself: closing here too
      // would let its click open it straight back up.
      if (triggerRef?.current && triggerRef.current.contains(e.target)) return
      onClose()
    }
    document.addEventListener("keydown", onKey)
    document.addEventListener("mousedown", onDown)
    ref.current?.querySelector("button[data-option]:not([disabled])")?.focus()
    return () => {
      document.removeEventListener("keydown", onKey)
      document.removeEventListener("mousedown", onDown)
    }
  }, [onClose, triggerRef])

  return (
    <div
      ref={ref}
      role="dialog"
      aria-label={`Choose a ${optionName.toLowerCase()} for ${product?.name || "this product"}`}
      className="absolute inset-x-[5px] bottom-[5px] z-20 rounded-[12px] border border-app-line bg-white p-3 font-app shadow-[0_-4px_18px_rgba(25,20,17,0.14)]"
      onClick={(e) => { e.preventDefault(); e.stopPropagation() }}
    >
      <div className="mb-2.5 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[10.5px] font-bold uppercase tracking-[1.2px] text-app-muted">Select preferences</p>
          <p className="mt-0.5 text-[13px] font-bold capitalize text-app-ink">{optionName.toLowerCase()}</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="-mr-1 -mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-app-muted transition-colors hover:bg-app-alt hover:text-app-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app-brown"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
      <div className="flex max-h-[132px] flex-wrap gap-1.5 overflow-y-auto">
        {variants.map((v) => {
          const { inStock } = channelAvailability(product, channel, v)
          const label = v.name || (v.attributes || []).map((a) => a.value).join(" / ")
          const vid = String(v._id || v.id || "")
          const selected = Boolean(selectedId) && vid === String(selectedId)
          return (
            <button
              key={vid || label}
              data-option=""
              type="button"
              disabled={!inStock}
              onClick={() => onPick(v)}
              aria-pressed={selected}
              title={inStock ? label : `${label} — sold out`}
              aria-label={inStock ? undefined : `${label} (sold out)`}
              className={`min-w-[42px] rounded-lg px-2.5 py-1.5 text-[12px] transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app-brown ${
                !inStock
                  ? "cursor-not-allowed border border-app-line bg-app-alt font-semibold text-[#BDB5AE] line-through"
                  : selected
                    ? "border-[1.5px] border-app-brown bg-app-tint font-extrabold text-app-brown"
                    : "border border-app-line bg-white font-semibold text-app-ink hover:border-app-brown hover:bg-app-tint hover:text-app-brown"
              }`}
            >
              {label}
            </button>
          )
        })}
      </div>
    </div>
  )
}
