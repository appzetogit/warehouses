import { useNavigate } from "react-router-dom"
import { ArrowLeft } from "lucide-react"
import { motion } from "framer-motion"
import { brandLogoOnDark } from "@/config/brandMark"
import { APP_CONFIG } from "@/config/constants"

/**
 * The customer sign-in look: a store photo that fades into the brand orange,
 * the logo, a title and a tagline, and the page's own content below.
 * Shared by sign-in and OTP so the two read as one flow.
 */
export default function AuthShell({ title, subtitle, tagline, onBack, footer, children }) {
  const navigate = useNavigate()
  const back = onBack || (() => (window.history.length > 1 ? navigate(-1) : navigate("/")))

  return (
    <div className="relative flex min-h-[100dvh] flex-col overflow-hidden bg-[#EA580C] font-sans text-white">
      <img
        src="/images/auth-store.webp"
        alt=""
        aria-hidden="true"
        className="wh-kenburns pointer-events-none absolute inset-0 h-full w-full object-cover"
      />
      {/* Photo at the top, brand orange from the middle down, so text always reads. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "linear-gradient(180deg, rgba(20,12,6,0.55) 0%, rgba(20,12,6,0.35) 20%, rgba(234,88,12,0.82) 42%, rgba(234,88,12,0.97) 56%, #EA580C 100%)",
        }}
      />

      <button
        type="button"
        onClick={back}
        aria-label="Back"
        className="absolute left-3 top-[max(12px,env(safe-area-inset-top))] z-20 flex h-10 w-10 items-center justify-center rounded-full bg-black/25 text-white backdrop-blur-sm hover:bg-black/35 active:scale-95"
      >
        <ArrowLeft className="h-5 w-5" aria-hidden="true" />
      </button>

      <div className="relative z-10 mx-auto flex w-full max-w-md flex-1 flex-col px-6 pb-[max(20px,env(safe-area-inset-bottom))] pt-[12dvh]">
        <motion.div
          initial={{ y: 16, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.5, ease: "easeOut" }}
          className="flex flex-col items-center text-center"
        >
          <img src={brandLogoOnDark()} alt={APP_CONFIG.NAME} className="h-20 w-auto object-contain drop-shadow-[0_4px_12px_rgba(0,0,0,0.35)]" />
          {title ? <h1 className="mt-3 text-[24px] font-bold leading-tight [text-shadow:0_2px_8px_rgba(0,0,0,0.35)]">{title}</h1> : null}
          {subtitle ? <p className="mt-2 text-[15px] font-medium text-white [text-shadow:0_1px_6px_rgba(0,0,0,0.3)]">{subtitle}</p> : null}
          {tagline ? <p className="mt-0.5 text-[15px] font-medium text-white [text-shadow:0_1px_6px_rgba(0,0,0,0.3)]">{tagline}</p> : null}
        </motion.div>

        <motion.div
          initial={{ y: 24, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.1, ease: "easeOut" }}
          className="mt-6 flex flex-1 flex-col"
        >
          {children}
        </motion.div>

        {footer ? <div className="mt-6 text-center text-[13px] text-white/90">{footer}</div> : null}
      </div>
    </div>
  )
}

/** The two button styles from the design: deep orange with a light rim, and white. */
export const primaryBtn =
  "flex h-14 w-full items-center justify-center gap-2 rounded-2xl border border-white/40 bg-[#C2410C] text-[17px] font-bold text-white shadow-[0_8px_20px_rgba(0,0,0,0.18)] transition active:scale-[0.98] disabled:opacity-60"
export const secondaryBtn =
  "flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-white text-[17px] font-bold text-gray-900 shadow-[0_8px_20px_rgba(0,0,0,0.15)] transition active:scale-[0.98] disabled:opacity-60"
