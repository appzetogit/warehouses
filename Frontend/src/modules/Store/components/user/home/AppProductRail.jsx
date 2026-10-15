import { Link } from "react-router-dom"
import ProductTile from "../mobile/ProductTile"
import AppSectionHeading from "./AppSectionHeading"

/**
 * The app's product rail (_FashionRail): the centred heading, an optional
 * "View all" link under it, then cards two and a sliver per screen.
 * From lg (desktop home) the rail is a grid: two rows of five, six from xl.
 */
export default function AppProductRail({ title, subtitle = "", products = [], to = "", linkLabel = "View all" }) {
  if (products.length < 2) return null
  return (
    <section aria-label={title} className="font-app">
      <AppSectionHeading title={title} subtitle={subtitle} className={to ? "pb-1.5!" : ""} />
      {to ? (
        <p className="mb-3 text-center">
          <Link to={to} className="text-[12.5px] font-semibold text-app-brown-badge lg:text-[14px] lg:hover:underline">
            {linkLabel} <span aria-hidden="true">→</span>
          </Link>
        </p>
      ) : null}
      <div className="flex snap-x gap-3 overflow-x-auto px-4 pb-2 [scrollbar-width:none] lg:grid lg:grid-cols-5 lg:gap-4 lg:overflow-visible lg:px-0 lg:pb-0 xl:grid-cols-6 lg:[&>*:nth-child(n+11)]:hidden xl:[&>*:nth-child(n+11)]:block xl:[&>*:nth-child(n+13)]:hidden [&::-webkit-scrollbar]:hidden">
        {products.map((p) => (
          <div key={p._id} className="w-[46%] shrink-0 snap-start lg:w-auto">
            <ProductTile product={p} />
          </div>
        ))}
      </div>
    </section>
  )
}
