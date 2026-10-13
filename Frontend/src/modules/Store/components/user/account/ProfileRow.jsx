import { Link } from "react-router-dom"
import { ChevronRight } from "lucide-react"

/**
 * Pieces of the customer app's profile screen (warehouse_user): white group
 * cards with icon rows, and the two-up stat cards. Presentational only; the
 * page passes the routes and handlers.
 */

const cardShadow = "shadow-[0_2px_10px_rgba(0,0,0,0.06)]"

function Tap({ to, onClick, className, children, ...rest }) {
  if (to) {
    return (
      <Link to={to} className={className} {...rest}>
        {children}
      </Link>
    )
  }
  return (
    <button type="button" onClick={onClick} className={`w-full text-left ${className}`} {...rest}>
      {children}
    </button>
  )
}

export function GroupCard({ title, action = null, children, className = "" }) {
  return (
    <section className={`overflow-hidden rounded-2xl bg-white ${cardShadow} ${className}`} aria-label={title}>
      {title ? (
        <div className="flex items-center justify-between px-4 pb-1 pt-4">
          <h2 className="text-[16px] font-bold text-app-ink">{title}</h2>
          {action}
        </div>
      ) : null}
      <div className="divide-y divide-app-line">{children}</div>
    </section>
  )
}

export default function ProfileRow({ icon: Icon, title, subtitle, to, onClick, trailing }) {
  return (
    <Tap
      to={to}
      onClick={onClick}
      className="flex items-center gap-3.5 px-4 py-3.5 transition-colors active:bg-app-alt hover:bg-app-alt/60"
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-app-brown/10 text-app-brown">
        <Icon className="h-[19px] w-[19px]" aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[14.5px] font-semibold text-app-ink">{title}</span>
        {subtitle ? <span className="mt-0.5 block truncate text-[12px] text-app-muted">{subtitle}</span> : null}
      </span>
      {trailing}
      <ChevronRight className="h-[18px] w-[18px] shrink-0 text-app-muted" aria-hidden="true" />
    </Tap>
  )
}

export function StatCard({ icon: Icon, label, value, to, onClick }) {
  return (
    <Tap
      to={to}
      onClick={onClick}
      className={`flex items-center gap-2.5 rounded-2xl bg-white p-3.5 ${cardShadow} transition-transform active:scale-[0.98]`}
    >
      <span className="flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-full bg-app-brown/12 text-app-brown">
        <Icon className="h-5 w-5" aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[11.5px] text-app-muted">{label}</span>
        <span className="mt-0.5 block truncate text-[14.5px] font-bold text-app-ink">{value}</span>
      </span>
      <ChevronRight className="h-4 w-4 shrink-0 text-app-brown" aria-hidden="true" />
    </Tap>
  )
}

export function OrderQuickLink({ icon: Icon, label, to, tone = "brown" }) {
  const tones = {
    brown: "bg-app-brown/12 text-app-brown",
    ok: "bg-app-ok/12 text-app-ok",
    danger: "bg-[#B3261E]/12 text-[#B3261E]",
  }
  return (
    <Link to={to} className="flex flex-1 flex-col items-center gap-1.5 rounded-xl py-1 active:bg-app-alt">
      <span className={`flex h-[42px] w-[42px] items-center justify-center rounded-full ${tones[tone] || tones.brown}`}>
        <Icon className="h-5 w-5" aria-hidden="true" />
      </span>
      <span className="text-[11.5px] font-medium text-app-muted">{label}</span>
    </Link>
  )
}
