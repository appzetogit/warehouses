import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { Suspense, lazy, useEffect } from 'react'
import { AppShellSkeleton } from '@store/components/ui/loading-skeletons'

const NATIVE_LAST_ROUTE_KEY = 'native_last_route'

// The customer store module — now mounted at root (/)
const StoreApp = lazy(() => import('../modules/Store/routes'))
import ProtectedRoute from '@store/components/ProtectedRoute'

const PageLoader = () => <AppShellSkeleton />

/** Renders the store module for everything under /food (legacy) and / (new). */
const StoreAppWrapper = () => {
  return (
    <Suspense fallback={<PageLoader />}>
      <StoreApp />
    </Suspense>
  )
}

const AdminRouter = lazy(() => import('../modules/Store/components/admin/AdminRouter'))
const SellerRouter = lazy(() => import('../modules/Store/components/seller/SellerRouter'))

/**
 * Legacy redirect: sends old /food/user/* addresses to the new root paths.
 * e.g. /food/user/cart → /cart, /food/user/sellers/x → /sellers/x
 */
const RedirectFromLegacyUser = () => {
  const location = useLocation()
  // Strip /food/user prefix and redirect to root-relative path
  const newPath = location.pathname.replace(/^(\/food)?\/user\/?/, '/') || '/'
  return <Navigate to={`${newPath}${location.search}${location.hash}`} replace />
}

/**
 * Legacy redirect: sends old /food/* addresses (non-user) to appropriate paths.
 */
const RedirectFromLegacyFood = () => {
  const location = useLocation()
  // Strip /food prefix
  const remaining = location.pathname.replace(/^\/food\/?/, '/') || '/'
  return <Navigate to={`${remaining}${location.search}${location.hash}`} replace />
}

/**
 * Sends the old /food/seller/* addresses to /seller/*.
 */
const RedirectToSeller = () => {
  const location = useLocation()
  const target =
    location.pathname.replace(/^\/food\/seller/, '/seller') +
    location.search +
    location.hash
  return <Navigate to={target} replace />
}

const AppRoutes = () => {
  const location = useLocation()

  useEffect(() => {
    if (typeof window === 'undefined') return

    const protocol = String(window.location?.protocol || '').toLowerCase()
    const userAgent = String(window.navigator?.userAgent || '').toLowerCase()
    const isNativeLikeShell =
      Boolean(window.flutter_inappwebview) ||
      Boolean(window.ReactNativeWebView) ||
      protocol === 'file:' ||
      userAgent.includes(' wv') ||
      userAgent.includes('; wv')

    if (!isNativeLikeShell) return

    const route = `${location.pathname || ''}${location.search || ''}`
    if (route !== '/') {
      localStorage.setItem(NATIVE_LAST_ROUTE_KEY, route)
    }
  }, [location.pathname, location.search])

  return (
    <Routes>
      {/* ============ Legacy Redirects (backward compatibility) ============ */}

      {/* Old seller portal paths under /food */}
      <Route path="/food/seller/*" element={<RedirectToSeller />} />

      {/* Old customer paths: /food/user/* → / */}
      <Route path="/food/user/*" element={<RedirectFromLegacyUser />} />
      {/* Customer pages moved to the root; many links still say /user/... */}
      <Route path="/user/*" element={<RedirectFromLegacyUser />} />

      {/* The rider web app still lives at /food/delivery/*. The store module
          is mounted at /food so its own delivery/* route sees "delivery/…";
          mounting it at /food/delivery would leave just "orders", which its
          catch-all would hand to the customer store. The more specific
          /food/user and /food/seller redirects above win over this. */}
      <Route path="/food/*" element={<StoreAppWrapper />} />
      <Route path="/food" element={<Navigate to="/" replace />} />

      {/* ============ Canonical Routes ============ */}

      {/* Seller Portal */}
      <Route
        path="/seller/*"
        element={
          <Suspense fallback={<PageLoader />}>
            <SellerRouter />
          </Suspense>
        }
      />

      {/* Global Admin Portal */}
      <Route
        path="/admin/*"
        element={
          <Suspense fallback={<PageLoader />}>
            <AdminRouter />
          </Suspense>
        }
      />

      {/* Customer Storefront — now at root (/) */}
      <Route path="/*" element={<StoreAppWrapper />} />
    </Routes>
  )
}

export default AppRoutes
