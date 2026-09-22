import { useEffect, useState } from "react"

const QUERY = "(min-width: 1024px)"

/** True at the Tailwind `lg` breakpoint and up; follows window resizes. */
export default function useIsDesktop() {
  const get = () => typeof window !== "undefined" && !!window.matchMedia?.(QUERY)?.matches
  const [isDesktop, setIsDesktop] = useState(get)
  useEffect(() => {
    const mq = window.matchMedia?.(QUERY)
    if (!mq) return undefined
    const onChange = () => setIsDesktop(mq.matches)
    onChange()
    mq.addEventListener?.("change", onChange)
    return () => mq.removeEventListener?.("change", onChange)
  }, [])
  return isDesktop
}
