import { Component } from "react"
import { Link } from "react-router-dom"

const RELOAD_KEY = "page_error_reload_at"

/**
 * Catches a page that throws while rendering, so the customer gets a way out
 * instead of a blank white screen. Typically a tab opened before a deploy
 * running old page code against new data: one automatic reload fixes that,
 * and the guard stops a loop when the error is real.
 */
export default class PageErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    console.error("Page crashed:", error, info?.componentStack)
    let last = 0
    try { last = Number(sessionStorage.getItem(RELOAD_KEY)) || 0 } catch { /* storage blocked */ }
    if (Date.now() - last > 60000) {
      try { sessionStorage.setItem(RELOAD_KEY, String(Date.now())) } catch { /* storage blocked */ }
      window.location.reload()
    }
  }

  componentDidUpdate(prevProps) {
    // A new page: give it a fresh start.
    if (this.state.error && prevProps.resetKey !== this.props.resetKey) this.setState({ error: null })
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 px-6 text-center">
        <h1 className="text-xl font-bold text-gray-900 dark:text-white">Something went wrong</h1>
        <p className="max-w-sm text-sm text-gray-600 dark:text-gray-300">
          This page didn't load properly. Reloading usually fixes it; your cart and orders are safe.
        </p>
        <div className="mt-2 flex gap-3">
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="rounded-full bg-[#ea580c] px-5 py-2 text-sm font-bold text-white hover:bg-[#d95d08]"
          >
            Reload
          </button>
          <Link to="/orders" className="rounded-full border border-gray-300 px-5 py-2 text-sm font-bold text-gray-800 dark:text-white">
            My orders
          </Link>
        </div>
      </div>
    )
  }
}
