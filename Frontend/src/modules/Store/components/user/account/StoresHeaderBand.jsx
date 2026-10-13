import { Link, useNavigate } from "react-router-dom"
import { ArrowLeft, Search, ShoppingBag } from "lucide-react"

/**
 * The brown header band from the customer app's stores screen
 * (warehouse_user): a brown gradient with rounded bottom corners, back,
 * title and count line in white, and a search shortcut.
 *
 * Back works like the mobile top bar: history if there is any, else home.
 */
const icon =
  "flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/12 text-white active:bg-white/20 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"

export default function StoresHeaderBand({ title, subtitle, searchTo, homeTo = "/" }) {
  const navigate = useNavigate()

  const back = () => {
    if (window.history.length > 1) return navigate(-1)
    return navigate(homeTo)
  }

  return (
    <div className="relative overflow-hidden rounded-b-[24px] bg-[linear-gradient(135deg,#7A4A2E_0%,#58321D_55%,#322218_100%)] px-3 pb-5 pt-3 font-app text-white">
      {/* Decorative bags, as on the app's band. */}
      <ShoppingBag className="pointer-events-none absolute -right-3 -top-2 h-24 w-24 rotate-12 text-white/10" aria-hidden="true" />
      <ShoppingBag className="pointer-events-none absolute right-16 top-10 h-12 w-12 -rotate-12 text-white/10" aria-hidden="true" />

      <div className="relative flex items-center justify-between">
        <button type="button" onClick={back} aria-label="Back" className={icon}>
          <ArrowLeft className="h-5 w-5" aria-hidden="true" />
        </button>
        {searchTo ? (
          <Link to={searchTo} aria-label="Search" className={icon}>
            <Search className="h-5 w-5" aria-hidden="true" />
          </Link>
        ) : null}
      </div>
      <div className="relative mt-3 px-1">
        <h1 className="text-[22px] font-bold leading-tight">{title}</h1>
        {subtitle ? <p className="mt-1 truncate text-[13px] text-white/85">{subtitle}</p> : null}
      </div>
    </div>
  )
}
