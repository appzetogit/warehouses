import { memo } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronRight, ShoppingBag, X } from "lucide-react";
import { motion } from "framer-motion";
import { getOrderKey, getOrderStatusText } from "@store/hooks/useActiveOrderTracking";

/** A gently bobbing shopping bag while the order is on its way. */
const PackingAnimation = memo(() => (
  <div className="relative w-10 h-10 flex items-center justify-center rounded-xl bg-orange-50 border border-orange-100 shadow-[0_4px_12px_rgba(253,146,11,0.12)] shrink-0">
    <motion.div animate={{ y: [0, -2, 0] }} transition={{ duration: 1.2, repeat: Infinity, ease: "easeInOut" }}>
      <ShoppingBag className="w-[22px] h-[22px] text-orange-500" strokeWidth={2} aria-hidden="true" />
    </motion.div>
  </div>
))

function OrderTrackingRowInner({ order, timeRemaining, onDismiss, compact = false }) {
  const navigate = useNavigate();

  if (!order) return null;

  const orderId = getOrderKey(order);
  const sellerName = order.seller || order.sellerName || "Seller";
  const statusText = getOrderStatusText(order);
  const themeInk = "var(--module-theme-ink, #B45309)";

  return (
    <motion.button
      type="button"
      layout
      onClick={() => navigate(`/orders/${orderId}`)}
      className={`relative w-full text-left bg-white/95 backdrop-blur-xl rounded-2xl border overflow-hidden cursor-pointer group active:scale-[0.99] transition-transform ${
        compact ? "p-3" : "p-4"
      }`}
      style={{
        boxShadow: "0 8px 24px rgba(var(--module-theme-rgb, 253,146,11), 0.14)",
        borderColor: "rgba(var(--module-theme-rgb, 253,146,11), 0.2)",
      }}
    >
      <div
        className="absolute inset-0 opacity-50 pointer-events-none rounded-2xl"
        style={{
          background: "linear-gradient(to right, rgba(var(--module-theme-rgb, 253,146,11), 0.1), rgba(255,255,255,0.5))",
        }}
      />

      <span
        role="button"
        tabIndex={0}
        onClick={(e) => {
          e.stopPropagation();
          onDismiss?.();
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            e.stopPropagation();
            onDismiss?.();
          }
        }}
        className="absolute top-2 right-2 p-1 rounded-full transition-colors z-20"
        style={{
          backgroundColor: "rgba(var(--module-theme-rgb, 253,146,11), 0.15)",
          color: themeInk,
        }}
      >
        <X className="w-3 h-3 pointer-events-none" />
      </span>

      <div className="flex items-center gap-3 relative z-10 w-full pr-6">
        <PackingAnimation />

        <div className="flex-1 min-w-0">
          <p className="text-gray-900 font-bold text-sm truncate tracking-tight">{sellerName}</p>
          <div className="flex items-center gap-1 mt-0.5">
            <p className="text-gray-500 font-medium text-xs truncate">{statusText}</p>
            <ChevronRight className="w-3 h-3 shrink-0 group-hover:translate-x-0.5 transition-transform" style={{ color: themeInk }} />
          </div>
        </div>

        <div
          className="rounded-xl px-3 py-1.5 shrink-0 flex flex-col items-center justify-center border"
          style={{
            background: "linear-gradient(135deg, var(--module-theme-color, #FD920B), rgba(var(--module-theme-rgb, 253,146,11), 0.84))",
            boxShadow: "0 6px 14px rgba(var(--module-theme-rgb, 253,146,11), 0.22)",
            borderColor: "rgba(var(--module-theme-rgb, 253,146,11), 0.3)",
          }}
        >
          <p className="text-wh-text text-[9px] font-bold uppercase tracking-wider opacity-95 leading-tight">
            ETA
          </p>
          <p className="text-wh-text text-sm font-black leading-tight">
            {timeRemaining !== null ? `${Math.max(1, timeRemaining)}m` : "--"}
          </p>
        </div>
      </div>
    </motion.button>
  );
}

const OrderTrackingRow = memo(OrderTrackingRowInner);
export default OrderTrackingRow;
