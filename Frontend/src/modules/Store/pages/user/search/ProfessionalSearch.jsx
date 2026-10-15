import { useState, useEffect } from "react"
import { useSearchParams } from "react-router-dom"
import { useLocation as useGeoLocation } from "@store/hooks/useLocation"
import { useZone } from "@store/hooks/useZone"
import useIsDesktop from "@store/components/user/desktop/useIsDesktop"
import MobileListing from "@store/components/user/mobile/MobileListing"
import SearchIdle from "@store/components/user/mobile/SearchIdle"
import { DesktopProductListing } from "@store/components/user/desktop/ListingDesktop"

const SEARCH_HISTORY_KEY = "professional_search_history_v1"

export default function ProfessionalSearch() {
  const [searchParams, setSearchParams] = useSearchParams()
  const { location: userCoords } = useGeoLocation()
  const { zoneId } = useZone(userCoords)
  const onWideScreen = useIsDesktop()

  // From the address, so a category picked in the header (or "All Categories") applies here too.
  const selectedCategoryId = searchParams.get("cat") || null
  const [history, setHistory] = useState([])

  // Load search history
  useEffect(() => {
    const savedHistory = localStorage.getItem(SEARCH_HISTORY_KEY)
    if (savedHistory) {
      try {
        const parsed = JSON.parse(savedHistory)
        if (Array.isArray(parsed)) setHistory(parsed)
      } catch {
        // A corrupted entry must not break the search page.
      }
    }

    // Trigger voice search if param is present
    if (searchParams.get('voice') === 'true') {
      handleVoiceSearch();
      // Clear the param so it doesn't trigger again on reload
      const newParams = new URLSearchParams(searchParams);
      newParams.delete('voice');
      setSearchParams(newParams, { replace: true });
    }
  }, [])

  // Phones search from the header above this page (?q=), so each search the
  // address carries is remembered for "Recent searches".
  const urlQuery = (searchParams.get("q") || "").trim()
  useEffect(() => {
    if (onWideScreen || !urlQuery) return
    setHistory((prev) => {
      const next = [urlQuery, ...(Array.isArray(prev) ? prev : []).filter((h) => String(h).toLowerCase() !== urlQuery.toLowerCase())].slice(0, 8)
      try {
        localStorage.setItem(SEARCH_HISTORY_KEY, JSON.stringify(next))
      } catch {
        // private mode: the list lasts for this visit only
      }
      return next
    })
  }, [urlQuery, onWideScreen])

  const clearHistory = () => {
    setHistory([])
    try {
      localStorage.removeItem(SEARCH_HISTORY_KEY)
    } catch {
      // nothing stored
    }
  }

  const addToHistory = (term) => {
    const newHistory = [term, ...history.filter(h => h !== term)].slice(0, 5)
    setHistory(newHistory)
    localStorage.setItem(SEARCH_HISTORY_KEY, JSON.stringify(newHistory))
  }

  // Speech Recognition Implementation
  const handleVoiceSearch = () => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SpeechRecognition) {
      alert("Voice search is not supported in this browser.")
      return
    }

    const recognition = new SpeechRecognition()
    recognition.lang = 'en-IN'
    recognition.onresult = (event) => {
      const transcript = event.results[0][0].transcript
      addToHistory(transcript.trim())
    }
    recognition.start()
  }

  const handleCategoryClick = (id) => {
    const newCat = selectedCategoryId === id ? null : id
    // A new category keeps the search, and drops the old one's filters, sort and page.
    const p = {}
    for (const key of ["q", "minDiscount"]) if (searchParams.get(key)) p[key] = searchParams.get(key)
    if (newCat) p.cat = newCat
    setSearchParams(p, { replace: true })
  }

  // Phones: the listing from the mobile mockup (screen 2).
  if (!onWideScreen) {
    const discount = Number(searchParams.get("minDiscount")) || null
    // Nothing asked yet: recent searches and popular categories, as in the app.
    if (!urlQuery && !discount && !selectedCategoryId) {
      return <SearchIdle recent={Array.isArray(history) ? history.filter((h) => typeof h === "string" && h.trim()) : []} onClearRecent={clearHistory} />
    }
    return (
      <MobileListing
        withTopBar={false}
        groupByCategory
        q={searchParams.get("q") || ""}
        minDiscount={discount}
        title={!searchParams.get("q") && discount ? `Minimum ${discount}% off` : undefined}
      />
    )
  }
  // Desktop (lg+): filter rail, results bar and product grid.
  return (
    <DesktopProductListing
      q={searchParams.get("q") || ""}
      smart
      minDiscount={Number(searchParams.get("minDiscount")) || null}
      title={
        !searchParams.get("q") && Number(searchParams.get("minDiscount")) > 0
          ? `Minimum ${Number(searchParams.get("minDiscount"))}% off`
          : undefined
      }
      categoryId={selectedCategoryId}
      onSelectCategory={(cat) => handleCategoryClick(cat ? cat.id : selectedCategoryId)}
      zoneId={zoneId}
    />
  )
}
