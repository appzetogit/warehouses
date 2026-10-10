import { Link } from "react-router-dom"
import { SearchX } from "lucide-react"
import { useStoreMode } from "@store/context/StoreModeContext"

/** Shown for any storefront address that has no page. */
export default function NotFound() {
  const { storePath } = useStoreMode()
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-4 py-16 text-center">
      <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-orange-50 text-orange-500 dark:bg-orange-950/40">
        <SearchX className="h-8 w-8" aria-hidden="true" />
      </div>
      <h1 className="text-xl font-bold text-gray-900 dark:text-white">Page not found</h1>
      <p className="mt-2 max-w-sm text-sm text-gray-500 dark:text-gray-400">
        The page you were looking for doesn&apos;t exist or has moved.
      </p>
      <Link
        to={storePath("/")}
        className="mt-6 inline-flex h-11 items-center justify-center rounded-xl bg-[#EA580C] px-6 text-sm font-bold text-white transition hover:bg-[#C2410C]"
      >
        Go to Home
      </Link>
    </div>
  )
}
