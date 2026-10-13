import { useEffect, useMemo, useRef, useState } from "react"
import { Check, Search, X } from "lucide-react"

/**
 * The "Sort & filter" bottom sheet, styled as the customer app's
 * (warehouse_user sort_filter_sheet.dart): sort as radio rows, then price
 * range, size, colour and brand, with "Clear all" and a live "Show N results".
 *
 * It edits a draft and hands it back on apply, so closing it changes nothing.
 * Options come from the search API's facets; `countFor(draft)` returns how
 * many products the draft would show.
 *
 * `section` picks what opens: "sort" is a short sort-only sheet that applies
 * on tap (the app's floating bar "Sort"); "brand" and "price" open the full
 * sheet scrolled to that part; anything else opens it at the top.
 */

export const EMPTY_MOBILE_FILTERS = { brands: [], sizes: [], colours: [], minPrice: null, maxPrice: null }

export const activeFilterCount = (f) =>
  f.brands.length + f.sizes.length + f.colours.length + (f.minPrice != null || f.maxPrice != null ? 1 : 0)

function Section({ id, title, children, extra = null }) {
  return (
    <section id={id} className="border-b border-app-line px-5 py-4 last:border-b-0">
      {title ? (
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-[15px] font-semibold text-app-ink">{title}</h3>
          {extra}
        </div>
      ) : null}
      {children}
    </section>
  )
}

function RadioRow({ label, selected, onSelect, name }) {
  return (
    <label className="flex min-h-[44px] cursor-pointer items-center gap-3 rounded-lg py-2.5 text-[14px] text-app-ink">
      <span className={`flex-1 ${selected ? "font-bold" : "font-medium"}`}>{label}</span>
      <input type="radio" name={name} checked={selected} onChange={onSelect} className="peer sr-only" />
      <span
        aria-hidden="true"
        className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-app-brown ${
          selected ? "border-app-brown" : "border-app-muted"
        }`}
      >
        {selected ? <span className="h-2.5 w-2.5 rounded-full bg-app-brown" /> : null}
      </span>
    </label>
  )
}

const toggle = (list, value) => (list.includes(value) ? list.filter((v) => v !== value) : [...list, value])

const thumb =
  "[&::-webkit-slider-thumb]:border-app-brown! [&::-moz-range-thumb]:border-app-brown! focus-visible:outline-none [&:focus-visible::-webkit-slider-thumb]:ring-2 [&:focus-visible::-webkit-slider-thumb]:ring-app-champagne"

export default function FilterSheet({
  open,
  onClose,
  value,
  onApply,
  facets,
  swatches = {},
  countFor,
  sorts = [],
  sort = "relevance",
  section = "all",
}) {
  const [draft, setDraft] = useState(value)
  const [sortDraft, setSortDraft] = useState(sort)
  const [brandQuery, setBrandQuery] = useState("")
  const [count, setCount] = useState(null)
  const bodyRef = useRef(null)
  const sortOnly = section === "sort"

  useEffect(() => {
    if (open) {
      setDraft(value)
      setSortDraft(sort)
    }
  }, [open, value, sort])

  // A light count request as the draft changes, so the button tells the truth.
  useEffect(() => {
    if (!open || sortOnly || !countFor) return undefined
    let cancelled = false
    const timer = setTimeout(() => {
      Promise.resolve(countFor(draft))
        .then((n) => !cancelled && setCount(Number.isFinite(n) ? n : null))
        .catch(() => !cancelled && setCount(null))
    }, 250)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [open, sortOnly, draft, countFor])

  useEffect(() => {
    if (!open) return undefined
    const onKey = (e) => e.key === "Escape" && onClose()
    document.addEventListener("keydown", onKey)
    const overflow = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      document.removeEventListener("keydown", onKey)
      document.body.style.overflow = overflow
    }
  }, [open, onClose])

  // "Brand" and "Price" on the floating bar open the sheet at that part.
  useEffect(() => {
    if (!open || sortOnly) return
    const target = section === "brand" || section === "price" ? bodyRef.current?.querySelector(`#wh-filter-${section}`) : null
    if (target && bodyRef.current) bodyRef.current.scrollTop = target.offsetTop - 8
  }, [open, sortOnly, section])

  const attr = (name) =>
    (facets?.attributes || []).find((a) => String(a.name).toLowerCase() === name)?.values || []
  const sizes = attr("size")
  const colours = attr("colour").length ? attr("colour") : attr("color")
  const brands = useMemo(
    () =>
      (facets?.brands || []).filter((b) => String(b.value).toLowerCase().includes(brandQuery.trim().toLowerCase())),
    [facets, brandQuery],
  )
  const range = facets?.priceRange || { min: 0, max: 0 }
  const lo = draft.minPrice ?? range.min
  const hi = draft.maxPrice ?? range.max
  const span = Math.max(1, range.max - range.min)

  if (!open) return null

  const title = sortOnly ? "Sort by" : "Sort & filter"

  return (
    <div className="fixed inset-0 z-[95] font-app lg:hidden" role="dialog" aria-modal="true" aria-labelledby="wh-filter-title">
      <button type="button" aria-label="Close" onClick={onClose} className="wh-reveal is-visible absolute inset-0 bg-black/40" />
      <div className="wh-slide-up-bar absolute inset-x-0 bottom-0 flex max-h-[88dvh] flex-col rounded-t-[24px] bg-white text-app-ink shadow-[0_-4px_24px_rgba(0,0,0,0.12)]">
        <div className="mx-auto mt-2.5 h-1 w-10 shrink-0 rounded-full bg-app-line" aria-hidden="true" />
        <div className="flex shrink-0 items-start gap-2 px-5 pb-2 pt-3">
          <div className="min-w-0 flex-1">
            <h2 id="wh-filter-title" className="text-[16px] font-bold leading-tight text-app-ink">{title}</h2>
            {sortOnly ? null : <p className="mt-0.5 text-[12.5px] text-app-muted">Narrow it down to exactly what you need</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="-mr-2 -mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-app-ink active:bg-app-alt focus-visible:outline-2 focus-visible:outline-app-brown"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        <div ref={bodyRef} className="relative min-h-0 flex-1 overflow-y-auto overscroll-contain">
          {sorts.length ? (
            <Section id="wh-filter-sort" title={sortOnly ? "" : "Sort by"}>
              <fieldset>
                <legend className="sr-only">Sort by</legend>
                {sorts.map(([key, label]) => (
                  <RadioRow
                    key={key}
                    name="wh-sort"
                    label={label}
                    selected={sortDraft === key}
                    onSelect={() => {
                      setSortDraft(key)
                      // The short sort sheet applies at once, as in the app.
                      if (sortOnly) {
                        onApply(value, key)
                        onClose()
                      }
                    }}
                  />
                ))}
              </fieldset>
            </Section>
          ) : null}

          {!sortOnly && range.max > range.min ? (
            <Section
              id="wh-filter-price"
              title="Price range"
              extra={<span className="text-[12.5px] font-semibold text-app-ink">₹{lo.toLocaleString("en-IN")} – ₹{hi.toLocaleString("en-IN")}</span>}
            >
              <div className="relative h-8">
                <span className="absolute left-0 right-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-app-line" />
                <span
                  className="absolute top-1/2 h-1 -translate-y-1/2 rounded-full bg-app-brown"
                  style={{ left: `${((lo - range.min) / span) * 100}%`, right: `${100 - ((hi - range.min) / span) * 100}%` }}
                />
                <input
                  type="range"
                  aria-label="Lowest price"
                  min={range.min}
                  max={range.max}
                  value={lo}
                  onChange={(e) => setDraft((d) => ({ ...d, minPrice: Math.min(Number(e.target.value), hi) }))}
                  className={`wh-range absolute inset-0 w-full ${thumb}`}
                />
                <input
                  type="range"
                  aria-label="Highest price"
                  min={range.min}
                  max={range.max}
                  value={hi}
                  onChange={(e) => setDraft((d) => ({ ...d, maxPrice: Math.max(Number(e.target.value), lo) }))}
                  className={`wh-range absolute inset-0 w-full ${thumb}`}
                />
              </div>
            </Section>
          ) : null}

          {!sortOnly && sizes.length ? (
            <Section id="wh-filter-size" title="Size">
              <div className="flex flex-wrap gap-2">
                {sizes.map((s) => {
                  const on = draft.sizes.includes(s.value)
                  return (
                    <button
                      key={s.value}
                      type="button"
                      aria-pressed={on}
                      onClick={() => setDraft((d) => ({ ...d, sizes: toggle(d.sizes, s.value) }))}
                      className={`min-w-[44px] rounded-full border px-3.5 py-2 text-[13px] font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app-brown ${
                        on ? "border-app-brown bg-app-brown/10 text-app-brown" : "border-app-line bg-app-alt text-app-ink"
                      }`}
                    >
                      {s.value}
                    </button>
                  )
                })}
              </div>
            </Section>
          ) : null}

          {!sortOnly && colours.length ? (
            <Section id="wh-filter-colour" title="Colour">
              <div className="flex flex-wrap gap-3">
                {colours.map((c) => {
                  const on = draft.colours.includes(c.value)
                  const hex = swatches[String(c.value).toLowerCase()] || "#d1d5db"
                  return (
                    <button
                      key={c.value}
                      type="button"
                      aria-pressed={on}
                      aria-label={`${c.value} (${c.count})`}
                      onClick={() => setDraft((d) => ({ ...d, colours: toggle(d.colours, c.value) }))}
                      className="flex flex-col items-center gap-1 rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app-brown"
                    >
                      <span
                        className={`flex h-9 w-9 items-center justify-center rounded-full border ${on ? "ring-2 ring-app-brown ring-offset-2" : "border-app-line"}`}
                        style={{ background: hex }}
                      >
                        {on ? <Check className={`h-4 w-4 ${/^#f|^#e|^#d/i.test(hex) ? "text-app-ink" : "text-white"}`} aria-hidden="true" /> : null}
                      </span>
                      <span className="text-[10.5px] text-app-muted">{c.value}</span>
                    </button>
                  )
                })}
              </div>
            </Section>
          ) : null}

          {!sortOnly && (facets?.brands || []).length ? (
            <Section id="wh-filter-brand" title="Brand">
              <label className="mb-3 flex h-10 items-center gap-2 rounded-full border border-app-line bg-app-alt px-3.5 focus-within:ring-2 focus-within:ring-app-champagne">
                <Search className="h-4 w-4 text-app-muted" aria-hidden="true" />
                <span className="sr-only">Search brand</span>
                <input
                  value={brandQuery}
                  onChange={(e) => setBrandQuery(e.target.value)}
                  placeholder="Search brand..."
                  className="min-w-0 flex-1 bg-transparent text-[13px] text-app-ink placeholder:text-app-muted focus:outline-none"
                />
              </label>
              <div className="grid grid-cols-2 gap-x-3 gap-y-2.5">
                {brands.map((b) => {
                  const on = draft.brands.includes(b.value)
                  return (
                    <label key={b.value} className="flex cursor-pointer items-center gap-2 text-[13px] text-app-ink">
                      <input
                        type="checkbox"
                        checked={on}
                        onChange={() => setDraft((d) => ({ ...d, brands: toggle(d.brands, b.value) }))}
                        className="h-4 w-4 accent-app-brown"
                      />
                      <span className={`truncate ${on ? "font-semibold" : ""}`}>{b.value}</span>
                      <span className="text-[11px] text-app-muted">({b.count})</span>
                    </label>
                  )
                })}
                {!brands.length ? <p className="col-span-2 text-[12.5px] text-app-muted">No brand matches “{brandQuery.trim()}”.</p> : null}
              </div>
            </Section>
          ) : null}
        </div>

        {sortOnly ? (
          <div className="h-[max(12px,env(safe-area-inset-bottom))] shrink-0" />
        ) : (
          <div className="flex shrink-0 gap-3 border-t border-app-line px-5 pb-[max(16px,env(safe-area-inset-bottom))] pt-3">
            <button
              type="button"
              onClick={() => {
                // As in the app: clearing applies straight away.
                onApply(EMPTY_MOBILE_FILTERS, "relevance")
                onClose()
              }}
              className="h-12 flex-1 rounded-full border border-app-brown text-[14px] font-bold text-app-brown active:bg-app-tint focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app-brown"
            >
              Clear all
            </button>
            <button
              type="button"
              onClick={() => {
                onApply(draft, sortDraft)
                onClose()
              }}
              className="h-12 flex-[2] rounded-full bg-app-brown text-[14px] font-bold text-white shadow-[0_4px_12px_rgba(88,50,29,0.25)] active:scale-[0.99] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app-brown"
            >
              {count == null ? "Show results" : count ? `Show ${count.toLocaleString("en-IN")} result${count === 1 ? "" : "s"}` : "No products match"}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
