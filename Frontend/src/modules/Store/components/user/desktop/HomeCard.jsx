import { Link } from "react-router-dom"
import { ImagePlaceholder, isRealImage, DealBadge, percentOff } from "./ui"

const focus = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-wh-brand"

/** White homepage card: 21px bold title, content, "See more" link. */
export function HomeCard({ title, seeMoreTo, seeMoreLabel = "See more", children }) {
  return (
    <section className="flex min-h-[420px] flex-col rounded-[8px] bg-wh-surface p-5 text-wh-text">
      <h2 className="mb-3 text-[21px] font-bold leading-7 line-clamp-2">{title}</h2>
      <div className="flex-1">{children}</div>
      {seeMoreTo ? (
        <Link to={seeMoreTo} className={`mt-3 self-start text-[13px] text-wh-link hover:text-wh-link-hover hover:underline ${focus}`}>
          {seeMoreLabel}
        </Link>
      ) : null}
    </section>
  )
}

/** 2×2 grid of image + label tiles. `tiles`: [{ key, to, image, label }] (up to 4). */
export function GridCard({ title, tiles = [], seeMoreTo }) {
  const list = tiles.slice(0, 4)
  if (!list.length) return null
  return (
    <HomeCard title={title} seeMoreTo={seeMoreTo}>
      <div className="grid grid-cols-2 gap-x-4 gap-y-3">
        {list.map((t) => (
          <Link key={t.key} to={t.to} className={`group block rounded-[4px] ${focus}`}>
            <div className="flex aspect-square items-center justify-center overflow-hidden bg-[#F7F7F7]">
              {isRealImage(t.image) ? (
                <img src={t.image} alt={t.label} loading="lazy" className="h-full w-full object-contain mix-blend-multiply" />
              ) : (
                <ImagePlaceholder name={t.name || t.label} />
              )}
            </div>
            <span className="mt-1 block truncate text-[12px] leading-4 group-hover:text-wh-link-hover">{t.label}</span>
          </Link>
        ))}
      </div>
    </HomeCard>
  )
}

/** One large deal image with a link. */
export function DealCard({ title, product, to, seeMoreTo }) {
  if (!product) return null
  const off = percentOff(product.price, product.mrp)
  return (
    <HomeCard title={title} seeMoreTo={seeMoreTo} seeMoreLabel="See all deals">
      <Link to={to} className={`group block ${focus}`}>
        <div className="flex aspect-square max-h-[300px] w-full items-center justify-center overflow-hidden bg-[#F7F7F7]">
          {isRealImage(product.image) ? (
            <img src={product.image} alt={product.name} loading="lazy" className="h-full w-full object-contain mix-blend-multiply" />
          ) : (
            <ImagePlaceholder name={product.name} />
          )}
        </div>
        <div className="mt-2 flex items-center gap-2">
          <DealBadge percent={off} />
          {off ? <span className="text-[12px] font-bold text-wh-deal">Limited time deal</span> : null}
        </div>
        <span className="mt-1 block truncate text-[14px] group-hover:text-wh-link-hover">{product.name}</span>
      </Link>
    </HomeCard>
  )
}
