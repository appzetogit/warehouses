import { useState, useEffect, useRef } from "react"
import { useNavigate, Link, useSearchParams } from "react-router-dom"
import { AlertCircle, Loader2 } from "lucide-react"
import { AnimatePresence, motion } from "framer-motion"
import { authAPI } from "@store/api"
import AuthShell, { primaryBtn, secondaryBtn } from "@store/components/user/auth/AuthShell"

const NAME_REGEX = /^[A-Za-z ]+$/

/**
 * Customer sign-in: a welcome with Login / Create Account, then the mobile
 * number (and the name, for a new account). Both go on to the OTP page;
 * signing in with a number that has no account yet creates one there.
 */
export default function SignIn() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()

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

  const inputBox =
    "flex h-14 items-center overflow-hidden rounded-2xl bg-white text-gray-900 shadow-[0_8px_20px_rgba(0,0,0,0.15)] focus-within:ring-4 focus-within:ring-white/40"

  return (
    <AuthShell
      title="Fashion Near You"
      subtitle="Shop Local Stores • Delivered Fast"
      tagline="Courier in Days or Quick in Minutes"
      onBack={step === "welcome" ? undefined : () => goTo("welcome")}
      footer={
        <>
          <p>
            Are you a seller?{" "}
            <Link to="/seller/login" className="font-bold text-white underline-offset-2 hover:underline">
              Open Seller App
            </Link>
          </p>
          <p className="mt-3 text-[11px] text-white/75">
            By continuing, you agree to our{" "}
            <Link to="/profile/terms" className="underline">
              Terms
            </Link>{" "}
            and{" "}
            <Link to="/profile/privacy" className="underline">
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
            onSubmit={submit}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            className="mt-auto space-y-4 pb-2"
            noValidate
          >
            <h2 className="text-center text-[18px] font-bold">{step === "signup" ? "Create Your Account" : "Welcome Back"}</h2>

            {step === "signup" ? (
              <label className={inputBox}>
                <span className="sr-only">Your name</span>
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
                  className="h-full w-full bg-transparent px-4 text-[16px] font-semibold placeholder:font-medium placeholder:text-gray-400 focus:outline-none"
                />
              </label>
            ) : null}

            <label className={inputBox}>
              <span className="sr-only">Mobile number</span>
              <span className="flex h-full items-center border-r border-gray-200 px-4 text-[16px] font-bold text-gray-800">+91</span>
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

            <button type="submit" className={secondaryBtn} disabled={isLoading || phone.length !== 10 || (step === "signup" && name.trim().length < 2)}>
              {isLoading ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" /> : null}
              {isLoading ? "Sending Code…" : "Get OTP"}
            </button>

            <p className="text-center text-[14px] text-white/90">
              {step === "signup" ? "Already have an account? " : "New here? "}
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
