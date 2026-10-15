/**
 * Quick home category tiles (QUICK_UI_SPEC.md): round-cornered tiles on a soft
 * brand tint with the label under, 8 per row at ≥1400px, 6 at 1280, 5 at 1024.
 * Built from the real category tree — the children of the top parents, falling
 * back to the parents themselves when a parent has no subcategories.
 */
import { Link } from "react-router-dom"
import { useStoreMode } from "@store/context/StoreModeContext"
import { isRealImage } from "../ui"
import { cx, focusRing } from "./quickHelpers"
import AppSectionHeading from "../../home/AppSectionHeading"
import { mediaUrl } from "../desktopCart"

const TILE_GRID =
  "grid grid-cols-3 gap-2 sm:grid-cols-4 sm:gap-3 lg:grid-cols-8 lg:gap-x-4 lg:gap-y-5 xl:grid-cols-10"

/** Flatten the tree into tiles: every parent's children, parents without children kept. */
export function categoryTilesFromTree(tree = [], limit = 24) {
  const tiles = []
  for (const parent of tree) {
    const children = Array.isArray(parent.children) ? parent.children : []
    if (children.length) {
      for (const child of children) tiles.push({ ...child, parentName: parent.name })
    } else {
      tiles.push({ ...parent, parentName: parent.name })
    }
  }
  return tiles.slice(0, limit)
}

export default function QuickCategoryTiles({ tree = [], loading = false, title = "Shop by Category" }) {
  const { storePath } = useStoreMode()
  const tiles = categoryTilesFromTree(tree)

  if (loading) {
    return (
      <section className="font-app">
        <AppSectionHeading title={title} />
        <div className={TILE_GRID} aria-hidden="true">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="animate-pulse">
              <div className="aspect-square rounded-full bg-app-sand" />
              <div className="mx-auto mt-2 h-3 w-3/4 rounded bg-app-sand" />
            </div>
          ))}
        </div>
      </section>
    )
  }

  if (!tiles.length) return null

  return (
    <section className="font-app text-app-ink">
      <AppSectionHeading title={title} />
      <div className={TILE_GRID}>
        {tiles.map((c) => {
          const img = mediaUrl(c.image)
          return (
            <Link
              key={c.id}
              to={storePath(`/category/${c.slug}`)}
              className={cx("group flex flex-col items-center gap-2 rounded-[12px] p-1", focusRing)}
            >
              <div className="flex aspect-square w-full items-center justify-center overflow-hidden rounded-full border border-app-line bg-app-tint">
                {isRealImage(img) ? (
                  <img
                    src={img}
                    alt=""
                    loading="lazy"
                    className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                  />
                ) : (
                  <span aria-hidden="true" className="font-app-display text-[26px] font-bold text-app-brown">
                    {String(c.name || "").trim().charAt(0).toUpperCase()}
                  </span>
                )}
              </div>
              <span className="line-clamp-2 text-center text-[13px] font-medium leading-4 group-hover:text-app-brown">
                {c.name}
              </span>
            </Link>
          )
        })}
      </div>
    </section>
  )
}
