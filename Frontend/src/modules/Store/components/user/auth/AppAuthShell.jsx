import { useNavigate } from "react-router-dom"
import { ArrowLeft, ShieldCheck } from "lucide-react"
import { motion } from "framer-motion"
import { brandLogoOnDark } from "@/config/brandMark"
import { APP_CONFIG } from "@/config/constants"

/**
 * The customer sign-in look, matching the customer app: a 260px brown hero
 * with the logo and a wave at the bottom, a shield badge, a dark title with a
 * grey explanation, and the page's own content below on a warm off-white.
 * Shared by sign-in and OTP so the two read as one flow.
 */
export default function AppAuthShell({ title, subtitle, tagline, onBack, footer, children }) {
  const navigate = useNavigate()
  const back = onBack || (() => (window.history.length > 1 ? navigate(-1) : navigate("/")))

  return (
    <div className="relative flex min-h-[100dvh] flex-col bg-[#FCFBFA] font-app text-app-ink">
      {/* Hero: brown gradient, logo, wave into the page colour. */}
      <div className="relative h-[260px] w-full shrink-0 overflow-hidden bg-gradient-to-br from-app-brown-deep via-app-brown to-app-brown-mid">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(circle at 80% 15%, rgba(233,193,154,0.28) 0%, rgba(233,193,154,0) 45%), radial-gradient(circle at 10% 90%, rgba(233,193,154,0.18) 0%, rgba(233,193,154,0) 40%)",
          }}
        />
        <motion.div
          initial={{ y: 12, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.5, ease: "easeOut" }}
          className="relative flex h-full flex-col items-center justify-center px-6 pb-10 text-center"
        >
          <img src={brandLogoOnDark()} alt={APP_CONFIG.NAME} className="h-20 w-auto object-contain drop-shadow-[0_4px_12px_rgba(0,0,0,0.3)]" />
          {tagline ? <p className="mt-2 text-[13px] font-medium tracking-wide text-app-champagne">{tagline}</p> : null}
        </motion.div>
        <svg
          aria-hidden="true"
          viewBox="0 0 400 60"
          preserveAspectRatio="none"
          className="pointer-events-none absolute inset-x-0 bottom-[-1px] h-[60px] w-full"
        >
          <path d="M0,60 L0,30 Q100,0 200,26 T400,22 L400,60 Z" fill="#FCFBFA" />
        </svg>
      </div>

      <button
        type="button"
        onClick={back}
        aria-label="Back"
        className="absolute left-4 top-[max(12px,env(safe-area-inset-top))] z-20 flex h-10 w-10 items-center justify-center rounded-full bg-black/35 text-white backdrop-blur-sm hover:bg-black/45 active:scale-95"
      >
        <ArrowLeft className="h-[22px] w-[22px]" aria-hidden="true" />
      </button>

      {/* Shield badge overlapping the wave. */}
      <div className="relative z-10 -mt-6 flex justify-center">
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-app-brown text-white shadow-[0_4px_12px_rgba(88,50,29,0.35)]">
          <ShieldCheck className="h-[26px] w-[26px]" aria-hidden="true" />
        </span>
      </div>

      <div className="relative z-10 mx-auto flex w-full max-w-md flex-1 flex-col px-6 pb-[max(20px,env(safe-area-inset-bottom))] pt-3">
        <motion.div
          initial={{ y: 12, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.45, ease: "easeOut" }}
          className="flex flex-col items-center text-center"
        >
          {title ? <h1 className="text-[22px] font-bold leading-tight tracking-[-0.2px] text-app-ink">{title}</h1> : null}
          {subtitle ? <p className="mt-2 text-[13.5px] leading-[1.35] text-[#757575]">{subtitle}</p> : null}
        </motion.div>

        <motion.div
          initial={{ y: 18, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.45, delay: 0.08, ease: "easeOut" }}
          className="mt-6 flex flex-1 flex-col"
        >
          {children}
        </motion.div>

        {footer ? <div className="mt-6 text-center text-[13px] text-[#757575]">{footer}</div> : null}
      </div>
    </div>
  )
}

/** Brown gradient pill (main action) and outlined brown pill (second action). */
export const primaryBtn =
  "flex h-[52px] w-full items-center justify-center gap-2 rounded-[26px] bg-gradient-to-r from-[#58321D] to-[#A15C35] text-[16px] font-bold text-white shadow-[0_6px_14px_rgba(88,50,29,0.35)] transition active:scale-[0.98] disabled:opacity-55 disabled:shadow-none"
export const secondaryBtn =
  "flex h-[52px] w-full items-center justify-center gap-2 rounded-[26px] border-[1.8px] border-app-brown bg-white text-[16px] font-bold text-app-brown transition active:scale-[0.98] disabled:opacity-55"

/** Phone box (brown rim) and plain text field (light rim, brown on focus). */
export const phoneBox =
  "flex h-[60px] items-center overflow-hidden rounded-[20px] border-[1.8px] border-app-brown bg-white shadow-[0_4px_14px_rgba(88,50,29,0.12)]"
export const fieldBox =
  "flex h-[60px] items-center overflow-hidden rounded-[20px] border-[1.8px] border-app-line bg-white transition focus-within:border-app-brown focus-within:shadow-[0_3px_10px_rgba(88,50,29,0.12)]"

/** Inline error line for the light page. */
export const errorLine = "flex items-center justify-center gap-1.5 rounded-xl bg-red-50 px-3 py-2 text-[13px] font-semibold text-red-700"
