/**
 * Loading shapes for the storefront home.
 *
 * Each one mirrors the real component it stands in for — same card shell, same
 * grid, same image ratios and text-line widths — so the page keeps its layout
 * while it loads instead of shifting when the content lands.
 */

const shimmer = "animate-pulse bg-[#E9ECEF]"

/** The hero banner's footprint, at each of its three heights. */
export function HeroSkeleton() {
  return (
    <div className={`h-[260px] w-full sm:h-[340px] lg:h-[440px] ${shimmer}`} aria-hidden="true" />
  )
}

/** A centred section heading: title, subtitle, divider. */
function HeadingSkeleton() {
  return (
    <div className="mb-4 text-center sm:mb-6">
      <div className={`mx-auto h-7 w-56 rounded ${shimmer}`} />
      <div className={`mx-auto mt-2 h-3 w-44 rounded ${shimmer}`} />
      <div className={`mx-auto mt-3 h-[3px] w-14 rounded-full ${shimmer}`} />
    </div>
  )
}

/** Matches a Rail of ProductCards: two rows of 46vw cards on a phone. */
export function RailSkeleton() {
  return (
    <section>
      <HeadingSkeleton />
      <div className="grid grid-flow-col grid-rows-2 auto-cols-[46vw] gap-3 overflow-hidden sm:auto-cols-[31vw] lg:auto-cols-[200px] lg:grid-rows-1">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="overflow-hidden rounded-2xl border border-wh-border bg-wh-surface">
            <div className={`aspect-[4/5] w-full ${shimmer}`} />
            <div className="space-y-1.5 p-2">
              <div className={`h-3 w-full rounded ${shimmer}`} />
              <div className={`h-3 w-2/3 rounded ${shimmer}`} />
              <div className={`h-4 w-1/2 rounded ${shimmer}`} />
              <div className={`h-7 w-full rounded-full ${shimmer}`} />
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}

/** Matches TrustStrip: four cards, two across on a phone. */
export function TrustStripSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="flex items-center gap-2 rounded-2xl border border-wh-border bg-wh-surface p-2.5">
          <div className={`h-9 w-9 shrink-0 rounded-xl ${shimmer}`} />
          <div className="min-w-0 flex-1 space-y-1.5">
            <div className={`h-3 w-4/5 rounded ${shimmer}`} />
            <div className={`h-2.5 w-3/5 rounded ${shimmer}`} />
          </div>
        </div>
      ))}
    </div>
  )
}

/** Matches CollectionTiles: 4:5 tiles, two across on a phone. */
export function CollectionTilesSkeleton() {
  return (
    <section>
      <HeadingSkeleton />
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 sm:gap-3 lg:grid-cols-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className={`aspect-[4/5] rounded-2xl ${shimmer}`} />
        ))}
      </div>
    </section>
  )
}

// The app-look home's placeholder colour (the cream page's hairline).
const appShimmer = "animate-pulse bg-app-line"

/** An app section heading: the serif word, the capitals line, the rules. */
function AppHeadingSkeleton() {
  return (
    <div className="mx-auto mb-5 flex max-w-[820px] items-center gap-5">
      <div className={`h-[3px] flex-1 rounded-full ${appShimmer}`} />
      <div className="w-56 space-y-2">
        <div className={`mx-auto h-9 w-32 rounded ${appShimmer}`} />
        <div className={`mx-auto h-4 w-48 rounded ${appShimmer}`} />
      </div>
      <div className={`h-[3px] flex-1 rounded-full ${appShimmer}`} />
    </div>
  )
}

/**
 * The desktop home (DesktopHome, lg+) while the catalogue loads, in the order
 * the real one renders: category circles, the 3:1 hero, the service strip,
 * the two collection cards and a grid of app product cards.
 */
function DesktopHomeBody() {
  return (
    <div className="mx-auto max-w-[1400px] px-6">
      <div className="flex justify-center gap-2 pt-6">
        {Array.from({ length: 10 }).map((_, i) => (
          <div key={i} className="flex w-[92px] shrink-0 flex-col items-center gap-2">
            <div className={`h-[68px] w-[68px] rounded-full ${appShimmer}`} />
            <div className={`h-3 w-14 rounded-full ${appShimmer}`} />
          </div>
        ))}
      </div>
      <div className="space-y-14 pt-5">
        <div>
          <div className={`aspect-[3/1] w-full rounded-2xl ${appShimmer}`} />
          <div className={`mt-4 h-11 w-full rounded-full ${appShimmer}`} />
        </div>
        <div className="grid grid-cols-2 gap-5">
          <div className={`h-[360px] rounded-2xl ${appShimmer}`} />
          <div className={`h-[360px] rounded-2xl ${appShimmer}`} />
        </div>
        <section>
          <AppHeadingSkeleton />
          <div className="grid grid-cols-5 gap-4 xl:grid-cols-6">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className={`rounded-[14px] bg-white p-[5px] shadow-[0_2px_8px_rgba(25,20,17,0.08)] ${i === 5 ? "hidden xl:block" : ""}`}>
                <div className={`aspect-[4/5] w-full rounded-[10px] ${appShimmer}`} />
                <div className="space-y-1.5 px-1 pb-1 pt-2">
                  <div className={`h-3.5 w-2/3 rounded ${appShimmer}`} />
                  <div className={`h-3 w-full rounded ${appShimmer}`} />
                  <div className={`h-3.5 w-1/2 rounded ${appShimmer}`} />
                  <div className={`mt-2 h-[38px] w-full rounded-[10px] ${appShimmer}`} />
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  )
}

export function HomeSkeleton() {
  return (
    <div className="min-h-screen bg-app-cream pb-16" role="status" aria-label="Loading the storefront">
      <DesktopHomeBody />
    </div>
  )
}

/**
 * Matches ProductDetailDesktop: breadcrumb, then gallery, details and buy box
 * — three columns at lg, stacked below it.
 */
export function ProductDetailSkeleton() {
  return (
    <div className="min-h-screen bg-wh-surface" role="status" aria-label="Loading the product">
      <div className="mx-auto max-w-[1500px] px-3 sm:px-5">
        <div className={`my-3 h-3 w-64 max-w-full rounded ${shimmer}`} />
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,5fr)_minmax(0,5fr)_260px] lg:gap-6 xl:grid-cols-[minmax(0,6fr)_minmax(0,5fr)_300px]">
          {/* Gallery: thumbnails sit under the image on a phone, beside it above */}
          <div className="flex flex-col-reverse gap-3 sm:flex-row">
            <div className="flex w-full gap-2 sm:w-[52px] sm:flex-col">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className={`h-[52px] w-[52px] shrink-0 rounded-[8px] ${shimmer}`} />
              ))}
            </div>
            <div className={`aspect-square w-full rounded-[8px] ${shimmer}`} />
          </div>

          {/* Name, price, options */}
          <div>
            <div className={`h-6 w-11/12 rounded ${shimmer}`} />
            <div className={`mt-2 h-3 w-40 rounded ${shimmer}`} />
            <div className={`mt-5 h-8 w-32 rounded ${shimmer}`} />
            <div className={`mt-2 h-3 w-28 rounded ${shimmer}`} />
            <div className="mt-5 flex gap-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className={`h-9 w-12 rounded-[8px] ${shimmer}`} />
              ))}
            </div>
            <div className="mt-5 space-y-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className={`h-3 w-full rounded ${shimmer}`} />
              ))}
            </div>
          </div>

          {/* Buy box */}
          <div className="rounded-[8px] border border-wh-border p-4">
            <div className={`h-7 w-24 rounded ${shimmer}`} />
            <div className={`mt-3 h-3 w-40 rounded ${shimmer}`} />
            <div className={`mt-2 h-3 w-28 rounded ${shimmer}`} />
            <div className={`mt-4 h-9 w-full rounded-full ${shimmer}`} />
            <div className={`mt-2 h-9 w-full rounded-full ${shimmer}`} />
            <div className={`mt-4 h-3 w-32 rounded ${shimmer}`} />
          </div>
        </div>
      </div>
    </div>
  )
}

/**
 * What the app shows before a storefront route's code has loaded: the header's
 * bands and then the home page's shape, so the first paint is already the
 * storefront rather than an unrelated placeholder.
 */
export function StorefrontShellSkeleton() {
  return (
    <div className="min-h-screen bg-gray-100/70 lg:bg-app-cream" role="status" aria-label="Loading the storefront">
      {/* Desktop: DesktopHeader's cream band and category bar, then the home. */}
      <div className="hidden lg:block">
        <div className="bg-[linear-gradient(180deg,#F1E4D6_0%,#F8F1EA_100%)]">
          <div className="mx-auto flex h-[72px] max-w-[1400px] items-center gap-4 px-6">
            <div className={`h-[46px] w-[130px] rounded-lg ${appShimmer}`} />
            <div className={`h-9 w-36 rounded-lg ${appShimmer}`} />
            <div className="h-[44px] flex-1 rounded-full bg-white shadow-[0_2px_10px_rgba(0,0,0,0.05)]" />
            <div className="h-9 w-24 rounded-full bg-[#191411]/80" />
            <div className={`h-9 w-9 rounded-full ${appShimmer}`} />
            <div className={`h-9 w-9 rounded-full ${appShimmer}`} />
            <div className={`h-9 w-9 rounded-full ${appShimmer}`} />
          </div>
        </div>
        <div className="border-y border-app-line bg-white">
          <div className="mx-auto flex h-[44px] max-w-[1400px] items-center gap-5 px-6">
            <div className="h-[30px] w-[68px] rounded-full bg-app-brown/80" />
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className={`h-3 w-16 rounded ${appShimmer}`} />
            ))}
          </div>
        </div>
        <DesktopHomeBody />
      </div>

      <div className="lg:hidden">
        {/* Phones (and tablets): the phone-width shell, unchanged. */}
        <div className="bg-gradient-to-r from-[#3A2619] via-[#58321D] to-[#6B3A22]">
          <div className="mx-auto flex max-w-[1500px] flex-wrap items-center gap-x-2 gap-y-1.5 px-2.5 py-2 lg:h-[62px] lg:flex-nowrap lg:px-[20px] lg:py-[6px]">
            <div className="h-[28px] w-[74px] rounded bg-white/25 lg:h-[42px] lg:w-[145px]" />
            <div className="h-5 w-24 rounded bg-white/25" />
            <div className="ml-auto h-6 w-28 rounded-full bg-white/25" />
            <div className="h-6 w-6 rounded-full bg-white/25" />
            <div className="h-6 w-6 rounded-full bg-white/25" />
            <div className="order-last h-[42px] w-full rounded-[8px] bg-white/80 lg:order-none lg:mx-2 lg:w-auto lg:flex-1" />
          </div>
        </div>
        {/* Category bar */}
        <div className="border-b border-gray-200 bg-white">
          <div className="mx-auto flex h-[42px] max-w-[1500px] items-center gap-3 px-3 lg:px-[20px]">
            <div className={`h-[32px] w-[68px] rounded-[4px] ${shimmer}`} />
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className={`h-3 w-16 rounded ${shimmer}`} />
            ))}
          </div>
        </div>
        <HeroSkeleton />
        <div className="relative z-20 mx-auto -mt-6 max-w-[1500px] space-y-4 px-3 sm:px-5 lg:-mt-16 lg:space-y-6">
          <TrustStripSkeleton />
          <CollectionTilesSkeleton />
        </div>
      </div>
    </div>
  )
}
