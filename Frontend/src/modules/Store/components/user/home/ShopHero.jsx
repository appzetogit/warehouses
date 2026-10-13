import { useEffect, useRef, useState } from "react"
import { Link } from "react-router-dom"
import { useStoreMode } from "@store/context/StoreModeContext"
import { mediaUrl } from "../desktop/desktopCart"

/**
 * The customer app's home hero (shop_home_screen.dart _Hero): one 2:1 slot,
 * 6px from the screen edges, radius 10. Banners crossfade every 5 seconds and
 * can be swiped; there are no dots. A banner with a title gets a dark shade,
 * the title, subtitle and a dark pill button; one without a title is finished
 * artwork and is shown clean.
 */

const INTERVAL = 5000
const SWIPE = 40

/** A banner's link: a full http(s) address opens in a new tab as written; a path stays in this store. */
function BannerLink({ link, storePath, children, ...rest }) {
  const target = String(link || "").trim() || "/categories"
  if (/^https?:\/\//i.test(target)) {
    return (
      <a href={target} target="_blank" rel="noopener noreferrer" {...rest}>
        {children}
      </a>
    )
  }
  return (
    <Link to={storePath(target)} {...rest}>
      {children}
    </Link>
  )
}

export default function ShopHero({ banners = [], loading = false }) {
  const { storePath } = useStoreMode()
  const slides = banners.filter((b) => b?.imageUrl)
  const [index, setIndex] = useState(0)
  const touch = useRef(null)
  const swiped = useRef(false)
  const count = slides.length
  const active = count ? index % count : 0

  // Restarts on every change, so a swipe gets a full 5 seconds too.
  useEffect(() => {
    if (count < 2) return undefined
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches) return undefined
    const timer = setTimeout(() => {
      if (!document.hidden) setIndex((i) => (i + 1) % count)
    }, INTERVAL)
    return () => clearTimeout(timer)
  }, [index, count])

  if (!count) {
    return loading ? <div aria-hidden="true" className="mx-1.5 aspect-[2/1] rounded-[10px] bg-app-line" /> : null
  }

  const onTouchStart = (e) => {
    const t = e.touches[0]
    touch.current = { x: t.clientX, y: t.clientY }
    swiped.current = false
  }
  const onTouchEnd = (e) => {
    const start = touch.current
    touch.current = null
    if (!start || count < 2) return
    const t = e.changedTouches[0]
    const dx = t.clientX - start.x
    if (Math.abs(dx) < SWIPE || Math.abs(dx) < Math.abs(t.clientY - start.y)) return
    swiped.current = true
    setIndex((i) => (dx < 0 ? (i + 1) % count : (i - 1 + count) % count))
  }

  return (
    <section
      aria-label="Offers"
      aria-roledescription="carousel"
      className="relative mx-1.5 aspect-[2/1] touch-pan-y overflow-hidden rounded-[10px] bg-app-line"
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      {slides.map((b, i) => {
        const on = i === active
        const title = String(b.title || "").trim()
        return (
          <BannerLink
            key={`${b.imageUrl}-${i}`}
            link={b.ctaLink}
            storePath={storePath}
            aria-hidden={on ? undefined : true}
            tabIndex={on ? undefined : -1}
            aria-label={title ? undefined : b.ctaText || `Offer ${i + 1} of ${count}`}
            onClick={(e) => {
              // A swipe ends on the slide; it should not also open it.
              if (swiped.current) {
                e.preventDefault()
                swiped.current = false
              }
            }}
            className={`absolute inset-0 block transition-opacity duration-[600ms] ease-in-out ${
              on ? "z-10 opacity-100" : "pointer-events-none z-0 opacity-0"
            }`}
          >
            <img
              src={mediaUrl(b.imageUrl)}
              alt=""
              loading={i === 0 ? "eager" : "lazy"}
              draggable={false}
              className="h-full w-full object-cover"
            />
            {title ? (
              <>
                <span aria-hidden="true" className="absolute inset-0 bg-[linear-gradient(90deg,rgba(0,0,0,0.7),transparent)]" />
                <span className="absolute inset-y-0 left-0 flex w-[68%] flex-col justify-center gap-1.5 p-4 font-app">
                  <span className="line-clamp-2 text-[22px] font-extrabold leading-[1.1] text-white">{title}</span>
                  {b.subtitle ? <span className="line-clamp-2 text-[11.5px] leading-snug text-white/90">{b.subtitle}</span> : null}
                  <span className="mt-1 inline-flex w-fit items-center gap-1 rounded-full bg-app-ink px-3.5 py-1.5 text-[12px] font-bold text-white">
                    {b.ctaText || "Shop Now"} <span aria-hidden="true">→</span>
                  </span>
                </span>
              </>
            ) : null}
          </BannerLink>
        )
      })}
    </section>
  )
}
