import { useEffect, useState } from "react"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { isVideoUrl } from "@store/utils/mediaType"

const AUTO_MS = 5000

/**
 * Desktop hero: full-width banner carousel (~300px visible, the image runs
 * taller so the first card row can overlap it) whose bottom fades into
 * --wh-page. `banners` are the existing hero banners ({ imageUrl, ... }).
 */
export default function HeroCarousel({ banners = [], onOpen }) {
  const slides = banners.filter((b) => b && typeof b.imageUrl === "string" && b.imageUrl)
  const [index, setIndex] = useState(0)
  const count = slides.length

  useEffect(() => {
    if (index >= count) setIndex(0)
  }, [count, index])

  useEffect(() => {
    if (count <= 1) return undefined
    const t = setInterval(() => {
      if (typeof document === "undefined" || !document.hidden) setIndex((i) => (i + 1) % count)
    }, AUTO_MS)
    return () => clearInterval(t)
  }, [count, index])

  if (!count) {
    return <div className="h-[300px] bg-gradient-to-b from-wh-nav-3 to-wh-page" aria-hidden="true" />
  }

  const go = (d) => setIndex((i) => (i + d + count) % count)
  const current = slides[Math.min(index, count - 1)]
  const clickable = typeof onOpen === "function" && (current.linkedSellers?.length || 0) > 0

  return (
    <section className="relative h-[550px] w-full overflow-hidden bg-wh-page" aria-roledescription="carousel" aria-label="Featured">
      {slides.map((b, i) => {
        const active = i === index
        const common = `absolute inset-0 h-full w-full object-cover object-top transition-opacity duration-700 ${active ? "opacity-100" : "opacity-0"}`
        return isVideoUrl(b.imageUrl) ? (
          <video key={b.imageUrl + i} src={b.imageUrl} className={common} muted loop autoPlay={active} playsInline preload={active ? "auto" : "metadata"} aria-hidden={!active} />
        ) : (
          <img key={b.imageUrl + i} src={b.imageUrl} alt={b.title || b.name || `Banner ${i + 1}`} className={common} loading={i === 0 ? "eager" : "lazy"} aria-hidden={!active} />
        )
      })}
      {clickable ? (
        <button type="button" className="absolute inset-x-0 top-0 h-[260px] cursor-pointer focus-visible:outline-2 focus-visible:-outline-offset-4 focus-visible:outline-wh-brand" onClick={() => onOpen(current)} aria-label={`Open banner ${index + 1}`} />
      ) : null}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-[300px] bg-gradient-to-b from-transparent to-wh-page" />
      {count > 1 ? (
        <>
          <button type="button" onClick={() => go(-1)} aria-label="Previous banner"
            className="absolute left-0 top-0 flex h-[250px] w-20 items-center justify-center text-wh-text hover:outline hover:outline-1 hover:outline-white focus-visible:outline-2 focus-visible:outline-wh-brand">
            <ChevronLeft className="h-10 w-10" strokeWidth={1.5} />
          </button>
          <button type="button" onClick={() => go(1)} aria-label="Next banner"
            className="absolute right-0 top-0 flex h-[250px] w-20 items-center justify-center text-wh-text hover:outline hover:outline-1 hover:outline-white focus-visible:outline-2 focus-visible:outline-wh-brand">
            <ChevronRight className="h-10 w-10" strokeWidth={1.5} />
          </button>
        </>
      ) : null}
    </section>
  )
}
