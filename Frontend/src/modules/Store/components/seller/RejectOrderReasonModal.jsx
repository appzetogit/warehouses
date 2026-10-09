import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { AlertCircle, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { sellerAPI } from "@store/api";
import {
  SHOP_REJECT_NOTE_MAX,
  SHOP_REJECT_REASONS,
} from "@store/utils/shopOrder";

/**
 * Reject an order with one of the structured reasons. The server refunds
 * online payments and restores stock; the customer is told the reason.
 * `order` needs an id (orderMongoId / mongoId / _id / orderId).
 */
export default function RejectOrderReasonModal({ order, onClose, onRejected }) {
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    setReason("");
    setNote("");
    setSubmitting(false);
  }, [order]);

  const orderId =
    order?.orderMongoId || order?.mongoId || order?._id || order?.orderId;
  const displayId = order?.orderId || order?.order_id || "";
  const noteRequired = reason === "other";
  const canSubmit =
    Boolean(reason) && (!noteRequired || note.trim().length > 0) && !submitting;

  const close = () => {
    if (!submitting) onClose?.();
  };

  const submit = async () => {
    if (!canSubmit || !orderId) return;
    setSubmitting(true);
    try {
      await sellerAPI.rejectOrderWithReason(orderId, { reason, note });
      toast.success(`Order ${displayId ? `#${displayId} ` : ""}rejected`);
      await onRejected?.(order);
    } catch (error) {
      toast.error(error.response?.data?.message || "Failed to reject order");
      setSubmitting(false);
    }
  };

  return (
    <AnimatePresence>
      {order && (
        <motion.div
          className="fixed inset-0 z-[10001] bg-black/60 flex items-center justify-center p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={close}>
          <motion.div
            className="w-[95%] max-w-md bg-white rounded-2xl shadow-2xl overflow-hidden"
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            onClick={(e) => e.stopPropagation()}>
            <div className="px-4 py-4 border-b border-gray-200">
              <h3 className="text-lg font-bold text-gray-900">
                Reject order {displayId ? `#${displayId}` : ""}
              </h3>
              <p className="text-sm text-gray-500 mt-1">
                Why can't you fulfil this order?
              </p>
            </div>

            <div className="px-4 py-4 space-y-2 max-h-[60vh] overflow-y-auto">
              {SHOP_REJECT_REASONS.map((r) => (
                <label
                  key={r.value}
                  className={`flex items-center gap-3 px-4 py-3 rounded-lg border-2 cursor-pointer transition-colors ${reason === r.value
                    ? "border-red-500 bg-red-50"
                    : "border-gray-200 hover:border-gray-300"
                    }`}>
                  <input
                    type="radio"
                    name="reject-reason"
                    value={r.value}
                    checked={reason === r.value}
                    onChange={() => setReason(r.value)}
                    disabled={submitting}
                    className="w-4 h-4 accent-red-600"
                  />
                  <span
                    className={`text-sm font-medium ${reason === r.value ? "text-red-700" : "text-gray-700"}`}>
                    {r.label}
                  </span>
                </label>
              ))}

              <div className="pt-2">
                <textarea
                  value={note}
                  onChange={(e) =>
                    setNote(e.target.value.slice(0, SHOP_REJECT_NOTE_MAX))
                  }
                  maxLength={SHOP_REJECT_NOTE_MAX}
                  rows={3}
                  disabled={submitting}
                  placeholder={
                    noteRequired
                      ? "Tell the customer what went wrong (required)"
                      : "Add a note for the customer (optional)"
                  }
                  className="w-full rounded-lg border-2 border-gray-200 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:border-gray-400 resize-none"
                />
                <div className="flex justify-between text-[11px] text-gray-400 mt-1">
                  <span>
                    {noteRequired && !note.trim() ? "A note is required for Other" : ""}
                  </span>
                  <span>
                    {note.length}/{SHOP_REJECT_NOTE_MAX}
                  </span>
                </div>
              </div>

              <div className="flex items-start gap-2 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2.5">
                <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <p className="text-xs font-medium text-amber-800">
                  The customer will be refunded in full and told why
                </p>
              </div>
            </div>

            <div className="px-4 py-4 bg-gray-50 border-t border-gray-200 flex gap-3">
              <button
                type="button"
                onClick={close}
                disabled={submitting}
                className="flex-1 bg-white border-2 border-gray-300 text-gray-700 py-3 rounded-lg font-semibold text-sm hover:bg-gray-50 transition-colors disabled:opacity-50">
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void submit()}
                disabled={!canSubmit}
                className={`flex-1 py-3 rounded-lg font-semibold text-sm transition-colors flex items-center justify-center gap-2 ${canSubmit || submitting
                  ? "!bg-red-600 !text-white hover:bg-red-700"
                  : "bg-gray-200 text-gray-400 cursor-not-allowed"
                  } disabled:opacity-80`}>
                {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
                {submitting ? "Rejecting..." : "Reject order"}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
