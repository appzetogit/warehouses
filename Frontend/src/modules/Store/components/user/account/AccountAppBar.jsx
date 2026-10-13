import { Link, useNavigate } from "react-router-dom"
import { ArrowLeft } from "lucide-react"

/**
 * The plain app bar from the customer app (warehouse_user): cream, a back
 * button and an 18/600 title, with room for an action on the right.
 *
 * `backTo` renders the back button as a link; otherwise it goes back in
 * history (or calls `onBack` when given).
 */
export const appBarIcon =
  "flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-app-ink active:bg-app-sand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app-brown"

export default function AccountAppBar({ title, subtitle, backTo, onBack, right = null, className = "" }) {
  const navigate = useNavigate()

  const back = backTo ? (
    <Link to={backTo} aria-label="Back" className={appBarIcon}>
      <ArrowLeft className="h-5 w-5" aria-hidden="true" />
    </Link>
  ) : (
    <button type="button" aria-label="Back" onClick={onBack || (() => navigate(-1))} className={appBarIcon}>
      <ArrowLeft className="h-5 w-5" aria-hidden="true" />
    </button>
  )

  return (
    <div className={`sticky top-0 z-40 border-b border-app-line bg-app-cream/95 font-app text-app-ink backdrop-blur ${className}`}>
      <div className="mx-auto flex h-14 max-w-5xl items-center gap-1 px-2">
        {back}
        <div className="min-w-0 flex-1 px-1">
          <h1 className="truncate text-[18px] font-semibold leading-tight text-app-ink">{title}</h1>
          {subtitle ? <p className="truncate text-[11px] text-app-muted">{subtitle}</p> : null}
        </div>
        {right}
      </div>
    </div>
  )
}
