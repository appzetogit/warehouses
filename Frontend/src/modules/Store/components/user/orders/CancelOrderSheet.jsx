import { useState } from "react"
import { Loader2, X } from "lucide-react"
import { toast } from "sonner"
import { orderAPI } from "@/services/api"

export const CANCEL_REASONS = [
  "Ordered by mistake",
  "Want to change size or colour",
  "Want to change the address",
  "Found a better price elsewhere",
  "Delivery is taking too long",
  "No longer need it",
  "Other",
]

// Until the order leaves the store: before the rider picks it up (Quick) or
// before it's handed to the courier (Shop). Mirrors the server's rule.
const CANCELLABLE = ["pending_payment", "created", "confirmed", "preparing", "ready_for_pickup", "reached_pickup"]

export function canCancelOrder(order) {
  const status = String(order?.orderStatus || order?.originalStatus || order?.status || "")
  return CANCELLABLE.includes(status) && !order?.shipment?.awb
}

/**
 * Asks why, then cancels. The reason is required and kept on the order; a
 * paid order is refunded by the server.
 */
export default function CancelOrderSheet({ order, onClose, onCancelled }) {
  const [reason, setReason] = useState("")
  const [other, setOther] = useState("")
  const [busy, setBusy] = useState(false)
  const paid = order?.payment?.method && order.payment.method !== "cash" && ["paid", "authorized"].includes(order?.payment?.status)
  const text = reason === "Other" ? other.trim() : reason

  const submit = async () => {
    if (!text) return toast.error(reason === "Other" ? "Tell us a little more" : "Pick a reason")
    setBusy(true)
    try {
      const res = await orderAPI.cancelOrder(String(order._id || order.id), { reason: text })
      toast.success(paid ? "Order cancelled. Your refund is on its way." : "Order cancelled")
      onCancelled?.(res?.data?.data?.order || { orderStatus: "cancelled_by_user", cancellationReason: text })
    } catch (err) {
      toast.error(err?.response?.data?.message || "Couldn't cancel this order")
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[90] flex items-end justify-center bg-black/40 sm:items-center" role="dialog" aria-modal="true" aria-label="Cancel order">
      <div className="w-full space-y-4 rounded-t-2xl bg-white p-4 pb-[max(16px,env(safe-area-inset-bottom))] dark:bg-zinc-900 sm:max-w-md sm:rounded-2xl">
        <div className="flex items-center justify-between">
          <h3 className="text-[17px] font-bold text-gray-900 dark:text-white">Cancel this order?</h3>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-full p-1 hover:bg-gray-100">
            <X className="h-5 w-5 text-gray-500" />
          </button>
        </div>
        <div>
          <p className="mb-2 text-[13px] font-semibold text-gray-700 dark:text-gray-200">Why are you cancelling?</p>
          <div className="flex flex-wrap gap-2">
            {CANCEL_REASONS.map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setReason(r)}
                aria-pressed={reason === r}
                className={`rounded-full border px-3 py-1.5 text-[12px] font-semibold ${
                  reason === r ? "border-[#EA580C] bg-[#FFF1E7] text-[#C2410C]" : "border-gray-200 text-gray-700 dark:border-zinc-700 dark:text-gray-200"
                }`}
              >
                {r}
              </button>
            ))}
          </div>
          {reason === "Other" ? (
            <textarea
              autoFocus
              rows={2}
              maxLength={300}
              value={other}
              onChange={(e) => setOther(e.target.value)}
              placeholder="Tell us a little more"
              className="mt-2 w-full rounded-lg border border-gray-200 px-3 py-2 text-[13px] dark:border-zinc-700 dark:bg-zinc-800"
            />
          ) : null}
        </div>
        <p className="text-[12px] text-gray-500">
          {paid ? "You'll get a full refund to your original payment method." : "Nothing has been charged, so there's nothing to refund."}
          {reason === "Want to change size or colour" ? " After cancelling, you can order the right size again." : ""}
        </p>
        <div className="flex gap-2">
          <button type="button" onClick={onClose} className="h-11 flex-1 rounded-xl border border-gray-300 text-[14px] font-bold text-gray-800 dark:text-gray-100">
            Keep Order
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={busy || !text}
            className="flex h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-[#CC0C39] text-[14px] font-bold text-white disabled:opacity-50"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Cancel Order
          </button>
        </div>
      </div>
    </div>
  )
}
