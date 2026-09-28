import { useCallback, useEffect, useMemo, useState } from "react"
import { Link } from "react-router-dom"
import { Check, ImagePlus, Loader2, Minus, PackageX, Plus, RefreshCw, Wallet, X } from "lucide-react"
import { toast } from "sonner"
import { userAPI, uploadAPI } from "@store/api"

const REASONS = [
  "Size or fit issue",
  "Item damaged or defective",
  "Wrong item received",
  "Not as described",
  "Quality not as expected",
  "Changed my mind",
  "Other",
]

const STATUS_LABEL = {
  requested: { text: "Requested", cls: "bg-amber-50 text-amber-700 border-amber-200" },
  approved: { text: "Approved, Pickup Soon", cls: "bg-blue-50 text-blue-700 border-blue-200" },
  rejected: { text: "Not accepted", cls: "bg-red-50 text-red-700 border-red-200" },
  received: { text: "Items Received", cls: "bg-indigo-50 text-indigo-700 border-indigo-200" },
  refunded: { text: "Refunded", cls: "bg-green-50 text-green-700 border-green-200" },
  replaced: { text: "Replacement Sent", cls: "bg-green-50 text-green-700 border-green-200" },
}

const money = (n) => `₹${(Number(n) || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`
const fmtDate = (d) => (d ? new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "")

/**
 * Returns for a delivered courier (standard) order: past requests with their
 * status, and a "Return or replace" button opening the request sheet.
 */
export default function OrderReturnsSection({ order }) {
  const orderId = order?._id || order?.id
  const status = String(order?.orderStatus || order?.status || "").toLowerCase()
  const isStandard = String(order?.fulfilmentMode || "").toLowerCase() === "standard"
  const [info, setInfo] = useState(null)
  const [open, setOpen] = useState(false)

  const load = useCallback(() => {
    if (!orderId) return
    userAPI
      .getOrderReturns(orderId)
      .then((res) => setInfo(res?.data?.data || null))
      .catch(() => setInfo(null))
  }, [orderId])

  useEffect(() => {
    if (isStandard && status === "delivered") load()
  }, [isStandard, status, load])

  if (!isStandard || status !== "delivered" || !info) return null
  const returns = info.returns || []
  if (!info.eligible && returns.length === 0) {
    return (
      <div className="px-4">
        <p className="text-xs text-gray-500 dark:text-gray-400">{info.reason}</p>
      </div>
    )
  }

  return (
    <div className="space-y-3 px-4">
      {returns.map((r) => {
        const s = STATUS_LABEL[r.status] || { text: r.status, cls: "bg-gray-50 text-gray-700 border-gray-200" }
        const replacing = r.resolution === "replacement"
        return (
          <div key={r._id} className="rounded-xl border border-gray-100 bg-white p-4 text-sm shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
            <div className="mb-2 flex items-center justify-between gap-2">
              <span className="font-semibold text-gray-800 dark:text-white">
                {replacing ? "Replacement" : "Return"} · {fmtDate(r.createdAt)}
              </span>
              <span className={`rounded-full border px-2 py-0.5 text-xs ${s.cls}`}>{s.text}</span>
            </div>
            <ul className="space-y-0.5 text-xs text-gray-600 dark:text-gray-300">
              {(r.items || []).map((i) => (
                <li key={`${i.itemId}-${i.variantId}`}>
                  {i.quantity} × {i.name}
                  {replacing && i.replacementVariantName ? ` → ${i.replacementVariantName}` : ""}
                </li>
              ))}
            </ul>
            <p className="mt-2 text-xs text-gray-500">Reason: {r.reason}</p>
            {r.status === "rejected" && r.rejectionReason ? <p className="mt-1 text-xs text-red-600">Not accepted: {r.rejectionReason}</p> : null}
            {r.reverseShipment?.awb ? (
              <p className="mt-1 text-xs text-gray-500">
                Pickup: {r.reverseShipment.courierName} · AWB {r.reverseShipment.awb}
              </p>
            ) : null}
            <p className="mt-1 text-xs text-gray-700 dark:text-gray-200">
              {r.status === "replaced" && r.replacementOrder?.orderId ? (
                <>
                  Replacement order{" "}
                  <Link to={`/orders/${r.replacementOrder.orderId}/details`} className="font-semibold text-wh-brand-ink underline">
                    #{r.replacementOrder.orderReadableId}
                  </Link>{" "}
                  is on its way.
                </>
              ) : r.status === "refunded" ? (
                `Refunded ${money(r.refund?.amount)}${r.refund?.method === "coins" ? " as coins" : ""}`
              ) : replacing ? (
                "We send the replacement as soon as the store gets the item back."
              ) : (
                `Refund on receipt: ${money(r.amounts?.refundAmount)}${r.refundTo === "coins" ? " as coins" : ""}`
              )}
              {!replacing && r.amounts?.coinsBack > 0 ? ` + ${r.amounts.coinsBack} coins back` : ""}
            </p>
          </div>
        )
      })}

      {info.eligible ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex w-full items-center justify-center gap-2 rounded-lg border border-wh-brand bg-white py-3 font-semibold text-wh-brand-ink hover:bg-orange-50 dark:bg-zinc-900 dark:hover:bg-orange-900/20"
        >
          <PackageX className="h-4 w-4" />
          Return or Replace Items
        </button>
      ) : (
        <p className="text-xs text-gray-500 dark:text-gray-400">{info.reason}</p>
      )}
      {info.eligible && info.windowEndsAt ? (
        <p className="text-center text-[11px] text-gray-500">Returns accepted until {fmtDate(info.windowEndsAt)}</p>
      ) : null}

      {open ? (
        <ReturnRequestSheet
          orderId={orderId}
          info={info}
          onClose={() => setOpen(false)}
          onDone={() => {
            setOpen(false)
            load()
          }}
        />
      ) : null}
    </div>
  )
}

function Stepper({ value, max, onChange, label }) {
  return (
    <div className="flex h-8 items-stretch overflow-hidden rounded-lg border border-gray-200 dark:border-zinc-700" aria-label={label}>
      <button type="button" aria-label="Fewer" disabled={value <= 0} onClick={() => onChange(value - 1)} className="w-8 disabled:opacity-40">
        <Minus className="mx-auto h-3.5 w-3.5" />
      </button>
      <span className="flex w-7 items-center justify-center text-[13px] font-bold tabular-nums">{value}</span>
      <button type="button" aria-label="More" disabled={value >= max} onClick={() => onChange(value + 1)} className="w-8 disabled:opacity-40">
        <Plus className="mx-auto h-3.5 w-3.5" />
      </button>
    </div>
  )
}

function ReturnRequestSheet({ orderId, info, onClose, onDone }) {
  const lines = (info.items || []).filter((l) => l.returnable > 0)
  const key = (l) => `${l.itemId}::${l.variantId || ""}`
  // One line with one unit starts selected; with more, the customer picks.
  const [qty, setQty] = useState(() => (lines.length === 1 && lines[0].returnable === 1 ? { [key(lines[0])]: 1 } : {}))
  const [swap, setSwap] = useState({})
  const [reason, setReason] = useState("")
  const [comment, setComment] = useState("")
  const [photos, setPhotos] = useState([])
  const [uploading, setUploading] = useState(false)
  const [resolution, setResolution] = useState("refund")
  const [refundTo, setRefundTo] = useState("original")
  const [submitting, setSubmitting] = useState(false)

  const picked = lines.filter((l) => (qty[key(l)] || 0) > 0)
  // Replacement is offered when every picked line has something in stock to send.
  const canReplace = picked.length > 0 && picked.every((l) => (l.replacementOptions || []).some((o) => o.inStock))
  const value = useMemo(() => picked.reduce((s, l) => s + l.price * (qty[key(l)] || 0), 0), [picked, qty])

  useEffect(() => {
    if (resolution === "replacement" && !canReplace) setResolution("refund")
  }, [resolution, canReplace])

  const addPhoto = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ""
    if (!file || photos.length >= 5) return
    setUploading(true)
    try {
      const res = await uploadAPI.uploadMedia(file, { folder: "returns" })
      const url = res?.data?.data?.url
      if (url) setPhotos((p) => [...p, url])
    } catch (err) {
      toast.error(err?.response?.data?.message || "Photo upload failed")
    } finally {
      setUploading(false)
    }
  }

  const submit = async () => {
    if (!picked.length) return toast.error("Pick at least one item")
    if (!reason) return toast.error("Tell us why")
    const items = picked.map((l) => {
      const chosen = swap[key(l)] ?? (l.replacementOptions || []).find((o) => o.inStock)?.variantId ?? l.variantId
      return {
        itemId: l.itemId,
        variantId: l.variantId || "",
        quantity: qty[key(l)],
        ...(resolution === "replacement" ? { replacementVariantId: chosen || "" } : {}),
      }
    })
    setSubmitting(true)
    try {
      await userAPI.requestOrderReturn(orderId, { items, reason, comment, photos, refundTo, resolution })
      toast.success(resolution === "replacement" ? "Replacement requested" : "Return Requested")
      onDone()
    } catch (err) {
      toast.error(err?.response?.data?.message || "Could not send the request")
    } finally {
      setSubmitting(false)
    }
  }

  const cash = String(info.paymentMethod) === "cash"
  const option = (active, onClick, Icon, title, text, disabled = false) => (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={active}
      className={`flex flex-1 items-start gap-2 rounded-xl border p-3 text-left transition-colors disabled:opacity-50 ${
        active ? "border-[#EA580C] bg-[#FFF1E7]" : "border-gray-200 dark:border-zinc-700"
      }`}
    >
      <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${active ? "text-[#EA580C]" : "text-gray-500"}`} aria-hidden="true" />
      <span>
        <span className="block text-[13px] font-bold text-gray-900 dark:text-white">{title}</span>
        <span className="block text-[11px] text-gray-500">{text}</span>
      </span>
    </button>
  )

  return (
    <div className="fixed inset-0 z-[90] flex items-end justify-center bg-black/40 sm:items-center" role="dialog" aria-modal="true" aria-label="Return or replace items">
      <div className="max-h-[92vh] w-full space-y-5 overflow-y-auto rounded-t-2xl bg-white p-4 pb-[max(16px,env(safe-area-inset-bottom))] dark:bg-zinc-900 sm:max-w-md sm:rounded-2xl">
        <div className="flex items-center justify-between">
          <h3 className="text-[17px] font-bold text-gray-900 dark:text-white">Return or Replace</h3>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-full p-1 hover:bg-gray-100">
            <X className="h-5 w-5 text-gray-500" />
          </button>
        </div>

        <section>
          <h4 className="mb-2 text-[13px] font-bold text-gray-800 dark:text-gray-100">1. Which items?</h4>
          <div className="space-y-2">
            {lines.map((l) => {
              const n = qty[key(l)] || 0
              return (
                <div key={key(l)} className={`flex items-center gap-3 rounded-xl border p-2.5 ${n ? "border-[#EA580C]" : "border-gray-200 dark:border-zinc-700"}`}>
                  {l.image ? <img src={l.image} alt="" className="h-12 w-10 shrink-0 rounded-md object-cover" /> : null}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-semibold text-gray-900 dark:text-gray-100">{l.name}</p>
                    <p className="text-[11px] text-gray-500">
                      {[l.variantName, money(l.price), `${l.returnable} of ${l.ordered} returnable`].filter(Boolean).join(" · ")}
                    </p>
                  </div>
                  <Stepper value={n} max={l.returnable} label={`How many ${l.name}`} onChange={(v) => setQty((q) => ({ ...q, [key(l)]: v }))} />
                </div>
              )
            })}
          </div>
        </section>

        <section>
          <h4 className="mb-2 text-[13px] font-bold text-gray-800 dark:text-gray-100">2. Why?</h4>
          <div className="flex flex-wrap gap-2">
            {REASONS.map((r) => (
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
          <textarea
            className="mt-2 w-full rounded-lg border border-gray-200 px-3 py-2 text-[13px] dark:border-zinc-700 dark:bg-zinc-800"
            rows={2}
            maxLength={1000}
            placeholder="Anything else we should know? (optional)"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
          />
          <div className="mt-2 flex flex-wrap gap-2">
            {photos.map((p) => (
              <div key={p} className="relative">
                <img src={p} alt="" className="h-14 w-14 rounded-md object-cover" />
                <button type="button" onClick={() => setPhotos((ps) => ps.filter((x) => x !== p))} className="absolute -right-1 -top-1 rounded-full bg-white shadow" aria-label="Remove photo">
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
            {photos.length < 5 ? (
              <label className="flex h-14 w-14 cursor-pointer items-center justify-center rounded-md border border-dashed border-gray-300" aria-label="Add a photo">
                {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4 text-gray-500" />}
                <input type="file" accept="image/*" className="hidden" onChange={addPhoto} disabled={uploading} />
              </label>
            ) : null}
          </div>
        </section>

        <section>
          <h4 className="mb-2 text-[13px] font-bold text-gray-800 dark:text-gray-100">3. What would you like?</h4>
          <div className="flex gap-2">
            {option(resolution === "refund", () => setResolution("refund"), Wallet, "Refund", value ? `About ${money(value)}` : "Your money back")}
            {option(
              resolution === "replacement",
              () => setResolution("replacement"),
              RefreshCw,
              "Replacement",
              canReplace ? "Same item, or another size" : picked.length ? "Not in stock right now" : "Pick items first",
              !canReplace,
            )}
          </div>

          {resolution === "replacement" ? (
            <div className="mt-3 space-y-2">
              {picked.map((l) => {
                const opts = l.replacementOptions || []
                const current = swap[key(l)] ?? opts.find((o) => o.inStock)?.variantId ?? ""
                return (
                  <div key={key(l)}>
                    <p className="mb-1 text-[12px] text-gray-600 dark:text-gray-300">Send {l.name} in</p>
                    <div className="flex flex-wrap gap-2">
                      {opts.map((o) => (
                        <button
                          key={o.variantId || "same"}
                          type="button"
                          disabled={!o.inStock}
                          onClick={() => setSwap((s) => ({ ...s, [key(l)]: o.variantId }))}
                          aria-pressed={current === o.variantId}
                          className={`flex items-center gap-1 rounded-lg border px-3 py-1.5 text-[12px] font-semibold disabled:line-through disabled:opacity-40 ${
                            current === o.variantId ? "border-[#EA580C] bg-[#FFF1E7] text-[#C2410C]" : "border-gray-200 text-gray-700 dark:border-zinc-700 dark:text-gray-200"
                          }`}
                        >
                          {current === o.variantId ? <Check className="h-3 w-3" aria-hidden="true" /> : null}
                          {o.name || "Same Item"}
                          {o.variantId === l.variantId ? <span className="font-normal text-gray-500"> (same)</span> : null}
                        </button>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          ) : null}

          <fieldset className="mt-3 space-y-1.5 text-[13px]">
            <legend className="mb-1 text-[12px] text-gray-600 dark:text-gray-300">
              {resolution === "replacement" ? "If we can't send it, refund to" : "Refund to"}
            </legend>
            <label className="flex items-center gap-2">
              <input type="radio" name="refundTo" className="accent-[#EA580C]" checked={refundTo === "original"} onChange={() => setRefundTo("original")} />
              {cash ? "Wallet (Paid in Cash)" : "Original Payment Method"}
            </label>
            <label className="flex items-center gap-2">
              <input type="radio" name="refundTo" className="accent-[#EA580C]" checked={refundTo === "coins"} onChange={() => setRefundTo("coins")} />
              Coins, to spend on your next order
            </label>
          </fieldset>
        </section>

        <p className="text-[11px] text-gray-500">
          The store checks the item when it comes back. {resolution === "replacement" ? "Your replacement ships then, free of charge." : "Your refund is paid then."}
        </p>

        <button
          type="button"
          onClick={submit}
          disabled={submitting || uploading || !picked.length || !reason}
          className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#EA580C] font-bold text-white disabled:opacity-50"
        >
          {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {resolution === "replacement" ? "Request Replacement" : "Request Return"}
        </button>
      </div>
    </div>
  )
}
