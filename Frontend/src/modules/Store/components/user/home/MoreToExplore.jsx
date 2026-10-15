import { useEffect, useMemo, useRef, useState } from "react"
import { ArrowUpDown, Check, LayoutGrid, X } from "lucide-react"
import ProductTile from "../mobile/ProductTile"
import AppSectionHeading from "./AppSectionHeading"
import { productOff, productPrice } from "./homeCatalogue"

/**
 * The app's "More to Explore" (shop_home_screen.dart ~:1758-1930): on the
 * cream band, a row of category chips that filter the grid below, a Sort chip
 * with a small sheet, and a two-column grid of product cards, 24 at a time.
 * From lg (desktop home) the grid has five columns (six from xl) and the sort
 * sheet opens as a small centred dialog.
 */

const PAGE = 24
const SORTS = [
  { id: "relevance", label: "Relevance" },
  { id: "price-asc", label: "Price: low to high" },
  { id: "price-desc", label: "Price: high to low" },
  { id: "discount", label: "Biggest discount" },
]

const chipBase =
  "flex h-[38px] shrink-0 items-center gap-1.5 rounded-[22px] px-4 text-[12.5px] font-semibold shadow-[0_2px_6px_rgba(25,20,17,0.08)] transition-colors"
const chipOn = "bg-app-brown-chip text-white"
const chipOff = "bg-white text-app-ink lg:hover:bg-app-tint"

function SortSheet({ value, onPick, onClose }) {
  const first = useRef(null)
  const close = useRef(onClose)
  close.current = onClose
  useEffect(() => {
    first.current?.focus()
    const onKey = (e) => e.key === "Escape" && close.current()
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])
  return (
    <div className="fixed inset-0 z-[80] flex items-end bg-black/40 font-app lg:items-center lg:justify-center" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="explore-sort-title"
        className="w-full rounded-t-[20px] bg-white px-4 pb-[calc(16px+env(safe-area-inset-bottom))] pt-3 lg:w-[380px] lg:rounded-[20px] lg:px-5 lg:pb-4 lg:shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-2 flex items-center justify-between">
          <h3 id="explore-sort-title" className="text-[15px] font-bold text-app-ink">
            Sort by
          </h3>
          <button type="button" aria-label="Close" onClick={onClose} className="flex h-9 w-9 items-center justify-center rounded-full text-app-muted">
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>
        <ul role="radiogroup" aria-labelledby="explore-sort-title">
          {SORTS.map((s, i) => {
            const on = s.id === value
            return (
              <li key={s.id}>
                <button
                  ref={i === 0 ? first : undefined}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => onPick(s.id)}
                  className={`flex w-full items-center justify-between border-b border-app-line py-3 text-left text-[13.5px] ${
                    on ? "font-bold text-app-brown" : "text-app-ink"
                  }`}
                >
                  {s.label}
                  {on ? <Check className="h-4 w-4" aria-hidden="true" /> : null}
                </button>
              </li>
            )
          })}
        </ul>
      </div>
    </div>
  )
}

export default function MoreToExplore({ products = [] }) {
  const [filter, setFilter] = useState("")
  const [sort, setSort] = useState("relevance")
  const [shown, setShown] = useState(PAGE)
  const [sheetOpen, setSheetOpen] = useState(false)

  // Categories by how many products they have here.
  const chips = useMemo(() => {
    const count = new Map()
    for (const p of products) {
      const name = String(p?.categoryName || "").trim()
      if (name) count.set(name, (count.get(name) || 0) + 1)
    }
    return [...count.entries()].sort((a, b) => b[1] - a[1]).map(([name]) => name)
  }, [products])

  const list = useMemo(() => {
    const picked = filter ? products.filter((p) => String(p?.categoryName || "").trim() === filter) : products
    if (sort === "relevance") return picked
    const sorted = [...picked]
    if (sort === "price-asc") sorted.sort((a, b) => productPrice(a) - productPrice(b))
    if (sort === "price-desc") sorted.sort((a, b) => productPrice(b) - productPrice(a))
    if (sort === "discount") sorted.sort((a, b) => productOff(b) - productOff(a))
    return sorted
  }, [products, filter, sort])

  if (!products.length) return null

  const pick = (name) => {
    setFilter(name)
    setShown(PAGE)
  }

  return (
    <section aria-label="More to explore" className="bg-app-cream pb-6 pt-7 font-app">
      <AppSectionHeading title="More to Explore" subtitle="Fresh picks from across the store" />
      <div className="flex items-center gap-2 pb-3 pl-4 pr-4 pt-1 lg:px-0 lg:pb-5">
        <div className="flex min-w-0 flex-1 gap-2 overflow-x-auto py-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <button type="button" aria-pressed={!filter} onClick={() => pick("")} className={`${chipBase} ${!filter ? chipOn : chipOff}`}>
            <LayoutGrid className={`h-4 w-4 ${!filter ? "" : "text-app-brown-chip"}`} aria-hidden="true" />
            All
          </button>
          {chips.map((name) => (
            <button
              key={name}
              type="button"
              aria-pressed={filter === name}
              onClick={() => pick(name)}
              className={`${chipBase} ${filter === name ? chipOn : chipOff}`}
            >
              {name}
            </button>
          ))}
        </div>
        {/* Sort stays in reach however far the chips scroll. */}
        <button type="button" aria-haspopup="dialog" onClick={() => setSheetOpen(true)} className={`${chipBase} ${sort !== "relevance" ? chipOn : chipOff}`}>
          <ArrowUpDown className={`h-4 w-4 ${sort !== "relevance" ? "" : "text-app-brown-chip"}`} aria-hidden="true" />
          Sort
        </button>
      </div>
      <div className="grid grid-cols-2 gap-3 px-4 lg:grid-cols-5 lg:gap-4 lg:px-0 xl:grid-cols-6">
        {list.slice(0, shown).map((p) => (
          <ProductTile key={p._id} product={p} />
        ))}
      </div>
      {list.length > shown ? (
        <div className="mt-5 flex justify-center px-4">
          <button
            type="button"
            onClick={() => setShown((n) => n + PAGE)}
            className="h-10 rounded-full border border-app-brown px-6 text-[13px] font-bold text-app-brown active:scale-[0.98] lg:h-11 lg:px-8 lg:transition-colors lg:hover:bg-app-brown lg:hover:text-white"
          >
            Show more
          </button>
        </div>
      ) : null}
      {sheetOpen ? (
        <SortSheet
          value={sort}
          onClose={() => setSheetOpen(false)}
          onPick={(id) => {
            setSort(id)
            setShown(PAGE)
            setSheetOpen(false)
          }}
        />
      ) : null}
    </section>
  )
}
