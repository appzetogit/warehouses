import { Link } from "react-router-dom"
import { ArrowUp, Facebook, Instagram, Linkedin, Mail, MapPin, MessageCircle, Phone, Youtube } from "lucide-react"
import { useStoreMode } from "@store/context/StoreModeContext"
import { useBusinessSettings, usePublicCategories } from "./useDesktopShell"

const SOCIAL_LABELS = { facebook: "Facebook", instagram: "Instagram", twitter: "X (Twitter)", x: "X", youtube: "YouTube", linkedin: "LinkedIn", whatsapp: "WhatsApp" }

/** The X wordmark (lucide only has the old bird). */
const XIcon = (props) => (
  <svg viewBox="0 0 24 24" fill="currentColor" {...props}>
    <path d="M17.75 3h3.07l-6.7 7.66L22 21h-6.17l-4.83-6.32L5.47 21H2.4l7.17-8.2L2 3h6.33l4.37 5.78L17.75 3Zm-1.08 16.2h1.7L7.4 4.7H5.57l11.1 14.5Z" />
  </svg>
)
const SOCIAL_ICONS = { facebook: Facebook, instagram: Instagram, twitter: XIcon, x: XIcon, youtube: Youtube, linkedin: Linkedin, whatsapp: MessageCircle }

/** Social links from Business Settings, whichever shape they're stored in. */
const socialLinksFrom = (s) => {
  const src = s?.socialLinks || s?.social || s?.socialMedia || {}
  const entries = Array.isArray(src)
    ? src.map((l) => [l?.platform || l?.name, l?.url || l?.link])
    : Object.entries(src)
  return entries
    .filter(([, url]) => typeof url === "string" && /^https:\/\//i.test(url))
    .map(([k, url]) => {
      const key = String(k).toLowerCase()
      return { key, label: SOCIAL_LABELS[key] || String(k), url, Icon: SOCIAL_ICONS[key] || null }
    })
}

// The brand's own contact details (from the old thewarehousess.com footer),
// used when Business Settings do not hold real ones.
const BRAND_CONTACT = {
  address: "401, 5th Floor, A Block, Corporate House, RNT Marg, Indore, India, 452001",
  phone: "+91-9203409595",
  email: "connect@thewarehousess.com",
}
const BRAND_LOGO_ON_DARK = "/brand/logo-on-dark.png"

// The phone home footer's look (ShopHomeFooter): a brown-deep "Back to top"
// band, a brown-darker body with white headings and #DDD3CB links, an ink strip.
const linkClass = "text-[#DDD3CB] transition-colors hover:text-app-champagne"
const iconClass = "h-5 w-5 shrink-0 text-app-champagne"

function Column({ title, children }) {
  return (
    <div>
      <h2 className="mb-4 text-[15px] font-bold text-white">{title}</h2>
      <ul className="space-y-3 text-[14px]">{children}</ul>
    </div>
  )
}

const FLink = ({ to, children }) => (
  <li>
    <Link to={to} className={linkClass}>{children}</Link>
  </li>
)

/** Storefront footer, desktop: the phone footer's brown palette with desktop columns. */
export default function DesktopFooter() {
  const { storePath } = useStoreMode()
  const { settings, brandName, supportEmail, supportPhone } = useBusinessSettings()
  const { categories } = usePublicCategories()
  const social = socialLinksFrom(settings)
  const email = supportEmail || BRAND_CONTACT.email
  const phone = supportPhone || BRAND_CONTACT.phone
  const address = String(settings?.address || settings?.companyAddress || "").trim() || BRAND_CONTACT.address
  // Subcategories that have products (the list only holds those), Women's first.
  const footerCategories = categories.filter((c) => c.parentId).slice(0, 6)

  return (
    <footer className="wh-desktop font-app mt-8">
      <button
        type="button"
        onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
        className="flex h-[50px] w-full items-center justify-center gap-1.5 bg-app-brown-deep text-[13px] text-white transition-colors hover:bg-app-brown"
      >
        <ArrowUp className="h-4 w-4" aria-hidden="true" /> Back to top
      </button>

      <div className="bg-app-brown-darker px-5 py-10 sm:px-8 sm:py-12">
        <div className="mx-auto grid max-w-[1500px] grid-cols-2 gap-x-6 gap-y-8 md:grid-cols-3 lg:grid-cols-[1.4fr_1fr_1fr_1fr_1.6fr] lg:gap-10">
          <div className="col-span-2 md:col-span-3 lg:col-span-1">
            <Link to={storePath("/")} aria-label={`${brandName} home`} className="inline-block">
              <img src={BRAND_LOGO_ON_DARK} alt={brandName} className="h-[72px] w-auto object-contain" />
            </Link>
            <p className="mt-4 max-w-sm text-[14px] leading-relaxed text-[#DDD3CB]">
              {brandName} brings you trendy and elegant fashion designed for modern women. From Western wear to
              ethnic styles, discover outfits that blend comfort with style.
            </p>
            {social.length ? (
              <ul aria-label="Social media" className="mt-4 flex flex-wrap gap-2">
                {social.map(({ key, label, url, Icon }) => (
                  <li key={key}>
                    <a
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={`${brandName} on ${label}`}
                      title={label}
                      className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-app-champagne transition-colors hover:bg-app-champagne hover:text-app-brown-darker"
                    >
                      {Icon ? <Icon className="h-[18px] w-[18px]" aria-hidden="true" /> : <span className="text-[12px] font-bold">{label.charAt(0)}</span>}
                    </a>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>

          <Column title="Categories">
            {footerCategories.length
              ? footerCategories.map((c) => <FLink key={c.id} to={storePath(`/category/${c.slug}`)}>{c.name}</FLink>)
              : <FLink to="/categories">All categories</FLink>}
          </Column>

          <Column title="Get to Know Us">
            <FLink to="/profile/about">About Us</FLink>
            <FLink to="/profile/privacy">Privacy Policy</FLink>
            <FLink to="/profile/terms">Terms &amp; Conditions</FLink>
            <FLink to="/profile/shipping">Shipping Policy</FLink>
            <FLink to="/seller/signup">Become a Vendor</FLink>
          </Column>

          <Column title="Let Us Help You">
            <FLink to="/orders">Track Your Order</FLink>
            <FLink to="/profile/refund">Refund &amp; Return</FLink>
            <FLink to="/offers">Offers &amp; Deals</FLink>
            <FLink to="/help">Contact Us</FLink>
            <FLink to="/profile">Your Account</FLink>
          </Column>

          <div className="col-span-2 md:col-span-1">
            <h2 className="mb-4 text-[15px] font-bold text-white">Connect with Us</h2>
            <ul className="space-y-4 text-[14px] text-[#DDD3CB]">
              <li className="flex gap-3">
                <MapPin className={`mt-0.5 ${iconClass}`} aria-hidden="true" />
                <span>{address}</span>
              </li>
              <li>
                <a href={`tel:${phone.replace(/[\s-]+/g, "")}`} className={`flex items-center gap-3 ${linkClass}`}>
                  <Phone className={iconClass} aria-hidden="true" /> {phone}
                </a>
              </li>
              <li>
                <a href={`mailto:${email}`} className={`flex items-center gap-3 break-all ${linkClass}`}>
                  <Mail className={iconClass} aria-hidden="true" /> {email}
                </a>
              </li>
            </ul>
          </div>
        </div>
      </div>

      <div className="bg-app-ink px-5 py-5 text-center">
        <p className="text-[15px] font-bold text-white">{brandName}</p>
        <p className="mt-1 text-[12px] text-[#A8A29E]">
          © {new Date().getFullYear()} {brandName}. All rights reserved.
        </p>
      </div>
    </footer>
  )
}
