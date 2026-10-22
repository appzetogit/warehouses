import { useCallback, useEffect, useRef, useState } from "react"
import { IndianRupee, Loader2, Wallet } from "lucide-react"
import { adminAPI } from "@store/api"
import { toast } from "sonner"
const debugLog = (...args) => {}
const debugWarn = (...args) => {}
const debugError = (...args) => {}


export default function DeliveryCashLimit() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [savingWithdrawal, setSavingWithdrawal] = useState(false)
  const [deliveryCashLimit, setDeliveryCashLimit] = useState("")
  const [deliveryWithdrawalLimit, setDeliveryWithdrawalLimit] = useState("")
  const [withdrawalMaxPercent, setWithdrawalMaxPercent] = useState("")
  const [savingMaxPercent, setSavingMaxPercent] = useState(false)
  const isMountedRef = useRef(true)

  const fetchLimit = useCallback(async ({ silent = false } = {}) => {
    try {
      if (!silent) {
        setLoading(true)
      }
      const response = await adminAPI.getDeliveryCashLimit()
      const data = response?.data?.data || response?.data || {}
      const limit = data.deliveryCashLimit
      const wl = data.deliveryWithdrawalLimit ?? 100
      if (!isMountedRef.current) return
      setDeliveryCashLimit(limit !== undefined && limit !== null ? String(limit) : "")
      setDeliveryWithdrawalLimit(wl !== undefined && wl !== null ? String(wl) : "100")
      setWithdrawalMaxPercent(String(data.deliveryWithdrawalMaxPercent ?? 10))
    } catch (error) {
      debugError("Error fetching delivery cash limit:", error)
      if (!isMountedRef.current) return
      if (!silent) {
        toast.error(error.response?.data?.message || "Failed to load delivery cash limit")
      }
      setDeliveryCashLimit("")
      setDeliveryWithdrawalLimit("100")
      setWithdrawalMaxPercent("10")
    } finally {
      if (!silent && isMountedRef.current) {
        setLoading(false)
      }
    }
  }, [])

  const saveLimit = async () => {
    const value = Number(deliveryCashLimit)
    if (!Number.isFinite(value) || value < 0) {
      toast.error("Cash limit must be a number (>= 0)")
      return
    }
    const withdrawalValue = Number(deliveryWithdrawalLimit)
    if (!Number.isFinite(withdrawalValue) || withdrawalValue < 0) {
      toast.error("Withdrawal limit must be a number (>= 0)")
      return
    }

    try {
      setSaving(true)
      // Send both fields to avoid unintentionally overwriting the other value
      const response = await adminAPI.updateDeliveryCashLimit({
        deliveryCashLimit: value,
        deliveryWithdrawalLimit: withdrawalValue,
      })
      const saved =
        response?.data?.data?.deliveryCashLimit ??
        response?.data?.deliveryCashLimit ??
        value
      setDeliveryCashLimit(String(saved))
      toast.success("Delivery cash limit updated successfully")
      await fetchLimit({ silent: true })
    } catch (error) {
      debugError("Error saving delivery cash limit:", error)
      toast.error(error.response?.data?.message || "Failed to update delivery cash limit")
    } finally {
      setSaving(false)
    }
  }

  const saveWithdrawalLimit = async () => {
    const value = Number(deliveryWithdrawalLimit)
    if (!Number.isFinite(value) || value < 0) {
      toast.error("Withdrawal limit must be a number (>= 0)")
      return
    }
    const cashValue = Number(deliveryCashLimit)
    if (!Number.isFinite(cashValue) || cashValue < 0) {
      toast.error("Cash limit must be a number (>= 0)")
      return
    }

    try {
      setSavingWithdrawal(true)
      // Send both fields to avoid unintentionally overwriting the other value
      const response = await adminAPI.updateDeliveryCashLimit({
        deliveryCashLimit: cashValue,
        deliveryWithdrawalLimit: value,
      })
      const saved =
        response?.data?.data?.deliveryWithdrawalLimit ??
        response?.data?.deliveryWithdrawalLimit ??
        value
      setDeliveryWithdrawalLimit(String(saved))
      toast.success("Withdrawal limit updated successfully")
      await fetchLimit({ silent: true })
    } catch (error) {
      debugError("Error saving withdrawal limit:", error)
      toast.error(error.response?.data?.message || "Failed to update withdrawal limit")
    } finally {
      setSavingWithdrawal(false)
    }
  }

  const saveMaxPercent = async () => {
    const value = Number(withdrawalMaxPercent)
    if (withdrawalMaxPercent === "" || !Number.isFinite(value) || value < 1 || value > 100) {
      toast.error("Max withdrawal per request must be between 1 and 100%")
      return
    }

    try {
      setSavingMaxPercent(true)
      // Only this field: the server leaves the other limits as they are.
      const response = await adminAPI.updateDeliveryCashLimit({ deliveryWithdrawalMaxPercent: value })
      const saved =
        response?.data?.data?.deliveryWithdrawalMaxPercent ??
        response?.data?.deliveryWithdrawalMaxPercent ??
        value
      setWithdrawalMaxPercent(String(saved))
      toast.success("Max withdrawal per request updated successfully")
      await fetchLimit({ silent: true })
    } catch (error) {
      debugError("Error saving max withdrawal percent:", error)
      toast.error(error.response?.data?.message || "Failed to update max withdrawal per request")
    } finally {
      setSavingMaxPercent(false)
    }
  }

  useEffect(() => {
    isMountedRef.current = true
    fetchLimit()

    return () => {
      isMountedRef.current = false
    }
  }, [fetchLimit])

  return (
    <div className="p-4 lg:p-6 bg-slate-50 min-h-screen">
      <div className="max-w-5xl mx-auto">
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
          <div className="flex items-center gap-3 mb-2">
            <IndianRupee className="w-5 h-5 text-slate-700" />
            <h1 className="text-2xl font-bold text-slate-900">Delivery Cash Limit</h1>
          </div>

          <p className="text-sm text-slate-600 mb-6">
            Set a <strong>global COD cash limit</strong> and <strong>minimum withdrawal amount</strong> for all delivery
            partners. Cash limit is used for Available cash limit in the delivery app; withdrawal is allowed only when
            withdrawable amount is above the withdrawal limit.
          </p>

          <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-lg mb-6">
            <div className="flex items-start gap-3">
              <IndianRupee className="w-5 h-5 text-emerald-700 mt-0.5" />
              <div className="flex-1">
                <div className="font-semibold text-emerald-900 mb-1">
                  Delivery Boy Available Cash Limit (Global)
                </div>
                <div className="text-sm text-emerald-800/80 mb-3">
                  When COD cash is collected, delivery partner&apos;s remaining limit will decrease automatically.
                </div>

                <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
                  <div className="flex-1">
                    <input
                      type="number"
                      min="0"
                      step="1"
                      value={deliveryCashLimit}
                      onChange={(e) => setDeliveryCashLimit(e.target.value)}
                      className="w-full px-4 py-2.5 border rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm border-emerald-200"
                      placeholder={loading ? "Loading..." : "e.g., 2000"}
                      disabled={loading || saving}
                    />
                    {loading && (
                      <p className="text-xs text-emerald-700/80 mt-1 flex items-center gap-2">
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        Loading current limit…
                      </p>
                    )}
                  </div>
                  <button
                    onClick={saveLimit}
                    disabled={loading || saving}
                    className="px-4 py-2.5 text-sm font-medium rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 transition-all shadow-md disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                    Save
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg">
            <div className="flex items-start gap-3">
              <Wallet className="w-5 h-5 text-amber-700 mt-0.5" />
              <div className="flex-1">
                <div className="font-semibold text-amber-900 mb-1">
                  Minimum Withdrawal Amount (Global)
                </div>
                <div className="text-sm text-amber-800/80 mb-3">
                  Delivery boy can withdraw only when withdrawable amount is <strong>above</strong> this value. Utni
                  amount ke upar rahega tabhi withdrawal hoga.
                </div>

                <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
                  <div className="flex-1">
                    <input
                      type="number"
                      min="0"
                      step="1"
                      value={deliveryWithdrawalLimit}
                      onChange={(e) => setDeliveryWithdrawalLimit(e.target.value)}
                      className="w-full px-4 py-2.5 border rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-amber-500 text-sm border-amber-200"
                      placeholder={loading ? "Loading..." : "e.g., 100"}
                      disabled={loading || savingWithdrawal}
                    />
                    {loading && (
                      <p className="text-xs text-amber-700/80 mt-1 flex items-center gap-2">
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        Loading…
                      </p>
                    )}
                  </div>
                  <button
                    onClick={saveWithdrawalLimit}
                    disabled={loading || savingWithdrawal}
                    className="px-4 py-2.5 text-sm font-medium rounded-lg bg-amber-600 text-white hover:bg-amber-700 transition-all shadow-md disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    {savingWithdrawal && <Loader2 className="w-4 h-4 animate-spin" />}
                    Save
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div className="p-4 bg-sky-50 border border-sky-200 rounded-lg mt-6">
            <div className="flex items-start gap-3">
              <Wallet className="w-5 h-5 text-sky-700 mt-0.5" />
              <div className="flex-1">
                <label htmlFor="delivery-withdrawal-max-percent" className="block font-semibold text-sky-900 mb-1">
                  Max withdrawal per request (% of wallet)
                </label>
                <div className="text-sm text-sky-800/80 mb-3">
                  A delivery partner can take at most this share of their current wallet balance in one withdrawal
                  request (1–100%). For example, 10% of a ₹571 balance allows up to ₹57.10.
                </div>

                <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
                  <div className="flex-1">
                    <input
                      id="delivery-withdrawal-max-percent"
                      type="number"
                      min="1"
                      max="100"
                      step="1"
                      value={withdrawalMaxPercent}
                      onChange={(e) => setWithdrawalMaxPercent(e.target.value)}
                      className="w-full px-4 py-2.5 border rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-sky-500 text-sm border-sky-200"
                      placeholder={loading ? "Loading..." : "e.g., 10"}
                      disabled={loading || savingMaxPercent}
                    />
                  </div>
                  <button
                    onClick={saveMaxPercent}
                    disabled={loading || savingMaxPercent}
                    className="px-4 py-2.5 text-sm font-medium rounded-lg bg-sky-600 text-white hover:bg-sky-700 transition-all shadow-md disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    {savingMaxPercent && <Loader2 className="w-4 h-4 animate-spin" />}
                    Save
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}


