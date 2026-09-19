import { Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { Suspense, lazy, useEffect, useState } from 'react'
import { AppShellSkeleton } from '@store/components/ui/loading-skeletons'
import LandingPage from './LandingPage'
import { isFeatureEnabled, loadCorePublicAppConfig } from '@store/services/publicAppConfig'

const NATIVE_LAST_ROUTE_KEY = 'native_last_route'

// Lazy load the Food service module (Quick-spicy app)
const StoreApp = lazy(() => import('../modules/Store/routes'))
const AuthApp = lazy(() => import('../modules/auth/routes'))
import ProtectedRoute from '@store/components/ProtectedRoute'

const PageLoader = () => <AppShellSkeleton />

/**
 * StoreAppWrapper — Quick-spicy App. को /food prefix के साथ render करता है.
 * 
 * Quick-spicy की App.jsx में routes /seller, /usermain, /admin, /delivery
 * जैसे hain (bina /food prefix ke). Yahan hum useLocation se /food ke baad wala
 * path nikalne ke baad StoreApp render karte hain. StoreApp internally BrowserRouter
 * nahi use karta (sirf Routes use karta hai), isliye ye directly kaam karta hai.
 */
const StoreAppWrapper = () => {
  return (
    <Suspense fallback={<PageLoader />}>
      <StoreApp />
    </Suspense>
  )
}

const RedirectToStore = () => {
  const location = useLocation();
  // We safely replace the exact current pathname with a /food prefixed pathname
  // This effectively catches programmatic navigation to absolute paths like '/seller/login'
  // and turns them into '/food/seller/login'
  return <Navigate to={`/food${location.pathname}${location.search}`} replace />;
};

const RootEntryRoute = () => {
  const [loading, setLoading] = useState(true)
  const [showLandingAtRoot, setShowLandingAtRoot] = useState(true)

  useEffect(() => {
    const loadFeatureSettings = async () => {
      try {
        await loadCorePublicAppConfig()
        setShowLandingAtRoot(
          isFeatureEnabled("root_landing_and_unregistered_control", true),
        )
      } catch (_error) {
        // fallback to landing page when API is unavailable
      } finally {
        setLoading(false)
      }
    }
    loadFeatureSettings()
  }, [])

  if (loading) return <PageLoader />
  if (!showLandingAtRoot) return <Navigate to="/food/user" replace />
  return <LandingPage />
}


const AdminRouter = lazy(() => import('../modules/Store/components/admin/AdminRouter'))
const SellerRouter = lazy(() => import('../modules/Store/components/seller/SellerRouter'))

/**
 * Sends the old /food/seller/* addresses to /seller/*.
 *
 * A redirect rather than a second mount: two live copies of the panel would
 * mean two sessions, two sets of sockets, and a bug fixed in one of them. The
 * rest of the path, the query string and the hash survive, so a deep link to a
 * specific order still lands on it.
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
    if (route.startsWith('/food/') || route.startsWith('/admin')) {
      localStorage.setItem(NATIVE_LAST_ROUTE_KEY, route)
    }
  }, [location.pathname, location.search])

  return (
    <Routes>
      {/* Root → Master Landing Page */}
      <Route path="/" element={<RootEntryRoute />} />

      {/* Auth Module */}


      {/* Food Module */}
      <Route path="/food/*" element={<StoreAppWrapper />} />

      {/* Seller Portal. Canonical home of the partner panel. */}
      <Route
        path="/seller/*"
        element={
          <Suspense fallback={<PageLoader />}>
            <SellerRouter />
          </Suspense>
        }
      />
      {/* Where the panel used to live; bookmarks and old links still resolve. */}
      <Route path="/food/seller/*" element={<RedirectToSeller />} />

      {/* Global Admin Portal - AdminRouter handles its own protection for sub-routes */}
      <Route path="/admin/*" element={<AdminRouter />} />

      {/* NEW Delivery V2 (Parallel testing) */}
      {/* Global Admin Portal - wrap lazy router in Suspense to avoid blank/crash on direct admin URLs */}
      <Route
        path="/admin/*"
        element={
          <Suspense fallback={<PageLoader />}>
            <AdminRouter />
          </Suspense>
        }
      />
      
      {/* Dynamic intercept redirects for bare paths (accessed programmatically) */}
      <Route path="/user/*" element={<RedirectToStore />} />
      <Route path="/seller/*" element={<RedirectToSeller />} />
      <Route path="/delivery/*" element={<RedirectToStore />} />
      <Route path="/usermain/*" element={<RedirectToStore />} />
      <Route path="/profile/*" element={<RedirectToStore />} />
      <Route path="/cart/*" element={<Navigate to="/food/user/cart" replace />} />
      <Route path="/orders/*" element={<RedirectToStore />} />

      {/* Fallback 404 */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default AppRoutes
