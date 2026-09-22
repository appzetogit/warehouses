import { useState } from "react"
import { Link } from "react-router-dom"
import { BRAND_LOGO_ON_DARK } from "@/config/brandMark"
import { useStoreMode } from "@store/context/StoreModeContext"
import { useBusinessSettings } from "./useDesktopShell"

const SOCIAL_LABELS = { facebook: "Facebook", instagram: "Instagram", twitter: "X (Twitter)", x: "X", youtube: "YouTube", linkedin: "LinkedIn", whatsapp: "WhatsApp" }

/** Social links from Business Settings, whichever shape they're stored in. */
const socialLinksFrom = (s) => {
  const src = s?.socialLinks || s?.social || s?.socialMedia || {}
  const entries = Array.isArray(src)
    ? src.map((l) => [l?.platform || l?.name, l?.url || l?.link])
    : Object.entries(src)
  return entries
    .filter(([, url]) => typeof url === "string" && /^https?:\/\//i.test(url))
    .map(([k, url]) => ({ label: SOCIAL_LABELS[String(k).toLowerCase()] || String(k), url }))
}

function Column({ title, children }) {
  return (
    <div>
      <h2 className="mb-2 text-[16px] font-bold text-white">{title}</h2>
      <ul className="space-y-2 text-[14px] text-[#DDD]">{children}</ul>
    </div>
  )
}

const FLink = ({ to, children }) => (
  <li>
    <Link to={to} className="hover:underline">{children}</Link>
  </li>
)

/** Desktop (lg+) storefront footer. */
export default function DesktopFooter() {
  const { storePath } = useStoreMode()
  const { settings, brandName, logoOnDark } = useBusinessSettings()
  const [logoSrc, setLogoSrc] = useState(null)
  const social = socialLinksFrom(settings)
  const email = settings?.email
  const phone = settings?.phone?.number ? `${settings.phone.countryCode || ""} ${settings.phone.number}`.trim() : ""

  return (
    <footer className="wh-desktop mt-8 hidden lg:block">
      <button
        type="button"
        onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
        className="block h-[50px] w-full bg-wh-nav-3 text-[13px] text-white hover:bg-[#485769]"
      >
        Back to top
      </button>

      <div className="bg-wh-nav-2">
        <div className="mx-auto grid max-w-[1000px] grid-cols-4 gap-10 px-[20px] py-10">
          <Column title="Get to Know Us">
            <FLink to="/profile/about">About {brandName}</FLink>
            <FLink to={storePath("/sellers")}>Our stores</FLink>
            <FLink to="/offers">Offers &amp; deals</FLink>
            <FLink to="/profile/refer-earn">Refer &amp; earn</FLink>
          </Column>
          <Column title="Connect with Us">
            {social.map((s) => (
              <li key={s.url}>
                <a href={s.url} target="_blank" rel="noopener noreferrer" className="hover:underline">{s.label}</a>
              </li>
            ))}
            {email ? (
              <li><a href={`mailto:${email}`} className="hover:underline">{email}</a></li>
            ) : null}
            {phone ? (
              <li><a href={`tel:${phone.replace(/\s+/g, "")}`} className="hover:underline">{phone}</a></li>
            ) : null}
            {!social.length && !email && !phone ? <FLink to="/help">Contact us</FLink> : null}
          </Column>
          <Column title="Make Money with Us">
            <FLink to="/seller/signup">Sell on {brandName}</FLink>
            <FLink to="/food/delivery/login">Become a delivery partner</FLink>
          </Column>
          <Column title="Let Us Help You">
            <FLink to="/profile">Your account</FLink>
            <FLink to="/orders">Returns &amp; orders</FLink>
            <FLink to="/help">Help</FLink>
            <FLink to="/profile/shipping">Shipping policy</FLink>
            <FLink to="/profile/refund">Refund policy</FLink>
            <FLink to="/profile/cancellation">Cancellation policy</FLink>
            <FLink to="/profile/terms">Terms of use</FLink>
            <FLink to="/profile/privacy">Privacy policy</FLink>
          </Column>
        </div>
      </div>

      <div className="bg-wh-nav">
        <div className="mx-auto flex max-w-[1500px] flex-col items-center gap-2 px-[20px] py-6 text-[12px] text-[#DDD]">
          <Link to={storePath("/")} aria-label={`${brandName} home`}>
            <img
              src={logoSrc || logoOnDark}
              alt={brandName}
              className="h-[36px] w-auto object-contain"
              onError={() => setLogoSrc(BRAND_LOGO_ON_DARK)}
            />
          </Link>
          <p className="text-[14px] font-bold text-white">{brandName}</p>
          <p>© {new Date().getFullYear()} {brandName}. All rights reserved.</p>
        </div>
      </div>
    </footer>
  )
}
