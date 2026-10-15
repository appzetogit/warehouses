import { useStoreMode } from "@store/context/StoreModeContext"
import { useParams, useNavigate } from "react-router-dom"
import useIsDesktop from "@store/components/user/desktop/useIsDesktop"
import MobileListing from "@store/components/user/mobile/MobileListing"
import { DesktopProductListing } from "@store/components/user/desktop/ListingDesktop"
import { useDeliveryLocation } from "@store/context/DeliveryLocationContext"

export default function CategoryPage() {
  const { isQuick, storePath } = useStoreMode()
  const { category } = useParams()
  const onWideScreen = useIsDesktop()
  const navigate = useNavigate()
  const { zoneId } = useDeliveryLocation()

  // Phones: the listing from the mobile mockup (screen 2).
  if (!onWideScreen) return <MobileListing categorySlug={String(category || "all").toLowerCase()} />
  // Desktop (lg+): filter rail, results bar and product grid.
  return (
    <DesktopProductListing
      categorySlug={String(category || "all").toLowerCase()}
      onSelectCategory={(cat) => navigate(storePath(`/category/${cat ? cat.slug : "all"}`))}
      zoneId={isQuick ? zoneId : undefined}
    />
  )
}
