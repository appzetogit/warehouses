/**
 * The customer app's section heading (warehouse_user SectionHeading): the first
 * word large in Cormorant, the rest in Poppins capitals underneath, a tapered
 * brown rule on each side (hairline far from the title, thick with a rounded
 * end beside it), and a champagne sheen that sweeps across now and then.
 */

function Rule({ side }) {
  // Thick end next to the title: the right end of the left rule, the left
  // end of the right rule.
  const thickOnRight = side === "left"
  return (
    <svg aria-hidden="true" viewBox="0 0 100 7" preserveAspectRatio="none" className="h-[7px] min-w-0 flex-1">
      <path
        d={thickOnRight ? "M0 3.5 L96.5 0 A3.5 3.5 0 0 1 96.5 7 Z" : "M100 3.5 L3.5 0 A3.5 3.5 0 0 0 3.5 7 Z"}
        fill="var(--app-brown)"
      />
    </svg>
  )
}

export default function AppSectionHeading({ title, subtitle = "", className = "" }) {
  const words = String(title || "").trim().split(/\s+/)
  const first = words[0] || ""
  const rest = words.slice(1).join(" ").toUpperCase()
  return (
    <div className={`px-4 pb-3.5 lg:px-0 ${className}`}>
      <div className="flex items-center gap-3.5">
        <Rule side="left" />
        <h2 className="app-sheen max-w-[60%] shrink-0 px-1 text-center text-app-brown">
          <span className="block font-app-display text-[38px] font-bold leading-[1.05]">{first}</span>
          {rest ? (
            <span className="block whitespace-nowrap font-app text-[19px] font-semibold leading-[1.1] tracking-[0.5px]">{rest}</span>
          ) : null}
        </h2>
        <Rule side="right" />
      </div>
      {subtitle ? (
        <p className="mt-2 text-center font-app text-[12.5px] tracking-[0.2px] text-app-muted">{subtitle}</p>
      ) : null}
    </div>
  )
}
