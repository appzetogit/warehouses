import { useState, useEffect, useRef } from "react"
import { useNavigate } from "react-router-dom"
import { AlertCircle, CheckCircle2, Loader2 } from "lucide-react"
import AuthShell, { secondaryBtn } from "@store/components/user/auth/AuthShell"
import apiClient, { authAPI } from "@store/api"
import { setAuthData as setUserAuthData } from "@store/utils/auth"
import { resolveDeviceFcmToken, registerWebPushForCurrentModule } from "@store/utils/firebaseMessaging"
import { motion, AnimatePresence } from "framer-motion"
import { useCompanyName } from "@store/hooks/useCompanyName"

const FULL_NAME_REGEX = /^[A-Za-z ]+$/

export default function OTP() {
  const companyName = useCompanyName()
  const navigate = useNavigate()
  const [otp, setOtp] = useState(["", "", "", ""]) // exactly 4 digits
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState("")
  const [success, setSuccess] = useState(false)
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
    // Redirect to home if already authenticated
    const isAuthenticated = localStorage.getItem("user_authenticated") === "true"
    if (isAuthenticated) {
      navigate("/", { replace: true })
      return
    }

    // Get auth data from sessionStorage
    const stored = sessionStorage.getItem("userAuthData")
    if (!stored) {
      navigate("/auth/login", { replace: true })
      return
    }
    const data = JSON.parse(stored)
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

    setResendTimer(60)
    const timer = setInterval(() => {
      if (typeof document !== "undefined" && document.hidden) return
      setResendTimer((prev) => {
        if (prev <= 1) {
          clearInterval(timer)
          return 0
        }
        return prev - 1
      })
    }, 1000)

    return () => clearInterval(timer)
  }, [navigate])

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
      const needsName = data.isNewUser === true || !hasName;

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
      setSuccess(true)
      setTimeout(() => navigate("/"), 600)
    } catch (err) {
      const status = err?.response?.status
      let message = err?.response?.data?.message || err?.response?.data?.error || err?.message || "Verification failed."
      if (status === 401) message = "Invalid or expired code."
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
      setSuccess(true)
      setTimeout(() => navigate("/"), 600)
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
      setResendTimer(60)
    } catch (err) {
      setError("Failed to resend OTP.")
    } finally {
      setIsLoading(false)
    }
    setOtp(["", "", "", ""])
  }

  if (!authData) return null

  const box =
    "h-16 w-14 rounded-2xl border-2 bg-white text-center text-[28px] font-bold text-gray-900 shadow-[0_8px_20px_rgba(0,0,0,0.15)] outline-none transition focus:border-[#7C2D12] disabled:opacity-60"

  return (
    <AuthShell
      title={showNameInput ? "One Last Step" : "Verify Your Number"}
      subtitle={showNameInput ? "Tell us what to call you" : `Enter the 4-digit code sent to ${contactInfo}`}
      onBack={() => navigate("/auth/login")}
      footer={<p className="text-[11px] text-white/75">{companyName} keeps your number private.</p>}
    >
      <AnimatePresence mode="wait">
        {!showNameInput ? (
          <motion.div
            key="otp-view"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            className="mt-auto space-y-5 pb-2"
          >
            <div className="flex justify-center gap-3" role="group" aria-label="Verification code">
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
                  className={`${box} ${digit ? "border-white" : "border-transparent"}`}
                />
              ))}
            </div>

            {error ? (
              <p role="alert" className="flex items-center justify-center gap-1.5 rounded-xl bg-black/20 px-3 py-2 text-[13px] font-semibold">
                <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
                {error}
              </p>
            ) : null}

            <button
              type="button"
              onClick={() => handleVerify()}
              disabled={isLoading || success || otp.some((d) => !d)}
              className={secondaryBtn}
            >
              {isLoading ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" /> : success ? <CheckCircle2 className="h-5 w-5 text-green-600" aria-hidden="true" /> : null}
              {success ? "Verified" : isLoading ? "Verifying…" : "Verify"}
            </button>

            <div className="flex items-center justify-between text-[14px]">
              <button type="button" onClick={() => navigate("/auth/login")} className="font-semibold text-white/95 underline-offset-2 hover:underline">
                Edit Number
              </button>
              {resendTimer > 0 ? (
                <span className="text-white/85">
                  Resend Code in <span className="font-bold tabular-nums">{resendTimer}s</span>
                </span>
              ) : (
                <button type="button" onClick={handleResend} disabled={isLoading} className="font-bold text-white underline-offset-2 hover:underline">
                  Resend Code
                </button>
              )}
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
            className="mt-auto space-y-4 pb-2"
          >
            <label className="flex h-14 items-center overflow-hidden rounded-2xl bg-white text-gray-900 shadow-[0_8px_20px_rgba(0,0,0,0.15)] focus-within:ring-4 focus-within:ring-white/40">
              <span className="sr-only">Your name</span>
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
                className="h-full w-full bg-transparent px-4 text-[16px] font-semibold placeholder:font-medium placeholder:text-gray-400 focus:outline-none"
              />
            </label>
            {nameError || error ? (
              <p role="alert" className="flex items-center justify-center gap-1.5 rounded-xl bg-black/20 px-3 py-2 text-[13px] font-semibold">
                <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
                {nameError || error}
              </p>
            ) : null}
            <button type="submit" disabled={isLoading || name.trim().length < 2} className={secondaryBtn}>
              {isLoading ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" /> : null}
              {isLoading ? "Saving…" : "Start Shopping"}
            </button>
          </motion.form>
        )}
      </AnimatePresence>
    </AuthShell>
  )
}
