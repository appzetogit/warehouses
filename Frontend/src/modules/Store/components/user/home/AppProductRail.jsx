import { Link } from "react-router-dom"
import ProductTile from "../mobile/ProductTile"
import AppSectionHeading from "./AppSectionHeading"

/**
 * The app's product rail (_FashionRail): the centred heading, an optional
 * "View all" link under it, then cards two and a sliver per screen.
 */
export default function AppProductRail({ title, subtitle = "", products = [], to = "", linkLabel = "View all" }) {
  if (products.length < 2) return null
  return (
    <section aria-label={title} className="font-app">
      <AppSectionHeading title={title} subtitle={subtitle} className={to ? "pb-1.5!" : ""} />
      {to ? (
        <p className="mb-3 text-center">
          <Link to={to} className="text-[12.5px] font-semibold text-app-brown-badge">
            {linkLabel} <span aria-hidden="true">→</span>
          </Link>
        </p>
      ) : null}
      <div className="flex snap-x gap-3 overflow-x-auto px-4 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {products.map((p) => (
          <div key={p._id} className="w-[46%] shrink-0 snap-start">
            <ProductTile product={p} />
          </div>
        ))}
      </div>
    </section>
  )
}
