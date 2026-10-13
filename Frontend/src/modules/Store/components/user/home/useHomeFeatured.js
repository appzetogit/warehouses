import { useEffect, useState } from "react"
import { catalogAPI } from "@/services/api"
import { useStoreMode } from "@store/context/StoreModeContext"
import { useQuickLayout } from "../quick-mobile/QuickLayoutContext"

/**
 * The admin's featured cards (GET /content/quick-home `featured`). Quick reads
 * them from QuickLayoutContext; the Shop home has no such provider, so it
 * fetches them itself, once per zone for the session.
 */

const cache = new Map()

export default function useHomeFeatured(zoneId) {
  const { isQuick } = useStoreMode()
  const { layout } = useQuickLayout()
  const key = String(zoneId || "global")
  const [featured, setFeatured] = useState(() => cache.get(key) || [])

  useEffect(() => {
    if (isQuick) return undefined
    if (cache.has(key)) {
      setFeatured(cache.get(key))
      return undefined
    }
    let cancelled = false
    catalogAPI
      .getQuickHome(zoneId || undefined)
      .then((res) => {
        const list = res?.data?.data?.featured
        const next = Array.isArray(list) ? list : []
        cache.set(key, next)
        if (!cancelled) setFeatured(next)
      })
      .catch(() => {
        if (!cancelled) setFeatured([])
      })
    return () => {
      cancelled = true
    }
  }, [isQuick, key, zoneId])

  return isQuick ? layout.featured : featured
}
