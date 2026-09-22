import { useRef } from "react"
import { Link } from "react-router-dom"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { ProductTile } from "./ui"

const focus = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-wh-brand"

/** Full-width white strip: title, "See all", horizontal scroll row of product tiles. */
export default function ProductCarousel({ title, products = [], seeAllTo, mode, etaMinutes }) {
  const rowRef = useRef(null)
  if (!products.length) return null
  const scroll = (dir) => {
    const el = rowRef.current
    if (el) el.scrollBy({ left: dir * el.clientWidth * 0.9, behavior: "smooth" })
  }
  return (
    <section className="rounded-[8px] bg-wh-surface px-5 py-4 text-wh-text">
      <div className="mb-3 flex items-baseline gap-4">
        <h2 className="text-[21px] font-bold leading-7">{title}</h2>
        {seeAllTo ? (
          <Link to={seeAllTo} className={`text-[13px] text-wh-link hover:text-wh-link-hover hover:underline ${focus}`}>See all</Link>
        ) : null}
      </div>
      <div className="relative">
        <div ref={rowRef} className="flex gap-4 overflow-x-auto scroll-smooth pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {products.map((p) => (
            <div key={p._id} className="w-[200px] shrink-0">
              <ProductTile product={p} compact mode={mode} etaMinutes={etaMinutes} />
            </div>
          ))}
        </div>
        {products.length > 5 ? (
          <>
            <button type="button" onClick={() => scroll(-1)} aria-label={`Scroll ${title} left`}
              className={`absolute left-0 top-[70px] flex h-[100px] w-11 items-center justify-center rounded-r-[4px] border border-wh-border bg-wh-surface/90 shadow ${focus}`}>
              <ChevronLeft className="h-6 w-6" />
            </button>
            <button type="button" onClick={() => scroll(1)} aria-label={`Scroll ${title} right`}
              className={`absolute right-0 top-[70px] flex h-[100px] w-11 items-center justify-center rounded-l-[4px] border border-wh-border bg-wh-surface/90 shadow ${focus}`}>
              <ChevronRight className="h-6 w-6" />
            </button>
          </>
        ) : null}
      </div>
    </section>
  )
}
