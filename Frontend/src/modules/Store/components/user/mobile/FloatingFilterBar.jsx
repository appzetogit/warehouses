import { useEffect } from "react"
import { ArrowUpDown, IndianRupee, SlidersHorizontal, Tag } from "lucide-react"

/**
 * The customer app's floating pill (sub_category_screen.dart _FilterBar):
 * Sort | Brand | Price | Filters (n), each an icon over a label, brown when
 * that part is in use. It floats above the phone's tab bar.
 *
 * `onOpen(section)` gets "sort", "brand", "price" or "all".
 */
export default function FloatingFilterBar({ sortActive, brandActive, priceActive, filterCount, onOpen }) {
  // The floating Spin / assistant buttons would sit on this bar; like the
  // app, listing pages don't show them on phones while the bar is up.
  useEffect(() => {
    const root = document.documentElement
    root.setAttribute("data-filter-bar", "")
    return () => root.removeAttribute("data-filter-bar")
  }, [])
  const item = (Icon, label, section, active, ariaLabel = label) => (
    <button
      type="button"
      onClick={() => onOpen(section)}
      aria-label={ariaLabel}
      aria-haspopup="dialog"
      className={`flex min-w-0 flex-1 flex-col items-center justify-center rounded-[20px] py-2 active:bg-app-alt focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-app-brown ${
        active ? "text-app-brown" : "text-app-ink"
      }`}
    >
      <Icon className="h-6 w-6" strokeWidth={active ? 2.2 : 1.8} aria-hidden="true" />
      <span className={`mt-0.5 max-w-full truncate text-[12px] leading-tight ${active ? "font-semibold" : ""}`}>{label}</span>
    </button>
  )

  return (
    <div
      role="toolbar"
      aria-label="Sort and filter"
      className="fixed inset-x-4 bottom-[calc(84px+env(safe-area-inset-bottom))] z-[70] flex items-center rounded-[32px] bg-white px-2 font-app shadow-[0_4px_16px_rgba(0,0,0,0.2)] md:bottom-[calc(16px+env(safe-area-inset-bottom))] lg:hidden"
    >
      {item(ArrowUpDown, "Sort", "sort", sortActive, sortActive ? "Sort (changed)" : "Sort")}
      {item(Tag, "Brand", "brand", brandActive)}
      {item(IndianRupee, "Price", "price", priceActive)}
      <span className="mx-1 h-9 w-px shrink-0 bg-app-line" aria-hidden="true" />
      {item(
        SlidersHorizontal,
        filterCount ? `Filters (${filterCount})` : "Filters",
        "all",
        filterCount > 0,
        filterCount ? `Filters, ${filterCount} applied` : "Filters",
      )}
    </div>
  )
}
