import { Suspense, lazy, useEffect } from "react"
import { Routes, Route } from "react-router-dom"
import DeliveryLayout from "./DeliveryLayout"
import ProtectedRoute from "./ProtectedRoute"
import Loader from "@store/components/Loader"

// Main pages (with layout)
const DeliveryHome = lazy(() => import("@store/pages/delivery/DeliveryHome"))
const Notifications = lazy(() => import("@store/pages/delivery/Notifications"))
const MyOrders = lazy(() => import("@store/pages/delivery/MyOrders"))
const PocketPage = lazy(() => import("@store/pages/delivery/PocketPage"))
const GigBooking = lazy(() => import("@store/pages/delivery/GigBooking"))
const PickupDirectionsPage = lazy(() => import("@store/pages/delivery/PickupDirectionsPage"))
const ProfilePage = lazy(() => import("@store/pages/delivery/ProfilePage"))
const ProfileDetails = lazy(() => import("@store/pages/delivery/ProfileDetails"))
const AcceptedOrderDetails = lazy(() => import("@store/pages/delivery/AcceptedOrderDetails"))
const MyAccount = lazy(() => import("@store/pages/delivery/MyAccount"))
const TransactionHistory = lazy(() => import("@store/pages/delivery/TransactionHistory"))
const EditProfile = lazy(() => import("@store/pages/delivery/EditProfile"))
const Settings = lazy(() => import("@store/pages/delivery/Settings"))
const Conversation = lazy(() => import("@store/pages/delivery/Conversation"))
const TermsAndConditions = lazy(() => import("@store/pages/delivery/TermsAndConditions"))
const PrivacyPolicy = lazy(() => import("@store/pages/delivery/PrivacyPolicy"))
const Payout = lazy(() => import("@store/pages/delivery/Payout"))
const DeductionStatement = lazy(() => import("@store/pages/delivery/DeductionStatement"))
const TipsStatement = lazy(() => import("@store/pages/delivery/TipsStatement"))
const PocketStatement = lazy(() => import("@store/pages/delivery/PocketStatement"))
const FuelPayment = lazy(() => import("@store/pages/delivery/FuelPayment"))
const LimitSettlement = lazy(() => import("@store/pages/delivery/LimitSettlement"))
const OffersPage = lazy(() => import("@store/pages/delivery/OffersPage"))
const UpdatesPage = lazy(() => import("@store/pages/delivery/UpdatesPage"))
const SupportTickets = lazy(() => import("@store/pages/delivery/SupportTickets"))
const CreateSupportTicket = lazy(() => import("@store/pages/delivery/CreateSupportTicket"))
const ViewSupportTicket = lazy(() => import("@store/pages/delivery/ViewSupportTicket"))
const ShowIdCard = lazy(() => import("@store/pages/delivery/ShowIdCard"))
const ChangeLanguage = lazy(() => import("@store/pages/delivery/ChangeLanguage"))
const SelectDropLocation = lazy(() => import("@store/pages/delivery/SelectDropLocation"))
const ReferAndEarn = lazy(() => import("@store/pages/delivery/ReferAndEarn"))
const YourReferrals = lazy(() => import("@store/pages/delivery/YourReferrals"))
const Earnings = lazy(() => import("@store/pages/delivery/Earnings"))
const TripHistory = lazy(() => import("@store/pages/delivery/TripHistory"))
const TimeOnOrders = lazy(() => import("@store/pages/delivery/TimeOnOrders"))
const PocketBalancePage = lazy(() => import("@store/pages/delivery/PocketBalance"))
const CustomerTipsBalancePage = lazy(() => import("@store/pages/delivery/CustomerTips"))
const PocketDetails = lazy(() => import("@store/pages/delivery/PocketDetails"))

// Auth pages
const Welcome = lazy(() => import("@store/pages/delivery/auth/Welcome"))
const SignIn = lazy(() => import("@store/pages/delivery/auth/SignIn"))
const OTP = lazy(() => import("@store/pages/delivery/auth/OTP"))
const Signup = lazy(() => import("@store/pages/delivery/auth/Signup"))
const SignupStep1 = lazy(() => import("@store/pages/delivery/auth/SignupStep1"))
const SignupStep2 = lazy(() => import("@store/pages/delivery/auth/SignupStep2"))

export default function DeliveryRouter() {
  // Safely enforce light mode for the Delivery app to prevent User dark mode bleeding
  useEffect(() => {
    document.documentElement.classList.remove('dark');
    return () => {
      const savedTheme = localStorage.getItem('appTheme') || 'light';
      if (savedTheme === 'dark') {
        document.documentElement.classList.add('dark');
      }
    };
  }, []);

  return (
    <Suspense fallback={<Loader />}>
      <Routes>
        {/* Auth routes */}
        <Route path="welcome" element={<Welcome />} />
        <Route path="login" element={<SignIn />} />
        <Route path="otp" element={<OTP />} />
        <Route path="signup" element={<Signup />} />
        <Route path="signup/details" element={<SignupStep1 />} />
        <Route path="signup/documents" element={<SignupStep2 />} />
        {/* Protected routes - require authentication */}
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <DeliveryLayout showGig={true}>
                <DeliveryHome />
              </DeliveryLayout>
            </ProtectedRoute>
          }
        />
        <Route
          element={
            <ProtectedRoute>
              <DeliveryLayout>
                <Notifications />
              </DeliveryLayout>
            </ProtectedRoute>
          }
          path="notifications"
        />
        <Route
          element={
            <ProtectedRoute>
              <DeliveryLayout showGig={true}>
                <MyOrders />
              </DeliveryLayout>
            </ProtectedRoute>
          }
          path="orders"
        />
        <Route
          element={
            <ProtectedRoute>
              <DeliveryLayout showGig={true} showPocket={true}>
                <PocketPage />
              </DeliveryLayout>
            </ProtectedRoute>
          }
          path="requests"
        />
        <Route
          element={
            <ProtectedRoute>
              <DeliveryLayout showGig={true} showPocket={true}>
                <PocketPage />
              </DeliveryLayout>
            </ProtectedRoute>
          }
          path="pocket"
        />
        <Route
          element={
            <ProtectedRoute>
              <DeliveryLayout showGig={true}>
                <GigBooking />
              </DeliveryLayout>
            </ProtectedRoute>
          }
          path="gig"
        />
        <Route
          element={
            <ProtectedRoute>
              <SelectDropLocation />
            </ProtectedRoute>
          }
          path="select-drop-location"
        />
        <Route
          element={
            <ProtectedRoute>
              <DeliveryLayout>
                <ReferAndEarn />
              </DeliveryLayout>
            </ProtectedRoute>
          }
          path="refer-and-earn"
        />
        <Route
          element={
            <ProtectedRoute>
              <DeliveryLayout>
                <YourReferrals />
              </DeliveryLayout>
            </ProtectedRoute>
          }
          path="your-referrals"
        />
        <Route
          element={
            <ProtectedRoute>
              <DeliveryLayout showGig={true}>
                <OffersPage />
              </DeliveryLayout>
            </ProtectedRoute>
          }
          path="offers"
        />
        <Route
          element={
            <ProtectedRoute>
              <DeliveryLayout>
                <PickupDirectionsPage />
              </DeliveryLayout>
            </ProtectedRoute>
          }
          path="pickup-directions"
        />
        <Route
          element={
            <ProtectedRoute>
              <DeliveryLayout showGig={true}>
                <ProfilePage />
              </DeliveryLayout>
            </ProtectedRoute>
          }
          path="profile"
        />
        <Route
          element={
            <ProtectedRoute>
              <DeliveryLayout>
                <ProfileDetails />
              </DeliveryLayout>
            </ProtectedRoute>
          }
          path="profile/details"
        />
        <Route
          element={
            <ProtectedRoute>
              <DeliveryLayout>
                <AcceptedOrderDetails />
              </DeliveryLayout>
            </ProtectedRoute>
          }
          path="order/:orderId"
        />
        <Route
          element={
            <ProtectedRoute>
              <DeliveryLayout>
                <MyAccount />
              </DeliveryLayout>
            </ProtectedRoute>
          }
          path="account"
        />
        <Route
          element={
            <ProtectedRoute>
              <DeliveryLayout>
                <Earnings />
              </DeliveryLayout>
            </ProtectedRoute>
          }
          path="earnings"
        />
        <Route
          element={
            <ProtectedRoute>
              <DeliveryLayout>
                <TripHistory />
              </DeliveryLayout>
            </ProtectedRoute>
          }
          path="trip-history"
        />
        <Route
          element={
            <ProtectedRoute>
              <DeliveryLayout>
                <TimeOnOrders />
              </DeliveryLayout>
            </ProtectedRoute>
          }
          path="time-on-orders"
        />
        <Route
          element={
            <ProtectedRoute>
              <DeliveryLayout>
                <TransactionHistory />
              </DeliveryLayout>
            </ProtectedRoute>
          }
          path="transactions"
        />
        <Route
          element={
            <ProtectedRoute>
              <DeliveryLayout>
                <Payout />
              </DeliveryLayout>
            </ProtectedRoute>
          }
          path="payout"
        />
        <Route
          element={
            <ProtectedRoute>
              <DeliveryLayout>
                <DeductionStatement />
              </DeliveryLayout>
            </ProtectedRoute>
          }
          path="deduction-statement"
        />
        <Route
          element={
            <ProtectedRoute>
              <DeliveryLayout>
                <CustomerTipsBalancePage />
              </DeliveryLayout>
            </ProtectedRoute>
          }
          path="customer-tips-balance"
        />
        <Route
          element={
            <ProtectedRoute>
              <DeliveryLayout>
                <PocketBalancePage />
              </DeliveryLayout>
            </ProtectedRoute>
          }
          path="pocket-balance"
        />
        <Route
          element={
            <ProtectedRoute>
              <DeliveryLayout>
                <TipsStatement />
              </DeliveryLayout>
            </ProtectedRoute>
          }
          path="tips-statement"
        />
        <Route
          element={
            <ProtectedRoute>
              <DeliveryLayout>
                <PocketStatement />
              </DeliveryLayout>
            </ProtectedRoute>
          }
          path="pocket-statement"
        />
        <Route
          element={
            <ProtectedRoute>
              <DeliveryLayout>
                <FuelPayment />
              </DeliveryLayout>
            </ProtectedRoute>
          }
          path="fuel-payment"
        />
        <Route
          element={
            <ProtectedRoute>
              <DeliveryLayout>
                <LimitSettlement />
              </DeliveryLayout>
            </ProtectedRoute>
          }
          path="limit-settlement"
        />
        <Route
          element={
            <ProtectedRoute>
              <DeliveryLayout>
                <PocketDetails />
              </DeliveryLayout>
            </ProtectedRoute>
          }
          path="pocket-details"
        />
        <Route
          element={
            <ProtectedRoute>
              <DeliveryLayout>
                <EditProfile />
              </DeliveryLayout>
            </ProtectedRoute>
          }
          path="profile/edit"
        />
        <Route
          element={
            <ProtectedRoute>
              <DeliveryLayout>
                <Settings />
              </DeliveryLayout>
            </ProtectedRoute>
          }
          path="profile/settings"
        />
        <Route
          element={
            <ProtectedRoute>
              <DeliveryLayout>
                <Conversation />
              </DeliveryLayout>
            </ProtectedRoute>
          }
          path="profile/conversation"
        />
        <Route
          element={
            <ProtectedRoute>
              <DeliveryLayout>
                <TermsAndConditions />
              </DeliveryLayout>
            </ProtectedRoute>
          }
          path="profile/terms"
        />
        <Route
          element={
            <ProtectedRoute>
              <DeliveryLayout>
                <PrivacyPolicy />
              </DeliveryLayout>
            </ProtectedRoute>
          }
          path="profile/privacy"
        />
        <Route
          element={
            <ProtectedRoute>
              <DeliveryLayout showGig={true}>
                <UpdatesPage />
              </DeliveryLayout>
            </ProtectedRoute>
          }
          path="updates"
        />
        <Route
          element={
            <ProtectedRoute>
              <DeliveryLayout>
                <SupportTickets />
              </DeliveryLayout>
            </ProtectedRoute>
          }
          path="help/tickets"
        />
        <Route
          element={
            <ProtectedRoute>
              <DeliveryLayout>
                <CreateSupportTicket />
              </DeliveryLayout>
            </ProtectedRoute>
          }
          path="help/create-ticket"
        />
        <Route
          element={
            <ProtectedRoute>
              <DeliveryLayout>
                <ViewSupportTicket />
              </DeliveryLayout>
            </ProtectedRoute>
          }
          path="help/tickets/:id"
        />
        <Route
          element={
            <ProtectedRoute>
              <DeliveryLayout>
                <ShowIdCard />
              </DeliveryLayout>
            </ProtectedRoute>
          }
          path="help/id-card"
        />
        <Route
          element={
            <ProtectedRoute>
              <DeliveryLayout>
                <ChangeLanguage />
              </DeliveryLayout>
            </ProtectedRoute>
          }
          path="help/language"
        />
      </Routes>
    </Suspense>
  )
}
