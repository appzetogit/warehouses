import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { toast } from "sonner"
import { Image as ImageIcon, Loader2, Pencil, Plus, Tag, Trash2, Upload, X } from "lucide-react"
import { adminAPI } from "@store/api"
import { useAdminPanel } from "@store/components/admin/useAdminPanel"
import { resolveMediaUrl } from "../../../../shared/utils/mediaUrl.js"

/**
 * Offer banners on the customer storefront. Each banner shows on Quick, Shop
 * or both; one linked to a coupon copies the code when tapped, otherwise its
 * link opens. Lists the banners of the panel you're in, or all of them.
 */

const CHANNELS = [
  { id: "quick", label: "Quick" },
  { id: "shop", label: "Shop" },
]
const MAX_MB = 10
const toDateInput = (d) => (d ? new Date(d).toISOString().slice(0, 10) : "")
const fmtDate = (d) => (d ? new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "")
const message = (e, fallback) => e?.response?.data?.message || e?.message || fallback

function statusOf(b) {
  if (!b.isActive) return { label: "Off", cls: "bg-slate-100 text-slate-600" }
  const now = Date.now()
  if (b.startDate && new Date(b.startDate).getTime() > now) return { label: "Scheduled", cls: "bg-blue-50 text-blue-700" }
  // An end date covers that whole day.
  if (b.endDate && new Date(b.endDate).getTime() + 86400000 <= now) return { label: "Ended", cls: "bg-rose-50 text-rose-700" }
  return { label: "Live", cls: "bg-emerald-50 text-emerald-700" }
}

const emptyForm = (panel) => ({
  title: "",
  subtitle: "",
  couponCode: "",
  ctaLink: "",
  channels: [panel],
  startDate: "",
  endDate: "",
  sortOrder: "",
  isActive: true,
  file: null,
  preview: "",
})

export default function OfferBanners() {
  const { panel, label: panelLabel } = useAdminPanel()
  const [scope, setScope] = useState("panel") // panel | all
  const [banners, setBanners] = useState([])
  const [size, setSize] = useState({ width: 1200, height: 400 })
  const [coupons, setCoupons] = useState([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(null) // null | "new" | banner
  const [form, setForm] = useState(() => emptyForm(panel))
  const [saving, setSaving] = useState(false)
  const [busyId, setBusyId] = useState("")
  const fileInput = useRef(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await adminAPI.getOfferBanners(scope === "panel" ? { channel: panel } : {})
      const data = res?.data?.data || {}
      setBanners(data.banners || [])
      if (data.recommendedSize) setSize(data.recommendedSize)
    } catch (e) {
      toast.error(message(e, "Couldn't load the banners"))
    } finally {
      setLoading(false)
    }
  }, [panel, scope])

  useEffect(() => {
    load()
  }, [load])

  // Coupons to link a banner to: the platform's and sellers' live or paused codes.
  useEffect(() => {
    adminAPI
      .getAllOffers({})
      .then((res) => setCoupons((res?.data?.data?.offers || []).filter((o) => o?.couponCode && o.status !== "inactive")))
      .catch(() => setCoupons([]))
  }, [])

  const couponLabel = useMemo(() => {
    const map = new Map()
    for (const o of coupons) {
      const off = o.discountType === "percentage" ? `${o.discountValue}% off` : `₹${o.discountValue} off`
      map.set(o.couponCode, `${o.couponCode} · ${off}`)
    }
    return map
  }, [coupons])

  const openNew = () => {
    setForm(emptyForm(panel))
    setEditing("new")
  }

  const openEdit = (b) => {
    setForm({
      title: b.title,
      subtitle: b.subtitle,
      couponCode: b.couponCode,
      ctaLink: b.ctaLink,
      channels: b.channels,
      startDate: toDateInput(b.startDate),
      endDate: toDateInput(b.endDate),
      sortOrder: String(b.sortOrder ?? ""),
      isActive: b.isActive,
      file: null,
      preview: resolveMediaUrl(b.imageUrl),
    })
    setEditing(b)
  }

  const close = () => {
    if (form.preview?.startsWith("blob:")) URL.revokeObjectURL(form.preview)
    setEditing(null)
  }

  const pickFile = (file) => {
    if (!file) return
    if (!file.type.startsWith("image/")) return toast.error("Pick an image (JPG, PNG or WebP)")
    if (file.size > MAX_MB * 1024 * 1024) return toast.error(`The image must be under ${MAX_MB} MB`)
    if (form.preview?.startsWith("blob:")) URL.revokeObjectURL(form.preview)
    setForm((f) => ({ ...f, file, preview: URL.createObjectURL(file) }))
  }

  const toggleChannel = (id) =>
    setForm((f) => ({
      ...f,
      channels: f.channels.includes(id) ? f.channels.filter((c) => c !== id) : [...f.channels, id],
    }))

  const save = async (e) => {
    e.preventDefault()
    if (editing === "new" && !form.file) return toast.error("Add a banner image")
    if (!form.channels.length) return toast.error("Pick where it shows: Quick, Shop or both")
    if (form.startDate && form.endDate && form.endDate < form.startDate) return toast.error("The end date is before the start date")

    const body = new FormData()
    if (form.file) body.append("file", form.file)
    body.append("title", form.title.trim())
    body.append("subtitle", form.subtitle.trim())
    body.append("couponCode", form.couponCode)
    body.append("ctaLink", form.couponCode ? "" : form.ctaLink.trim())
    body.append("channels", form.channels.join(","))
    // Dates are whole days: from the start of the first to the end of the last.
    body.append("startDate", form.startDate ? new Date(`${form.startDate}T00:00:00`).toISOString() : "")
    body.append("endDate", form.endDate ? new Date(`${form.endDate}T23:59:59`).toISOString() : "")
    if (form.sortOrder !== "") body.append("sortOrder", form.sortOrder)
    body.append("isActive", String(form.isActive))

    setSaving(true)
    try {
      if (editing === "new") await adminAPI.createOfferBanner(body)
      else await adminAPI.updateOfferBanner(editing.id, body)
      toast.success(editing === "new" ? "Banner added" : "Banner saved")
      close()
      load()
    } catch (err) {
      toast.error(message(err, "Couldn't save the banner"))
    } finally {
      setSaving(false)
    }
  }

  const toggleActive = async (b) => {
    setBusyId(b.id)
    try {
      await adminAPI.updateOfferBanner(b.id, { isActive: !b.isActive })
      setBanners((list) => list.map((x) => (x.id === b.id ? { ...x, isActive: !b.isActive } : x)))
    } catch (e) {
      toast.error(message(e, "Couldn't update the banner"))
    } finally {
      setBusyId("")
    }
  }

  const remove = async (b) => {
    if (!window.confirm(`Delete the banner "${b.title || "Untitled"}"? This can't be undone.`)) return
    setBusyId(b.id)
    try {
      await adminAPI.deleteOfferBanner(b.id)
      setBanners((list) => list.filter((x) => x.id !== b.id))
      toast.success("Banner deleted")
    } catch (e) {
      toast.error(message(e, "Couldn't delete the banner"))
    } finally {
      setBusyId("")
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 p-4 lg:p-6">
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Offer Banners</h1>
            <p className="mt-0.5 text-sm text-slate-500">
              Banners for coupons and offers on the storefront. Choose whether each one shows on Quick, Shop or both.
            </p>
          </div>
          <button
            type="button"
            onClick={openNew}
            className="flex items-center justify-center gap-2 rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-slate-800"
          >
            <Plus className="h-4 w-4" /> Add Banner
          </button>
        </div>

        <div className="inline-flex rounded-xl border border-slate-200 bg-white p-1 text-sm" role="tablist">
          {[
            { id: "panel", label: `On ${panelLabel}` },
            { id: "all", label: "All Banners" },
          ].map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={scope === t.id}
              onClick={() => setScope(t.id)}
              className={`rounded-lg px-4 py-1.5 font-semibold ${scope === t.id ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100"}`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
          </div>
        ) : banners.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-12 text-center">
            <ImageIcon className="mx-auto h-10 w-10 text-slate-300" />
            <h3 className="mt-3 text-lg font-bold text-slate-900">No Banners Yet</h3>
            <p className="mx-auto mt-1 max-w-sm text-sm text-slate-500">
              {scope === "panel" ? `Nothing shows on ${panelLabel} yet.` : "No offer banners yet."} Add one to promote a coupon or a sale.
            </p>
            <button type="button" onClick={openNew} className="mt-4 text-sm font-bold text-slate-900 underline">
              Add a Banner
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
            {banners.map((b) => {
              const st = statusOf(b)
              return (
                <div key={b.id} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                  <div className="relative aspect-[3/1] bg-slate-100">
                    <img src={resolveMediaUrl(b.imageUrl)} alt={b.title || "Offer banner"} className="h-full w-full object-cover" loading="lazy" />
                    <span className={`absolute left-2 top-2 rounded-full px-2 py-0.5 text-[11px] font-bold ${st.cls}`}>{st.label}</span>
                  </div>
                  <div className="space-y-2 p-4">
                    <div>
                      <p className="truncate font-semibold text-slate-900">{b.title || "Untitled"}</p>
                      {b.subtitle ? <p className="truncate text-xs text-slate-500">{b.subtitle}</p> : null}
                    </div>
                    <div className="flex flex-wrap gap-1.5 text-[11px] font-semibold">
                      {b.channels.map((c) => (
                        <span key={c} className={`rounded-full border px-2 py-0.5 ${c === "quick" ? "border-amber-200 bg-amber-50 text-amber-800" : "border-indigo-200 bg-indigo-50 text-indigo-800"}`}>
                          {c === "quick" ? "Quick" : "Shop"}
                        </span>
                      ))}
                      {b.couponCode ? (
                        <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-emerald-800">
                          <Tag className="h-3 w-3" /> {b.couponCode}
                        </span>
                      ) : null}
                    </div>
                    <p className="text-xs text-slate-500">
                      {b.startDate || b.endDate
                        ? `${b.startDate ? fmtDate(b.startDate) : "Now"} – ${b.endDate ? fmtDate(b.endDate) : "No end date"}`
                        : "Always on"}
                      {!b.couponCode && b.ctaLink ? ` · Opens ${b.ctaLink}` : ""}
                    </p>
                    <div className="flex items-center justify-between border-t border-slate-100 pt-3">
                      <label className="flex cursor-pointer items-center gap-2 text-xs font-semibold text-slate-700">
                        <input type="checkbox" checked={b.isActive} disabled={busyId === b.id} onChange={() => toggleActive(b)} className="h-4 w-4 accent-slate-900" />
                        Active
                      </label>
                      <div className="flex gap-1">
                        <button type="button" onClick={() => openEdit(b)} className="rounded-lg p-2 text-slate-600 hover:bg-slate-100" aria-label={`Edit ${b.title || "banner"}`}>
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button type="button" onClick={() => remove(b)} disabled={busyId === b.id} className="rounded-lg p-2 text-rose-600 hover:bg-rose-50" aria-label={`Delete ${b.title || "banner"}`}>
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {editing ? (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4" role="dialog" aria-modal="true" aria-label={editing === "new" ? "Add banner" : "Edit banner"}>
          <form onSubmit={save} className="my-8 w-full max-w-lg space-y-4 rounded-2xl bg-white p-5 shadow-xl">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-900">{editing === "new" ? "Add Banner" : "Edit Banner"}</h2>
              <button type="button" onClick={close} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100" aria-label="Close">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div>
              <p className="mb-1 text-sm font-semibold text-slate-800">Banner Image{editing === "new" ? "*" : ""}</p>
              <button
                type="button"
                onClick={() => fileInput.current?.click()}
                className="relative flex aspect-[3/1] w-full items-center justify-center overflow-hidden rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 hover:border-slate-400"
              >
                {form.preview ? (
                  <img src={form.preview} alt="" className="h-full w-full object-cover" />
                ) : (
                  <span className="flex flex-col items-center gap-1 text-sm text-slate-500">
                    <Upload className="h-6 w-6" /> Upload Image
                  </span>
                )}
              </button>
              <input ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => pickFile(e.target.files?.[0])} />
              <p className="mt-1 text-[11px] text-slate-500">
                Best at {size.width} × {size.height} px (3:1). JPG, PNG or WebP, under {MAX_MB} MB.
              </p>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="text-sm font-semibold text-slate-800">
                Title
                <input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} maxLength={60} placeholder="Festive Sale" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal" />
              </label>
              <label className="text-sm font-semibold text-slate-800">
                Subtitle
                <input value={form.subtitle} onChange={(e) => setForm((f) => ({ ...f, subtitle: e.target.value }))} maxLength={80} placeholder="Flat 20% off on kurtas" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal" />
              </label>
            </div>

            <label className="block text-sm font-semibold text-slate-800">
              Coupon
              <select value={form.couponCode} onChange={(e) => setForm((f) => ({ ...f, couponCode: e.target.value }))} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-normal">
                <option value="">No coupon (open a link instead)</option>
                {coupons.map((o) => (
                  <option key={o._id || o.couponCode} value={o.couponCode}>
                    {couponLabel.get(o.couponCode)}
                    {o.status === "paused" ? " (paused)" : ""}
                  </option>
                ))}
                {form.couponCode && !couponLabel.has(form.couponCode) ? <option value={form.couponCode}>{form.couponCode}</option> : null}
              </select>
              <span className="mt-1 block text-[11px] font-normal text-slate-500">Tapping the banner copies this code so the customer can apply it in the cart.</span>
            </label>

            {!form.couponCode ? (
              <label className="block text-sm font-semibold text-slate-800">
                Link
                <input value={form.ctaLink} onChange={(e) => setForm((f) => ({ ...f, ctaLink: e.target.value }))} placeholder="/offers or /category/kurtas" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal" />
                <span className="mt-1 block text-[11px] font-normal text-slate-500">Optional. A page in the store (starting with /) or a full web address.</span>
              </label>
            ) : null}

            <fieldset>
              <legend className="text-sm font-semibold text-slate-800">Show On*</legend>
              <div className="mt-1 flex gap-2">
                {CHANNELS.map((c) => {
                  const on = form.channels.includes(c.id)
                  return (
                    <label key={c.id} className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold ${on ? "border-slate-900 bg-slate-900 text-white" : "border-slate-300 text-slate-700"}`}>
                      <input type="checkbox" checked={on} onChange={() => toggleChannel(c.id)} className="sr-only" />
                      {c.label}
                    </label>
                  )
                })}
              </div>
            </fieldset>

            <div className="grid grid-cols-2 gap-3">
              <label className="text-sm font-semibold text-slate-800">
                Starts
                <input type="date" value={form.startDate} onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value }))} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal" />
              </label>
              <label className="text-sm font-semibold text-slate-800">
                Ends
                <input type="date" value={form.endDate} min={form.startDate || undefined} onChange={(e) => setForm((f) => ({ ...f, endDate: e.target.value }))} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal" />
              </label>
            </div>
            <p className="-mt-2 text-[11px] text-slate-500">Leave the dates empty to show it until you switch it off.</p>

            <div className="flex items-end justify-between gap-3">
              <label className="text-sm font-semibold text-slate-800">
                Order
                <input type="number" min="0" value={form.sortOrder} onChange={(e) => setForm((f) => ({ ...f, sortOrder: e.target.value }))} placeholder="Last" className="mt-1 w-24 rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal" />
              </label>
              <label className="flex items-center gap-2 pb-2 text-sm font-semibold text-slate-800">
                <input type="checkbox" checked={form.isActive} onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.checked }))} className="h-4 w-4 accent-slate-900" />
                Active
              </label>
            </div>

            <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
              <button type="button" onClick={close} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700">
                Cancel
              </button>
              <button type="submit" disabled={saving} className="flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {editing === "new" ? "Add Banner" : "Save"}
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  )
}
