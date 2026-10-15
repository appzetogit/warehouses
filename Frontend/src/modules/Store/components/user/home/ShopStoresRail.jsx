import { Link } from "react-router-dom"
import { ArrowRight, MapPin, Package, Star, Store } from "lucide-react"
import { useStoreMode } from "@store/context/StoreModeContext"
import { mediaUrl } from "../desktop/desktopCart"
import AppSectionHeading from "./AppSectionHeading"

/**
 * The app's store cards (shop_home_screen.dart _StoreCard), 242×255: a cover
 * with a soft shade and the store's logo, then its name, locality, how many
 * products it lists here and "Explore Store". No "verified" chip: the store
 * records carry no such flag. From lg the rail is a grid of four (five from xl).
 */

const localityOf = (s) => {
  const place = s.location?.area || s.location?.city || s.address?.area || s.address?.city || s.city || ""
  const km = Number(s.distanceKm)
  const distance = s.distanceKm != null && Number.isFinite(km) ? `${km.toFixed(1)} km` : ""
  return [place, distance].filter(Boolean).join(" • ")
}

function StoreCard({ store, productCount }) {
  const { storePath } = useStoreMode()
  const slug = store.slug || store._id
  const cover = mediaUrl(store.coverImages?.[0] || store.profileImage)
  const logo = mediaUrl(store.profileImage)
  const rating = Number(store.rating) || 0
  const locality = localityOf(store)
  return (
    <Link
      to={storePath(`/sellers/${slug}`)}
      className="flex h-[255px] w-[242px] shrink-0 flex-col overflow-hidden rounded-[20px] border border-app-line bg-white shadow-[0_4px_14px_rgba(25,20,17,0.06)] active:scale-[0.97] lg:h-[275px] lg:w-auto lg:transition-shadow lg:hover:shadow-[0_8px_22px_rgba(25,20,17,0.12)]"
    >
      <span className="relative block h-[138px] shrink-0 bg-app-alt lg:h-[150px]">
        {cover ? (
          <img src={cover} alt="" loading="lazy" className="h-full w-full object-cover" />
        ) : (
          <span className="flex h-full items-center justify-center text-app-muted">
            <Store className="h-8 w-8" aria-hidden="true" />
          </span>
        )}
        <span
          aria-hidden="true"
          className="absolute inset-0 bg-[linear-gradient(180deg,rgba(0,0,0,0.35)_0%,transparent_45%,rgba(0,0,0,0.65)_100%)]"
        />
        {rating > 0 ? (
          <span className="absolute right-2.5 top-2.5 flex items-center gap-0.5 rounded-[10px] bg-white/[0.92] px-[7px] py-[3px] text-[10.5px] font-extrabold text-app-ink shadow-[0_0_6px_rgba(0,0,0,0.1)]">
            <Star className="h-3 w-3 fill-[#F59E0B] text-[#F59E0B]" aria-hidden="true" />
            {rating.toFixed(1)}
          </span>
        ) : null}
        <span className="absolute bottom-1.5 left-3 h-[42px] w-[42px] overflow-hidden rounded-full border-2 border-white bg-white shadow-[0_0_8px_rgba(0,0,0,0.2)]">
          {logo ? (
            <img src={logo} alt="" loading="lazy" className="h-full w-full object-cover" />
          ) : (
            <span className="flex h-full items-center justify-center text-[16px] font-extrabold text-app-brown">
              {String(store.sellerName || "?").slice(0, 1)}
            </span>
          )}
        </span>
      </span>
      <span className="flex min-h-0 flex-1 flex-col px-3 py-2.5">
        <span className="block truncate text-[14px] font-extrabold leading-[1.2] text-app-ink">{store.sellerName}</span>
        {locality ? (
          <span className="mt-0.5 flex items-center gap-[3px] text-[10.5px] text-app-muted">
            <MapPin className="h-3 w-3 shrink-0 text-[#322218]" aria-hidden="true" />
            <span className="truncate">{locality}</span>
          </span>
        ) : null}
        <span className="mt-auto flex items-center gap-1.5">
          {productCount > 0 ? (
            <span className="flex items-center gap-[3px] rounded-md bg-app-alt px-1.5 py-[3px] text-[9.5px] font-semibold text-app-muted">
              <Package className="h-3 w-3 text-[#322218]" aria-hidden="true" />
              {productCount} Product{productCount === 1 ? "" : "s"}
            </span>
          ) : null}
          <span className="ml-auto text-[10.5px] font-bold text-[#322218]">Explore Store</span>
          <span aria-hidden="true" className="flex h-[30px] w-[30px] items-center justify-center rounded-full bg-app-alt text-[#322218]">
            <ArrowRight className="h-4 w-4" />
          </span>
        </span>
      </span>
    </Link>
  )
}

export default function ShopStoresRail({ stores = [], products = [], title }) {
  if (!stores.length) return null
  const counts = new Map()
  for (const p of products) {
    const id = String(p?.sellerId || p?.seller?._id || "")
    if (id) counts.set(id, (counts.get(id) || 0) + 1)
  }
  return (
    <section aria-label={title} className="font-app">
      <AppSectionHeading title={title} />
      <div className="flex gap-3.5 overflow-x-auto px-4 pb-2 [scrollbar-width:none] lg:grid lg:grid-cols-4 lg:gap-4 lg:overflow-visible lg:px-0 lg:pb-0 xl:grid-cols-5 [&::-webkit-scrollbar]:hidden">
        {stores.map((s) => (
          <StoreCard key={s._id} store={s} productCount={counts.get(String(s._id)) || 0} />
        ))}
      </div>
    </section>
  )
}
