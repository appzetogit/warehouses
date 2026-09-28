import { useState, useEffect, useRef } from "react"
import { useNavigate } from "react-router-dom"
import { motion, useReducedMotion } from "framer-motion"
import { AlertCircle, Loader2 } from "lucide-react"
import AuthShell, { secondaryBtn } from "@store/components/user/auth/AuthShell"
import { sellerAPI } from "@store/api"
import {
  setAuthData as setSellerAuthData,
  setSellerPendingPhone,
} from "@store/utils/auth"
import { resolveDeviceFcmToken, registerWebPushForCurrentModule } from "@store/utils/firebaseMessaging"
import { useCompanyName } from "@store/hooks/useCompanyName"
import { loadBusinessSettings, getModuleLogoUrl } from "@store/utils/businessSettings"
import brandMark from "@/config/brandMark"

const THEME = "#FD920B"
const THEME_INK = "#B45309"

export default function SellerOTP() {
  const companyName = useCompanyName()
  const navigate = useNavigate()
  const prefersReducedMotion = useReducedMotion()
  const [logoUrl, setLogoUrl] = useState(() => getModuleLogoUrl("seller") || brandMark)
  const [otp, setOtp] = useState(["", "", "", ""])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState("")
  const [resendTimer, setResendTimer] = useState(0)
  const [authData, setAuthData] = useState(null)
  const [contactInfo, setContactInfo] = useState("")
  const [focusedIndex, setFocusedIndex] = useState(null)
  const [keyboardInset, setKeyboardInset] = useState(0)
  const inputRefs = useRef([])
  const hasSubmittedRef = useRef(false)

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        await loadBusinessSettings()
        const logo = getModuleLogoUrl("seller")
        if (logo) setLogoUrl(logo)
      } catch {
        // keep fallback
      }
    }
    fetchSettings()

    const handleSettingsUpdate = async () => {
      await loadBusinessSettings()
      const logo = getModuleLogoUrl("seller")
      if (logo) setLogoUrl(logo)
    }
    window.addEventListener("businessSettingsUpdated", handleSettingsUpdate)
    return () => window.removeEventListener("businessSettingsUpdated", handleSettingsUpdate)
  }, [])

  useEffect(() => {
    const stored = sessionStorage.getItem("sellerAuthData")
    if (stored) {
      const data = JSON.parse(stored)
      setAuthData(data)
      if (data.method === "email" && data.email) {
        setContactInfo(data.email)
      } else if (data.phone) {
        const phoneMatch = data.phone?.match(/(\+\d+)\s*(.+)/)
        setContactInfo(
          // "+91 90000 00000", with non-breaking spaces so it never splits.
          phoneMatch
            ? (() => {
                const d = phoneMatch[2].replace(/\D/g, "")
                const nbsp = String.fromCharCode(160)
                return `${phoneMatch[1]}${nbsp}${d.slice(0, 5)}${nbsp}${d.slice(5)}`
              })()
            : data.phone || ""
        )
      }
    } else {
      navigate("/seller/login")
      return
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
    const focusFirstInput = () => inputRefs.current[0]?.focus()
    const frameId = requestAnimationFrame(() => {
      focusFirstInput()
      window.setTimeout(focusFirstInput, 120)
    })
    return () => cancelAnimationFrame(frameId)
  }, [authData])

  useEffect(() => {
    if (typeof window === "undefined" || !window.visualViewport) return undefined
    const viewport = window.visualViewport
    const updateKeyboardInset = () => {
      const inset = Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop)
      setKeyboardInset(inset > 0 ? inset : 0)
    }
    updateKeyboardInset()
    viewport.addEventListener("resize", updateKeyboardInset)
    viewport.addEventListener("scroll", updateKeyboardInset)
    return () => {
      viewport.removeEventListener("resize", updateKeyboardInset)
      viewport.removeEventListener("scroll", updateKeyboardInset)
    }
  }, [])

  const handleChange = (index, value) => {
    if (value && !/^\d$/.test(value)) return
    const newOtp = [...otp]
    newOtp[index] = value
    setOtp(newOtp)
    setError("")

    if (value && index < 3) inputRefs.current[index + 1]?.focus()

    if (newOtp.every((digit) => digit !== "") && newOtp.length === 4) {
      if (!hasSubmittedRef.current) {
        hasSubmittedRef.current = true
        handleVerify(newOtp.join(""))
      }
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

  const handlePaste = (index, e) => {
    e.preventDefault()
    const pastedData = e.clipboardData.getData("text")
    const digits = pastedData.replace(/\D/g, "").slice(0, 4).split("")
    const newOtp = [...otp]
    digits.forEach((digit, i) => {
      if (i < 4) newOtp[i] = digit
    })
    setOtp(newOtp)
    if (digits.length === 4) handleVerify(newOtp.join(""))
    else inputRefs.current[digits.length]?.focus()
  }

  const handleVerify = async (otpValue = null) => {
    const code = otpValue || otp.join("")
    if (hasSubmittedRef.current && !otpValue) return
    if (code.length !== 4) {
      setError("Please enter the complete 4-digit code")
      hasSubmittedRef.current = false
      return
    }

    setIsLoading(true)
    setError("")

    try {
      if (!authData) throw new Error("Session expired.")
      const phone = authData.method === "phone" ? authData.phone : null
      const email = authData.method === "email" ? authData.email : null
      const purpose = authData.isSignUp ? "register" : "login"

      let fcmToken = null
      let platform = "web"
      try {
        const resolved = await resolveDeviceFcmToken("seller", { allowPrompt: true })
        fcmToken = resolved?.token || null
        platform = resolved?.platform || "web"
      } catch (e) {
        // Continue login even if FCM resolve fails
      }

      const response = await sellerAPI.verifyOTP(phone, code, purpose, null, email, fcmToken, platform)
      const data = response?.data?.data || response?.data
      const needsRegistration = data?.needsRegistration === true
      const normalizedPhone = data?.phone || phone

      if (needsRegistration) {
        setSellerPendingPhone(normalizedPhone)
        sessionStorage.removeItem("sellerAuthData")
        sessionStorage.removeItem("sellerLoginPhone")
        navigate("/seller/onboarding", { replace: true })
        return
      }

      const accessToken = data?.accessToken
      const refreshToken = data?.refreshToken ?? null
      const seller = data?.user ?? data?.seller

      if (accessToken && seller) {
        setSellerAuthData("seller", accessToken, seller, refreshToken)
        window.dispatchEvent(new Event("sellerAuthChanged"))
        sessionStorage.removeItem("sellerAuthData")
        sessionStorage.removeItem("sellerLoginPhone")
        registerWebPushForCurrentModule("/seller", { force: true }).catch(() => {})
        navigate("/seller", { replace: true })
      }
    } catch (err) {
      const message =
        err?.response?.data?.message ||
        err?.response?.data?.error ||
        err?.message ||
        "Invalid OTP."
      if (/pending approval/i.test(message)) {
        const pendingPhone = authData?.phone || authData?.email || contactInfo
        if (pendingPhone) setSellerPendingPhone(pendingPhone)
        sessionStorage.removeItem("sellerAuthData")
        sessionStorage.removeItem("sellerLoginPhone")
        navigate("/seller/pending-verification", {
          replace: true,
          state: { phone: pendingPhone || "" },
        })
        return
      }
      setError(message)
      setOtp(["", "", "", ""])
      hasSubmittedRef.current = false
      inputRefs.current[0]?.focus()
    } finally {
      setIsLoading(false)
    }
  }

  const handleResend = async () => {
    if (resendTimer > 0) return
    setIsLoading(true)
    setError("")
    try {
      if (!authData) throw new Error("Session expired.")
      const purpose = authData.isSignUp ? "register" : "login"
      const phone = authData.method === "phone" ? authData.phone : null
      const email = authData.method === "email" ? authData.email : null
      await sellerAPI.sendOTP(phone, purpose, email)
      setResendTimer(60)
    } catch {
      setError("Failed to resend OTP.")
    }
    setIsLoading(false)
    setOtp(["", "", "", ""])
    inputRefs.current[0]?.focus()
  }

  const formMotion = prefersReducedMotion
    ? {}
    : {
        initial: { opacity: 0, y: 12 },
        animate: { opacity: 1, y: 0 },
        transition: { duration: 0.35, ease: "easeOut" },
      }

  const isOtpComplete = otp.every((digit) => digit !== "")

  if (!authData) return null

  const box =
    "h-16 w-14 rounded-2xl border-2 bg-white text-center text-[28px] font-bold text-gray-900 shadow-[0_8px_20px_rgba(0,0,0,0.15)] outline-none transition focus:border-[#7C2D12] disabled:opacity-60"

  return (
    <AuthShell
      title="Verify Your Number"
      subtitle={`Enter the 4-digit code sent to ${contactInfo}`}
      onBack={() => navigate("/seller/login")}
      footer={<p className="text-[11px] text-white/75">{companyName} Vendor App</p>}
    >
      <motion.div
        initial={prefersReducedMotion ? false : { opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="mt-auto space-y-5 pb-2"
        style={{ paddingBottom: keyboardInset ? `${keyboardInset}px` : undefined }}
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
              onChange={(e) => handleChange(index, e.target.value)}
              onKeyDown={(e) => handleKeyDown(index, e)}
              onPaste={(e) => handlePaste(index, e)}
              onFocus={() => setFocusedIndex(index)}
              onBlur={() => setFocusedIndex(null)}
              disabled={isLoading}
              className={`${box} ${digit || focusedIndex === index ? "border-white" : "border-transparent"}`}
            />
          ))}
        </div>

        {error ? (
          <p role="alert" className="flex items-center justify-center gap-1.5 rounded-xl bg-black/20 px-3 py-2 text-[13px] font-semibold">
            <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
            {error}
          </p>
        ) : null}

        <button type="button" onClick={() => handleVerify()} disabled={isLoading || !isOtpComplete} className={secondaryBtn}>
          {isLoading ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" /> : null}
          {isLoading ? "Verifying…" : "Verify"}
        </button>

        <div className="flex items-center justify-between text-[14px]">
          <button type="button" onClick={() => navigate("/seller/login")} className="font-semibold text-white/95 underline-offset-2 hover:underline">
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
    </AuthShell>
  )
}
