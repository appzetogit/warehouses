import { useState, useEffect, useRef } from "react"
import { useNavigate } from "react-router-dom"
import { AlertCircle, CheckCircle2, Loader2, User } from "lucide-react"
import AppAuthShell, { primaryBtn, fieldBox, errorLine } from "@store/components/user/auth/AppAuthShell"
import apiClient, { authAPI } from "@store/api"
import { setAuthData as setUserAuthData } from "@store/utils/auth"
import { resolveDeviceFcmToken, registerWebPushForCurrentModule } from "@store/utils/firebaseMessaging"
import { motion, AnimatePresence } from "framer-motion"
import { useCompanyName } from "@store/hooks/useCompanyName"
import { safeRedirectPath } from "./authRedirect"

const RESEND_SECONDS = 60

// Seconds left until `deadline` (a Date.now() timestamp), never negative.
const secondsUntil = (deadline) => Math.max(0, Math.ceil((deadline - Date.now()) / 1000))

const FULL_NAME_REGEX = /^[A-Za-z ]+$/

export default function OTP() {
  const companyName = useCompanyName()
  const navigate = useNavigate()
  const [otp, setOtp] = useState(["", "", "", ""]) // exactly 4 digits
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState("")
  const [success, setSuccess] = useState(false)
  // The countdown runs off a deadline, so it keeps time while the tab is hidden
  // (the user switching to their SMS app) and restarts after every resend.
  const [resendDeadline, setResendDeadline] = useState(0)
  const [resendTimer, setResendTimer] = useState(0)
  const [authData, setAuthData] = useState(null)
  const [showNameInput, setShowNameInput] = useState(false)
  const [name, setName] = useState("")
  const [nameError, setNameError] = useState("")
  const [verifiedData, setVerifiedData] = useState(null)
  const [contactInfo, setContactInfo] = useState("")
  const [contactType, setContactType] = useState("phone")
  const [deviceToken, setDeviceToken] = useState(null)
  const [activePlatform, setActivePlatform] = useState("web")
  const inputRefs = useRef([])
  const submittingRef = useRef(false)

  useEffect(() => {
    // Get auth data from sessionStorage
    const stored = sessionStorage.getItem("userAuthData")
    let data = null
    try {
      data = stored ? JSON.parse(stored) : null
    } catch {
      data = null
    }

    // Already signed in: go where the user was headed.
    const isAuthenticated = localStorage.getItem("user_authenticated") === "true"
    if (isAuthenticated) {
      navigate(safeRedirectPath(data?.from) || "/", { replace: true })
      return
    }

    if (!data) {
      navigate("/auth/login", { replace: true })
      return
    }
    setAuthData(data)

    if (data.method === "email" && data.email) {
      setContactType("email")
      setContactInfo(data.email)
    } else if (data.phone) {
      setContactType("phone")
      const phoneMatch = data.phone?.match(/(\+\d+)\s*(.+)/)
      if (phoneMatch) {
        // "+91 90000 00000", with non-breaking spaces so it never splits across lines.
        const digits = phoneMatch[2].replace(/\D/g, "")
        const nbsp = String.fromCharCode(160)
        setContactInfo(`${phoneMatch[1]}${nbsp}${digits.slice(0, 5)}${nbsp}${digits.slice(5)}`)
      } else {
        setContactInfo(data.phone || "")
      }
    }

    setResendDeadline(Date.now() + RESEND_SECONDS * 1000)
  }, [navigate])

  useEffect(() => {
    if (!resendDeadline) return undefined
    const tick = () => {
      const left = secondsUntil(resendDeadline)
      setResendTimer(left)
      return left
    }
    if (tick() === 0) return undefined
    const timer = setInterval(() => {
      if (tick() === 0) clearInterval(timer)
    }, 1000)
    // Browsers throttle timers in background tabs; catch up as soon as the user is back.
    const onVisible = () => {
      if (!document.hidden) tick()
    }
    document.addEventListener("visibilitychange", onVisible)
    return () => {
      clearInterval(timer)
      document.removeEventListener("visibilitychange", onVisible)
    }
  }, [resendDeadline])

  const finishSignIn = () => {
    setSuccess(true)
    const target = safeRedirectPath(authData?.from) || "/"
    setTimeout(() => navigate(target, { replace: true }), 600)
  }

  useEffect(() => {
    if (inputRefs.current[0] && !showNameInput) {
      inputRefs.current[0].focus()
    }
  }, [showNameInput])

  // Warm notification permission on first OTP interaction (needs a user gesture).
  const ensureNotificationPermission = async () => {
    try {
      if (typeof Notification === "undefined") return
      if (Notification.permission === "default") {
        await Notification.requestPermission()
      }
    } catch {
      // ignore
    }
  }

  const handleChange = (index, value) => {
    if (value && !/^\d$/.test(value)) return
    const newOtp = [...otp]
    newOtp[index] = value
    setOtp(newOtp)
    setError("")

    if (value && index < 3) {
      inputRefs.current[index + 1]?.focus()
    }

    if (!showNameInput && newOtp.slice(0, 4).every((digit) => digit !== "")) {
      handleVerify(newOtp.slice(0, 4).join(""))
    }
  }

  const handleKeyDown = (index, e) => {
    if (e.key === "Backspace") {
      if (otp[index]) {
        const newOtp = [...otp]
        newOtp[index] = ""
        setOtp(newOtp)
      } else if (index > 0) {
        inputRefs.current[index - 1]?.focus()
        const newOtp = [...otp]
        newOtp[index - 1] = ""
        setOtp(newOtp)
      }
    }
  }

  const handlePaste = (e) => {
    e.preventDefault()
    const pastedData = e.clipboardData.getData("text")
    const digits = pastedData.replace(/\D/g, "").slice(0, 4).split("")
    const newOtp = [...otp]
    digits.forEach((digit, i) => {
      if (i < 4) newOtp[i] = digit
    })
    setOtp(newOtp)
    if (!showNameInput && digits.length === 4) {
      handleVerify(newOtp.slice(0, 4).join(""))
    } else {
      inputRefs.current[Math.min(digits.length, 3)]?.focus()
    }
  }

  const handleVerify = async (otpValue = null) => {
    if (showNameInput) return
    if (submittingRef.current) return

    const code = (otpValue || otp.join("")).replace(/\D/g, "")
    const code4 = code.slice(0, 4)
    if (code4.length !== 4) {
      setError("OTP must be exactly 4 digits")
      return
    }

    submittingRef.current = true
    setIsLoading(true)
    setError("")

    try {
      const phone = authData?.method === "phone" ? authData.phone : null
      const email = authData?.method === "email" ? authData.email : null
      const purpose = authData?.isSignUp ? "register" : "login"
      const providedName = authData?.isSignUp ? authData?.name || null : null
      const referralCode = authData?.referralCode || null

      let fcmToken = null;
      let platform = "web";
      try {
        const resolved = await resolveDeviceFcmToken("user", { allowPrompt: true });
        fcmToken = resolved?.token || null;
        platform = resolved?.platform || "web";
      } catch (e) {
        console.warn("Failed to get FCM token during login", e);
      }

      if (!fcmToken && typeof Notification !== "undefined" && Notification.permission === "denied") {
        console.warn(
          "[FCM] Browser notification permission is BLOCKED. Token cannot be created. " +
            "Chrome → site settings → Notifications → Allow for this site, then login again.",
        );
      }

      setDeviceToken(fcmToken);
      setActivePlatform(platform);

      const response = await authAPI.verifyOTP(
        phone, code4, purpose, providedName, email, "user", null, referralCode, fcmToken, platform
      )
      const data = response?.data?.data || response?.data || {}
      const accessToken = data.accessToken
      const refreshToken = data.refreshToken ?? null
      const user = data.user

      if (!accessToken || !user || !refreshToken) {
        throw new Error("Invalid response from server")
      }

      const hasName = user.name && String(user.name).trim().length > 0 && String(user.name).toLowerCase() !== "null";
      // Ask only when there is no saved name (a new sign-up already gave theirs on the previous screen).
      const needsName = !hasName;

      if (needsName) {
        setVerifiedData(data)
        setShowNameInput(true)
        setIsLoading(false)
        submittingRef.current = false
        return
      }

      sessionStorage.removeItem("userAuthData")
      setUserAuthData("user", accessToken, user, refreshToken)
      window.dispatchEvent(new Event("userAuthChanged"))
      // Force sync after login (bypass throttle / recover after logout).
      await registerWebPushForCurrentModule("/", { force: true }).catch(() => {})
      finishSignIn()
    } catch (err) {
      const status = err?.response?.status
      const serverMessage = err?.response?.data?.message || err?.response?.data?.error
      let message = serverMessage || err?.message || "Verification failed."
      if (status === 401 && !serverMessage) message = "Invalid or expired code."
      setError(message)
    } finally {
      setIsLoading(false)
      submittingRef.current = false
    }
  }

  const handleSubmitName = async () => {
    const normalizedName = String(name || "").replace(/\s+/g, " ").trim()
    if (!normalizedName || normalizedName.length < 2) {
      setNameError("Please enter a valid name")
      return
    }
    if (!FULL_NAME_REGEX.test(normalizedName)) {
      setNameError("Name can contain only letters and spaces")
      return
    }

    setIsLoading(true)
    setError("")
    setNameError("")

    try {
      const { accessToken, refreshToken, user } = verifiedData

      // Update name via profile API
      try {
        await apiClient.patch("/user/profile", 
          { name: normalizedName },
          { headers: { Authorization: `Bearer ${accessToken}` } }
        )
      } catch (e) {
        console.error("Failed to update name on backend, but proceeding with login", e)
      }

      sessionStorage.removeItem("userAuthData")
      setUserAuthData("user", accessToken, { ...user, name: normalizedName }, refreshToken)
      window.dispatchEvent(new Event("userAuthChanged"))
      await registerWebPushForCurrentModule("/", { force: true }).catch(() => {})
      finishSignIn()
    } catch (err) {
      setError("Failed to complete registration. Please try again.")
    } finally {
      setIsLoading(false)
    }
  }

  const handleResend = async () => {
    if (resendTimer > 0 || isLoading) return
    setIsLoading(true)
    setError("")
    try {
      const phone = authData?.method === "phone" ? authData.phone : null
      const email = authData?.method === "email" ? authData.email : null
      const purpose = authData?.isSignUp ? "register" : "login"
      await authAPI.sendOTP(phone, purpose, email)
      setResendDeadline(Date.now() + RESEND_SECONDS * 1000)
    } catch (err) {
      setError(err?.response?.data?.message || err?.response?.data?.error || "Failed to resend OTP.")
    } finally {
      setIsLoading(false)
    }
    setOtp(["", "", "", ""])
  }

  if (!authData) return null

  const box =
    "h-[60px] w-[58px] rounded-2xl border-[1.8px] bg-white text-center text-[22px] font-bold text-app-ink caret-app-brown outline-none transition focus:border-app-brown focus:shadow-[0_3px_10px_rgba(88,50,29,0.15)] disabled:opacity-60"

  return (
    <AppAuthShell
      title={showNameInput ? "One last step" : "Verify OTP 🔒"}
      subtitle={showNameInput ? "Tell us what to call you" : `Enter the 4-digit code sent to ${contactInfo}`}
      onBack={() => navigate("/auth/login")}
      footer={<p className="text-[11.5px]">{companyName} keeps your {contactType === "email" ? "email" : "number"} private.</p>}
    >
      <AnimatePresence mode="wait">
        {!showNameInput ? (
          <motion.div
            key="otp-view"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            className="space-y-6 pt-2"
          >
            <div className="flex justify-center gap-3.5" role="group" aria-label="Verification code">
              {otp.map((digit, index) => (
                <input
                  key={index}
                  ref={(el) => (inputRefs.current[index] = el)}
                  type="text"
                  inputMode="numeric"
                  autoComplete={index === 0 ? "one-time-code" : "off"}
                  aria-label={`Digit ${index + 1}`}
                  maxLength={1}
                  value={digit}
                  onFocus={() => {
                    void ensureNotificationPermission()
                  }}
                  onChange={(e) => handleChange(index, e.target.value)}
                  onKeyDown={(e) => handleKeyDown(index, e)}
                  onPaste={index === 0 ? handlePaste : undefined}
                  disabled={isLoading || success}
                  className={`${box} ${digit ? "border-app-brown/60" : "border-app-line"}`}
                />
              ))}
            </div>

            {error ? (
              <p role="alert" className={errorLine}>
                <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
                {error}
              </p>
            ) : null}

            <button
              type="button"
              onClick={() => handleVerify()}
              disabled={isLoading || success || otp.some((d) => !d)}
              className={primaryBtn}
            >
              {isLoading ? <Loader2 className="h-[22px] w-[22px] animate-spin" aria-hidden="true" /> : success ? <CheckCircle2 className="h-5 w-5" aria-hidden="true" /> : null}
              {success ? "Verified" : isLoading ? "Verifying…" : "Verify & Continue"}
            </button>

            <div className="space-y-2 text-center text-[13.5px] text-[#757575]">
              <p>
                {contactType === "email" ? "No email? Check spam, or" : "Didn't receive OTP?"}{" "}
                {resendTimer > 0 ? (
                  <span className="font-bold text-app-brown">
                    Resend in <span className="tabular-nums">{resendTimer}s</span>
                  </span>
                ) : (
                  <button type="button" onClick={handleResend} disabled={isLoading} className="font-bold text-app-brown underline-offset-2 hover:underline disabled:opacity-60">
                    Resend OTP
                  </button>
                )}
              </p>
              <button type="button" onClick={() => navigate("/auth/login")} className="font-semibold text-app-brown underline-offset-2 hover:underline">
                {contactType === "email" ? "Edit Email" : "Edit Number"}
              </button>
            </div>
          </motion.div>
        ) : (
          <motion.form
            key="name-view"
            onSubmit={(e) => {
              e.preventDefault()
              handleSubmitName()
            }}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-3.5 pt-2"
          >
            <label className={fieldBox}>
              <span className="sr-only">Your name</span>
              <User className="ml-4 h-5 w-5 shrink-0 text-[#757575]" aria-hidden="true" />
              <input
                type="text"
                autoFocus
                autoComplete="name"
                value={name}
                onChange={(e) => {
                  setName(e.target.value.replace(/[^A-Za-z ]/g, ""))
                  if (nameError) setNameError("")
                }}
                disabled={isLoading}
                placeholder="Your Name"
                className="h-full w-full bg-transparent px-3 text-[15.5px] font-semibold text-app-ink caret-app-brown placeholder:font-normal placeholder:text-[#9E9E9E] focus:outline-none"
              />
            </label>
            {nameError || error ? (
              <p role="alert" className={errorLine}>
                <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
                {nameError || error}
              </p>
            ) : null}
            <div className="pt-1.5">
              <button type="submit" disabled={isLoading || name.trim().length < 2} className={primaryBtn}>
                {isLoading ? <Loader2 className="h-[22px] w-[22px] animate-spin" aria-hidden="true" /> : null}
                {isLoading ? "Saving…" : "Start Shopping"}
              </button>
            </div>
          </motion.form>
        )}
      </AnimatePresence>
    </AppAuthShell>
  )
}
