import { Link } from "react-router-dom"
import { History, TrendingUp } from "lucide-react"
import { useDeliveryLocation } from "@store/context/DeliveryLocationContext"
import { useStoreMode } from "@store/context/StoreModeContext"
import { usePublicCategories } from "../desktop/useDesktopShell"

/**
 * The search page before anything is typed, as in the customer app
 * (search_screen.dart _idle): "Recent searches" with a red Clear, then
 * "Popular right now" — the live top-level categories, since the backend has
 * no trending-search list of its own. Phones only; the search field itself
 * (with its suggestions) is the header above.
 */
export default function SearchIdle({ recent = [], onClearRecent }) {
  const { storePath } = useStoreMode()
  const { zoneId } = useDeliveryLocation()
  const { categories, loading } = usePublicCategories(zoneId)
  const popular = categories.filter((c) => !c.parentId).slice(0, 8)
  const searchTo = (term) => `${storePath("/search")}?${new URLSearchParams({ q: term })}`

  const chip =
    "inline-flex max-w-full items-center gap-2 rounded-full border border-app-line bg-app-alt px-4 py-2.5 text-[12px] font-semibold text-app-ink active:bg-app-sand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app-brown"
  const heading = "text-[16px] font-semibold text-app-ink"

  return (
    <div className="min-h-[60vh] bg-app-cream px-4 pb-[calc(84px+env(safe-area-inset-bottom))] pt-4 font-app text-app-ink lg:hidden">
      {recent.length ? (
        <section aria-labelledby="wh-recent-searches" className="mb-6">
          <div className="mb-3 flex items-center justify-between">
            <h2 id="wh-recent-searches" className={heading}>Recent searches</h2>
            <button
              type="button"
              onClick={onClearRecent}
              className="rounded-full px-2 py-1 text-[12.5px] font-semibold text-[#C62828] focus-visible:outline-2 focus-visible:outline-app-brown"
            >
              Clear
            </button>
          </div>
          <ul className="flex flex-wrap gap-2">
            {recent.map((term) => (
              <li key={term} className="max-w-full">
                <Link to={searchTo(term)} className={chip}>
                  <History className="h-3.5 w-3.5 shrink-0 text-app-muted" aria-hidden="true" />
                  <span className="truncate">{term}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {popular.length ? (
        <section aria-labelledby="wh-popular-searches">
          <h2 id="wh-popular-searches" className={`mb-3 ${heading}`}>Popular right now</h2>
          <ul className="flex flex-wrap gap-2">
            {popular.map((c) => (
              <li key={c.id} className="max-w-full">
                <Link to={searchTo(c.name)} className={chip}>
                  <TrendingUp className="h-3.5 w-3.5 shrink-0 text-app-muted" aria-hidden="true" />
                  <span className="truncate">{c.name}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : loading ? (
        <div className="flex flex-wrap gap-2" aria-hidden="true">
          {Array.from({ length: 6 }).map((_, i) => (
            <span key={i} className="h-10 w-24 animate-pulse rounded-full bg-app-sand/70" />
          ))}
        </div>
      ) : null}

      {!recent.length && !popular.length && !loading ? (
        <p className="mt-10 text-center text-[13px] text-app-muted">Search for products, brands and categories above.</p>
      ) : null}
    </div>
  )
}
