import { useState } from "react"
import { useNavigate, Link } from "react-router-dom"
import { AnimatePresence, motion } from "framer-motion"
import { AlertCircle, Loader2 } from "lucide-react"
import { sellerAPI } from "@store/api"
import AuthShell, { primaryBtn, secondaryBtn } from "@store/components/user/auth/AuthShell"

/**
 * Seller sign-in in the storefront's look: Login / Create Account, then the
 * mobile number and an OTP. A number with no store yet is taken to store
 * registration after the OTP, so "Create Account" and "Login" share the flow.
 */
export default function SellerLogin() {
  const navigate = useNavigate()
  // welcome -> login | signup
  const [step, setStep] = useState(() => (sessionStorage.getItem("sellerLoginPhone") ? "login" : "welcome"))
  const [phone, setPhone] = useState(() => sessionStorage.getItem("sellerLoginPhone") || "")
  const [error, setError] = useState("")
  const [isSending, setIsSending] = useState(false)

  const validatePhone = (value) => {
    const digits = String(value || "").replace(/\D/g, "")
    if (!digits) return "Enter your mobile number"
    if (digits.length !== 10) return "Mobile number must be 10 digits"
    if (!["6", "7", "8", "9"].includes(digits[0])) return "Enter a valid Indian mobile number"
    return ""
  }

  const sendOTP = async (e) => {
    e.preventDefault()
    const phoneError = validatePhone(phone)
    if (phoneError) {
      setError(phoneError)
      return
    }
    const fullPhone = `+91 ${phone}`
    try {
      setIsSending(true)
      setError("")
      await sellerAPI.sendOTP(fullPhone, step === "signup" ? "register" : "login")
      sessionStorage.setItem(
        "sellerAuthData",
        JSON.stringify({ method: "phone", phone: fullPhone, isSignUp: step === "signup", module: "seller" }),
      )
      navigate("/seller/otp")
    } catch (apiErr) {
      setError(apiErr?.response?.data?.message || "Couldn't send the code. Please try again.")
    } finally {
      setIsSending(false)
    }
  }

  const goTo = (next) => {
    setError("")
    setStep(next)
  }

  return (
    <AuthShell
      title="Vendor App"
      subtitle="Grow Your Clothing Business"
      tagline="Sell Nearby • Get More Orders"
      onBack={step === "welcome" ? () => navigate("/") : () => goTo("welcome")}
      footer={
        <>
          <p>
            Are you a customer?{" "}
            <Link to="/" className="font-bold text-white underline-offset-2 hover:underline">
              Open Customer App
            </Link>
          </p>
          <p className="mt-3 text-[11px] text-white/75">
            <Link to="/seller/terms" className="underline">
              Terms
            </Link>
            {" · "}
            <Link to="/seller/privacy" className="underline">
              Privacy
            </Link>
            {" · "}
            <Link to="/seller/help-content" className="underline">
              Support
            </Link>
          </p>
        </>
      }
    >
      <AnimatePresence mode="wait">
        {step === "welcome" ? (
          <motion.div
            key="welcome"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            className="mt-auto space-y-4 pb-2"
          >
            <button type="button" className={primaryBtn} onClick={() => goTo("login")}>
              Login
            </button>
            <button type="button" className={secondaryBtn} onClick={() => goTo("signup")}>
              Create Account
            </button>
          </motion.div>
        ) : (
          <motion.form
            key={step}
            onSubmit={sendOTP}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            className="mt-auto space-y-4 pb-2"
            noValidate
          >
            <div className="text-center">
              <h2 className="text-[18px] font-bold">{step === "signup" ? "Register Your Store" : "Welcome Back"}</h2>
              <p className="mt-0.5 text-[13px] text-white/85">
                {step === "signup"
                  ? "Verify your number, then add your store details"
                  : "Enter your registered mobile number"}
              </p>
            </div>

            <label className="flex h-14 items-center overflow-hidden rounded-2xl bg-white text-gray-900 shadow-[0_8px_20px_rgba(0,0,0,0.15)] focus-within:ring-4 focus-within:ring-white/40">
              <span className="sr-only">Mobile number</span>
              <span className="flex h-full items-center border-r border-gray-200 px-4 text-[16px] font-bold text-gray-800">+91</span>
              <input
                type="tel"
                inputMode="numeric"
                autoComplete="tel-national"
                autoFocus
                maxLength={10}
                value={phone}
                onChange={(e) => {
                  const value = e.target.value.replace(/\D/g, "").slice(0, 10)
                  setPhone(value)
                  sessionStorage.setItem("sellerLoginPhone", value)
                  setError("")
                }}
                placeholder="Mobile Number"
                className="h-full w-full bg-transparent px-4 text-[17px] font-bold tracking-wider placeholder:font-medium placeholder:tracking-normal placeholder:text-gray-400 focus:outline-none"
              />
            </label>

            {error ? (
              <p role="alert" className="flex items-center justify-center gap-1.5 rounded-xl bg-black/20 px-3 py-2 text-[13px] font-semibold">
                <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
                {error}
              </p>
            ) : null}

            <button type="submit" className={secondaryBtn} disabled={isSending || phone.length !== 10}>
              {isSending ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" /> : null}
              {isSending ? "Sending Code…" : "Get OTP"}
            </button>

            <p className="text-center text-[14px] text-white/90">
              {step === "signup" ? "Already selling with us? " : "New seller? "}
              <button type="button" onClick={() => goTo(step === "signup" ? "login" : "signup")} className="font-bold text-white underline-offset-2 hover:underline">
                {step === "signup" ? "Login" : "Create Account"}
              </button>
            </p>
          </motion.form>
        )}
      </AnimatePresence>
    </AuthShell>
  )
}
