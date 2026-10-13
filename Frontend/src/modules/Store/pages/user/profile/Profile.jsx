import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Accessibility,
  ArrowLeft,
  ChevronRight,
  Wallet,
  Package,
  Heart,
  CreditCard,
  Bell,
  HelpCircle,
  LogOut,
  Moon,
  Sun,
  Check,
  MapPin,
  Coins,
  Camera,
  CheckCircle2,
  FileText,
  Gift,
  Info,
  Palette,
  RotateCcw,
  ShieldAlert,
  ShieldCheck,
  ShoppingBag,
  TicketPercent,
  Truck,
  Undo2,
  XCircle,
} from "lucide-react";

import AnimatedPage from "@store/components/user/AnimatedPage";
import { resolveMediaUrl } from "@store/utils/common";
import { Button } from "@store/components/ui/button";
import ProfileRow, {
  GroupCard,
  OrderQuickLink,
  StatCard,
} from "@store/components/user/account/ProfileRow";
import { useProfile } from "@store/context/ProfileContext";
import { useLocationSelector } from "@store/components/user/UserLayout";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@store/components/ui/avatar";
import { useCompanyName } from "@store/hooks/useCompanyName";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@store/components/ui/dialog";
import { userAPI } from "@store/api";
import { clearModuleAuth } from "@store/utils/auth";
import { logoutUserSession } from "@store/utils/moduleLogout";
import { toast } from "sonner";
const debugLog = (...args) => { };
const debugError = (...args) => { };
const USER_SESSION_PREFERENCE_KEYS = ["userVegMode"];

import { registerWebPushForCurrentModule } from "@store/utils/firebaseMessaging";
import DeleteAccountModal from "@store/components/DeleteAccountModal";
import MarketingPushToggle from "@store/components/user/MarketingPushToggle";

export default function Profile() {
  const { userProfile, vegMode, setVegMode, getDefaultAddress, addresses } =
    useProfile();
  const { openLocationSelector } = useLocationSelector();
  const navigate = useNavigate();
  const companyName = useCompanyName();
  const defaultAddress = getDefaultAddress?.();
  const savedAddressSummary = defaultAddress
    ? [
      defaultAddress.street,
      defaultAddress.additionalDetails,
      defaultAddress.city,
      defaultAddress.state,
      defaultAddress.zipCode,
    ]
      .filter(Boolean)
      .join(", ")
    : "No address saved. Tap to save Home, Work, or Other.";

  // Popup states
  const [vegModeOpen, setVegModeOpen] = useState(false);
  const [appearanceOpen, setAppearanceOpen] = useState(false);
  const [logoutConfirmOpen, setLogoutConfirmOpen] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [referralReward, setReferralReward] = useState(0);
  const [walletBalance, setWalletBalance] = useState(0);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);

  // Trigger web push registration when profile mounts to ensure FCM token is saved
  useEffect(() => {
    registerWebPushForCurrentModule().catch(console.error);
  }, []);

  const handleVegModeUpdate = (nextValue) => {
    setVegMode(nextValue);
    localStorage.setItem("userVegMode", String(nextValue));
  };

  // Settings states
  const [appearance, setAppearance] = useState(() => {
    // Load theme from localStorage or default to 'light'
    return localStorage.getItem("appTheme") || "light";
  });

  // Apply theme to document
  useEffect(() => {
    const root = document.documentElement;
    if (appearance === "dark") {
      root.classList.add("dark");
    } else {
      root.classList.remove("dark");
    }
    // Save to localStorage
    localStorage.setItem("appTheme", appearance);
  }, [appearance]);

  // Get first letter of name for avatar
  const avatarInitial =
    userProfile?.name?.charAt(0)?.toUpperCase() ||
    userProfile?.phone?.charAt(1)?.toUpperCase() ||
    "U";
  const displayName = userProfile?.name || userProfile?.phone || "User";
  // Only show email if it exists and is valid, otherwise show phone or "Not available"
  const hasValidEmail =
    userProfile?.email &&
    userProfile.email.trim() !== "" &&
    userProfile.email.includes("@");
  const displayEmail = hasValidEmail
    ? userProfile.email
    : userProfile?.phone || "Not available";

  // Calculate profile completion percentage
  const calculateProfileCompletion = () => {
    if (!userProfile) return 0;

    // Helper function to check if date field is filled (handles Date objects, date strings, ISO strings)
    const isDateFilled = (dateField) => {
      if (!dateField) return false;

      // Check if it's a Date object
      if (dateField instanceof Date) {
        return !isNaN(dateField.getTime());
      }

      // Check if it's a string
      if (typeof dateField === "string") {
        const trimmed = dateField.trim();
        if (trimmed === "" || trimmed === "null" || trimmed === "undefined")
          return false;

        // Try to parse as date (handles various formats: YYYY-MM-DD, ISO strings, etc.)
        const date = new Date(trimmed);
        if (!isNaN(date.getTime())) {
          // Valid date
          return true;
        }
      }

      return false;
    };

    // Check name - must have value
    const hasName = !!(
      userProfile.name &&
      typeof userProfile.name === "string" &&
      userProfile.name.trim() !== ""
    );

    // Check contact - phone OR email (at least one)
    const hasPhone = !!(
      userProfile.phone &&
      typeof userProfile.phone === "string" &&
      userProfile.phone.trim() !== ""
    );
    const hasContact = hasPhone || hasValidEmail;

    // Check profile image - must have URL string
    const hasImage = !!(
      userProfile.profileImage &&
      typeof userProfile.profileImage === "string" &&
      userProfile.profileImage.trim() !== "" &&
      userProfile.profileImage !== "null" &&
      userProfile.profileImage !== "undefined"
    );

    // Check date of birth
    const hasDateOfBirth = isDateFilled(userProfile.dateOfBirth);

    // Check gender - must be valid value
    const validGenders = ["male", "female", "other", "prefer-not-to-say"];
    const hasGender = !!(
      userProfile.gender &&
      typeof userProfile.gender === "string" &&
      userProfile.gender.trim() !== "" &&
      validGenders.includes(userProfile.gender.trim().toLowerCase())
    );

    // Required fields only (anniversary is NOT counted - it's optional)
    // Only these 5 fields count towards 100%
    const requiredFields = {
      name: hasName,
      contact: hasContact,
      profileImage: hasImage,
      dateOfBirth: hasDateOfBirth,
      gender: hasGender,
    };

    const totalRequiredFields = 5; // Fixed: name, contact, profileImage, dateOfBirth, gender
    const completedRequiredFields =
      Object.values(requiredFields).filter(Boolean).length;

    // Calculate percentage based ONLY on required fields (anniversary NOT included)
    const percentage = Math.round(
      (completedRequiredFields / totalRequiredFields) * 100,
    );

    // Always log for debugging (remove in production if needed)
    debugLog("?? Profile completion check:", {
      requiredFields,
      completedRequiredFields,
      totalRequiredFields,
      percentage,
      fieldStatus: {
        name: hasName ? "?" : "?",
        contact: hasContact ? "?" : "?",
        profileImage: hasImage ? "?" : "?",
        dateOfBirth: hasDateOfBirth ? "?" : "?",
        gender: hasGender ? "?" : "?",
      },
      rawData: {
        name: userProfile.name || "missing",
        phone: userProfile.phone || "missing",
        email: userProfile.email || "missing",
        profileImage: userProfile.profileImage ? "exists" : "missing",
        dateOfBirth: userProfile.dateOfBirth
          ? String(userProfile.dateOfBirth)
          : "missing",
        gender: userProfile.gender || "missing",
      },
    });

    return percentage;
  };

  const profileCompletion = calculateProfileCompletion();
  const isComplete = profileCompletion === 100;
  useEffect(() => {
    let mounted = true;
    userAPI
      .getReferralStats()
      .then((res) => {
        const reward = res?.data?.data?.stats?.rewardAmount;
        if (mounted) setReferralReward(Number(reward) || 0);
      })
      .catch(() => { });
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    let mounted = true;
    userAPI
      .getWallet()
      .then((res) => {
        const w = res?.data?.data?.wallet || res?.data?.wallet;
        const bal = Number(w?.balance);
        if (mounted) setWalletBalance(Number.isFinite(bal) ? bal : 0);
      })
      .catch(() => { });
    return () => {
      mounted = false;
    };
  }, []);

  const refId =
    userProfile?._id || userProfile?.id || userProfile?.referralCode || "";
  const referralLink = refId
    ? `${window.location.origin}/auth/login?ref=${encodeURIComponent(String(refId))}`
    : "";

  const handleShareReferral = async () => {
    if (!referralLink) return;
    const rewardText = referralReward > 0 ? `\u20B9${referralReward}` : "rewards";
    const shareText = `Join ${companyName} and earn ${rewardText}.`;
    try {
      if (navigator.share) {
        await navigator.share({
          title: `${companyName} referral`,
          text: shareText,
          url: referralLink,
        });
      } else {
        const fallbackUrl = `https://wa.me/?text=${encodeURIComponent(`${shareText} ${referralLink}`)}`;
        window.open(fallbackUrl, "_blank", "noopener,noreferrer");
      }
    } catch (error) {
      debugError("Failed to share referral:", error);
    }
  };

  // Handle logout
  const handleLogout = async () => {
    if (isLoggingOut) return; // Prevent multiple clicks

    setIsLoggingOut(true);

    try {
      await logoutUserSession({ navigate });
    } catch (err) {
      debugError("Error during logout:", err);
      clearModuleAuth("user");
      localStorage.removeItem("accessToken");
      localStorage.removeItem("user_authenticated");
      localStorage.removeItem("user_user");
      localStorage.removeItem("user");
      localStorage.removeItem("cart");
      localStorage.removeItem("cart_quick");
      USER_SESSION_PREFERENCE_KEYS.forEach((key) => localStorage.removeItem(key));
      window.dispatchEvent(new Event("userAuthChanged"));
      navigate("/auth/login", { replace: true });
    } finally {
      setIsLoggingOut(false);
    }
  };

  const handleConfirmDelete = async () => {
    try {
      await userAPI.deleteCurrentUserAccount();
      toast.success("Account deleted successfully");
      
      clearModuleAuth("user");
      localStorage.removeItem("accessToken");
      localStorage.removeItem("user_authenticated");
      localStorage.removeItem("user_user");
      localStorage.removeItem("user");
      localStorage.removeItem("cart");
      localStorage.removeItem("cart_quick");
      USER_SESSION_PREFERENCE_KEYS.forEach((key) => localStorage.removeItem(key));
      
      window.dispatchEvent(new Event("userAuthChanged"));
      navigate("/auth/login", { replace: true });
    } catch (error) {
      console.error("Failed to delete account:", error);
      toast.error(error?.response?.data?.message || "Failed to delete account. Please try again.");
    }
  };

  const handleLogoutClick = () => {
    if (isLoggingOut) return;
    setLogoutConfirmOpen(true);
  };

  const addressCount = addresses?.length || 0;

  return (
    <AnimatedPage className="min-h-screen bg-app-cream font-app text-app-ink dark:bg-[#0a0a0a]">
      <div className="max-w-xl mx-auto px-4 pt-4 pb-24 space-y-4">
        {/* Title */}
        <div className="flex items-start gap-2">
          <Link
            to="/"
            aria-label="Back"
            className="-ml-2 mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-app-ink active:bg-app-sand"
          >
            <ArrowLeft className="h-5 w-5" aria-hidden="true" />
          </Link>
          <div className="min-w-0">
            <h1 className="text-[26px] font-bold leading-tight text-app-ink">Profile</h1>
            <p className="mt-1 text-[13px] text-app-muted">
              Manage your account, orders &amp; preferences
            </p>
          </div>
        </div>

        {/* User card */}
        <div className="rounded-[20px] border border-app-brown/25 bg-app-tint-strong p-4">
          <div className="flex items-center gap-3.5">
            <Link to="/profile/edit" className="relative shrink-0" aria-label="Edit profile photo">
              <Avatar className="h-16 w-16 rounded-full border-2 border-app-brown bg-app-brown/15">
                {userProfile?.profileImage && (
                  <AvatarImage
                    src={resolveMediaUrl(userProfile.profileImage) || undefined}
                    alt={displayName}
                  />
                )}
                <AvatarFallback className="bg-app-brown/15 text-xl font-bold text-app-brown">
                  {avatarInitial}
                </AvatarFallback>
              </Avatar>
              <span className="absolute bottom-0 right-0 flex h-5 w-5 items-center justify-center rounded-full bg-app-brown text-white">
                <Camera className="h-3 w-3" aria-hidden="true" />
              </span>
            </Link>
            <div className="min-w-0 flex-1">
              <h2 className="truncate text-[18px] font-bold text-app-ink">{displayName}</h2>
              {userProfile?.phone ? (
                <p className="truncate text-[13px] text-app-muted">{userProfile.phone}</p>
              ) : null}
              {hasValidEmail ? (
                <p className="truncate text-[13px] text-app-muted">{displayEmail}</p>
              ) : null}
              {!isComplete ? (
                <p className="mt-1 text-[11.5px] font-medium text-app-brown">
                  Profile {profileCompletion}% complete
                </p>
              ) : null}
            </div>
          </div>
          <Link
            to="/profile/edit"
            className="mt-3.5 flex h-[38px] w-full items-center justify-center rounded-xl border border-app-brown text-[13px] font-semibold text-app-brown active:bg-app-brown/10"
          >
            Edit Profile
          </Link>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 gap-3">
          <StatCard
            icon={Wallet}
            label="Wallet"
            value={`₹${walletBalance.toFixed(2)}`}
            to="/wallet"
          />
          <StatCard
            icon={TicketPercent}
            label="Coupons"
            value="View offers"
            to="/profile/coupons"
          />
          <StatCard
            icon={Package}
            label="Orders"
            value="Track & reorder"
            to="/orders"
          />
          <StatCard
            icon={MapPin}
            label="Saved Addresses"
            value={addressCount > 0 ? `${addressCount} saved` : "Add address"}
            onClick={openLocationSelector}
          />
        </div>

        {/* Preferences */}
        <GroupCard title="Preferences">
          <ProfileRow
            icon={Bell}
            title="Notifications"
            subtitle="Order updates & alerts"
            to="/notifications"
          />
          <ProfileRow
            icon={Palette}
            title="Appearance"
            subtitle={`Theme: ${appearance === "dark" ? "Dark" : "Light"}`}
            onClick={() => setAppearanceOpen(true)}
          />
          <ProfileRow
            icon={Heart}
            title="Favorites"
            subtitle="Your saved products"
            to="/profile/favorites"
          />
          <ProfileRow
            icon={MapPin}
            title="My Addresses"
            subtitle={savedAddressSummary}
            onClick={openLocationSelector}
          />
          <ProfileRow
            icon={CreditCard}
            title="Payment Methods"
            subtitle="Saved cards & UPI"
            to="/profile/payments"
          />
        </GroupCard>

        <MarketingPushToggle />

        {/* My Orders */}
        <section
          aria-label="My Orders"
          className="rounded-2xl bg-white p-4 shadow-[0_2px_10px_rgba(0,0,0,0.06)]"
        >
          <div className="flex items-center justify-between">
            <h2 className="text-[16px] font-bold text-app-ink">My Orders</h2>
            <Link
              to="/orders"
              className="flex items-center text-[12.5px] font-semibold text-app-brown"
            >
              View All Orders
              <ChevronRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </div>
          <div className="mt-4 flex justify-around">
            <OrderQuickLink icon={ShoppingBag} label="Upcoming" to="/orders" />
            <OrderQuickLink icon={CheckCircle2} label="Completed" to="/orders" tone="ok" />
            <OrderQuickLink icon={XCircle} label="Cancelled" to="/orders" tone="danger" />
            <OrderQuickLink icon={Undo2} label="Returns" to="/orders" />
          </div>
        </section>

        {/* Rewards */}
        <GroupCard title="Rewards">
          <ProfileRow
            icon={Coins}
            title="Coins"
            subtitle="Balance, history & expiring coins"
            to="/coins"
          />
          <ProfileRow
            icon={TicketPercent}
            title="Offers & Coupons"
            subtitle="Coupons you can use right now"
            to="/profile/coupons"
          />
          <ProfileRow
            icon={RotateCcw}
            title="Order Again"
            subtitle="Re-buy items from past orders"
            to="/order-again"
          />
          <ProfileRow
            icon={Gift}
            title="Refer & Earn"
            subtitle={
              referralReward > 0
                ? `Earn ₹${referralReward} for every friend`
                : "Share with friends"
            }
            to="/profile/refer-earn"
          />
        </GroupCard>

        {/* Help & Legal */}
        <GroupCard title="Help & Legal">
          <ProfileRow
            icon={HelpCircle}
            title="Help & Support"
            subtitle="FAQs, order refund status & support"
            to="/profile/support"
          />
          <ProfileRow
            icon={ShieldCheck}
            title="Privacy Policy"
            subtitle={`How ${companyName} handles your data`}
            to="/profile/privacy"
          />
          <ProfileRow
            icon={FileText}
            title="Terms & Conditions"
            subtitle="The terms you agree to when ordering"
            to="/profile/terms"
          />
          <ProfileRow
            icon={Info}
            title={`About ${companyName}`}
            subtitle="App version & who we are"
            to="/profile/about"
          />
          <ProfileRow
            icon={Undo2}
            title="Refund Policy"
            subtitle="How refunds and returns work"
            to="/profile/refund"
          />
          <ProfileRow
            icon={Truck}
            title="Shipping Policy"
            subtitle="Delivery times and charges"
            to="/profile/shipping"
          />
          <ProfileRow
            icon={XCircle}
            title="Cancellation Policy"
            subtitle="When you can cancel an order"
            to="/profile/cancellation"
          />
          <ProfileRow
            icon={Accessibility}
            title="Accessibility"
            subtitle="Our accessibility commitment"
            to="/profile/accessibility"
          />
          <ProfileRow
            icon={ShieldAlert}
            title="Report a Safety Emergency"
            subtitle="Tell us if something went wrong"
            to="/profile/report-safety-emergency"
          />
        </GroupCard>

        {/* Log out */}
        <button
          type="button"
          onClick={handleLogoutClick}
          disabled={isLoggingOut}
          className="flex w-full items-center justify-center gap-2.5 rounded-2xl border border-app-line bg-white py-4 text-[15px] font-bold text-[#B3261E] active:bg-app-alt disabled:opacity-60"
        >
          <LogOut className="h-5 w-5" aria-hidden="true" />
          Log Out
        </button>

        <button
          type="button"
          onClick={() => setDeleteModalOpen(true)}
          className="w-full py-1 text-center text-xs text-app-muted hover:text-[#B3261E] transition-colors"
        >
          Delete Account
        </button>
      </div>

      {/* Logout Confirmation Popup */}
      {logoutConfirmOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-sm rounded-2xl bg-white dark:bg-[#1a1a1a] p-5 shadow-2xl border border-gray-200 dark:border-gray-800">
            <h3 className="text-lg font-bold text-gray-900 dark:text-white">
              Log out?
            </h3>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              Are you sure you want to log out?
            </p>
            <div className="mt-5 flex items-center gap-3">
              <Button
                type="button"
                variant="outline"
                className="flex-1 rounded-xl"
                onClick={() => setLogoutConfirmOpen(false)}
                disabled={isLoggingOut}
              >
                No
              </Button>
              <Button
                type="button"
                className="flex-1 rounded-xl bg-app-brown hover:bg-app-brown-deep text-white"
                onClick={() => {
                  setLogoutConfirmOpen(false);
                  handleLogout();
                }}
                disabled={isLoggingOut}
              >
                Yes
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Appearance Popup */}
      <Dialog open={appearanceOpen} onOpenChange={setAppearanceOpen}>
        <DialogContent className="max-w-sm md:max-w-md lg:max-w-lg w-[calc(100%-2rem)] rounded-2xl p-0 overflow-hidden bg-white dark:bg-[#1a1a1a] border-gray-200 dark:border-gray-800">
          <DialogHeader className="p-5 pb-3">
            <DialogTitle className="text-lg font-bold text-gray-900 dark:text-white">
              Appearance
            </DialogTitle>
            <DialogDescription className="text-sm text-gray-500 dark:text-gray-400">
              Choose your preferred theme
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 px-5 pb-5">
            <button
              onClick={() => {
                setAppearance("light");
                setAppearanceOpen(false);
              }}
              className={`w-full p-3 rounded-xl border-2 transition-all flex items-center gap-3 ${appearance === "light"
                  ? "border-app-brown bg-app-tint-strong dark:border-app-brown-mid dark:bg-app-brown/20"
                  : "border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:border-gray-300 dark:hover:border-gray-600"
                }`}>
              <div
                className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${appearance === "light"
                    ? "border-app-brown bg-app-brown dark:border-app-brown-mid dark:bg-app-brown-mid"
                    : "border-gray-300 dark:border-gray-600"
                  }`}>
                {appearance === "light" && (
                  <Check className="h-3 w-3 text-white" />
                )}
              </div>
              <Sun className="h-5 w-5 text-yellow-500 dark:text-yellow-400 flex-shrink-0" />
              <div className="text-left">
                <p className="font-medium text-gray-900 dark:text-white text-sm">
                  Light
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Default light theme
                </p>
              </div>
            </button>
            <button
              onClick={() => {
                setAppearance("dark");
                setAppearanceOpen(false);
              }}
              className={`w-full p-3 rounded-xl border-2 transition-all flex items-center gap-3 ${appearance === "dark"
                  ? "border-app-brown bg-app-tint-strong dark:border-app-brown-mid dark:bg-app-brown/20"
                  : "border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:border-gray-300 dark:hover:border-gray-600"
                }`}>
              <div
                className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${appearance === "dark"
                    ? "border-app-brown bg-app-brown dark:border-app-brown-mid dark:bg-app-brown-mid"
                    : "border-gray-300 dark:border-gray-600"
                  }`}>
                {appearance === "dark" && (
                  <Check className="h-3 w-3 text-white" />
                )}
              </div>
              <Moon className="h-5 w-5 text-gray-600 dark:text-gray-300 flex-shrink-0" />
              <div className="text-left">
                <p className="font-medium text-gray-900 dark:text-white text-sm">
                  Dark
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Dark Theme
                </p>
              </div>
            </button>
          </div>
        </DialogContent>
      </Dialog>
 
      <DeleteAccountModal 
        isOpen={deleteModalOpen} 
        onClose={() => setDeleteModalOpen(false)} 
        onConfirm={handleConfirmDelete} 
        walletAmount={walletBalance} 
        moduleName="user" 
      />
    </AnimatedPage>
  );
}
