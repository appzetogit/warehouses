import { useEffect, useState } from "react"
import { Link } from "react-router-dom"
import { toast } from "sonner"
import { Loader2, Sparkles } from "lucide-react"
import { adminAIAPI } from "@store/api"

const errorMessage = (e, fallback) => e?.response?.data?.message || e?.message || fallback
const inr = (v) => `₹${Number(v || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`

/**
 * Admin seller detail: the store's AI switches (images billed monthly, AI Help
 * chat free), an optional monthly image cap, and this month's image usage.
 * Both are off until switched on here.
 */
export default function SellerAiAccessCard({ sellerId }) {
  const [data, setData] = useState(null)
  const [cap, setCap] = useState("")
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!sellerId) return undefined
    let cancelled = false
    adminAIAPI.getStoreAccess(sellerId)
      .then((res) => {
        if (cancelled) return
        const d = res?.data?.data || null
        setData(d)
        setCap(d?.aiAccess?.monthlyImageCap ?? "")
      })
      .catch((e) => { if (!cancelled) toast.error(errorMessage(e, "Could not load the store's AI settings")) })
    return () => { cancelled = true }
  }, [sellerId])

  const save = async (patch) => {
    setSaving(true)
    try {
      const res = await adminAIAPI.updateStoreAccess(sellerId, patch)
      const d = res?.data?.data || null
      setData(d)
      setCap(d?.aiAccess?.monthlyImageCap ?? "")
      toast.success("AI settings for this store saved")
    } catch (e) {
      toast.error(errorMessage(e, "Could not save"))
    } finally {
      setSaving(false)
    }
  }

  if (!data) {
    return <div className="text-xs text-slate-500 flex items-center gap-2"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading AI settings…</div>
  }

  const access = data.aiAccess || {}
  const u = data.usage || {}
  const capChanged = String(cap ?? "") !== String(access.monthlyImageCap ?? "")

  return (
    <div className="rounded-2xl border border-slate-200 p-4 space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2"><Sparkles className="w-4 h-4 text-violet-600" /> AI</h3>
        <Link to="/admin/ai/store-usage" className="text-xs font-semibold text-indigo-600 hover:underline">Usage by store</Link>
      </div>

      <label className="flex items-center justify-between gap-4">
        <span>
          <span className="block text-sm font-semibold text-slate-800">AI images</span>
          <span className="block text-xs text-slate-500">Enhance and Mannequin shots on the item page. Charged at {inr(u.extraImagePrice)} per image beyond the plan&apos;s included images, on the monthly subscription invoice.</span>
        </span>
        <input type="checkbox" className="h-5 w-5" disabled={saving} checked={Boolean(access.imagesEnabled)} onChange={(e) => save({ imagesEnabled: e.target.checked })} />
      </label>

      <label className="flex items-center justify-between gap-4">
        <span>
          <span className="block text-sm font-semibold text-slate-800">AI Help chat</span>
          <span className="block text-xs text-slate-500">The seller panel&apos;s how-to assistant. Free.</span>
        </span>
        <input type="checkbox" className="h-5 w-5" disabled={saving} checked={Boolean(access.chatEnabled)} onChange={(e) => save({ chatEnabled: e.target.checked })} />
      </label>

      <div>
        <label className="block text-sm font-semibold text-slate-800 mb-1" htmlFor={`ai-cap-${sellerId}`}>Monthly image cap for this store</label>
        <div className="flex gap-2">
          <input
            id={`ai-cap-${sellerId}`}
            type="number"
            min={0}
            step={1}
            value={cap}
            placeholder="Platform default"
            onChange={(e) => setCap(e.target.value)}
            className="w-40 rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
          />
          <button
            type="button"
            disabled={saving || !capChanged}
            onClick={() => save({ monthlyImageCap: cap === "" ? null : Number(cap) })}
            className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
          >
            Save cap
          </button>
        </div>
        <p className="text-xs text-slate-500 mt-1">Empty uses the platform cap from AI Settings. 0 = no cap.</p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
        <div className="rounded-lg bg-slate-50 p-2.5"><div className="text-slate-500">Images this month</div><div className="font-bold text-slate-900">{u.usedThisMonth || 0}{u.monthlyCap ? ` / ${u.monthlyCap}` : ""}</div></div>
        <div className="rounded-lg bg-slate-50 p-2.5"><div className="text-slate-500">Included ({u.plan || "starter"})</div><div className="font-bold text-slate-900">{u.includedUsed || 0} / {u.includedThisMonth || 0}</div></div>
        <div className="rounded-lg bg-slate-50 p-2.5"><div className="text-slate-500">Extra images</div><div className="font-bold text-slate-900">{u.extraImagesThisMonth || 0}</div></div>
        <div className="rounded-lg bg-slate-50 p-2.5"><div className="text-slate-500">Extra cost</div><div className="font-bold text-slate-900">{inr(u.extraCostThisMonth)}</div></div>
      </div>
    </div>
  )
}
