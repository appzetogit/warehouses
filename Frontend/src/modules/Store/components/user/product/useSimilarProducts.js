import { useEffect, useState } from "react"
import { catalogAPI } from "@/services/api"
import { useStoreMode } from "@store/context/StoreModeContext"

/**
 * Products similar to `productId` (same source as RecommendationRail's
 * "You May Also Like": catalogAPI recommendations, type "similar", only what
 * this storefront delivers). Fetched once per product and shared by the phone
 * page's "N Similar Products" strip and its "People also viewed" grid.
 * Empty while loading or on error.
 */
export default function useSimilarProducts(productId, limit = 10) {
  const { fulfilmentMode } = useStoreMode()
  const [products, setProducts] = useState([])

  useEffect(() => {
    if (!productId) return undefined
    let cancelled = false
    setProducts([])
    catalogAPI
      .getProductRecommendations(productId, { type: "similar", fulfilmentMode, limit })
      .then((res) => {
        const list = (res?.data?.data?.products || []).filter((p) => p && String(p._id) !== String(productId))
        if (!cancelled) setProducts(list)
      })
      .catch(() => {
        if (!cancelled) setProducts([])
      })
    return () => {
      cancelled = true
    }
  }, [productId, fulfilmentMode, limit])

  return products
}
