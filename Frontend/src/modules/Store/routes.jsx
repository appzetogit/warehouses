import { Routes, Route, Navigate, useLocation, useNavigationType } from "react-router-dom"
import { useEffect, useLayoutEffect, useRef, Suspense, lazy } from "react"
import ProtectedRoute from "@store/components/ProtectedRoute"
import AuthRedirect from "@store/components/AuthRedirect"
import Loader from "@store/components/Loader"
import PushSoundEnableButton from "@store/components/PushSoundEnableButton"
import { registerWebPushForCurrentModule } from "@store/utils/firebaseMessaging"
import { isModuleAuthenticated } from "@store/utils/auth"
import { useSellerNotifications } from "@store/hooks/useSellerNotifications"
import { applyModulePowerScanning, getCachedSettings } from "@store/utils/businessSettings"
import { PublicAppConfigProvider } from "@store/context/PublicAppConfigContext"
import { shouldSkipScrollResetForHome } from "@store/utils/homeScrollRestore"

// Lazy Loading Components
const UserRouter = lazy(() => import("@store/components/user/UserRouter"))

// Seller Module
const SellerRouter = lazy(() => import("@store/components/seller/SellerRouter"))

// Admin Module
const AdminRouter = lazy(() => import("@store/components/admin/AdminRouter"))
const AdminLogin = lazy(() => import("@store/pages/admin/auth/AdminLogin"))
const AdminForgotPassword = lazy(() => import("@store/pages/admin/auth/AdminForgotPassword"))

// Delivery Module
const DeliveryRouter = lazy(() => import("../DeliveryV2"))

/*
 * Where each history entry was scrolled to, by location.key, so Back/Forward
 * returns to the same spot (a listing, a search) instead of the top.
 */
const SCROLL_POSITIONS_KEY = "store_scroll_positions_v1"
const MAX_SCROLL_ENTRIES = 60

function readScrollPositions() {
  try {
    const parsed = JSON.parse(sessionStorage.getItem(SCROLL_POSITIONS_KEY) || "{}")
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {}
  } catch {
    return {}
  }
}

function saveScrollPosition(key, y) {
  if (!key) return
  try {
    const all = readScrollPositions()
    delete all[key]
    all[key] = Math.max(0, Math.round(y))
    const keys = Object.keys(all)
    for (const old of keys.slice(0, Math.max(0, keys.length - MAX_SCROLL_ENTRIES))) delete all[old]
    sessionStorage.setItem(SCROLL_POSITIONS_KEY, JSON.stringify(all))
  } catch {
    // private mode / quota: Back just starts at the top
  }
}

// Scroll to top on a new page; on Back/Forward (POP) go back to where that
// entry was, once its content has loaded. Home keeps its own restore.
function ScrollToTop() {
  const location = useLocation();
  const navigationType = useNavigationType();
  const keyRef = useRef(location.key);
  const restoringRef = useRef(false);

  useEffect(() => {
    if ("scrollRestoration" in window.history) window.history.scrollRestoration = "manual";
    // Throttled: the latest position per entry, written at most every 150ms.
    let pending = null;
    let timer = 0;
    const flush = () => {
      window.clearTimeout(timer);
      timer = 0;
      if (pending) saveScrollPosition(pending.key, pending.y);
      pending = null;
    };
    const onScroll = () => {
      if (restoringRef.current) return;
      // A different entry now: write the last one's spot before it is replaced.
      if (pending && pending.key !== keyRef.current) flush();
      pending = { key: keyRef.current, y: window.scrollY || 0 };
      if (!timer) timer = window.setTimeout(flush, 150);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("pagehide", flush);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("pagehide", flush);
      flush();
    };
  }, []);

  // A layout effect: the new key and the saved spot are read before any
  // scroll event of the new page can overwrite them.
  useLayoutEffect(() => {
    keyRef.current = location.key;
    if (shouldSkipScrollResetForHome(location.pathname)) return undefined;

    const target = navigationType === "POP" ? Number(readScrollPositions()[location.key]) || 0 : 0;
    if (!target) {
      // A replace that only rewrites the query (a listing's sort or filters)
      // is still a change of results: start them from the top.
      window.scrollTo(0, 0);
      return undefined;
    }

    // Content comes in after the route renders: keep trying until the page is
    // tall enough and has settled, or the shopper scrolls themselves.
    restoringRef.current = true;
    const started = Date.now();
    let settledSince = 0;
    let lastHeight = 0;
    let timer = 0;
    const finish = (save) => {
      restoringRef.current = false;
      window.clearInterval(timer);
      window.removeEventListener("wheel", stop);
      window.removeEventListener("touchstart", stop);
      window.removeEventListener("keydown", stop);
      window.removeEventListener("mousedown", stop);
      if (save) saveScrollPosition(location.key, window.scrollY || 0);
    };
    const stop = () => finish(true);
    const tick = () => {
      const height = document.documentElement.scrollHeight;
      const reachable = height - window.innerHeight >= target - 2;
      window.scrollTo(0, target);
      if (reachable && height === lastHeight) {
        if (!settledSince) settledSince = Date.now();
        if (Date.now() - settledSince >= 600) return stop();
      } else {
        settledSince = 0;
      }
      lastHeight = height;
      if (Date.now() - started > 4000) stop();
      return undefined;
    };
    window.addEventListener("wheel", stop, { passive: true });
    window.addEventListener("touchstart", stop, { passive: true });
    window.addEventListener("keydown", stop);
    window.addEventListener("mousedown", stop);
    timer = window.setInterval(tick, 50);
    tick();
    // Leaving mid-restore: the window already shows the next page, nothing to save.
    return () => finish(false);
  }, [location.pathname, location.search, location.key, navigationType]);
  return null;
}

function SellerGlobalNotificationListenerInner() {
  useSellerNotifications()
  return null
}

function SellerGlobalNotificationListener() {
  const location = useLocation()
  const isSellerRoute =
    location.pathname.startsWith("/seller") &&
    !location.pathname.startsWith("/sellers")
  const isSellerAuthRoute =
    location.pathname === "/seller/login" ||
    location.pathname === "/seller/auth/sign-in" ||
    location.pathname === "/seller/signup" ||
    location.pathname === "/seller/signup-email" ||
    location.pathname === "/seller/forgot-password" ||
    location.pathname === "/seller/otp" ||
    location.pathname === "/seller/welcome" ||
    location.pathname === "/seller/auth/google-callback"
  const isOrderManagedRoute =
    location.pathname === "/seller" ||
    location.pathname === "/seller/orders" ||
    location.pathname.startsWith("/seller/orders/")

  const shouldListen =
    isSellerRoute &&
    !isSellerAuthRoute &&
    !isOrderManagedRoute &&
    isModuleAuthenticated("seller")

  if (!shouldListen) {
    return null
  }

  return <SellerGlobalNotificationListenerInner />
}

export default function App() {
  const location = useLocation()

  useEffect(() => {
    registerWebPushForCurrentModule(location.pathname)
  }, [location.pathname])

  useEffect(() => {
    const resolveModule = () => {
      if (location.pathname.startsWith("/seller")) return "seller"
      if (location.pathname.startsWith("/food/delivery") || location.pathname.startsWith("/delivery")) return "delivery"
      return "user"
    }

    const cached = getCachedSettings()
    if (cached) {
      applyModulePowerScanning(resolveModule(), cached)
    }
  }, [location.pathname])

  return (
    <PublicAppConfigProvider>
      <ScrollToTop />
      <SellerGlobalNotificationListener />
      <PushSoundEnableButton />
      <Suspense fallback={<Loader />}>
        <Routes>
          {/* User/Customer Module — mounted at root */}
          <Route
            path="/*"
            element={<UserRouter />}
          />

          {/* Seller Module */}
          <Route
            path="seller/*"
            element={
              <SellerRouter />
            }
          />

          {/* Delivery Module */}
          <Route
            path="delivery/*"
            element={<DeliveryRouter />}
          />
        </Routes>
      </Suspense>
    </PublicAppConfigProvider>
  )
}
