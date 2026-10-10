import { useEffect, useRef } from "react"
import { X } from "lucide-react"
import { channelAvailability } from "@store/utils/channelStock"

/**
 * The size (or colour) choice a product card opens from its Add to Cart, so
 * the customer picks and adds without leaving the list. Sold-out options are
 * shown but can't be picked. Closes on Escape, on a click outside, or with ×.
 */
export default function CardSizePicker({ product, channel = "shop", onPick, onClose, triggerRef = null }) {
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
    ref.current?.querySelector("button:not([disabled])")?.focus()
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
      className="absolute inset-x-2 bottom-2 z-20 rounded-xl border border-wh-border bg-wh-surface p-2.5 shadow-xl"
      onClick={(e) => { e.preventDefault(); e.stopPropagation() }}
    >
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[12px] font-bold text-wh-text">Select {optionName.toLowerCase()}</span>
        <button type="button" onClick={onClose} aria-label="Close" className="rounded-full p-0.5 text-wh-muted hover:bg-wh-page hover:text-wh-text">
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {variants.map((v) => {
          const { inStock } = channelAvailability(product, channel, v)
          const label = v.name || (v.attributes || []).map((a) => a.value).join(" / ")
          return (
            <button
              key={v._id || v.id || label}
              type="button"
              disabled={!inStock}
              onClick={() => onPick(v)}
              title={inStock ? label : `${label} — sold out`}
              className={`min-w-[40px] rounded-lg border px-2.5 py-1.5 text-[12px] font-semibold transition-colors ${
                inStock
                  ? "border-wh-border text-wh-text hover:border-[#ea580c] hover:bg-[#fff4e5] hover:text-[#b45309]"
                  : "cursor-not-allowed border-dashed border-wh-border text-wh-muted line-through opacity-60"
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
