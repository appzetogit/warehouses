import { Suspense, lazy, useEffect } from "react"
import { Routes, Route, Outlet } from "react-router-dom"
import ProtectedRoute from "@food/components/ProtectedRoute"
import AuthRedirect from "@food/components/AuthRedirect"
import Loader from "@food/components/Loader"
import SellerLayout from "@food/components/seller/SellerLayout"
import { applyModuleBranding, getCachedSettings, loadBusinessSettings } from "@food/utils/businessSettings"

const LayoutWrapper = () => (
  <SellerLayout>
    <Outlet />
  </SellerLayout>
)

// Lazy Loading Components
const AllOrdersPage = lazy(() => import("@food/pages/seller/AllOrdersPage"))
const OrdersMain = lazy(() => import("@food/pages/seller/OrdersMain"))
const SellerNotifications = lazy(() => import("@food/pages/seller/Notifications"))
const SellerOnboarding = lazy(() => import("@food/pages/seller/Onboarding"))
const CouponListPage = lazy(() => import("@food/pages/seller/CouponListPage"))
const AddCouponPage = lazy(() => import("@food/pages/seller/AddCouponPage"))
const EditCouponPage = lazy(() => import("@food/pages/seller/EditCouponPage"))
const MenuCategoriesPage = lazy(() => import("@food/pages/seller/MenuCategoriesPage"))
const DeliverySettings = lazy(() => import("@food/pages/seller/DeliverySettings"))
const RushHour = lazy(() => import("@food/pages/seller/RushHour"))
const OutletTimings = lazy(() => import("@food/pages/seller/OutletTimings"))
const DaySlots = lazy(() => import("@food/pages/seller/DaySlots"))
const OutletInfo = lazy(() => import("@food/pages/seller/OutletInfo"))
const RatingsReviews = lazy(() => import("@food/pages/seller/RatingsReviews"))
const EditOwner = lazy(() => import("@food/pages/seller/EditOwner"))
const EditCuisines = lazy(() => import("@food/pages/seller/EditCuisines"))
const EditSellerAddress = lazy(() => import("@food/pages/seller/EditSellerAddress"))
const Inventory = lazy(() => import("@food/pages/seller/Inventory"))
const Feedback = lazy(() => import("@food/pages/seller/Feedback"))
const ShareFeedback = lazy(() => import("@food/pages/seller/ShareFeedback"))
const DishRatings = lazy(() => import("@food/pages/seller/DishRatings"))
const SellerSupport = lazy(() => import("@food/pages/seller/SellerSupport"))
const FssaiDetails = lazy(() => import("@food/pages/seller/FssaiDetails"))
const FssaiUpdate = lazy(() => import("@food/pages/seller/FssaiUpdate"))
const Hyperpure = lazy(() => import("@food/pages/seller/Hyperpure"))
const ItemDetailsPage = lazy(() => import("@food/pages/seller/ItemDetailsPage"))
const HubFinance = lazy(() => import("@food/pages/seller/HubFinance"))
const FinanceDetailsPage = lazy(() => import("@food/pages/seller/FinanceDetailsPage"))
const WithdrawalHistoryPage = lazy(() => import("@food/pages/seller/WithdrawalHistoryPage"))
const PhoneNumbersPage = lazy(() => import("@food/pages/seller/PhoneNumbersPage"))
const DownloadReport = lazy(() => import("@food/pages/seller/DownloadReport"))
const ManageOutlets = lazy(() => import("@food/pages/seller/ManageOutlets"))
const UpdateBankDetails = lazy(() => import("@food/pages/seller/UpdateBankDetails"))
const ZoneSetup = lazy(() => import("@food/pages/seller/ZoneSetup"))
const DiningReservations = lazy(() => import("@food/pages/seller/DiningReservations"))
const SellerStatus = lazy(() => import("@food/pages/seller/SellerStatus"))
const ExploreMore = lazy(() => import("@food/pages/seller/ExploreMore"))
const SellerPrivacy = lazy(() => import("@food/pages/seller/Privacy"))
const SellerTerms = lazy(() => import("@food/pages/seller/Terms"))
const SellerCMSHelpSupport = lazy(() => import("@food/pages/seller/CMSHelpSupport"))
const OrderDetailPage = lazy(() => import("@food/pages/seller/OrderDetailPage"))

const Welcome = lazy(() => import("@food/pages/seller/auth/Welcome"))
const Login = lazy(() => import("@food/pages/seller/auth/Login"))
const OTP = lazy(() => import("@food/pages/seller/auth/OTP"))
const Signup = lazy(() => import("@food/pages/seller/auth/Signup"))
const ForgotPassword = lazy(() => import("@food/pages/seller/auth/ForgotPassword"))
const VerificationPending = lazy(() => import("@food/pages/seller/auth/VerificationPending"))
const Subscription = lazy(() => import("@food/pages/seller/Subscription"))

export default function SellerRouter() {
  // Safely enforce light mode for the Seller app to prevent User dark mode bleeding
  useEffect(() => {
    document.documentElement.classList.remove('dark');
    return () => {
      const savedTheme = localStorage.getItem('appTheme') || 'light';
      if (savedTheme === 'dark') {
        document.documentElement.classList.add('dark');
      }
    };
  }, []);

  useEffect(() => {
    const applyBranding = async () => {
      const cached = getCachedSettings()
      if (cached) {
        applyModuleBranding("seller", cached)
      } else {
        const settings = await loadBusinessSettings()
        applyModuleBranding("seller", settings)
      }
    }

    applyBranding()
    const handleSettingsUpdate = () => applyBranding()
    window.addEventListener("businessSettingsUpdated", handleSettingsUpdate)
    return () => window.removeEventListener("businessSettingsUpdated", handleSettingsUpdate)
  }, [])

  return (
    <Suspense fallback={<Loader />}>
      <Routes>
        {/* Auth Routes */}
        <Route path="welcome" element={<AuthRedirect module="seller"><Welcome /></AuthRedirect>} />
        <Route path="login" element={<AuthRedirect module="seller"><Login /></AuthRedirect>} />
        <Route path="otp" element={<AuthRedirect module="seller"><OTP /></AuthRedirect>} />
        <Route path="signup" element={<AuthRedirect module="seller"><Signup /></AuthRedirect>} />
        <Route path="forgot-password" element={<AuthRedirect module="seller"><ForgotPassword /></AuthRedirect>} />
        <Route path="pending-verification" element={<AuthRedirect module="seller"><VerificationPending /></AuthRedirect>} />

        <Route path="onboarding" element={<AuthRedirect module="seller"><SellerOnboarding /></AuthRedirect>} />

        {/* Protected app shell (desktop sidebar + mobile chrome) */}
        <Route element={<LayoutWrapper />}>
          <Route element={<ProtectedRoute requiredRole="seller" loginPath="/seller/login"><OrdersMain /></ProtectedRoute>} path="" />
          <Route element={<ProtectedRoute requiredRole="seller" loginPath="/seller/login"><SellerNotifications /></ProtectedRoute>} path="notifications" />
          <Route element={<ProtectedRoute requiredRole="seller" loginPath="/seller/login"><AllOrdersPage /></ProtectedRoute>} path="orders/all" />
          <Route element={<ProtectedRoute requiredRole="seller" loginPath="/seller/login"><OrderDetailPage /></ProtectedRoute>} path="orders/:id" />
          <Route element={<ProtectedRoute requiredRole="seller" loginPath="/seller/login"><CouponListPage /></ProtectedRoute>} path="coupon" />
          <Route element={<ProtectedRoute requiredRole="seller" loginPath="/seller/login"><AddCouponPage /></ProtectedRoute>} path="coupon/new" />
          <Route element={<ProtectedRoute requiredRole="seller" loginPath="/seller/login"><EditCouponPage /></ProtectedRoute>} path="coupon/:id/edit" />
          <Route element={<ProtectedRoute requiredRole="seller" loginPath="/seller/login"><DeliverySettings /></ProtectedRoute>} path="delivery-settings" />
          <Route element={<ProtectedRoute requiredRole="seller" loginPath="/seller/login"><RushHour /></ProtectedRoute>} path="rush-hour" />
          <Route element={<ProtectedRoute requiredRole="seller" loginPath="/seller/login"><MenuCategoriesPage /></ProtectedRoute>} path="menu-categories" />
          <Route element={<ProtectedRoute requiredRole="seller" loginPath="/seller/login"><SellerStatus /></ProtectedRoute>} path="status" />
          <Route element={<ProtectedRoute requiredRole="seller" loginPath="/seller/login"><ExploreMore /></ProtectedRoute>} path="explore" />
          <Route element={<ProtectedRoute requiredRole="seller" loginPath="/seller/login"><OutletTimings /></ProtectedRoute>} path="outlet-timings" />
          <Route element={<ProtectedRoute requiredRole="seller" loginPath="/seller/login"><DaySlots /></ProtectedRoute>} path="outlet-timings/:day" />
          <Route element={<ProtectedRoute requiredRole="seller" loginPath="/seller/login"><OutletInfo /></ProtectedRoute>} path="outlet-info" />
          <Route element={<ProtectedRoute requiredRole="seller" loginPath="/seller/login"><RatingsReviews /></ProtectedRoute>} path="ratings-reviews" />
          <Route element={<ProtectedRoute requiredRole="seller" loginPath="/seller/login"><EditOwner /></ProtectedRoute>} path="edit-owner" />
          <Route element={<ProtectedRoute requiredRole="seller" loginPath="/seller/login"><EditCuisines /></ProtectedRoute>} path="edit-cuisines" />
          <Route element={<ProtectedRoute requiredRole="seller" loginPath="/seller/login"><EditSellerAddress /></ProtectedRoute>} path="edit-address" />
          <Route element={<ProtectedRoute requiredRole="seller" loginPath="/seller/login"><Inventory /></ProtectedRoute>} path="inventory" />
          <Route element={<ProtectedRoute requiredRole="seller" loginPath="/seller/login"><Feedback /></ProtectedRoute>} path="feedback" />
          <Route element={<ProtectedRoute requiredRole="seller" loginPath="/seller/login"><ShareFeedback /></ProtectedRoute>} path="share-feedback" />
          <Route element={<ProtectedRoute requiredRole="seller" loginPath="/seller/login"><DishRatings /></ProtectedRoute>} path="dish-ratings" />
          <Route element={<ProtectedRoute requiredRole="seller" loginPath="/seller/login"><SellerSupport /></ProtectedRoute>} path="help-centre/support" />
          <Route element={<ProtectedRoute requiredRole="seller" loginPath="/seller/login"><FssaiDetails /></ProtectedRoute>} path="fssai" />
          <Route element={<ProtectedRoute requiredRole="seller" loginPath="/seller/login"><FssaiUpdate /></ProtectedRoute>} path="fssai/update" />
          <Route element={<ProtectedRoute requiredRole="seller" loginPath="/seller/login"><Hyperpure /></ProtectedRoute>} path="hyperpure" />
          <Route element={<ProtectedRoute requiredRole="seller" loginPath="/seller/login"><ItemDetailsPage /></ProtectedRoute>} path="hub-menu/item/:id" />
          <Route element={<ProtectedRoute requiredRole="seller" loginPath="/seller/login"><HubFinance /></ProtectedRoute>} path="hub-finance" />
          <Route element={<ProtectedRoute requiredRole="seller" loginPath="/seller/login"><Subscription /></ProtectedRoute>} path="subscription" />
          <Route element={<ProtectedRoute requiredRole="seller" loginPath="/seller/login"><WithdrawalHistoryPage /></ProtectedRoute>} path="withdrawal-history" />
          <Route element={<ProtectedRoute requiredRole="seller" loginPath="/seller/login"><FinanceDetailsPage /></ProtectedRoute>} path="finance-details" />
          <Route element={<ProtectedRoute requiredRole="seller" loginPath="/seller/login"><PhoneNumbersPage /></ProtectedRoute>} path="phone" />
          <Route element={<ProtectedRoute requiredRole="seller" loginPath="/seller/login"><DownloadReport /></ProtectedRoute>} path="download-report" />
          <Route element={<ProtectedRoute requiredRole="seller" loginPath="/seller/login"><ManageOutlets /></ProtectedRoute>} path="manage-outlets" />
          <Route element={<ProtectedRoute requiredRole="seller" loginPath="/seller/login"><UpdateBankDetails /></ProtectedRoute>} path="update-bank-details" />
          <Route element={<ProtectedRoute requiredRole="seller" loginPath="/seller/login"><DiningReservations /></ProtectedRoute>} path="reservations" />
          <Route element={<ProtectedRoute requiredRole="seller" loginPath="/seller/login"><ZoneSetup /></ProtectedRoute>} path="zone-setup" />
        </Route>

        {/* CMS Content Routes (Stay public-accessible but inside router) */}
        <Route path="privacy" element={<SellerPrivacy />} />
        <Route path="terms" element={<SellerTerms />} />
        <Route path="help-content" element={<SellerCMSHelpSupport />} />
      </Routes>
    </Suspense>
  )
}
