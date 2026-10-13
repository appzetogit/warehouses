import { Link } from "react-router-dom"
import { Mail, Phone } from "lucide-react"
import { useBusinessSettings } from "../desktop/useDesktopShell"

/**
 * The app's home footer (shop_home_screen.dart _HomeFooter), phones only:
 * a "Back to top" bar, two columns of links, the support email and phone the
 * admin has set, and the brand line. Every link is a route this site has.
 */

const linkClass = "block py-1 text-[12.5px] text-[#DDD3CB]"

function Column({ title, links }) {
  return (
    <div className="min-w-0">
      <h2 className="mb-2 text-[14px] font-bold text-white">{title}</h2>
      <ul>
        {links.map(([label, to]) => (
          <li key={label}>
            <Link to={to} className={linkClass}>
              {label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}

export default function ShopHomeFooter() {
  const { brandName, supportEmail, supportPhone } = useBusinessSettings()
  const year = new Date().getFullYear()
  return (
    <footer className="font-app lg:hidden">
      <button
        type="button"
        onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
        className="flex h-[46px] w-full items-center justify-center bg-app-brown-deep text-[12.5px] text-white"
      >
        Back to top
      </button>
      <div className="bg-app-brown-darker px-5 py-6">
        <div className="grid grid-cols-2 gap-6">
          <Column
            title="Get to Know Us"
            links={[
              ["About", "/profile/about"],
              ["Terms", "/profile/terms"],
              ["Privacy", "/profile/privacy"],
            ]}
          />
          <Column
            title="Let Us Help You"
            links={[
              ["Your Orders", "/orders"],
              ["Returns & Refunds", "/profile/refund"],
              ["Help", "/help"],
              [`Sell on ${brandName}`, "/seller/signup"],
            ]}
          />
        </div>
        {supportEmail || supportPhone ? (
          <div className="mt-6">
            <h2 className="mb-2 text-[14px] font-bold text-white">Connect with Us</h2>
            {supportEmail ? (
              <a href={`mailto:${supportEmail}`} className={`${linkClass} flex items-center gap-2`}>
                <Mail className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span className="truncate">{supportEmail}</span>
              </a>
            ) : null}
            {supportPhone ? (
              <a href={`tel:${supportPhone.replace(/\s+/g, "")}`} className={`${linkClass} flex items-center gap-2`}>
                <Phone className="h-4 w-4 shrink-0" aria-hidden="true" />
                {supportPhone}
              </a>
            ) : null}
          </div>
        ) : null}
      </div>
      <div className="bg-app-ink px-5 pt-5 pb-[calc(20px+68px+env(safe-area-inset-bottom))] text-center md:pb-5">
        <p className="text-[15px] font-bold text-white">{brandName}</p>
        <p className="mt-1 text-[11.5px] text-[#A8A29E]">
          © {year} {brandName}. All rights reserved.
        </p>
      </div>
    </footer>
  )
}
