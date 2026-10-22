import { useEffect, useState } from "react"
import { Link } from "react-router-dom"
import { toast } from "sonner"
import { Download, ImagePlus } from "lucide-react"
import { adminAIAPI } from "@store/api"

const errorMessage = (e, fallback) => e?.response?.data?.message || e?.message || fallback
const inr = (v) => `₹${Number(v || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`

/** 'YYYY-MM' of today in India time, the month AI charges are counted in. */
const istMonth = () => new Date(Date.now() + 330 * 60 * 1000).toISOString().slice(0, 7)

/** AI image usage per store for one month: what each store made and what goes on its bill. */
export default function AiStoreUsage() {
  const [month, setMonth] = useState(istMonth)
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    adminAIAPI.getStoreUsage({ month })
      .then((res) => { if (!cancelled) setData(res?.data?.data || null) })
      .catch((e) => { if (!cancelled) toast.error(errorMessage(e, "Failed to load AI usage by store")) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [month])

  const exportCsv = async () => {
    try {
      const res = await adminAIAPI.exportStoreUsage({ month })
      const blob = new Blob([res.data], { type: "text/csv;charset=utf-8" })
      const url = URL.createObjectURL(blob)
      const link = document.createElement("a")
      link.href = url
      link.download = `ai-store-usage-${month}.csv`
      link.click()
      URL.revokeObjectURL(url)
    } catch (_error) {
      toast.error("Export failed")
    }
  }

  const stores = data?.stores || []

  return (
    <div className="p-4 md:p-6">
      <div className="flex flex-wrap items-end justify-between gap-3 mb-4">
        <div>
          <div className="flex items-center gap-2">
            <ImagePlus className="w-5 h-5 text-indigo-600" />
            <h1 className="text-xl font-bold text-slate-900">AI images by store</h1>
          </div>
          <p className="text-sm text-slate-500 mt-1">
            Images each store made and the extra amount added to its monthly subscription invoice. Prices and allowances are set in{" "}
            <Link to="/admin/ai/settings" className="text-indigo-600 hover:underline">AI Settings</Link>.
          </p>
        </div>
        <div className="flex items-end gap-2">
          <label className="text-xs text-slate-600">Month
            <input type="month" value={month} onChange={(e) => e.target.value && setMonth(e.target.value)} className="block mt-1 rounded-lg border border-slate-300 px-2 py-1 text-sm" />
          </label>
          <button onClick={exportCsv} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-50">
            <Download className="w-4 h-4" /> CSV
          </button>
        </div>
      </div>

      {data && (
        <div className="grid grid-cols-3 gap-3 mb-4 max-w-2xl">
          <div className="bg-white border border-slate-200 rounded-xl p-4"><div className="text-xs text-slate-500">Images made</div><div className="text-xl font-bold mt-1">{data.totals.images}</div></div>
          <div className="bg-white border border-slate-200 rounded-xl p-4"><div className="text-xs text-slate-500">Extra images</div><div className="text-xl font-bold mt-1">{data.totals.extraImages}</div></div>
          <div className="bg-white border border-slate-200 rounded-xl p-4"><div className="text-xs text-slate-500">To bill</div><div className="text-xl font-bold mt-1">{inr(data.totals.amount)}</div></div>
        </div>
      )}

      <div className="bg-white border border-slate-200 rounded-xl overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-xs text-slate-500">
            <tr>
              <th className="text-left px-3 py-2">Store</th>
              <th className="text-left px-3 py-2">Plan</th>
              <th className="text-right px-3 py-2">Images</th>
              <th className="text-right px-3 py-2">Included</th>
              <th className="text-right px-3 py-2">Extra</th>
              <th className="text-right px-3 py-2">Amount</th>
              <th className="text-right px-3 py-2">On invoice</th>
              <th className="text-left px-3 py-2">AI images</th>
            </tr>
          </thead>
          <tbody>
            {loading && !data && <tr><td colSpan={8} className="px-3 py-6 text-center text-slate-500">Loading…</td></tr>}
            {data && stores.length === 0 && <tr><td colSpan={8} className="px-3 py-6 text-center text-slate-500">No AI images in {data.month}.</td></tr>}
            {stores.map((r) => (
              <tr key={r.sellerId} className="border-t border-slate-100">
                <td className="px-3 py-2">
                  <div className="font-semibold text-slate-800">{r.sellerName || r.sellerId}</div>
                  <div className="text-xs text-slate-500">{r.ownerName} {r.ownerPhone}</div>
                </td>
                <td className="px-3 py-2 capitalize">{r.plan}</td>
                <td className="px-3 py-2 text-right">{r.images}{r.pendingImages ? <span className="text-xs text-slate-400"> (+{r.pendingImages} running)</span> : null}</td>
                <td className="px-3 py-2 text-right">{r.includedImages}</td>
                <td className="px-3 py-2 text-right">{r.extraImages}</td>
                <td className="px-3 py-2 text-right font-semibold">{inr(r.amount)}</td>
                <td className="px-3 py-2 text-right">{inr(r.billedAmount)}</td>
                <td className="px-3 py-2">{r.imagesEnabled ? <span className="text-green-700">On</span> : <span className="text-slate-500">Off</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
