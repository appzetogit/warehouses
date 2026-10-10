import { useEffect, useState } from "react"
import { adminAPI } from "@store/api"
import { getCachedSettings, loadBusinessSettings } from "@store/utils/businessSettings"
import { APP_CONFIG } from "@/config/constants"
import { brandLogoOnDark } from "@/config/brandMark"
import { categorySlugOf } from "@store/utils/categorySlug"

/** Business Settings (cached, refreshed on the businessSettingsUpdated event). */
export function useBusinessSettings() {
  const [settings, setSettings] = useState(() => getCachedSettings() || null)
  useEffect(() => {
    let alive = true
    if (!getCachedSettings()) {
      loadBusinessSettings()
        .then((s) => alive && s && setSettings(s))
        .catch(() => {})
    }
    const onUpdate = () => setSettings(getCachedSettings() || null)
    window.addEventListener("businessSettingsUpdated", onUpdate)
    return () => {
      alive = false
      window.removeEventListener("businessSettingsUpdated", onUpdate)
    }
  }, [])
  return {
    settings,
    brandName: settings?.companyName || APP_CONFIG.NAME,
    logoOnDark: brandLogoOnDark(settings || undefined),
    ...supportContact(settings),
    returnWindowDays: Number(settings?.returnWindowDays) > 0 ? Number(settings.returnWindowDays) : null,
  }
}

/**
 * The support email and phone customers may use, or "" when the admin hasn't
 * set a real one. Placeholders ("admin@example.com", "00000 00000") are
 * treated as unset, so nobody is told to write to an address that goes nowhere.
 */
export function supportContact(settings) {
  const email = String(settings?.supportEmail || settings?.email || "").trim()
  const realEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && !/@(example|test|localhost)\b|\.(test|invalid|example)$/i.test(email)
  const raw = settings?.phone
  const digits = String(typeof raw === "object" ? raw?.number || "" : raw || "").replace(/\D/g, "")
  const code = typeof raw === "object" && raw?.countryCode ? raw.countryCode : "+91"
  const realPhone = digits.length >= 8 && !/^0+$/.test(digits)
  return {
    supportEmail: realEmail ? email : "",
    supportPhone: realPhone ? `${code} ${digits}` : "",
  }
}

const categoriesCache = new Map()

/**
 * Public categories (zone-aware), normalised to {id, name, slug, image, parentId}.
 * `tree` groups subcategories under their parent (the API returns parentId and
 * includes parents that hold no products themselves).
 */
export function usePublicCategories(zoneId) {
  const key = String(zoneId || "global")
  const [list, setList] = useState(() => categoriesCache.get(key) || [])
  const [loading, setLoading] = useState(() => !categoriesCache.has(key))
  useEffect(() => {
    let alive = true
    const cached = categoriesCache.get(key)
    if (cached) {
      setList(cached)
      setLoading(false)
      return undefined
    }
    setLoading(true)
    adminAPI
      .getPublicCategories(zoneId ? { zoneId } : {})
      .then((res) => {
        const raw = res?.data?.data?.categories || res?.data?.categories || []
        const items = (Array.isArray(raw) ? raw : []).map((c, i) => ({
          id: String(c?.id || c?._id || c?.slug || i),
          name: c?.name || "",
          slug: categorySlugOf(c),
          image: c?.image || c?.imageUrl || "",
          parentId: c?.parentId ? String(c.parentId?._id || c.parentId) : null,
          sortOrder: Number(c?.sortOrder) || 0,
          order: i,
        })).filter((c) => c.name)
        // Each main category, in the admin's sortOrder, followed by its own
        // subcategories in theirs, so lists read Men, T-Shirts, Shirts…, Women…
        // rather than a new subcategory jumping ahead of everything.
        const byId = new Map(items.map((c) => [c.id, c]))
        const rootOf = (c) => (c.parentId && byId.has(c.parentId) ? byId.get(c.parentId) : c)
        items.sort((a, b) => {
          const ra = rootOf(a)
          const rb = rootOf(b)
          if (ra !== rb) return ra.sortOrder - rb.sortOrder || ra.order - rb.order
          if (a === ra) return -1
          if (b === rb) return 1
          return a.sortOrder - b.sortOrder || a.order - b.order
        })
        categoriesCache.set(key, items)
        if (alive) {
          setList(items)
          setLoading(false)
        }
      })
      .catch(() => {
        if (!alive) return
        setList([])
        setLoading(false)
      })
    return () => {
      alive = false
    }
  }, [key, zoneId])

  const byId = new Map(list.map((c) => [c.id, c]))
  const roots = list.filter((c) => !c.parentId || !byId.has(c.parentId))
  const tree = roots.map((r) => ({ ...r, children: list.filter((c) => c.parentId === r.id) }))
  return { categories: list, roots, tree, loading }
}
