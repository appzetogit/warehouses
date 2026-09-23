import { Link } from "react-router-dom"
import { Star } from "lucide-react"
import { useStoreMode } from "@store/context/StoreModeContext"
import { ImagePlaceholder, isRealImage, percentOff } from "../desktop/ui"
import { mediaUrl } from "../desktop/desktopCart"

/**
 * The storefront product card (MOBILE_UI_SPEC.md), at the reference's
 * proportions: a 4:5 image on a tinted panel, then the name, the price against
 * a struck MRP, a discount pill, the rating, and a full-width outlined action.
 *
 * The whole card links to the product; the action is a button on top of it, so
 * `onAction` must stop the click from reaching the link.
 */
export default function ProductCard({
  product,
  actionLabel = "Add to cart",
  onAction,
  disabled = false,
  badge = null,
  footNote = null,
}) {
  const { storePath } = useStoreMode()
  const id = product?._id || product?.id
  const image = mediaUrl(product?.image || (Array.isArray(product?.images) ? product.images[0] : ""))
  const price = Number(product?.displayPrice ?? product?.price ?? 0)
  const mrp = Number(product?.mrp ?? 0)
  const off = percentOff(price, mrp)
  const rating = Number(product?.rating) > 0 ? Number(product.rating) : null
  const ratingCount = Number(product?.ratingCount ?? product?.totalRatings) || 0

  return (
    <article className="flex h-full flex-col overflow-hidden rounded-2xl border border-wh-border bg-wh-surface">
      <Link to={storePath(`/product/${id}`)} className="flex flex-1 flex-col focus-visible:outline-2 focus-visible:outline-wh-brand">
        <div className="relative aspect-[4/5] w-full overflow-hidden rounded-t-2xl bg-[#F7F7F7]">
          {isRealImage(image) ? (
            <img
              src={image}
              alt={product?.name || "Product"}
              loading="lazy"
              className="h-full w-full object-cover transition-transform duration-500 ease-out hover:scale-105"
            />
          ) : (
            <ImagePlaceholder name={product?.name} />
          )}
          {badge}
        </div>

        <div className="flex flex-1 flex-col justify-between space-y-1 p-2 sm:p-2.5">
          <h3 className="line-clamp-2 text-[12px] font-semibold uppercase leading-snug tracking-tight text-wh-text sm:text-[13px]">
            {product?.name}
          </h3>

          {product?.packSize ? (
            <p className="text-[11px] text-wh-muted">{product.packSize}</p>
          ) : null}

          <div className="flex flex-wrap items-baseline gap-x-1.5">
            {mrp > price ? (
              <span className="text-[11px] text-wh-muted line-through">₹{mrp.toLocaleString("en-IN")}</span>
            ) : null}
            <span className="text-[14px] font-bold text-wh-text">₹{price.toLocaleString("en-IN")}</span>
          </div>

          {off > 0 ? (
            <span className="inline-block w-fit rounded bg-wh-success px-1.5 py-0.5 text-[10px] font-black text-white">
              {off}% OFF
            </span>
          ) : null}

          {rating ? (
            <div className="flex items-center gap-1">
              <div className="flex">
                {[...Array(5)].map((_, i) => (
                  <Star
                    key={i}
                    className={`h-3 w-3 ${i < Math.round(rating) ? "fill-amber-500 text-amber-500" : "text-gray-300"}`}
                    aria-hidden="true"
                  />
                ))}
              </div>
              {ratingCount > 0 ? <span className="text-[10px] text-wh-muted">({ratingCount})</span> : null}
            </div>
          ) : null}

          {footNote}
        </div>
      </Link>

      {onAction ? (
        <div className="px-2 pb-2 sm:px-2.5 sm:pb-2.5">
          <button
            type="button"
            disabled={disabled}
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
              onAction(product)
            }}
            className="w-full rounded-full border-[0.8px] border-wh-text px-3 py-1.5 text-[12px] font-medium text-wh-text transition-colors hover:bg-wh-brand hover:border-wh-brand disabled:cursor-not-allowed disabled:opacity-50"
          >
            {actionLabel}
          </button>
        </div>
      ) : null}
    </article>
  )
}
