import { useCallback, useEffect, useState } from "react"
import { Link } from "react-router-dom"
import { toast } from "sonner"
import { Hourglass, Loader2, RefreshCw } from "lucide-react"
import { adminAPI } from "@store/api"
import { useAdminBase } from "@store/components/admin/useAdminPanel"
import { formatCurrency, formatDateTime, errorMessage } from "../reports/reportShared"

const HOUR_OPTIONS = [12, 24, 48, 72]

const paymentLabel = (method) => {
  const m = String(method || "").toLowerCase()
  if (!m) return "—"
  if (m === "cash" || m === "cod") return "COD"
  return m.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
}

/** Shop orders (no acceptance deadline) that a store has not accepted or rejected yet. */
export default function AwaitingStoreOrders() {
  const base = useAdminBase()
  const [hours, setHours] = useState(24)
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(() => {
    setLoading(true)
    return adminAPI.getOrdersAwaitingStore({ hours })
      .then((res) => setRows(res?.data?.data?.orders || []))
      .catch((e) => { setRows([]); toast.error(errorMessage(e, "Failed to load orders waiting for a store")) })
      .finally(() => setLoading(false))
  }, [hours])

  useEffect(() => { load() }, [load])

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Hourglass className="w-5 h-5 text-amber-600" />
          <h1 className="text-xl font-semibold text-slate-900">Waiting for store</h1>
          <span className="text-sm text-slate-500">({rows.length})</span>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <label htmlFor="awaiting-hours" className="text-slate-500">Waiting more than</label>
          <select
            id="awaiting-hours"
            className="border border-slate-200 rounded-md px-2 py-2"
            value={hours}
            onChange={(e) => setHours(Number(e.target.value))}
          >
            {HOUR_OPTIONS.map((h) => <option key={h} value={h}>{h} hours</option>)}
          </select>
          <button type="button" onClick={() => load()} disabled={loading} className="p-2 rounded-md border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-50" title="Refresh">
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>
      <p className="text-sm text-slate-500">Shop orders the store has neither accepted nor rejected. They never auto-cancel, so chase the store or cancel from the order.</p>

      <div className="bg-white rounded-xl border border-slate-200 overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-slate-600 text-xs uppercase">
            <tr>{["Order", "Store", "Customer", "Total", "Payment", "Waiting for", "Reminders sent"].map((h) => <th key={h} className="px-3 py-2 text-left font-medium">{h}</th>)}</tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? (
              <tr><td colSpan={7} className="px-3 py-8 text-center"><Loader2 className="w-5 h-5 animate-spin inline" /></td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={7} className="px-3 py-8 text-center text-slate-500">No Shop orders are waiting on a store</td></tr>
            ) : rows.map((r) => {
              const reminders = [r.reminders?.firstAt, r.reminders?.secondAt].filter(Boolean)
              return (
                <tr key={r._id} className="hover:bg-slate-50">
                  <td className="px-3 py-2">
                    <Link className="font-medium text-blue-600 hover:underline" to={`${base}/orders/all?orderId=${encodeURIComponent(r._id)}`}>
                      #{r.order_id || r._id}
                    </Link>
                    <div className="text-xs text-slate-500">Since {formatDateTime(r.waitingSince)}</div>
                  </td>
                  <td className="px-3 py-2">{r.sellerName || "—"}</td>
                  <td className="px-3 py-2">
                    <div>{r.customerName || "—"}</div>
                    {r.customerPhone && <div className="text-xs text-slate-500">{r.customerPhone}</div>}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">{formatCurrency(r.total)}</td>
                  <td className="px-3 py-2">{paymentLabel(r.paymentMethod)}</td>
                  <td className="px-3 py-2 whitespace-nowrap font-semibold text-amber-700">{Math.floor(Number(r.hoursWaiting) || 0)}h</td>
                  <td className="px-3 py-2 text-xs">
                    {reminders.length === 0 ? (
                      <span className="text-slate-400">None</span>
                    ) : (
                      <>
                        <div className="font-medium">{reminders.length} sent</div>
                        <div className="text-slate-500">Last {formatDateTime(reminders[reminders.length - 1])}</div>
                      </>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
