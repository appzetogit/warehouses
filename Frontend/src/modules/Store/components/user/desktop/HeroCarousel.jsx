import { useEffect, useState } from "react"
import { Link } from "react-router-dom"
import { ChevronLeft, ChevronRight, ArrowRight, Truck, ShieldCheck, RotateCcw } from "lucide-react"
import { useStoreMode } from "@store/context/StoreModeContext"
import { isVideoUrl } from "@store/utils/mediaType"

const AUTO_MS = 6000

const DEFAULT_SLIDES = [
  {
    imageUrl: "/hero-boutique.jpg",
    tag: "NEW SEASON COLLECTION",
    title: "Style That\nMoves With You",
    subtitle: "Trendy styles. Everyday comfort. Unbeatable prices.",
    ctaText: "Shop Now",
    ctaLink: "/categories",
  },
]

/**
 * A banner with no title is finished artwork (a sale poster with its own
 * lettering): it is shown whole, over a blurred copy of itself, with no
 * headline laid on top, and the whole slide links to its target.
 */
const isArtwork = (b) => Boolean(b?.imageUrl) && !String(b?.title || "").trim()

/** A banner link: a full http(s) address opens in a new tab as written; a path stays in this store. */
function BannerLink({ link, storePath, children, ...rest }) {
  const target = String(link || "").trim() || "/categories"
  if (/^https?:\/\//i.test(target)) {
    return <a href={target} target="_blank" rel="noopener noreferrer" {...rest}>{children}</a>
  }
  return <Link to={storePath(target)} {...rest}>{children}</Link>
}

export default function HeroCarousel({ banners = [], onOpen }) {
  const { storePath } = useStoreMode()
  const rawSlides = banners.filter((b) => b && typeof b.imageUrl === "string" && b.imageUrl)
  const slides = rawSlides.length > 0 ? rawSlides : DEFAULT_SLIDES
  const [index, setIndex] = useState(0)
  const count = Math.max(slides.length, 3)

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

  const go = (d) => setIndex((i) => (i + d + count) % count)
  const current = slides[index % slides.length] || slides[0]
  const artwork = isArtwork(current) && rawSlides.length > 0
  // Posters are 16:9 with lettering to the edges: give them the room to show whole.
  const hasArtwork = rawSlides.some(isArtwork)

  return (
    <section
      className={`relative w-full overflow-hidden bg-[#1a1a1a] ${
        hasArtwork ? "aspect-[16/9] max-h-[600px] lg:aspect-auto lg:h-[600px]" : "h-[260px] sm:h-[340px] lg:h-[440px]"
      }`}
      aria-roledescription="carousel"
      aria-label="Featured"
    >
      {/* Background slide image */}
      {slides.map((b, i) => {
        const active = i === (index % slides.length)
        const common = `absolute inset-0 h-full w-full object-cover object-center transition-opacity duration-700 ${
          active ? "opacity-100 wh-kenburns" : "opacity-0"
        }`
        if (isVideoUrl(b.imageUrl)) {
          return <video key={b.imageUrl + i} src={b.imageUrl} className={common} muted loop autoPlay={active} playsInline preload={active ? "auto" : "metadata"} aria-hidden={!active} />
        }
        if (isArtwork(b) && rawSlides.length > 0) {
          return (
            <div key={b.imageUrl + i} className={`absolute inset-0 transition-opacity duration-700 ${active ? "opacity-100" : "opacity-0"}`} aria-hidden={!active}>
              <img src={b.imageUrl} alt="" className="absolute inset-0 h-full w-full scale-110 object-cover blur-2xl brightness-75" loading="eager" />
              <img src={b.imageUrl} alt={`Offer ${i + 1}`} className="absolute inset-0 h-full w-full object-contain" loading="eager" />
            </div>
          )
        }
        return <img key={b.imageUrl + i} src={b.imageUrl} alt={b.title || `Hero banner ${i + 1}`} className={common} loading="eager" aria-hidden={!active} />
      })}

      {artwork ? (
        <BannerLink link={current.ctaLink} storePath={storePath} className="absolute inset-0 z-10" aria-label={current.ctaText || "Shop the offer"} />
      ) : null}

      {/* Hero Content Overlay (Left) */}
      <div className={`relative z-20 mx-auto h-full max-w-[1500px] flex-col justify-center px-4 pb-8 sm:px-8 lg:px-12 lg:pb-12 ${artwork ? "hidden" : "flex"}`}>
        <div key={index} className="wh-reveal is-visible max-w-[78%] text-left sm:max-w-xl">
          <span className="inline-block text-[10px] font-bold uppercase tracking-[0.18em] text-[#f59e0b] [text-shadow:0_1px_6px_rgba(0,0,0,0.6)] sm:text-[12px] sm:tracking-[0.2em]">
            {current.tag || "NEW SEASON COLLECTION"}
          </span>
          <h1 className="mt-1.5 whitespace-pre-line text-[26px] font-black leading-[1.1] tracking-tight text-white [text-shadow:0_2px_12px_rgba(0,0,0,0.65)] sm:mt-2 sm:text-5xl lg:text-[54px]">
            {current.title || "Style That\nMoves With You"}
          </h1>
          <p className="mt-2 text-[13px] text-white [text-shadow:0_1px_8px_rgba(0,0,0,0.7)] sm:mt-3 sm:text-[16px]">
            {current.subtitle || "Trendy styles. Everyday comfort. Unbeatable prices."}
          </p>
          <div className="mt-4 sm:mt-6">
            <BannerLink
              link={current.ctaLink}
              storePath={storePath}
              className="inline-flex items-center gap-2 rounded-full bg-[#f59e0b] px-4 py-2 text-[13px] font-bold text-gray-950 shadow-lg sm:px-6 sm:py-2.5 sm:text-[14px] hover:bg-[#ea8c00] hover:scale-105 active:scale-95 transition-all"
            >
              {current.ctaText || "Shop Now"}
              <ArrowRight className="h-4 w-4" />
            </BannerLink>
          </div>
        </div>
      </div>

      {/* Carousel navigation arrows */}
      {count > 1 ? (
        <>
          <button
            type="button"
            onClick={() => go(-1)}
            aria-label="Previous banner"
            className="absolute left-2 top-1/2 z-20 hidden h-12 w-10 -translate-y-1/2 items-center justify-center rounded-r bg-black/30 sm:flex text-white backdrop-blur-xs hover:bg-black/60 transition-colors"
          >
            <ChevronLeft className="h-6 w-6" />
          </button>
          <button
            type="button"
            onClick={() => go(1)}
            aria-label="Next banner"
            className="absolute right-2 top-1/2 z-20 hidden h-12 w-10 -translate-y-1/2 items-center justify-center rounded-l bg-black/30 sm:flex text-white backdrop-blur-xs hover:bg-black/60 transition-colors"
          >
            <ChevronRight className="h-6 w-6" />
          </button>
        </>
      ) : null}

      {/* Carousel indicator dots */}
      <div className="absolute bottom-5 left-1/2 -translate-x-1/2 flex items-center gap-2 z-20">
        {[0, 1, 2].map((dotIdx) => {
          const isActive = index % 3 === dotIdx
          return (
            <button
              key={dotIdx}
              type="button"
              onClick={() => setIndex(dotIdx)}
              aria-label={`Go to slide ${dotIdx + 1}`}
              className={`rounded-full transition-all duration-300 ${
                isActive ? "h-2.5 w-2.5 bg-[#f59e0b]" : "h-2 w-2 bg-white/50 hover:bg-white/80"
              }`}
            />
          )
        })}
      </div>

      {/* Trust Badges (Bottom Right) */}
      <div className={`absolute bottom-6 right-8 hidden items-center gap-6 z-20 ${artwork ? "" : "xl:flex"}`}>
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[#f59e0b]/50 bg-black/50 backdrop-blur-sm text-[#f59e0b] shadow-sm">
            <Truck className="h-5 w-5" />
          </div>
          <div className="text-left text-white leading-tight">
            <div className="text-[13px] font-bold">Fast Delivery</div>
            <div className="text-[12px] text-gray-300">in Indore</div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[#f59e0b]/50 bg-black/50 backdrop-blur-sm text-[#f59e0b] shadow-sm">
            <ShieldCheck className="h-5 w-5" />
          </div>
          <div className="text-left text-white leading-tight">
            <div className="text-[13px] font-bold">100% Genuine</div>
            <div className="text-[12px] text-gray-300">Products</div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[#f59e0b]/50 bg-black/50 backdrop-blur-sm text-[#f59e0b] shadow-sm">
            <RotateCcw className="h-5 w-5" />
          </div>
          <div className="text-left text-white leading-tight">
            <div className="text-[13px] font-bold">Easy Returns</div>
            <div className="text-[12px] text-gray-300">&amp; Exchanges</div>
          </div>
        </div>
      </div>
    </section>
  )
}
