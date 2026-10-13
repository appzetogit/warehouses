import { useEffect, useRef } from "react"
import { X } from "lucide-react"

/**
 * Full-screen photo viewer for the phone product page (the app's zoom
 * dialog): black backdrop, swipe between photos, pinch to zoom (the browser's
 * own pinch-zoom is allowed on the photos), close with X or Escape.
 */
export default function ImageZoomViewer({ images = [], startIndex = 0, alt = "", onClose }) {
  const strip = useRef(null)
  const closeBtn = useRef(null)

  useEffect(() => {
    const el = strip.current
    if (el) el.scrollLeft = el.clientWidth * startIndex
    closeBtn.current?.focus()
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = "hidden"
    const onKey = (e) => {
      if (e.key === "Escape") onClose()
    }
    window.addEventListener("keydown", onKey)
    return () => {
      document.body.style.overflow = prevOverflow
      window.removeEventListener("keydown", onKey)
    }
    // Opened once per tap; the start photo doesn't change while open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div role="dialog" aria-modal="true" aria-label="Product photos" className="fixed inset-0 z-[200] bg-black">
      <div
        ref={strip}
        className="flex h-full w-full snap-x snap-mandatory overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {images.map((src, i) => (
          <div key={src} className="flex h-full w-full shrink-0 snap-center items-center justify-center overflow-auto [touch-action:pan-x_pan-y_pinch-zoom]">
            <img src={src} alt={i === 0 ? alt : ""} className="max-h-full max-w-full object-contain" />
          </div>
        ))}
      </div>
      <button
        ref={closeBtn}
        type="button"
        onClick={onClose}
        aria-label="Close photos"
        className="absolute left-3 top-[max(12px,env(safe-area-inset-top))] flex h-10 w-10 items-center justify-center rounded-full bg-black/40 text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
      >
        <X className="h-6 w-6" aria-hidden="true" />
      </button>
    </div>
  )
}
