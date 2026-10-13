import { useState, useEffect, useRef } from "react"
import { useNavigate, Link, useSearchParams, useLocation } from "react-router-dom"
import { AlertCircle, Loader2, User } from "lucide-react"
import { AnimatePresence, motion } from "framer-motion"
import { authAPI } from "@store/api"
import AppAuthShell, { primaryBtn, secondaryBtn, phoneBox, fieldBox, errorLine } from "@store/components/user/auth/AppAuthShell"
import { isModuleAuthenticated } from "@store/utils/auth"
import { pickRedirectPath } from "./authRedirect"

const NAME_REGEX = /^[A-Za-z ]+$/

/**
 * Customer sign-in: a welcome with Login / Create Account, then the mobile
 * number (and the name, for a new account). Both go on to the OTP page;
 * signing in with a number that has no account yet creates one there.
 */
export default function SignIn() {
  const navigate = useNavigate()
  const location = useLocation()
  const [searchParams] = useSearchParams()

  // Where to go once signed in: the page that sent the user here (state.from),
  // a ?next= link, or the target kept from an earlier visit ("Edit Number").
  const [returnTo] = useState(() => {
    let storedFrom = null
    try {
      storedFrom = JSON.parse(sessionStorage.getItem("userAuthData") || "null")?.from || null
    } catch {
      /* ignore a bad stored value */
    }
    return pickRedirectPath(location.state?.from, searchParams.get("next"), storedFrom)
  })

  // Already signed in: nothing to do here.
  useEffect(() => {
    if (isModuleAuthenticated("user")) navigate(returnTo || "/", { replace: true })
  }, [navigate, returnTo])

  // welcome -> login | signup
  const [step, setStep] = useState("welcome")
  const [phone, setPhone] = useState("")
  const [name, setName] = useState("")
  const [error, setError] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const submittingRef = useRef(false)

  // Back from the OTP page ("Edit Number"): straight to the number, filled in.
  useEffect(() => {
    const stored = sessionStorage.getItem("userAuthData")
    if (!stored) return
    try {
      const data = JSON.parse(stored)
      const digits = String(data.phone || "").replace(/^\+91\s*/, "").replace(/\D/g, "").slice(0, 10)
      if (digits) setPhone(digits)
      if (data.name) setName(data.name)
      setStep(data.isSignUp ? "signup" : "login")
    } catch {
      /* ignore a bad stored value */
    }
  }, [])

  const phoneError = (value) => {
    if (!value.trim()) return "Enter your mobile number"
    if (!/^\d{10}$/.test(value)) return "Mobile number must be 10 digits"
    return ""
  }

  const submit = async (e) => {
    e.preventDefault()
    const isSignUp = step === "signup"
    const cleanName = name.replace(/\s+/g, " ").trim()
    if (isSignUp && (cleanName.length < 2 || !NAME_REGEX.test(cleanName))) {
      setError("Enter your name (letters and spaces only)")
      return
    }
    const pErr = phoneError(phone)
    if (pErr) {
      setError(pErr)
      return
    }
    if (submittingRef.current) return
    submittingRef.current = true
    setIsLoading(true)
    setError("")

    try {
      const fullPhone = `+91 ${phone}`
      await authAPI.sendOTP(fullPhone, isSignUp ? "register" : "login", null)
      const ref = String(searchParams.get("ref") || "").trim()
      sessionStorage.setItem(
        "userAuthData",
        JSON.stringify({
          method: "phone",
          phone: fullPhone,
          email: null,
          name: isSignUp ? cleanName : null,
          referralCode: ref || null,
          isSignUp,
          module: "user",
          from: returnTo,
        }),
      )
      navigate("/auth/otp")
    } catch (apiError) {
      setError(apiError?.response?.data?.message || apiError?.response?.data?.error || "Couldn't send the code. Please try again.")
    } finally {
      setIsLoading(false)
      submittingRef.current = false
    }
  }

  const goTo = (next) => {
    setError("")
    setStep(next)
  }

  const heading =
    step === "signup" ? "Create your account" : step === "login" ? "Enter your phone number" : "Fashion Near You"
  const explanation =
    step === "signup"
      ? "Tell us your name and phone number. We will send a 4-digit code to verify it."
      : step === "login"
        ? "We will send a 4-digit verification code to verify your phone number."
        : "Shop local stores, delivered fast. Courier in days or quick in minutes."

  return (
    <AppAuthShell
      title={heading}
      subtitle={explanation}
      tagline="Shop Local Stores • Delivered Fast"
      onBack={step === "welcome" ? undefined : () => goTo("welcome")}
      footer={
        <>
          <p className="text-[13.5px]">
            Are you a seller?{" "}
            <Link to="/seller/login" className="font-bold text-app-brown underline-offset-2 hover:underline">
              Open Seller App
            </Link>
          </p>
          <p className="mt-3 text-[11.5px] leading-[1.3]">
            By continuing, you agree to our{" "}
            <Link to="/profile/terms" className="font-semibold text-app-brown underline-offset-2 hover:underline">
              Terms
            </Link>{" "}
            and{" "}
            <Link to="/profile/privacy" className="font-semibold text-app-brown underline-offset-2 hover:underline">
              Privacy Policy
            </Link>
            .
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
            className="space-y-3.5 pt-2"
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
            onSubmit={submit}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            className="space-y-3.5"
            noValidate
          >
            {step === "signup" ? (
              <label className={fieldBox}>
                <span className="sr-only">Your name</span>
                <User className="ml-4 h-5 w-5 shrink-0 text-[#757575]" aria-hidden="true" />
                <input
                  type="text"
                  autoComplete="name"
                  autoFocus
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value.replace(/[^A-Za-z ]/g, ""))
                    setError("")
                  }}
                  placeholder="Your Name"
                  className="h-full w-full bg-transparent px-3 text-[15.5px] font-semibold text-app-ink caret-app-brown placeholder:font-normal placeholder:text-[#9E9E9E] focus:outline-none"
                />
              </label>
            ) : null}

            <label className={phoneBox}>
              <span className="sr-only">Mobile number</span>
              <span className="flex h-full shrink-0 items-center gap-1.5 pl-4 pr-3 text-[16px] font-semibold text-app-ink">
                <span aria-hidden="true" className="text-[20px] leading-none">
                  🇮🇳
                </span>
                +91
              </span>
              <span aria-hidden="true" className="h-7 w-px shrink-0 bg-app-line" />
              <input
                type="tel"
                inputMode="numeric"
                autoComplete="tel-national"
                autoFocus={step === "login"}
                maxLength={10}
                value={phone}
                onChange={(e) => {
                  setPhone(e.target.value.replace(/\D/g, "").slice(0, 10))
                  setError("")
                }}
                placeholder="Enter phone number"
                className="h-full w-full bg-transparent px-3.5 text-[15.5px] font-semibold tracking-wider text-app-ink caret-app-brown placeholder:text-[14.5px] placeholder:font-normal placeholder:tracking-normal placeholder:text-[#9E9E9E] focus:outline-none"
              />
            </label>

            {error ? (
              <p role="alert" className={errorLine}>
                <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
                {error}
              </p>
            ) : null}

            <div className="pt-1.5">
              <button type="submit" className={primaryBtn} disabled={isLoading || phone.length !== 10 || (step === "signup" && name.trim().length < 2)}>
                {isLoading ? <Loader2 className="h-[22px] w-[22px] animate-spin" aria-hidden="true" /> : null}
                {isLoading ? "Sending OTP…" : "Continue & Send OTP"}
              </button>
            </div>

            <p className="pt-1 text-center text-[13.5px] text-[#757575]">
              {step === "signup" ? "Already have an account? " : "New here? "}
              <button type="button" onClick={() => goTo(step === "signup" ? "login" : "signup")} className="font-bold text-app-brown underline-offset-2 hover:underline">
                {step === "signup" ? "Login" : "Create Account"}
              </button>
            </p>
          </motion.form>
        )}
      </AnimatePresence>
    </AppAuthShell>
  )
}
