import { useEffect, useState } from "react"

const LINE = 18 // px, one hint line
const EVERY_MS = 3000
const SLIDE_MS = 350

/**
 * The app's search hint: 'Search for "<term>"', sliding up to the next term
 * every few seconds (warehouse_user SearchBarWidget). The last row repeats the
 * first so the loop wraps without sliding back down. Decorative: the input
 * carries its own label.
 */
export default function RotatingSearchHint({ words, className = "" }) {
  const list = words.length ? words : ["products"]
  const rows = [...list, list[0]]
  const [index, setIndex] = useState(0)
  const [animate, setAnimate] = useState(true)
  const key = list.join("|")

  useEffect(() => {
    setIndex(0)
    if (list.length < 2) return undefined
    const timer = setInterval(() => {
      setAnimate(true)
      setIndex((i) => i + 1)
    }, EVERY_MS)
    return () => clearInterval(timer)
    // `key` stands in for the list's contents.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  // On the repeated first row, jump back to the real one without a slide.
  useEffect(() => {
    if (index < list.length) return undefined
    const timer = setTimeout(() => {
      setAnimate(false)
      setIndex(0)
    }, SLIDE_MS)
    return () => clearTimeout(timer)
  }, [index, list.length])

  return (
    <span aria-hidden="true" className={`block overflow-hidden ${className}`} style={{ height: LINE }}>
      <span
        className={`block ${animate ? "transition-transform ease-out motion-reduce:transition-none" : ""}`}
        style={{ transform: `translateY(-${index * LINE}px)`, transitionDuration: `${SLIDE_MS}ms` }}
      >
        {rows.map((word, i) => (
          <span key={`${word}-${i}`} className="block truncate text-[12px] text-app-muted" style={{ height: LINE, lineHeight: `${LINE}px` }}>
            Search for &quot;{word}&quot;
          </span>
        ))}
      </span>
    </span>
  )
}
