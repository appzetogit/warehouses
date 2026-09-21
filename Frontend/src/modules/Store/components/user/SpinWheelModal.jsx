import React, { useState, useEffect, useRef } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { X, Sparkles, Coins, Gift, Clock, AlertCircle } from "lucide-react"
import confetti from "canvas-confetti"
import { toast } from "sonner"
import { spinAPI } from "@store/api"

const DEFAULT_SEGMENTS = [
  { id: 1, label: "10 Coins", type: "coins", value: 10, color: "#f59e0b" },
  { id: 2, label: "25 Coins", type: "coins", value: 25, color: "#8b5cf6" },
  { id: 3, label: "Better Luck", type: "none", value: 0, color: "#6b7280" },
  { id: 4, label: "50 Coins", type: "coins", value: 50, color: "#10b981" },
  { id: 5, label: "5 Coins", type: "coins", value: 5, color: "#3b82f6" },
  { id: 6, label: "100 Coins 🌟", type: "coins", value: 100, color: "#ec4899" },
]

export default function SpinWheelModal({ isOpen, onClose, onRewardEarned }) {
  const [segments, setSegments] = useState(DEFAULT_SEGMENTS)
  const [canSpin, setCanSpin] = useState(true)
  const [spinsRemaining, setSpinsRemaining] = useState(1)
  const [coinBalance, setCoinBalance] = useState(0)
  const [isSpinning, setIsSpinning] = useState(false)
  const [rotation, setRotation] = useState(0)
  const [wonResult, setWonResult] = useState(null)
  const [loading, setLoading] = useState(true)
  const wheelRef = useRef(null)

  useEffect(() => {
    if (!isOpen) {
      setWonResult(null)
      return
    }

    let isMounted = true
    setLoading(true)

    spinAPI
      .getStatus()
      .then((res) => {
        if (!isMounted) return
        const data = res?.data || res
        if (Array.isArray(data.segments) && data.segments.length > 0) {
          setSegments(data.segments)
        }
        setCanSpin(!!data.canSpin)
        setSpinsRemaining(data.spinsRemaining ?? 0)
        setCoinBalance(data.coinBalance ?? 0)
      })
      .catch((err) => {
        // Fallback for unauthenticated or network failure
        console.warn("Could not load spin status:", err)
      })
      .finally(() => {
        if (isMounted) setLoading(false)
      })

    return () => {
      isMounted = false
    }
  }, [isOpen])

  const handleSpin = async () => {
    if (isSpinning || !canSpin || spinsRemaining <= 0) return

    setIsSpinning(true)
    setWonResult(null)

    try {
      const res = await spinAPI.play()
      const data = res?.data || res
      const winIndex = data.winningIndex ?? 0
      const wonSegment = data.segment || segments[winIndex] || segments[0]

      const numSegments = segments.length
      const sliceAngle = 360 / numSegments

      // The top pointer points at 270 degrees (or -90).
      // Center of segment i is at (i * sliceAngle + sliceAngle / 2)
      // To bring segment i to the top (270 deg):
      // targetRotation = (360 * 5) + (270 - (winIndex * sliceAngle + sliceAngle / 2))
      const extraSpins = 360 * 6 // 6 full rotations
      const targetAngle = 270 - (winIndex * sliceAngle + sliceAngle / 2)
      const finalRotation = rotation + extraSpins + (targetAngle - (rotation % 360))

      setRotation(finalRotation)

      setTimeout(() => {
        setIsSpinning(false)
        setCanSpin(false)
        setSpinsRemaining(0)
        setWonResult(wonSegment)

        if (wonSegment.type === "coins" && wonSegment.value > 0) {
          confetti({
            particleCount: 80,
            spread: 70,
            origin: { y: 0.6 },
            colors: ["#f59e0b", "#10b981", "#8b5cf6", "#ec4899"],
          })
          toast.success(`🎉 Congratulations! You won ${wonSegment.value} coins!`)
          if (onRewardEarned) onRewardEarned(wonSegment.value)
        } else {
          toast.info("Better luck next time! Check back tomorrow for another spin.")
        }
      }, 5000) // 5s spin duration
    } catch (err) {
      setIsSpinning(false)
      const msg = err?.response?.data?.message || err?.message || "Failed to spin wheel."
      toast.error(msg)
    }
  }

  if (!isOpen) return null

  const sliceAngle = 360 / segments.length
  const radius = 140
  const center = 150

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md">
        <motion.div
          initial={{ opacity: 0, scale: 0.9, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.9, y: 20 }}
          className="relative w-full max-w-md overflow-hidden rounded-3xl bg-gradient-to-b from-gray-900 via-gray-950 to-black p-6 border border-amber-500/30 shadow-2xl text-white text-center"
        >
          {/* Header button */}
          <button
            onClick={onClose}
            className="absolute top-4 right-4 p-2 rounded-full bg-white/10 hover:bg-white/20 text-gray-400 hover:text-white transition"
          >
            <X className="w-5 h-5" />
          </button>

          {/* Title badge */}
          <div className="inline-flex items-center gap-2 px-3 py-1 mb-2 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-400 text-xs font-semibold tracking-wide uppercase">
            <Sparkles className="w-3.5 h-3.5 text-amber-400 animate-spin" />
            Daily Lucky Wheel
          </div>

          <h2 className="text-2xl font-bold bg-gradient-to-r from-amber-200 via-yellow-400 to-amber-500 bg-clip-text text-transparent">
            Spin & Win Coins
          </h2>
          <p className="text-xs text-gray-400 mt-1 mb-6">
            Use coins to get up to 50% off your food & marketplace orders!
          </p>

          {/* Wheel Container */}
          <div className="relative w-[300px] h-[300px] mx-auto mb-6 flex items-center justify-center">
            {/* Top Pointer Indicator */}
            <div className="absolute top-0 left-1/2 -translate-x-1/2 z-20 -mt-2">
              <div className="w-6 h-8 bg-amber-400 clip-triangle shadow-lg drop-shadow-[0_0_8px_rgba(245,158,11,0.8)]"
                   style={{ clipPath: "polygon(50% 100%, 0 0, 100% 0)" }}
              />
            </div>

            {/* Glowing outer ring */}
            <div className="absolute inset-0 rounded-full border-4 border-amber-500/40 shadow-[0_0_25px_rgba(245,158,11,0.3)] animate-pulse pointer-events-none" />

            {/* SVG Wheel */}
            <motion.div
              ref={wheelRef}
              className="w-full h-full"
              style={{ transformOrigin: "center center" }}
              animate={{ rotate: rotation }}
              transition={{ duration: 5, ease: [0.15, 0.9, 0.2, 1] }}
            >
              <svg width="300" height="300" viewBox="0 0 300 300" className="w-full h-full drop-shadow-md">
                <g transform="translate(150, 150)">
                  {segments.map((seg, i) => {
                    const startAngle = (i * sliceAngle * Math.PI) / 180
                    const endAngle = ((i + 1) * sliceAngle * Math.PI) / 180
                    const x1 = radius * Math.cos(startAngle)
                    const y1 = radius * Math.sin(startAngle)
                    const x2 = radius * Math.cos(endAngle)
                    const y2 = radius * Math.sin(endAngle)
                    const pathData = `M 0 0 L ${x1} ${y1} A ${radius} ${radius} 0 0 1 ${x2} ${y2} Z`

                    // Label rotation angle
                    const midAngle = i * sliceAngle + sliceAngle / 2
                    return (
                      <g key={seg.id || i}>
                        <path d={pathData} fill={seg.color || "#3b82f6"} stroke="#1e293b" strokeWidth="2" />
                        <g transform={`rotate(${midAngle}) translate(${radius * 0.65}, 0)`}>
                          <text
                            transform="rotate(90)"
                            textAnchor="middle"
                            alignmentBaseline="middle"
                            fill="#ffffff"
                            fontSize="11"
                            fontWeight="bold"
                            style={{ filter: "drop-shadow(0px 1px 2px rgba(0,0,0,0.8))" }}
                          >
                            {seg.label}
                          </text>
                        </g>
                      </g>
                    )
                  })}
                </g>
              </svg>
            </motion.div>

            {/* Center Spin Button / Hub */}
            <div className="absolute inset-0 m-auto w-16 h-16 rounded-full bg-gradient-to-br from-amber-400 to-yellow-600 border-2 border-white/50 shadow-xl flex items-center justify-center z-10">
              <button
                onClick={handleSpin}
                disabled={isSpinning || !canSpin}
                className="w-full h-full rounded-full flex flex-col items-center justify-center text-[10px] font-extrabold uppercase tracking-tight text-gray-950 transition hover:scale-105 active:scale-95 disabled:opacity-60 cursor-pointer disabled:cursor-not-allowed"
              >
                {isSpinning ? "..." : "SPIN"}
              </button>
            </div>
          </div>

          {/* Winning Celebration Card */}
          {wonResult && (
            <motion.div
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              className="p-4 mb-4 rounded-2xl bg-amber-500/10 border border-amber-500/40 text-center"
            >
              {wonResult.type === "coins" && wonResult.value > 0 ? (
                <div>
                  <div className="text-3xl mb-1">🎁</div>
                  <div className="font-bold text-amber-300 text-lg">You Won {wonResult.value} Coins!</div>
                  <div className="text-xs text-gray-300 mt-1">
                    Added to your coin balance. Usable on any checkout!
                  </div>
                </div>
              ) : (
                <div>
                  <div className="text-2xl mb-1">☘️</div>
                  <div className="font-bold text-gray-200">Better Luck Next Time!</div>
                  <div className="text-xs text-gray-400 mt-1">
                    Come back tomorrow for a guaranteed free spin!
                  </div>
                </div>
              )}
            </motion.div>
          )}

          {/* Footer Info */}
          <div className="flex items-center justify-between text-xs text-gray-400 pt-2 border-t border-white/10">
            <div className="flex items-center gap-1.5">
              <Coins className="w-4 h-4 text-amber-400" />
              <span>Balance: <strong className="text-white">{coinBalance} Coins</strong></span>
            </div>
            <div className="flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-gray-400" />
              <span>{canSpin ? "1 Daily Spin Ready" : "Resets Tomorrow"}</span>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  )
}
