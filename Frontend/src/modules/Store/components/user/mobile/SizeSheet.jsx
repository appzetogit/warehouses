import { useEffect } from "react"
import { createPortal } from "react-dom"
import { X } from "lucide-react"

/**
 * The size choice a phone opens from a product tile's Add: a sheet from the
 * bottom with every size of the product, sold-out ones struck through.
 * Picking one adds that size. Closes on the backdrop, ×, or Escape.
 *
 * options: [{ key, label, ok, variant }]
 */
export default function SizeSheet({ title, optionName = "size", price, options = [], onPick, onClose }) {
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

  return createPortal(
    <div className="fixed inset-0 z-[120] flex items-end justify-center" role="dialog" aria-modal="true" aria-label={`Choose a ${optionName}`}>
      <button type="button" aria-label="Close" onClick={onClose} className="absolute inset-0 bg-black/40" />
      <div className="relative w-full max-w-md rounded-t-2xl bg-white px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 shadow-2xl">
        <span aria-hidden="true" className="mx-auto mb-3 block h-1 w-10 rounded-full bg-gray-200" />
        <div className="mb-3 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[15px] font-bold text-gray-900">Select {optionName}</p>
            <p className="line-clamp-1 text-[12px] text-gray-500">
              {title}
              {price ? ` · ₹${Number(price).toLocaleString("en-IN")}` : ""}
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-full p-1 text-gray-500 active:bg-gray-100">
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>
        <div className="flex flex-wrap gap-2 pb-2">
          {options.map((o) => (
            <button
              key={o.key}
              type="button"
              disabled={!o.ok}
              onClick={() => onPick(o)}
              className={`min-w-[52px] rounded-xl border px-3 py-2.5 text-[14px] font-semibold transition-colors ${
                o.ok
                  ? "border-gray-300 text-gray-900 active:border-[#0D9488] active:bg-[#F0FDFA]"
                  : "cursor-not-allowed border-dashed border-gray-200 text-gray-400 line-through"
              }`}
            >
              {o.label}
            </button>
          ))}
        </div>
      </div>
    </div>,
    document.body,
  )
}
